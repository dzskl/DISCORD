// Helpers reutilizaveis em toda a app
const crypto = require('crypto');

function formatCents(cents, currency = 'R$') {
  return `${currency} ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function epochPlus(seconds) {
  return nowEpoch() + seconds;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function isValidDiscordId(id) {
  return /^\d{15,25}$/.test(String(id || ''));
}

function isValidHexColor(s) {
  return /^#[0-9a-fA-F]{6}$/.test(s || '');
}

function timeAgo(epochSeconds) {
  const s = nowEpoch() - epochSeconds;
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return `há ${Math.floor(s / 86400)}d`;
}

function computeExpiry(duration, fromEpoch = nowEpoch()) {
  if (!duration || duration === 'permanent') return null;
  const map = { '1d': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '1y': 365 * 86400 };
  return fromEpoch + (map[duration] || 0);
}

module.exports = {
  formatCents,
  escapeHtml,
  csvEscape,
  generateToken,
  generateTempPassword,
  nowEpoch,
  epochPlus,
  isValidEmail,
  isValidDiscordId,
  isValidHexColor,
  timeAgo,
  computeExpiry
};
