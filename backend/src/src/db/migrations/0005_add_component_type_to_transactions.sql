-- Add component_type column to transactions table for tracking salary component payments
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS component_type TEXT;

-- Add index for querying paid components by user and period
CREATE INDEX IF NOT EXISTS idx_transactions_user_component ON transactions(user_id, component_type, created_at) WHERE component_type IS NOT NULL;
