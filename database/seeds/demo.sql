-- Seed de exemplo pra dev. Roda com `npm run seed`.
-- Cuidado: nao usar em producao.

INSERT OR IGNORE INTO categories (name, description, icon) VALUES
  ('VIPs', 'Cargos premium do servidor', '💎'),
  ('Skins', 'Skins e itens cosméticos', '🎨'),
  ('Suporte', 'Atendimento personalizado', '🎫');

INSERT OR IGNORE INTO products (name, description, price_cents, cost_cents, duration, stock, category_id, accent_color, active) VALUES
  ('VIP Mensal', 'Acesso ao canal VIP, prioridade no suporte, cargo exclusivo.', 4990, 0, '30d', 10, 1, '#5865f2', 1),
  ('VIP Anual', 'Todos os beneficios VIP por 12 meses com desconto especial.', 14990, 0, '1y', 5, 1, '#5fff5f', 1),
  ('Cargo Personalizado', 'Cargo personalizado com nome e cor exclusivos.', 1990, 0, 'permanent', NULL, 2, '#ff5fc1', 1);

INSERT OR IGNORE INTO coupons (code, discount_percent, max_uses, active) VALUES
  ('BLACKFRIDAY', 25, 100, 1),
  ('PRIMEIRA', 15, NULL, 1);

INSERT OR IGNORE INTO auto_replies (trigger, match_type, response, active) VALUES
  ('bom dia', 'contains', 'Bom dia! Como posso ajudar?', 1),
  ('preco', 'contains', 'Confira nossos planos em /loja.html', 1);
