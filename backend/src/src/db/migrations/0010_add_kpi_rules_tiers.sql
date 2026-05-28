-- ============================================================================
-- Migration: 0010_add_kpi_rules_tiers.sql
-- Purpose: Populate kpi_rules table with all bonus tiers for realtors, MOP, ROP
--          Update base salaries for MOP and ROP positions in positions table
--
-- KPI Rules Structure:
--   - Realtor: 5 tiers based on monthly revenue thresholds (0 to 1.55M rubles)
--   - MOP (Sales Manager): 3 tiers based on plan completion (50% to 120%)
--   - ROP (Head of Sales): 4 tiers based on plan completion (50% to 120%)
--
-- Base Salaries:
--   - MOP: 40,000 rubles
--   - ROP: 80,000 rubles
--
-- Author: GSD Plan Executor
-- Date: 2026-03-26
-- ============================================================================

-- ============================================================================
-- STEP 1: Clear existing rules
-- ============================================================================
-- Delete all existing KPI rules for the three roles to ensure clean state
-- This prevents duplicates when re-running migration
DELETE FROM kpi_rules
WHERE role IN ('realtor', 'sales_manager', 'head_sales');

-- ============================================================================
-- STEP 2: Insert Realtor Bonus Tiers (5 tiers)
-- ============================================================================
-- Realtors earn percentage of revenue based on monthly performance
-- Higher revenue thresholds unlock higher bonus percentages
-- Thresholds: 0, 700k, 900k, 1.2M, 1.55M rubles
-- Percentages: 40%, 45%, 50%, 55%, 60%

INSERT INTO kpi_rules (id, role, period_type, min_threshold, percent, description)
VALUES
    -- Tier 1: Base rate - no minimum threshold
    (
        gen_random_uuid(),
        'realtor',
        'monthly',
        0,
        40,
        'Реиелтор: 40% при выручке от 0₽'
    ),
    -- Tier 2: Junior performer - 700k threshold
    (
        gen_random_uuid(),
        'realtor',
        'monthly',
        700000,
        45,
        'Реиелтор: 45% при выручке от 700 000₽'
    ),
    -- Tier 3: Experienced performer - 900k threshold
    (
        gen_random_uuid(),
        'realtor',
        'monthly',
        900000,
        50,
        'Реиелтор: 50% при выручке от 900 000₽'
    ),
    -- Tier 4: Senior performer - 1.2M threshold
    (
        gen_random_uuid(),
        'realtor',
        'monthly',
        1200000,
        55,
        'Реиелтор: 55% при выручке от 1 200 000₽'
    ),
    -- Tier 5: Top performer - 1.55M threshold
    (
        gen_random_uuid(),
        'realtor',
        'monthly',
        1550000,
        60,
        'Реиелтор: 60% при выручке от 1 550 000₽'
    );

-- ============================================================================
-- STEP 3: Insert MOP (Sales Manager) Bonus Tiers (3 tiers)
-- ============================================================================
-- MOP earns percentage of TEAM revenue based on plan completion
-- Manager bonus = (team revenue) * (percent based on plan %)
-- Plan completion thresholds: 50%, 95%, 120%
-- Percentages: 3%, 4%, 5% of team revenue

INSERT INTO kpi_rules (id, role, period_type, min_threshold, percent, description)
VALUES
    -- Tier 1: Minimum threshold - 50% plan completion
    (
        gen_random_uuid(),
        'sales_manager',
        'monthly',
        50,
        3,
        'МОП: 3% (от выручки команды) при выполнении плана 50%'
    ),
    -- Tier 2: Target achievement - 95% plan completion
    (
        gen_random_uuid(),
        'sales_manager',
        'monthly',
        95,
        4,
        'МОП: 4% (от выручки команды) при выполнении плана 95%'
    ),
    -- Tier 3: Overachievement - 120% plan completion
    (
        gen_random_uuid(),
        'sales_manager',
        'monthly',
        120,
        5,
        'МОП: 5% (от выручки команды) при выполнении плана 120%'
    );

-- ============================================================================
-- STEP 4: Insert ROP (Head of Sales) Bonus Tiers (4 tiers)
-- ============================================================================
-- ROP earns percentage of AGENCY revenue based on plan completion
-- Head of Sales bonus = (agency revenue) * (percent based on plan %)
-- Plan completion thresholds: 50%, 75%, 95%, 120%
-- Percentages: 3%, 4%, 5%, 6% of agency revenue

INSERT INTO kpi_rules (id, role, period_type, min_threshold, percent, description)
VALUES
    -- Tier 1: Minimum threshold - 50% plan completion
    (
        gen_random_uuid(),
        'head_sales',
        'monthly',
        50,
        3,
        'РОП: 3% (от выручки агентства) при выполнении плана 50%'
    ),
    -- Tier 2: Moderate performance - 75% plan completion
    (
        gen_random_uuid(),
        'head_sales',
        'monthly',
        75,
        4,
        'РОП: 4% (от выручки агентства) при выполнении плана 75%'
    ),
    -- Tier 3: Target achievement - 95% plan completion
    (
        gen_random_uuid(),
        'head_sales',
        'monthly',
        95,
        5,
        'РОП: 5% (от выручки агентства) при выполнении плана 95%'
    ),
    -- Tier 4: Overachievement - 120% plan completion
    (
        gen_random_uuid(),
        'head_sales',
        'monthly',
        120,
        6,
        'РОП: 6% (от выручки агентства) при выполнении плана 120%'
    );

-- ============================================================================
-- STEP 5: Update Base Salaries in Positions Table
-- ============================================================================
-- Set fixed base salaries for management positions
-- MOP (Manager On Place / sales_manager): 40,000 rubles
-- ROP (Regional On Place / head_sales): 80,000 rubles
-- Uses ILIKE for case-insensitive matching with Cyrillic characters

-- Update MOP base salary
UPDATE positions
SET base_salary = 40000
WHERE name ILIKE '%моп%';

-- Update ROP base salary
UPDATE positions
SET base_salary = 80000
WHERE name ILIKE '%роп%';

-- ============================================================================
-- VERIFICATION QUERIES (uncomment to verify after migration)
-- ============================================================================
-- Verify realtor rules (should return 5 rows)
-- SELECT * FROM kpi_rules WHERE role = 'realtor' ORDER BY min_threshold;

-- Verify MOP rules (should return 3 rows)
-- SELECT * FROM kpi_rules WHERE role = 'sales_manager' ORDER BY min_threshold;

-- Verify ROP rules (should return 4 rows)
-- SELECT * FROM kpi_rules WHERE role = 'head_sales' ORDER BY min_threshold;

-- Verify position salaries
-- SELECT name, base_salary FROM positions WHERE name ILIKE '%моп%' OR name ILIKE '%роп%';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
