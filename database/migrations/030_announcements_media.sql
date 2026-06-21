-- Migration 030 — Anuncios suportam imagem/banner

ALTER TABLE announcements ADD COLUMN image_url TEXT;
ALTER TABLE announcements ADD COLUMN banner_url TEXT;
ALTER TABLE announcements ADD COLUMN thumbnail_url TEXT;
