-- Lock cooperativo pra jobs cron rodarem so em 1 replica por vez.
-- holder identifica a replica (process_id ou hostname); lease_until eh
-- unix ts ate quando o lock vale. Outras replicas respeitam.

CREATE TABLE IF NOT EXISTS cron_locks (
  job_name     TEXT PRIMARY KEY,
  holder       TEXT NOT NULL,
  acquired_at  INTEGER NOT NULL,
  lease_until  INTEGER NOT NULL
);
