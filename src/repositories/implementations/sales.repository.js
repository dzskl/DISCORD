const { db } = require('../../database/connection');

module.exports = {
  findById(id) { return db.prepare(`SELECT * FROM sales WHERE id=?`).get(id); },
  findBySessionId(sessionId) { return db.prepare(`SELECT * FROM sales WHERE stripe_session_id=?`).get(sessionId); },
  recent(limit = 50) {
    return db.prepare(`
      SELECT s.*, p.name AS product_name
      FROM sales s LEFT JOIN products p ON p.id=s.product_id
      ORDER BY s.created_at DESC LIMIT ?
    `).all(limit);
  },
  markPaid(id, { paymentIntent, expiresAt }) {
    db.prepare(`
      UPDATE sales SET status='paid', paid_at=strftime('%s','now'), stripe_payment_intent=?, expires_at=?
      WHERE id=?
    `).run(paymentIntent || null, expiresAt || null, id);
  },
  markRefunded(id) {
    db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(id);
  }
};
