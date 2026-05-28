-- Migration: Add missing rop_percent column to deal_table_rows
-- Issue: Column was defined in TypeScript schema but missing from database
-- Date: 2026-03-22
-- Related: Fix for /api/finances/salaries 500 error

BEGIN;

-- Add rop_percent column if it doesn't exist
-- This column stores the ROP (Regional Operations Manager) commission percentage
ALTER TABLE deal_table_rows
  ADD COLUMN IF NOT EXISTS rop_percent NUMERIC(12,2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN deal_table_rows.rop_percent IS 'ROP commission percentage (0-100)';

COMMIT;
