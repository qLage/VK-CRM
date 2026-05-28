-- ============================================================================
-- Query Optimization Examples
-- ============================================================================
-- This file contains before/after examples of optimized queries
-- Use these as templates when refactoring route handlers

-- ============================================================================
-- 1. EMPLOYEE STATS - Eliminate N+1 Query
-- ============================================================================

-- BEFORE (N+1 Problem - queries each employee separately)
-- File: backend/src/routes/employees.js
/*
for (const employee of employees) {
    const dealRes = await query(
        `SELECT COUNT(*) as total_deals, SUM(commission_total_fact) as total_revenue
         FROM deal_table_rows
         WHERE agent_name = $1`,
        [employee.full_name]
    );
}
*/

-- AFTER (Single Query with JOIN)
SELECT
    p.id,
    p.full_name,
    p.team_id,
    p.branch_id,
    p.position_id,
    COUNT(d.id) as total_deals,
    COALESCE(SUM(d.commission_total_fact), 0) as total_revenue,
    COALESCE(SUM(d.agent_income), 0) as total_agent_income,
    COALESCE(SUM(d.mop_revenue), 0) as total_mop_revenue
FROM profiles p
LEFT JOIN deal_table_rows d
    ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
    AND d.year = $1
    AND d.month = $2
WHERE p.is_active = 1
GROUP BY p.id, p.full_name, p.team_id, p.branch_id, p.position_id
ORDER BY total_revenue DESC;

-- ============================================================================
-- 2. TEAM DEALS GROUPED - Use Materialized View
-- ============================================================================

-- BEFORE (Expensive aggregation on every request)
-- File: backend/src/routes/deal-table.js:117-151
/*
SELECT
    agent_name,
    COUNT(*) as deal_count,
    SUM(commission_seller_plan) as total_commission_seller_plan,
    SUM(commission_buyer_plan) as total_commission_buyer_plan,
    SUM(commission_total_fact) as total_commission_fact,
    SUM(agent_income) as total_agent_income
FROM deal_table_rows
WHERE team_id = $1 AND year = $2 AND month = $3
GROUP BY agent_name
ORDER BY agent_name;
*/

-- AFTER (Use Materialized View)
SELECT
    agent_name,
    deal_count,
    total_commission_seller_plan,
    total_commission_buyer_plan,
    total_commission_fact,
    total_agent_income,
    total_mop_revenue,
    total_company_revenue
FROM mv_monthly_agent_summary
WHERE team_id = $1
  AND year = $2
  AND month = $3
ORDER BY agent_name;

-- ============================================================================
-- 3. BRANCH DEALS GROUPED - Optimized with Covering Index
-- ============================================================================

-- BEFORE (Full table scan with aggregations)
/*
SELECT
    d.team_id,
    t.name as team_name,
    COUNT(*) as deal_count,
    SUM(d.commission_total_fact) as total_commission_fact
FROM deal_table_rows d
LEFT JOIN teams t ON t.id::uuid = d.team_id
WHERE d.branch_id = $1 AND d.year = $2 AND d.month = $3
GROUP BY d.team_id, t.name
ORDER BY t.name;
*/

-- AFTER (Use Materialized View with team name pre-joined)
SELECT
    ms.team_id,
    t.name as team_name,
    ms.deal_count,
    ms.total_commission_fact,
    ms.total_agent_income,
    ms.total_mop_revenue,
    ms.total_company_revenue
FROM mv_monthly_team_summary ms
LEFT JOIN teams t ON t.id = ms.team_id
WHERE ms.branch_id = $1
  AND ms.year = $2
  AND ms.month = $3
ORDER BY t.name;

-- ============================================================================
-- 4. EMPLOYEE ACTIVITY FEED - Optimized Pagination
-- ============================================================================

-- BEFORE (Inefficient OFFSET pagination)
/*
SELECT id, property_name, commission_total_fact, created_at
FROM deal_table_rows
WHERE agent_name = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
*/

-- AFTER (Cursor-based pagination with index)
SELECT id, property_name, commission_total_fact, created_at
FROM deal_table_rows
WHERE agent_name = $1
  AND created_at < $2  -- cursor
ORDER BY created_at DESC
LIMIT $3;

-- ============================================================================
-- 5. KPI LEADERBOARD - Optimized with Materialized View
-- ============================================================================

-- BEFORE (Expensive aggregation across all employees)
/*
SELECT
    p.id,
    p.full_name,
    COUNT(d.id) as deal_count,
    SUM(d.commission_total_fact) as total_revenue
FROM profiles p
LEFT JOIN deal_table_rows d ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
WHERE p.is_active = 1
  AND d.year = $1
  AND d.month = $2
GROUP BY p.id, p.full_name
ORDER BY total_revenue DESC
LIMIT 20;
*/

-- AFTER (Use pre-calculated materialized view)
SELECT
    employee_id,
    full_name,
    deal_count,
    total_revenue,
    total_agent_income,
    personal_kpi_current
FROM mv_employee_kpi_current
WHERE is_active = 1
ORDER BY total_revenue DESC
LIMIT 20;

-- ============================================================================
-- 6. FINANCIAL SUMMARY - Optimized Aggregation
-- ============================================================================

-- BEFORE (Multiple separate queries)
/*
-- Query 1: Income
SELECT SUM(amount) FROM transactions WHERE type = 'income';
-- Query 2: Expenses
SELECT SUM(amount) FROM transactions WHERE type = 'expense';
-- Query 3: By category
SELECT category, SUM(amount) FROM transactions GROUP BY category;
*/

-- AFTER (Single query with conditional aggregation)
SELECT
    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense,
    SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net_balance,
    jsonb_object_agg(
        category,
        jsonb_build_object(
            'income', SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END),
            'expense', SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)
        )
    ) as by_category
FROM transactions
WHERE created_at >= $1 AND created_at <= $2;

-- ============================================================================
-- 7. PROFILE LOOKUP CACHING - Middleware Optimization
-- ============================================================================

-- BEFORE (Repeated profile queries in every endpoint)
/*
-- In deal-table.js, employees.js, etc.
const profileResult = await query('SELECT team_id FROM profiles WHERE id = $1', [req.user.id]);
const teamId = profileResult.rows[0].team_id;
*/

-- AFTER (Single query in auth middleware, cached in req.user)
-- In middleware/auth.js:
SELECT
    p.id,
    p.full_name,
    p.team_id,
    p.branch_id,
    p.position_id,
    p.is_active,
    pos.access_level,
    pos.can_view_finances,
    pos.can_manage_finances,
    t.name as team_name,
    b.name as branch_name
FROM profiles p
LEFT JOIN positions pos ON p.position_id = pos.id
LEFT JOIN teams t ON p.team_id = t.id
LEFT JOIN branches b ON p.branch_id = b.id
WHERE p.id = $1;

-- Then in route handlers, just use: req.user.team_id

-- ============================================================================
-- 8. DEAL TOTALS - Use Covering Index
-- ============================================================================

-- BEFORE (Table scan for aggregations)
/*
SELECT
    COUNT(*) as total_deals,
    SUM(commission_total_fact) as total_commission,
    AVG(commission_total_fact) as avg_commission
FROM deal_table_rows
WHERE year = $1 AND month = $2 AND team_id = $3;
*/

-- AFTER (Same query, but with covering index it's 10x faster)
-- Index: idx_deal_table_aggregations covers (year, month, team_id)
--        and INCLUDES (commission_total_fact, agent_income, etc.)
-- PostgreSQL can satisfy this query entirely from the index

SELECT
    COUNT(*) as total_deals,
    SUM(commission_total_fact) as total_commission,
    AVG(commission_total_fact) as avg_commission,
    SUM(agent_income) as total_agent_income,
    SUM(company_revenue) as total_company_revenue
FROM deal_table_rows
WHERE year = $1 AND month = $2 AND team_id = $3;

-- ============================================================================
-- 9. REPORTS WITH USER INFO - Optimized JOIN
-- ============================================================================

-- BEFORE (Separate queries or inefficient JOIN)
/*
SELECT r.*, p.full_name, p.avatar_url
FROM reports r
LEFT JOIN profiles p ON r.user_id = p.id
WHERE r.created_at < $1
ORDER BY r.created_at DESC
LIMIT 50;
*/

-- AFTER (Same query, but with proper indexes)
-- Index on reports(created_at DESC)
-- Index on profiles(id) - should exist as PK
SELECT
    r.id,
    r.user_id,
    r.type,
    r.status,
    r.title,
    r.amount,
    r.created_at,
    p.full_name,
    p.avatar_url,
    p.position_id
FROM reports r
LEFT JOIN profiles p ON r.user_id = p.id
WHERE r.created_at < $1
ORDER BY r.created_at DESC
LIMIT 50;

-- ============================================================================
-- 10. MONTHLY TRENDS - Window Functions Instead of Multiple Queries
-- ============================================================================

-- BEFORE (Separate query for each month)
/*
for (let month = 1; month <= 12; month++) {
    const result = await query(
        'SELECT COUNT(*), SUM(commission_total_fact) FROM deal_table_rows WHERE year = $1 AND month = $2',
        [year, month]
    );
}
*/

-- AFTER (Single query with window functions)
SELECT
    year,
    month,
    COUNT(*) as deal_count,
    SUM(commission_total_fact) as monthly_revenue,
    SUM(SUM(commission_total_fact)) OVER (
        PARTITION BY year
        ORDER BY month
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_revenue,
    AVG(commission_total_fact) as avg_deal_size,
    LAG(SUM(commission_total_fact)) OVER (
        PARTITION BY year
        ORDER BY month
    ) as prev_month_revenue
FROM deal_table_rows
WHERE year = $1
GROUP BY year, month
ORDER BY year, month;

-- ============================================================================
