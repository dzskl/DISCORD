// Verificacao de identidade (KYC PIX micropagamento).
// Fluxo: start (CPF+PIX -> QR R$0,99) -> upload proof -> review.

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('../database/connection');
const { requireAuth, requireOwner } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'verifications');
const MAX_PROOF_MB = 5;
const VERIFY_AMOUNT_CENTS = 99;

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function cleanCpfCnpj(v) {
  return String(v || '').replace(/\D/g, '');
}

function validCpfCnpj(v) {
  const d = cleanCpfCnpj(v);
  return d.length === 11 || d.length === 14;
}

router.get('/', (req, res) => {
  const v = db.prepare('SELECT * FROM user_verifications WHERE user_id=?').get(req.appUser.id);
  res.json(v || { status: 'not_started' });
});

router.post('/start', (req, res) => {
  const { cpf_cnpj, pix_key } = req.body || {};
  if (!validCpfCnpj(cpf_cnpj)) return res.status(400).json({ error: 'CPF/CNPJ invalido' });
  if (!pix_key || String(pix_key).trim().length < 3) return res.status(400).json({ error: 'chave PIX invalida' });

  const cleanDoc = cleanCpfCnpj(cpf_cnpj);
  const pix = String(pix_key).trim();
  const txId = 'VRF' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const payload = buildPixPayload(VERIFY_AMOUNT_CENTS, txId, cleanDoc);

  const existing = db.prepare('SELECT id, status FROM user_verifications WHERE user_id=?').get(req.appUser.id);
  if (existing && existing.status === 'approved') {
    return res.status(400).json({ error: 'verificacao ja aprovada' });
  }

  if (existing) {
    db.prepare(`
      UPDATE user_verifications SET
        cpf_cnpj = ?, pix_key = ?, status = 'pending_payment',
        payment_qr_payload = ?, payment_tx_id = ?, proof_file_path = NULL,
        proof_uploaded_at = NULL, rejection_reason = NULL
      WHERE user_id = ?
    `).run(cleanDoc, pix, payload, txId, req.appUser.id);
  } else {
    db.prepare(`
      INSERT INTO user_verifications (user_id, cpf_cnpj, pix_key, status, payment_amount_cents, payment_qr_payload, payment_tx_id)
      VALUES (?, ?, ?, 'pending_payment', ?, ?, ?)
    `).run(req.appUser.id, cleanDoc, pix, VERIFY_AMOUNT_CENTS, payload, txId);
  }

  audit.log({ req, action: 'verification.start', details: { cpf_cnpj: cleanDoc.slice(0, 3) + '...' } });

  const v = db.prepare('SELECT * FROM user_verifications WHERE user_id=?').get(req.appUser.id);
  res.json(v);
});

// Upload do comprovante. Recebe base64 do arquivo (mantem simples — sem multer).
router.post('/upload-proof', express.json({ limit: '8mb' }), (req, res) => {
  const { filename, content_base64 } = req.body || {};
  if (!content_base64) return res.status(400).json({ error: 'arquivo obrigatorio' });
  const data = Buffer.from(content_base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (data.length > MAX_PROOF_MB * 1024 * 1024) return res.status(400).json({ error: `arquivo > ${MAX_PROOF_MB}MB` });

  const v = db.prepare('SELECT * FROM user_verifications WHERE user_id=?').get(req.appUser.id);
  if (!v) return res.status(400).json({ error: 'verificacao nao iniciada' });
  if (!['pending_payment', 'pending_proof', 'pending_review', 'rejected'].includes(v.status)) {
    return res.status(400).json({ error: 'estado invalido' });
  }

  ensureDir();
  const ext = (filename || 'proof').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || 'bin';
  if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) return res.status(400).json({ error: 'formato invalido (jpg, png, pdf)' });
  const dest = path.join(UPLOAD_DIR, `${v.id}_${Date.now()}.${ext}`);
  fs.writeFileSync(dest, data);

  db.prepare(`
    UPDATE user_verifications SET
      proof_file_path = ?, proof_uploaded_at = strftime('%s','now'), status = 'pending_review'
    WHERE id = ?
  `).run(dest, v.id);

  audit.log({ req, action: 'verification.proof_uploaded', target_id: v.id });

  res.json(db.prepare('SELECT * FROM user_verifications WHERE user_id=?').get(req.appUser.id));
});

// Approve/reject (owner only)
router.post('/:userId/review', requireOwner, (req, res) => {
  const { action, reason } = req.body || {};
  const v = db.prepare('SELECT * FROM user_verifications WHERE user_id=?').get(req.params.userId);
  if (!v) return res.status(404).json({ error: 'nao encontrado' });

  if (action === 'approve') {
    db.prepare(`UPDATE user_verifications SET status='approved', reviewed_at=strftime('%s','now'), reviewer_id=? WHERE id=?`)
      .run(req.appUser.id, v.id);
    db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'info', 'Verificacao aprovada', 'Seu cadastro foi verificado. Voce ja pode sacar.')`).run(v.user_id);
  } else if (action === 'reject') {
    db.prepare(`UPDATE user_verifications SET status='rejected', reviewed_at=strftime('%s','now'), reviewer_id=?, rejection_reason=? WHERE id=?`)
      .run(req.appUser.id, reason || null, v.id);
    db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'warning', 'Verificacao rejeitada', ?)`).run(v.user_id, reason || 'Comprovante invalido');
  } else {
    return res.status(400).json({ error: 'action invalido (approve|reject)' });
  }
  audit.log({ req, action: `verification.${action}`, target_id: v.id });
  res.json({ ok: true });
});

// EMV PIX simplificado — gera payload "BR Code" pra QR. Nao eh banco real,
// e um placeholder visivel que QR readers conseguem ler como "PIX copia e cola".
function buildPixPayload(amountCents, txId, doc) {
  const merchantName = 'BOTDASH VERIFICAR';
  const merchantCity = 'SAO PAULO';
  const amount = (amountCents / 100).toFixed(2);
  // Formato EMV-like simplificado, suficiente pro QR ser lido pelo banco
  const f = (id, value) => id + String(value.length).padStart(2, '0') + value;
  const gui = f('00', 'br.gov.bcb.pix') + f('01', doc.slice(0, 16));
  const mai = f('26', gui);
  const addl = f('05', txId.slice(0, 25));
  const tlv = [
    f('00', '01'),
    f('01', '11'),
    mai,
    f('52', '0000'),
    f('53', '986'),
    f('54', amount),
    f('58', 'BR'),
    f('59', merchantName.slice(0, 25)),
    f('60', merchantCity.slice(0, 15)),
    f('62', addl)
  ].join('');
  const toCrc = tlv + '6304';
  return toCrc + crc16(toCrc);
}

function crc16(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

module.exports = router;
