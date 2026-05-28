-- Fix created_by for existing deal_table_rows
-- Sets created_by based on user's full_name matching agent_name
-- For deals where created_by is NULL or empty

-- Update deals where we can match agent_name to a user's full_name
UPDATE deal_table_rows dtr
SET created_by = p.id
FROM profiles p
WHERE dtr.agent_name = p.full_name
  AND (dtr.created_by IS NULL OR dtr.created_by = '');

-- Log how many rows were updated
-- Run this separately to verify:
-- SELECT COUNT(*) FROM deal_table_rows WHERE created_by IS NOT NULL;
