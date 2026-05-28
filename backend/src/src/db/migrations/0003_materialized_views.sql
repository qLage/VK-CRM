-- Migration: Materialized Views for Pre-Aggregated Statistics
-- Phase 02-03: Performance optimization for dashboard queries
-- Created: 2026-03-20

BEGIN;

-- 1. Employee Monthly Statistics
-- Aggregates deal statistics per employee per month
CREATE MATERIALIZED VIEW mv_employee_monthly_stats AS
SELECT
    LOWER(TRIM(d.agent_name)) AS employee_id,
    d.year,
    d.month,
    COUNT(d.id) AS deal_count,
    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
    COALESCE(SUM(d.agent_income), 0)::NUMERIC(12,2) AS total_agent_income,
    COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_mop_revenue,
    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
    MAX(d.updated_at) AS last_updated
FROM deal_table_rows d
WHERE d.status = 'active'
    AND d.agent_name IS NOT NULL
    AND d.agent_name != ''
GROUP BY LOWER(TRIM(d.agent_name)), d.year, d.month;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_employee_monthly_stats_unique
    ON mv_employee_monthly_stats(employee_id, year, month);

-- Create index for fast lookups
CREATE INDEX idx_mv_employee_monthly_stats_period
    ON mv_employee_monthly_stats(year, month);

-- 2. Team Monthly Statistics
-- Aggregates deal statistics per team per month
CREATE MATERIALIZED VIEW mv_team_monthly_stats AS
SELECT
    d.team_id,
    d.year,
    d.month,
    COUNT(d.id) AS deal_count,
    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
    COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_team_revenue,
    COUNT(DISTINCT LOWER(TRIM(d.agent_name))) AS member_count,
    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
    MAX(d.updated_at) AS last_updated
FROM deal_table_rows d
WHERE d.status = 'active'
    AND d.team_id IS NOT NULL
GROUP BY d.team_id, d.year, d.month;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_team_monthly_stats_unique
    ON mv_team_monthly_stats(team_id, year, month);

-- Create index for fast lookups
CREATE INDEX idx_mv_team_monthly_stats_period
    ON mv_team_monthly_stats(year, month);

-- 3. Branch Monthly Statistics
-- Aggregates deal statistics per branch per month
CREATE MATERIALIZED VIEW mv_branch_monthly_stats AS
SELECT
    d.branch_id,
    d.year,
    d.month,
    COUNT(d.id) AS deal_count,
    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
    COALESCE(SUM(d.rop_payout), 0)::NUMERIC(12,2) AS total_rop_payout,
    COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
    COUNT(DISTINCT d.team_id) AS team_count,
    COUNT(DISTINCT LOWER(TRIM(d.agent_name))) AS agent_count,
    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
    MAX(d.updated_at) AS last_updated
FROM deal_table_rows d
WHERE d.status = 'active'
    AND d.branch_id IS NOT NULL
GROUP BY d.branch_id, d.year, d.month;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_branch_monthly_stats_unique
    ON mv_branch_monthly_stats(branch_id, year, month);

-- Create index for fast lookups
CREATE INDEX idx_mv_branch_monthly_stats_period
    ON mv_branch_monthly_stats(year, month);

-- 4. Company Monthly Statistics
-- Aggregates company-wide statistics per month
CREATE MATERIALIZED VIEW mv_company_monthly_stats AS
SELECT
    d.year,
    d.month,
    COUNT(d.id) AS total_deals,
    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
    COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
    COUNT(DISTINCT d.branch_id) AS branch_count,
    COUNT(DISTINCT LOWER(TRIM(d.agent_name))) AS agent_count,
    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
    MAX(d.updated_at) AS last_updated
FROM deal_table_rows d
WHERE d.status = 'active'
GROUP BY d.year, d.month;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_company_monthly_stats_unique
    ON mv_company_monthly_stats(year, month);

-- 5. Create refresh function for all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
    -- Refresh all views concurrently (non-blocking)
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_monthly_stats;

    RAISE NOTICE 'All materialized views refreshed successfully';
END;
$$ LANGUAGE plpgsql;

-- 6. Add comments for documentation
COMMENT ON MATERIALIZED VIEW mv_employee_monthly_stats IS 'Pre-aggregated employee statistics per month for fast KPI queries';
COMMENT ON MATERIALIZED VIEW mv_team_monthly_stats IS 'Pre-aggregated team statistics per month for fast KPI queries';
COMMENT ON MATERIALIZED VIEW mv_branch_monthly_stats IS 'Pre-aggregated branch statistics per month for fast KPI queries';
COMMENT ON MATERIALIZED VIEW mv_company_monthly_stats IS 'Pre-aggregated company-wide statistics per month for fast dashboard queries';
COMMENT ON FUNCTION refresh_all_materialized_views() IS 'Refreshes all KPI materialized views concurrently';

COMMIT;
