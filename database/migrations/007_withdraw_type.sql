-- Migration 007 — saque normal vs instantaneo

ALTER TABLE withdrawals ADD COLUMN withdraw_type TEXT NOT NULL DEFAULT 'normal';
-- normal: fee R$0.50, processa em ate 24h
-- instant: fee R$3.50, processa em minutos
