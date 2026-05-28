-- Add company_id column to recurring_expenses table for multi-tenant isolation

-- Step 1: Add company_id column (nullable initially)
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS company_id TEXT;

-- Step 2: Set company_id from created_by user's company
UPDATE recurring_expenses re
SET company_id = p.company_id
FROM profiles p
WHERE re.created_by = p.id
  AND re.company_id IS NULL;

-- Step 3: For any remaining NULL values, set a default company_id
-- (This handles edge cases where created_by user no longer exists)
UPDATE recurring_expenses
SET company_id = (SELECT company_id FROM profiles LIMIT 1)
WHERE company_id IS NULL;

-- Step 4: Make company_id NOT NULL
ALTER TABLE recurring_expenses
  ALTER COLUMN company_id SET NOT NULL;

-- Step 5: Create index for performance
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_company_id
  ON recurring_expenses(company_id);

-- Step 6: Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_company_created
  ON recurring_expenses(company_id, created_at DESC);
