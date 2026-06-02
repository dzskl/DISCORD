const { db } = require('../../database/connection');

const COLUMNS = 'id,email,role,discord_id,discord_tag,discord_avatar,display_name,plan,stripe_customer_id,stripe_subscription_id,subscription_status,subscription_ends_at,trial_ends_at,active,created_at,last_login_at';

module.exports = {
  findById(id) {
    return db.prepare(`SELECT ${COLUMNS} FROM users WHERE id=?`).get(id);
  },
  findByIdWithHash(id) {
    return db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  },
  findByEmail(email) {
    return db.prepare(`SELECT * FROM users WHERE email=? AND active=1`).get(email);
  },
  findByDiscordId(discordId) {
    return db.prepare(`SELECT * FROM users WHERE discord_id=?`).get(discordId);
  },
  countActive() {
    return db.prepare(`SELECT COUNT(*) AS c FROM users WHERE active=1`).get().c;
  },
  firstOwner() {
    return db.prepare(`SELECT * FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1`).get();
  },
  listAll() {
    return db.prepare(`SELECT id,email,role,discord_id,discord_tag,display_name,active,created_at,last_login_at FROM users ORDER BY created_at`).all();
  },
  create({ email, password_hash, role, display_name, discord_id = null, discord_tag = null, discord_avatar = null, plan = 'free', subscription_status = null, trial_ends_at = null, subscription_ends_at = null }) {
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, role, display_name, discord_id, discord_tag, discord_avatar, plan, subscription_status, trial_ends_at, subscription_ends_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    `).run(email, password_hash, role, display_name, discord_id, discord_tag, discord_avatar, plan, subscription_status, trial_ends_at, subscription_ends_at);
    return this.findByIdWithHash(info.lastInsertRowid);
  },
  updatePassword(id, password_hash) {
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(password_hash, id);
  },
  touchLogin(id) {
    db.prepare(`UPDATE users SET last_login_at=strftime('%s','now') WHERE id=?`).run(id);
  },
  deactivate(id) {
    db.prepare(`UPDATE users SET active=0 WHERE id=?`).run(id);
  },
  updatePlan(id, { plan, status, ends_at, customer_id, subscription_id }) {
    db.prepare(`
      UPDATE users SET
        plan=COALESCE(?,plan),
        subscription_status=COALESCE(?,subscription_status),
        subscription_ends_at=COALESCE(?,subscription_ends_at),
        stripe_customer_id=COALESCE(?,stripe_customer_id),
        stripe_subscription_id=COALESCE(?,stripe_subscription_id)
      WHERE id=?
    `).run(plan ?? null, status ?? null, ends_at ?? null, customer_id ?? null, subscription_id ?? null, id);
  }
};
