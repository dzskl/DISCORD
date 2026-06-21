-- Migration 031 — Super admin (donos da plataforma BotDash)
-- Distinto do role 'owner' (owner = dono de guild/loja).
-- Super admin tem acesso ao painel /admin/ e controla tudo.

ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = 1;
