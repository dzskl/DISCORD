const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const KEY_FILE = path.join(__dirname, '..', 'data', '.master.key');

let masterKey = null;

function getMasterKey() {
  if (masterKey) return masterKey;
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 64) {
    masterKey = Buffer.from(process.env.ENCRYPTION_KEY.slice(0, 64), 'hex');
    return masterKey;
  }
  try {
    masterKey = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
    if (masterKey.length !== 32) throw new Error('chave invalida');
    return masterKey;
  } catch {
    masterKey = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, masterKey.toString('hex'), { mode: 0o600 });
    require('./logger').warn({ file: KEY_FILE }, 'chave de criptografia gerada — faca backup!');
    return masterKey;
  }
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(blob) {
  if (!blob) return null;
  try {
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (e) {
    require('./logger').error({ err: e.message }, 'falha ao decriptar credencial');
    return null;
  }
}

function maskValue(v) {
  if (!v) return null;
  if (v.length <= 8) return '••••';
  return v.slice(0, 4) + '•'.repeat(8) + v.slice(-4);
}

module.exports = { encrypt, decrypt, maskValue, getMasterKey };
