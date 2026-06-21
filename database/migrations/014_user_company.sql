-- Migration 014 — dados da empresa + API key + URLs de integracao (user-level)

ALTER TABLE users ADD COLUMN api_key TEXT;
ALTER TABLE users ADD COLUMN api_key_created_at INTEGER;
ALTER TABLE users ADD COLUMN company_name TEXT;
ALTER TABLE users ADD COLUMN company_logo_url TEXT;
ALTER TABLE users ADD COLUMN company_color TEXT DEFAULT '#8B5CF6';
ALTER TABLE users ADD COLUMN webhook_url TEXT;
ALTER TABLE users ADD COLUMN callback_url TEXT;
ALTER TABLE users ADD COLUMN repass_fee_to_customer INTEGER DEFAULT 0;
