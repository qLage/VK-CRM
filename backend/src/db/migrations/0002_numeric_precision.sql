-- Migration: Convert financial columns to NUMERIC for precision
-- Phase 02-02: Unified KPI Calculation Engine
-- Created: 2026-03-20

BEGIN;

-- 1. Convert deal_table_rows financial columns to NUMERIC(12,2)
-- Note: Some columns may already be NUMERIC from schema definition
ALTER TABLE deal_table_rows
  ALTER COLUMN commission_seller_plan TYPE NUMERIC(12,2) USING commission_seller_plan::NUMERIC(12,2),
  ALTER COLUMN commission_buyer_plan TYPE NUMERIC(12,2) USING commission_buyer_plan::NUMERIC(12,2),
  ALTER COLUMN commission_seller_fact TYPE NUMERIC(12,2) USING commission_seller_fact::NUMERIC(12,2),
  ALTER COLUMN commission_buyer_fact TYPE NUMERIC(12,2) USING commission_buyer_fact::NUMERIC(12,2),
  ALTER COLUMN commission_total_fact TYPE NUMERIC(12,2) USING commission_total_fact::NUMERIC(12,2),
  ALTER COLUMN agent_income TYPE NUMERIC(12,2) USING agent_income::NUMERIC(12,2),
  ALTER COLUMN mop_revenue TYPE NUMERIC(12,2) USING mop_revenue::NUMERIC(12,2),
  ALTER COLUMN rop_payout TYPE NUMERIC(12,2) USING rop_payout::NUMERIC(12,2),
  ALTER COLUMN mortgage_deduction TYPE NUMERIC(12,2) USING mortgage_deduction::NUMERIC(12,2),
  ALTER COLUMN other_expenses TYPE NUMERIC(12,2) USING other_expenses::NUMERIC(12,2),
  ALTER COLUMN company_revenue TYPE NUMERIC(12,2) USING company_revenue::NUMERIC(12,2),
  ALTER COLUMN deal_amount TYPE NUMERIC(12,2) USING deal_amount::NUMERIC(12,2),
  ALTER COLUMN agent_manual_bonus TYPE NUMERIC(12,2) USING agent_manual_bonus::NUMERIC(12,2),
  ALTER COLUMN rop_manual_bonus TYPE NUMERIC(12,2) USING rop_manual_bonus::NUMERIC(12,2),
  ALTER COLUMN plan_completion TYPE NUMERIC(12,2) USING plan_completion::NUMERIC(12,2),
  ALTER COLUMN marginality TYPE NUMERIC(12,2) USING marginality::NUMERIC(12,2);

-- 2. Convert deal_table_rows percentage columns to NUMERIC(5,2)
ALTER TABLE deal_table_rows
  ALTER COLUMN agent_percent_seller TYPE NUMERIC(5,2) USING agent_percent_seller::NUMERIC(5,2),
  ALTER COLUMN agent_percent_buyer TYPE NUMERIC(5,2) USING agent_percent_buyer::NUMERIC(5,2),
  ALTER COLUMN agent_percent TYPE NUMERIC(5,2) USING agent_percent::NUMERIC(5,2),
  ALTER COLUMN mop_percent TYPE NUMERIC(5,2) USING mop_percent::NUMERIC(5,2),
  ALTER COLUMN rop_percent TYPE NUMERIC(5,2) USING rop_percent::NUMERIC(5,2);

-- 3. Convert profiles KPI columns (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='personal_kpi_current') THEN
    ALTER TABLE profiles
      ALTER COLUMN personal_kpi_current TYPE NUMERIC(5,2) USING personal_kpi_current::NUMERIC(5,2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='management_kpi_current') THEN
    ALTER TABLE profiles
      ALTER COLUMN management_kpi_current TYPE NUMERIC(5,2) USING management_kpi_current::NUMERIC(5,2);
  END IF;
END $$;

-- 4. Convert positions default KPI columns (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='positions' AND column_name='default_personal_kpi_min') THEN
    ALTER TABLE positions
      ALTER COLUMN default_personal_kpi_min TYPE NUMERIC(5,2) USING default_personal_kpi_min::NUMERIC(5,2),
      ALTER COLUMN default_personal_kpi_max TYPE NUMERIC(5,2) USING default_personal_kpi_max::NUMERIC(5,2),
      ALTER COLUMN default_management_kpi_min TYPE NUMERIC(5,2) USING default_management_kpi_min::NUMERIC(5,2),
      ALTER COLUMN default_management_kpi_max TYPE NUMERIC(5,2) USING default_management_kpi_max::NUMERIC(5,2);
  END IF;
END $$;

-- 5. Add comments for documentation
COMMENT ON COLUMN deal_table_rows.commission_total_fact IS 'Total commission (NUMERIC for precision, no floating-point errors)';
COMMENT ON COLUMN deal_table_rows.agent_income IS 'Agent income (NUMERIC for precision)';
COMMENT ON COLUMN deal_table_rows.mop_revenue IS 'MOP revenue (NUMERIC for precision)';
COMMENT ON COLUMN deal_table_rows.company_revenue IS 'Company revenue (NUMERIC for precision)';

COMMIT;
