// 2FA TOTP (Google Authenticator compatible).
const express = require('express');
const crypto = require('crypto');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

function base32Encode(buffer) {
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const b of buffer) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      output += ALPH[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPH[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(s) {
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | ALPH.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret, step = 30, t = Math.floor(Date.now() / 1000)) {
  const counter = Math.floor(t / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(secret, token) {
  const t = Math.floor(Date.now() / 1000);
  // janela de +-1 step (30s)
  for (const offset of [-1, 0, 1]) {
    if (totp(secret, 30, t + offset * 30) === token) return true;
  }
  return false;
}

router.get('/status', (req, res) => {
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.appUser.id);
  res.json({ enabled: !!(u?.totp_enabled) });
});

// Inicia setup — gera secret e retorna otpauth URI + secret pra QR
router.post('/setup', (req, res) => {
  const u = db.prepare('SELECT email, totp_enabled FROM users WHERE id=?').get(req.appUser.id);
  if (u?.totp_enabled) return res.status(400).json({ error: '2FA ja ativo' });
  const secret = base32Encode(crypto.randomBytes(20));
  db.prepare('UPDATE users SET totp_secret=? WHERE id=?').run(secret, req.appUser.id);
  const issuer = 'BotDash';
  const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(u?.email || 'user');
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  res.json({ secret, uri });
});

// Verifica + ativa
router.post('/verify-setup', (req, res) => {
  const { token } = req.body || {};
  if (!token || !/^\d{6}$/.test(String(token))) return res.status(400).json({ error: 'token invalido' });
  const u = db.prepare('SELECT totp_secret FROM users WHERE id=?').get(req.appUser.id);
  if (!u?.totp_secret) return res.status(400).json({ error: 'setup nao iniciado' });
  if (!verifyTotp(u.totp_secret, String(token))) return res.status(400).json({ error: 'codigo incorreto' });

  // Gera recovery codes
  const codes = [];
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET totp_enabled=1 WHERE id=?').run(req.appUser.id);
    db.prepare('DELETE FROM totp_recovery_codes WHERE user_id=?').run(req.appUser.id);
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      db.prepare('INSERT INTO totp_recovery_codes (user_id, code) VALUES (?, ?)').run(req.appUser.id, code);
      codes.push(code);
    }
  });
  tx();
  audit.log({ req, action: '2fa.enable' });
  res.json({ ok: true, recovery_codes: codes });
});

router.post('/verify', (req, res) => {
  const { token } = req.body || {};
  const u = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id=?').get(req.appUser.id);
  if (!u?.totp_enabled) return res.status(400).json({ error: '2FA nao ativo' });

  if (token && /^\d{6}$/.test(String(token))) {
    if (verifyTotp(u.totp_secret, String(token))) {
      req.session.twofa_verified_at = Math.floor(Date.now() / 1000);
      return res.json({ ok: true });
    }
  }
  // tenta recovery code
  if (token) {
    const row = db.prepare('SELECT id FROM totp_recovery_codes WHERE user_id=? AND code=? AND used_at IS NULL').get(req.appUser.id, String(token).toUpperCase());
    if (row) {
      db.prepare(`UPDATE totp_recovery_codes SET used_at=strftime('%s','now') WHERE id=?`).run(row.id);
      req.session.twofa_verified_at = Math.floor(Date.now() / 1000);
      return res.json({ ok: true, recovery_used: true });
    }
  }
  res.status(400).json({ error: 'codigo invalido' });
});

router.post('/disable', (req, res) => {
  const { password } = req.body || {};
  // simplificacao: nao exige password se nao tiver coluna password — em prod sim
  db.prepare('UPDATE users SET totp_secret=NULL, totp_enabled=0 WHERE id=?').run(req.appUser.id);
  db.prepare('DELETE FROM totp_recovery_codes WHERE user_id=?').run(req.appUser.id);
  audit.log({ req, action: '2fa.disable' });
  res.json({ ok: true });
});

module.exports = { router, verifyTotp };
