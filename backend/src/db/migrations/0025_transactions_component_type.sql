-- Payroll payout rows reference transactions.component_type (SQLite + Postgres).
-- Idempotent: safe if 0005_add_component_type_to_transactions.sql already ran.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS component_type TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_user_component ON transactions(user_id, component_type, created_at)
  WHERE component_type IS NOT NULL;
