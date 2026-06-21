const { db } = require('../../database/connection');

module.exports = {
  findById(id) { return db.prepare(`SELECT * FROM products WHERE id=?`).get(id); },
  findActiveById(id) { return db.prepare(`SELECT * FROM products WHERE id=? AND active=1`).get(id); },
  listActive() {
    return db.prepare(`SELECT * FROM products WHERE active=1 ORDER BY price_cents ASC`).all();
  },
  listAll() {
    return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM sales s WHERE s.product_id=p.id AND s.status='paid') AS sales_count
      FROM products p ORDER BY p.active DESC, p.created_at DESC
    `).all();
  },
  countActive() {
    return db.prepare(`SELECT COUNT(*) AS c FROM products WHERE active=1`).get().c;
  },
  decrementStock(id, by) {
    const p = this.findById(id);
    if (!p || p.stock == null) return p;
    const newQty = Math.max(0, p.stock - by);
    db.prepare(`UPDATE products SET stock=? WHERE id=?`).run(newQty, id);
    return { ...p, stock: newQty, _previous_stock: p.stock };
  }
};
