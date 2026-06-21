// Keypair ed25519 pra webhook signing v3. Gera lazy ao primeiro uso,
// rotaciona com novo kid. Public keys expostas via /.well-known/botdash-keys.json.

const crypto = require('crypto');
const { db } = require('../database/connection');

function generate() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    public_key: publicKey.export({ format: 'pem', type: 'spki' }),
    private_key: privateKey.export({ format: 'pem', type: 'pkcs8' })
  };
}

function getActive() {
  let row;
  try {
    row = db.prepare(`SELECT * FROM signing_keys WHERE active=1 ORDER BY id DESC LIMIT 1`).get();
  } catch { return null; }
  if (!row) {
    // Bootstrap: cria primeira key
    const { public_key, private_key } = generate();
    const kid = 'bd_' + new Date().toISOString().slice(0, 7).replace('-', '_') + '_' + crypto.randomBytes(3).toString('hex');
    const info = db.prepare(`
      INSERT INTO signing_keys (kid, algorithm, public_key, private_key)
      VALUES (?, 'ed25519', ?, ?)
    `).run(kid, public_key, private_key);
    row = db.prepare(`SELECT * FROM signing_keys WHERE id=?`).get(info.lastInsertRowid);
  }
  return row;
}

function sign(body) {
  const key = getActive();
  if (!key) throw new Error('signing key indisponivel');
  const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(key.private_key));
  return { kid: key.kid, signature: sig.toString('base64') };
}

function verify(body, signatureB64, kid) {
  const row = db.prepare(`SELECT public_key FROM signing_keys WHERE kid=?`).get(kid);
  if (!row) return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(body),
      crypto.createPublicKey(row.public_key),
      Buffer.from(signatureB64, 'base64')
    );
  } catch { return false; }
}

function rotate() {
  // Mantem antigo ativo por 24h (grace period) — vendedor tem tempo de cachear novo
  const { public_key, private_key } = generate();
  const kid = 'bd_' + new Date().toISOString().slice(0, 7).replace('-', '_') + '_' + crypto.randomBytes(3).toString('hex');
  const info = db.prepare(`
    INSERT INTO signing_keys (kid, algorithm, public_key, private_key)
    VALUES (?, 'ed25519', ?, ?)
  `).run(kid, public_key, private_key);
  // marca antigos pra rotacionar (mantem active=1 ate grace period)
  db.prepare(`UPDATE signing_keys SET rotated_at=strftime('%s','now') WHERE id != ? AND rotated_at IS NULL`).run(info.lastInsertRowid);
  return { id: info.lastInsertRowid, kid };
}

function listPublic() {
  try {
    const rows = db.prepare(`SELECT kid, algorithm, public_key, created_at, rotated_at FROM signing_keys WHERE active=1 ORDER BY id DESC`).all();
    return rows;
  } catch { return []; }
}

module.exports = { getActive, sign, verify, rotate, listPublic, generate };
