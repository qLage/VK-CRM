-- ============================================================================
-- Materialized Views for CRM Performance Optimization
-- ============================================================================
-- These views pre-calculate expensive aggregations
-- Refresh them periodically (e.g., hourly or after deal updates)

-- ============================================================================
-- 1. EMPLOYEE MONTHLY STATISTICS
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_monthly_agent_summary;
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_employee_monthly_stats AS
SELECT
    agent_id as employee_id,
    year,
    month,
    COUNT(*) as deal_count,
    SUM(commission_total_fact) as total_commission,
    SUM(agent_income) as total_agent_income,
    SUM(mop_revenue) as total_mop_revenue,
    AVG(commission_total_fact) as avg_check,
    MAX(updated_at) as last_updated
FROM deal_table_rows
WHERE agent_id IS NOT NULL
GROUP BY agent_id, year, month;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_employee_monthly_stats_unique
ON mv_employee_monthly_stats(employee_id, year, month);

-- ============================================================================
-- 2. TEAM MONTHLY STATISTICS
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_monthly_team_summary;
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_team_monthly_stats AS
SELECT
    team_id,
    year,
    month,
    COUNT(*) as deal_count,
    SUM(commission_total_fact) as total_commission,
    SUM(company_revenue) as total_team_revenue,
    COUNT(DISTINCT agent_id) as member_count,
    AVG(commission_total_fact) as avg_check,
    MAX(updated_at) as last_updated
FROM deal_table_rows
WHERE team_id IS NOT NULL
GROUP BY team_id, year, month;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_team_monthly_stats_unique
ON mv_team_monthly_stats(team_id, year, month);

-- ============================================================================
-- 3. BRANCH MONTHLY STATISTICS
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_monthly_branch_summary;
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_branch_monthly_stats AS
SELECT
    branch_id,
    year,
    month,
    COUNT(*) as deal_count,
    SUM(commission_total_fact) as total_commission,
    SUM(rop_payout) as total_rop_payout,
    SUM(company_revenue) as total_company_revenue,
    COUNT(DISTINCT team_id) as team_count,
    COUNT(DISTINCT agent_id) as agent_count,
    AVG(commission_total_fact) as avg_check,
    MAX(updated_at) as last_updated
FROM deal_table_rows
WHERE branch_id IS NOT NULL
GROUP BY branch_id, year, month;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_branch_monthly_stats_unique
ON mv_branch_monthly_stats(branch_id, year, month);

-- ============================================================================
-- 4. COMPANY MONTHLY STATISTICS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_company_monthly_stats AS
SELECT
    year,
    month,
    COUNT(*) as total_deals,
    SUM(commission_total_fact) as total_commission,
    SUM(company_revenue) as total_company_revenue,
    COUNT(DISTINCT branch_id) as branch_count,
    COUNT(DISTINCT agent_id) as agent_count,
    AVG(commission_total_fact) as avg_check,
    MAX(updated_at) as last_updated
FROM deal_table_rows
GROUP BY year, month;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_company_monthly_stats_unique
ON mv_company_monthly_stats(year, month);

-- ============================================================================
-- 5. EMPLOYEE KPI SUMMARY (Current Period)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_employee_kpi_current AS
SELECT
    p.id as employee_id,
    p.full_name,
    p.team_id,
    p.branch_id,
    p.position_id,
    COALESCE(d.deal_count, 0) as deal_count,
    COALESCE(d.total_revenue, 0) as total_revenue,
    COALESCE(d.total_agent_income, 0) as total_agent_income,
    p.personal_kpi_current,
    p.management_kpi_current,
    p.is_active
FROM profiles p
LEFT JOIN (
    SELECT
        agent_id,
        COUNT(*) as deal_count,
        SUM(commission_total_fact) as total_revenue,
        SUM(agent_income) as total_agent_income
    FROM deal_table_rows
    WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)
      AND month = EXTRACT(MONTH FROM CURRENT_DATE)
    GROUP BY agent_id
) d ON p.id::TEXT = d.agent_id
WHERE p.is_active = 1;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_employee_kpi_current_unique
ON mv_employee_kpi_current(employee_id);

-- ============================================================================
-- 6. REFRESH FUNCTIONS
-- ============================================================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
    -- We can't use CONCURRENTLY if table is empty, but we'll assume it's populated for now
    -- or handle the first refresh manually.
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_monthly_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_kpi_current;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh only current period views (faster)
CREATE OR REPLACE FUNCTION refresh_current_period_mv()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_kpi_current;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
