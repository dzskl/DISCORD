-- Migration 023 — Sistema de Suporte (tickets do site)

CREATE TABLE IF NOT EXISTS support_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'duvida',   -- duvida|bug|cobranca|feature|outro
  priority TEXT DEFAULT 'normal',    -- low|normal|high|urgent
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open|in_progress|waiting_user|closed
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  responded_at INTEGER,
  closed_at INTEGER,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_support_inq_status ON support_inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_inq_email ON support_inquiries(email);

CREATE TABLE IF NOT EXISTS support_inquiry_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES support_inquiries(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,         -- user|admin
  author_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_msg_inq ON support_inquiry_messages(inquiry_id, created_at);
