// Resolve o "vendedor" (user_id) de uma sale.
// Vendedor = owner do guild da venda. Se sem guild_id, cai no owner global.

function findSellerUserId(db, sale) {
  if (!sale) return null;
  if (sale.guild_id) {
    const row = db.prepare(`
      SELECT user_id FROM user_guilds
      WHERE guild_id = ? AND role = 'owner'
      ORDER BY created_at ASC LIMIT 1
    `).get(sale.guild_id);
    if (row?.user_id) return row.user_id;
  }
  const fb = db.prepare(`SELECT id FROM users WHERE role='owner' ORDER BY id ASC LIMIT 1`).get();
  return fb?.id || null;
}

// Plano efetivo do vendedor (cai pra 'free' se nao achar / expirado)
function sellerPlanId(db, userId) {
  if (!userId) return 'free';
  const u = db.prepare(`
    SELECT plan, subscription_status, subscription_ends_at
    FROM users WHERE id=?
  `).get(userId);
  if (!u) return 'free';
  const now = Math.floor(Date.now() / 1000);
  // Expirou?
  if (u.plan !== 'free' && u.subscription_ends_at && u.subscription_ends_at < now) {
    if (u.subscription_status !== 'active' && u.subscription_status !== 'trialing') return 'free';
  }
  return u.plan || 'free';
}

module.exports = { findSellerUserId, sellerPlanId };
