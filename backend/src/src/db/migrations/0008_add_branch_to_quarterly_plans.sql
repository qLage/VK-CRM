-- Migration: Add branch_id to quarterly_plans for branch-specific planning
-- Issue: Plans should be scoped to individual branches, not company-wide
-- Date: 2026-03-23
-- Related: Implement branch-specific quarterly planning system

BEGIN;

-- Step 1: Add branch_id column (nullable initially for safe migration)
ALTER TABLE quarterly_plans
  ADD COLUMN IF NOT EXISTS branch_id TEXT;

-- Step 2: Identify default branch for backfilling existing records
-- Get the first branch from the branches table, or we'll need to create one
DO $$
DECLARE
  default_branch_id TEXT;
BEGIN
  -- Try to get the first existing branch
  SELECT id INTO default_branch_id FROM branches ORDER BY created_at LIMIT 1;

  -- If no branches exist, create a default one
  IF default_branch_id IS NULL THEN
    default_branch_id := 'default-branch-' || gen_random_uuid()::text;
    INSERT INTO branches (id, name, city, company_id, created_at, updated_at)
    SELECT
      default_branch_id,
      'Main Office',
      'Default',
      company_id,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM companies
    LIMIT 1;

    RAISE NOTICE 'Created default branch: %', default_branch_id;
  END IF;

  -- Step 3: Backfill existing quarterly_plans with default branch_id
  UPDATE quarterly_plans
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Backfilled % records with branch_id: %',
    (SELECT COUNT(*) FROM quarterly_plans WHERE branch_id = default_branch_id),
    default_branch_id;
END $$;

-- Step 4: Make branch_id NOT NULL now that all records have values
ALTER TABLE quarterly_plans
  ALTER COLUMN branch_id SET NOT NULL;

-- Step 5: Add foreign key constraint to branches table
ALTER TABLE quarterly_plans
  ADD CONSTRAINT fk_quarterly_plans_branch
  FOREIGN KEY (branch_id) REFERENCES branches(id)
  ON DELETE CASCADE;

-- Step 6: Drop old unique constraint (period_year, period_quarter only)
ALTER TABLE quarterly_plans
  DROP CONSTRAINT IF EXISTS quarterly_plans_period_year_period_quarter_key;

-- Step 7: Add new unique constraint including branch_id
ALTER TABLE quarterly_plans
  ADD CONSTRAINT quarterly_plans_period_year_quarter_branch_key
  UNIQUE (period_year, period_quarter, branch_id);

-- Add comment for documentation
COMMENT ON COLUMN quarterly_plans.branch_id IS 'Branch ID for branch-specific quarterly planning';

COMMIT;
