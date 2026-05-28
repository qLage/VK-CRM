-- Fix transactions table timestamp columns
-- Change created_at and updated_at from TEXT to TIMESTAMP

-- Step 1: Add new timestamp columns
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_at_new TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS updated_at_new TIMESTAMP WITHOUT TIME ZONE;

-- Step 2: Copy data from text columns to timestamp columns
UPDATE transactions
SET
  created_at_new = created_at::timestamp,
  updated_at_new = updated_at::timestamp
WHERE created_at IS NOT NULL OR updated_at IS NOT NULL;

-- Step 3: Drop old text columns
ALTER TABLE transactions
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS updated_at;

-- Step 4: Rename new columns to original names
ALTER TABLE transactions
  RENAME COLUMN created_at_new TO created_at;

ALTER TABLE transactions
  RENAME COLUMN updated_at_new TO updated_at;

-- Step 5: Set defaults
ALTER TABLE transactions
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Step 6: Recreate index if it exists
DROP INDEX IF EXISTS idx_transactions_company_date;
CREATE INDEX IF NOT EXISTS idx_transactions_company_date
  ON transactions(company_id, created_at);
