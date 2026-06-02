// Servico de email. Suporta SMTP (universal) ou Resend (mais simples).
// Se nenhum configurado, faz log + retorna {sent:false} silenciosamente.

const logger = require('../utils/logger');

function getCfg() {
  const { getCredential } = require('../database/connection');
  return {
    smtp_host: getCredential('SMTP_HOST'),
    smtp_port: parseInt(getCredential('SMTP_PORT') || '587'),
    smtp_user: getCredential('SMTP_USER'),
    smtp_pass: getCredential('SMTP_PASS'),
    smtp_secure: getCredential('SMTP_SECURE') === '1',
    smtp_from: getCredential('SMTP_FROM') || getCredential('SMTP_USER'),
    resend_key: getCredential('RESEND_API_KEY'),
    resend_from: getCredential('RESEND_FROM') || 'BotDash <onboarding@resend.dev>',
    brand_name: getCredential('BRAND_NAME') || 'BotDash'
  };
}

function isConfigured() {
  const c = getCfg();
  return !!c.resend_key || (!!c.smtp_host && !!c.smtp_user);
}

let _transport = null;
function getTransport() {
  const c = getCfg();
  if (_transport) return _transport;
  if (!c.smtp_host) return null;
  const nodemailer = require('nodemailer');
  _transport = nodemailer.createTransport({
    host: c.smtp_host,
    port: c.smtp_port,
    secure: c.smtp_secure || c.smtp_port === 465,
    auth: c.smtp_user ? { user: c.smtp_user, pass: c.smtp_pass } : undefined
  });
  return _transport;
}

function invalidateTransport() { _transport = null; }

async function send({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'no recipient' };
  const c = getCfg();

  if (c.resend_key) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.resend_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: c.resend_from, to: [to], subject, html, text: text || stripHtml(html) })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        logger.warn({ err, to, subject }, 'resend falhou');
        return { sent: false, reason: err.message || 'resend error' };
      }
      logger.info({ to, subject }, 'email enviado via Resend');
      return { sent: true, via: 'resend' };
    } catch (e) {
      logger.warn({ err: e.message }, 'resend exception');
      return { sent: false, reason: e.message };
    }
  }

  const t = getTransport();
  if (!t) {
    logger.info({ to, subject }, '[dev] email simulado — SMTP/Resend não configurado');
    logger.debug({ html }, 'email body');
    return { sent: false, reason: 'not configured', dev: true };
  }
  try {
    await t.sendMail({ from: c.smtp_from, to, subject, html, text: text || stripHtml(html) });
    logger.info({ to, subject }, 'email enviado via SMTP');
    return { sent: true, via: 'smtp' };
  } catch (e) {
    logger.warn({ err: e.message, to }, 'SMTP falhou');
    return { sent: false, reason: e.message };
  }
}

function stripHtml(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

// ============ TEMPLATES ============

function shell(content, brand) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${brand}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.04);">
        <tr><td style="padding:32px 40px 20px;background:#0e0e2e;color:#fff;">
          <div style="display:inline-block;width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#8b6fff,#7758ff);text-align:center;line-height:36px;font-weight:700;font-size:16px;color:#fff;vertical-align:middle;">B</div>
          <span style="font-size:18px;font-weight:700;letter-spacing:-.01em;margin-left:10px;vertical-align:middle;">${brand}</span>
        </td></tr>
        <tr><td style="padding:36px 40px;">${content}</td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;color:#888;font-size:12px;text-align:center;border-top:1px solid #eee;">
          ${brand} · enviado automaticamente — não responda este email
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const T = {
  welcome: (user) => {
    const c = getCfg();
    return {
      subject: `Bem-vindo ao ${c.brand_name}! 🎉`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;letter-spacing:-.01em;">Bem-vindo, ${user.display_name || user.email.split('@')[0]}!</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;">Sua conta foi criada com sucesso. Você ganhou <b>7 dias grátis do plano Pro</b> pra testar tudo sem limitação.</p>
        <p style="margin:0 0 24px;color:#5a5b6e;line-height:1.55;">Acesse o painel pra configurar seu bot, cadastrar produtos e começar a vender:</p>
        <a href="${process.env.PUBLIC_URL || '#'}/app.html" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">acessar painel →</a>
        <p style="margin:30px 0 0;color:#888;font-size:13px;line-height:1.55;">Qualquer dúvida, é só responder esta mensagem ou nos chamar no Discord.</p>
      `, c.brand_name)
    };
  },

  invite: (email, tempPassword, inviterName) => {
    const c = getCfg();
    return {
      subject: `Você foi convidado pro ${c.brand_name}`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;">Acesso ao painel ${c.brand_name}</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;"><b>${inviterName || 'O owner'}</b> te deu acesso ao painel ${c.brand_name}.</p>
        <div style="background:#f5f5f7;border-radius:8px;padding:18px;margin:0 0 24px;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">email</div>
          <div style="font-size:14px;font-weight:600;margin-bottom:14px;">${email}</div>
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">senha temporária</div>
          <div style="font-family:'SF Mono',Monaco,monospace;font-size:16px;font-weight:700;color:#8b6fff;background:#fff;padding:10px 14px;border-radius:6px;border:1px solid #e8e8ee;">${tempPassword}</div>
        </div>
        <a href="${process.env.PUBLIC_URL || '#'}/login.html" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">fazer login →</a>
        <p style="margin:24px 0 0;color:#888;font-size:13px;">⚠️ Troque sua senha no primeiro login (aba Equipe → trocar senha).</p>
      `, c.brand_name)
    };
  },

  passwordReset: (email, resetUrl) => {
    const c = getCfg();
    return {
      subject: `Redefinir senha — ${c.brand_name}`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;">Redefinir senha</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;">Recebemos um pedido pra redefinir a senha de <b>${email}</b>. Clique no botão pra criar uma nova senha:</p>
        <a href="${resetUrl}" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">redefinir senha →</a>
        <p style="margin:24px 0 6px;color:#888;font-size:13px;">Esse link expira em 1 hora.</p>
        <p style="margin:0;color:#888;font-size:13px;">Se você não pediu, pode ignorar — sua senha continua igual.</p>
      `, c.brand_name)
    };
  },

  trialReminder: (user, daysLeft) => {
    const c = getCfg();
    return {
      subject: daysLeft === 0 ? `Seu trial expira hoje — ${c.brand_name}` : `Faltam ${daysLeft} dia(s) no seu trial — ${c.brand_name}`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;">${daysLeft === 0 ? 'Seu trial expira hoje' : `Faltam ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`}</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;">Olá ${user.display_name || user.email.split('@')[0]}, seu trial gratuito do plano Pro está chegando ao fim.</p>
        <p style="margin:0 0 24px;color:#5a5b6e;line-height:1.55;">Assine agora pra manter <b>produtos ilimitados</b>, afiliados, sorteios, auto-respostas e tudo que você usou nesses dias.</p>
        <a href="${process.env.PUBLIC_URL || '#'}/app.html?upgrade=1" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">assinar Pro · R$47/mês →</a>
        <p style="margin:24px 0 0;color:#888;font-size:13px;">Sem renovação automática, seu painel volta pro plano free.</p>
      `, c.brand_name)
    };
  },

  trialExpired: (user) => {
    const c = getCfg();
    return {
      subject: `Seu trial expirou — ${c.brand_name}`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;">Seu trial expirou</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;">Seu painel voltou pro plano Free. As features Pro (afiliados, sorteios, auto-respostas, produtos ilimitados etc.) estão desabilitadas — mas todos os seus dados continuam intactos.</p>
        <a href="${process.env.PUBLIC_URL || '#'}/app.html?upgrade=1" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">reativar Pro →</a>
      `, c.brand_name)
    };
  },

  paymentReceived: (user, amount) => {
    const c = getCfg();
    return {
      subject: `Pagamento confirmado — ${c.brand_name} Pro`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;">Pagamento confirmado ✓</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;">Recebemos seu pagamento de <b>R$ ${amount}</b>. Seu plano Pro está ativo.</p>
        <a href="${process.env.PUBLIC_URL || '#'}/app.html" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">acessar painel →</a>
      `, c.brand_name)
    };
  },

  paymentFailed: (user) => {
    const c = getCfg();
    return {
      subject: `Pagamento falhou — atualize o cartão`,
      html: shell(`
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;">Pagamento falhou ⚠️</h1>
        <p style="margin:0 0 18px;color:#5a5b6e;line-height:1.55;">Não conseguimos processar o pagamento da sua assinatura Pro. Atualize seu método de pagamento pra evitar cancelamento:</p>
        <a href="${process.env.PUBLIC_URL || '#'}/app.html" style="display:inline-block;background:#8b6fff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">atualizar cartão →</a>
      `, c.brand_name)
    };
  }
};

module.exports = { send, isConfigured, invalidateTransport, T };
