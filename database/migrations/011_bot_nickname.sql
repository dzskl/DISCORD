-- Migration 011 — apelido custom do bot pra usar no breadcrumb e UI compacta

ALTER TABLE bot_instances ADD COLUMN nickname TEXT;
