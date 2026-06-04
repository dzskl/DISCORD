-- Migration 016 — Sorteios avancados (Requisitos + Tarefas)

ALTER TABLE giveaways ADD COLUMN icon_url TEXT;
ALTER TABLE giveaways ADD COLUMN banner_url TEXT;
ALTER TABLE giveaways ADD COLUMN description TEXT;
ALTER TABLE giveaways ADD COLUMN delivery_type TEXT DEFAULT 'none';      -- none|cargo|codigo|mensagem
ALTER TABLE giveaways ADD COLUMN delivery_payload TEXT;                  -- cargo_id ou codigo ou mensagem
ALTER TABLE giveaways ADD COLUMN monitor INTEGER DEFAULT 0;
ALTER TABLE giveaways ADD COLUMN requirements_json TEXT;                 -- {toggles:{}, dias_conta_min, convites_min, gasto_min/max, primeira_compra_dias, ultima_compra_dias, cargos_obrigatorios:[], cargos_bloqueados:[], canais_voz:[], inviters:[], nicknames:[], status:[], atividades:[], bios:[]}

CREATE TABLE IF NOT EXISTS giveaway_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- twitter_follow | discord_join | youtube_sub | url_visit | custom
  title TEXT NOT NULL,
  url TEXT,
  payload TEXT,
  auto_verify INTEGER DEFAULT 0,
  order_idx INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_giveaway_tasks_gid ON giveaway_tasks(giveaway_id);
