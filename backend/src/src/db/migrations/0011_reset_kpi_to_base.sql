-- ============================================================================
-- Migration: 0011_reset_kpi_to_base.sql
-- Purpose: Reset all users' KPI to base level (40% for realtors, 3% for management)
--          Clear personal_kpi_current and management_kpi_current to position defaults
--
-- Author: GSD Quick Task 260326-iet
-- Date: 2026-03-26
-- ============================================================================

-- ============================================================================
-- STEP 1: Reset Realtor KPI to base level (40%)
-- ============================================================================
-- Reset personal_kpi_current to 40%
-- Reset management_kpi_current to 0 (not applicable for realtors)
UPDATE profiles p
SET personal_kpi_current = 40,
    management_kpi_current = 0
FROM positions pos
WHERE p.position_id = pos.id
  AND pos.name = 'Риелтор';

-- ============================================================================
-- STEP 2: Reset Management KPI to base level (3%)
-- ============================================================================
-- Reset personal_kpi_current to 3% (base level for management)
-- Reset management_kpi_current to 3% (base level)
UPDATE profiles p
SET personal_kpi_current = 3,
    management_kpi_current = 3
FROM positions pos
WHERE p.position_id = pos.id
  AND pos.name IN ('МОП', 'РОП', 'Директор', 'Коммерческий директор');

-- ============================================================================
-- VERIFICATION QUERIES (uncomment to verify after migration)
-- ============================================================================
-- Verify realtor KPI reset (should show 40%)
-- SELECT p.full_name, pos.name as position, p.personal_kpi_current, p.management_kpi_current
-- FROM profiles p
-- JOIN positions pos ON p.position_id = pos.id
-- WHERE pos.name ILIKE '%realtor%' OR pos.name ILIKE '%реелтор%'
-- ORDER BY p.full_name;

-- Verify management KPI reset (should show 3%)
-- SELECT p.full_name, pos.name as position, p.personal_kpi_current, p.management_kpi_current
-- FROM profiles p
-- JOIN positions pos ON p.position_id = pos.id
-- WHERE pos.name ILIKE '%manager%' OR pos.name ILIKE '%моп%'
--    OR pos.name ILIKE '%head_sales%' OR pos.name ILIKE '%роп%'
--    OR pos.name ILIKE '%director%' OR pos.name ILIKE '%директор%'
--    OR pos.name ILIKE '%commercial%' OR pos.name ILIKE '%коммерческ%'
-- ORDER BY p.full_name;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
