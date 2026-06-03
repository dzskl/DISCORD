// Telegram bot (skeleton). Roda via long-polling getUpdates ou via webhook.
// Mantém handlers de comandos básicos: /start, /loja, /comprar, /vips.
// O dono configura TELEGRAM_BOT_TOKEN nas credenciais.

const { db, getCredential } = require('../database/connection');
const logger = require('../utils/logger');

let _pollInterval = null;
let _lastUpdateId = 0;

function token() {
  return getCredential('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN;
}

function api(method, body) {
  const t = token();
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN nao configurado');
  return fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

async function sendMessage(chatId, text, opts = {}) {
  return api('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...opts });
}

function upsertUser(from) {
  if (!from) return;
  db.prepare(`
    INSERT INTO telegram_users (telegram_id, username, first_name, last_seen)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_seen = excluded.last_seen
  `).run(from.id, from.username || null, from.first_name || null);
}

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;
  const text = (msg.text || '').trim();
  const chatId = msg.chat.id;
  upsertUser(msg.from);

  if (text === '/start' || text.startsWith('/start ')) {
    const publicUrl = process.env.PUBLIC_URL || '';
    return sendMessage(chatId,
      `👋 *Bem-vindo(a)!*\n\nUse os comandos:\n` +
      `• /loja — ver produtos\n` +
      `• /vips — assinaturas VIP\n` +
      `• /suporte — abrir ticket\n` +
      `${publicUrl ? `\nLoja web: ${publicUrl}/loja.html` : ''}`
    );
  }

  if (text === '/loja') {
    const products = db.prepare(`SELECT name, price_cents FROM products WHERE active=1 LIMIT 8`).all();
    if (!products.length) return sendMessage(chatId, '🛒 Nenhum produto disponivel.');
    const lines = products.map(p => `• *${p.name}* — R$ ${(p.price_cents / 100).toFixed(2).replace('.', ',')}`).join('\n');
    return sendMessage(chatId, `🛒 *Produtos disponiveis*\n\n${lines}\n\nResponda */comprar <nome>* pra iniciar.`);
  }

  if (text === '/vips') {
    const subs = db.prepare(`SELECT name, price_cents, subscription_interval FROM products WHERE is_subscription=1 AND active=1 LIMIT 6`).all();
    if (!subs.length) return sendMessage(chatId, '⭐ Nenhuma assinatura VIP disponivel.');
    const lines = subs.map(s => `• *${s.name}* — R$ ${(s.price_cents / 100).toFixed(2).replace('.', ',')}/${s.subscription_interval === 'year' ? 'ano' : 'mes'}`).join('\n');
    return sendMessage(chatId, `⭐ *Assinaturas VIP*\n\n${lines}`);
  }

  if (text === '/suporte') {
    return sendMessage(chatId, '🎫 Em breve! Por enquanto, mande DM no nosso Discord.');
  }

  if (text.startsWith('/')) {
    return sendMessage(chatId, `❓ Comando nao reconhecido. Use /start pra ver as opcoes.`);
  }
}

async function pollOnce() {
  try {
    const resp = await api('getUpdates', { offset: _lastUpdateId + 1, timeout: 25 });
    if (!resp || !resp.ok || !resp.result) return;
    for (const upd of resp.result) {
      _lastUpdateId = Math.max(_lastUpdateId, upd.update_id);
      try { await handleUpdate(upd); } catch (e) { logger.warn({ err: e.message, upd: upd.update_id }, 'telegram update erro'); }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'telegram poll erro');
  }
}

async function start() {
  if (!token()) {
    logger.info('TELEGRAM_BOT_TOKEN nao definido — telegram nao iniciado');
    return;
  }
  if (_pollInterval) return;
  logger.info('telegram bot polling iniciado');
  _pollInterval = setInterval(pollOnce, 3000);
  pollOnce();
}

function stop() {
  if (_pollInterval) clearInterval(_pollInterval);
  _pollInterval = null;
}

module.exports = { start, stop, sendMessage, handleUpdate };
