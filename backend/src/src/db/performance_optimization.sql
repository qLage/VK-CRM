-- ============================================================================
-- CRM Database Performance Optimization
-- ============================================================================
-- This script adds critical indexes and optimizations for PostgreSQL
-- Run this after the main migrations to improve query performance

-- ============================================================================
-- 1. CRITICAL INDEXES FOR deal_table_rows (Primary Performance Bottleneck)
-- ============================================================================

-- Index for year/month filtering (used in almost every query)
CREATE INDEX IF NOT EXISTS idx_deal_table_year_month
ON deal_table_rows(year DESC, month DESC);

-- Index for agent name lookups (string matching, heavily used)
CREATE INDEX IF NOT EXISTS idx_deal_table_agent_name_lower
ON deal_table_rows(LOWER(TRIM(agent_name)));

-- Composite index for team hierarchy queries
CREATE INDEX IF NOT EXISTS idx_deal_table_team_year_month
ON deal_table_rows(team_id, year DESC, month DESC)
WHERE team_id IS NOT NULL;

-- Composite index for branch hierarchy queries
CREATE INDEX IF NOT EXISTS idx_deal_table_branch_year_month
ON deal_table_rows(branch_id, year DESC, month DESC)
WHERE branch_id IS NOT NULL;

-- Index for cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_deal_table_updated_at
ON deal_table_rows(updated_at DESC);

-- Covering index for common aggregation queries (reduces table lookups)
CREATE INDEX IF NOT EXISTS idx_deal_table_aggregations
ON deal_table_rows(year, month, team_id, branch_id)
INCLUDE (commission_total_fact, agent_income, mop_revenue, company_revenue);

-- ============================================================================
-- 2. PROFILES TABLE OPTIMIZATION
-- ============================================================================

-- Composite index for team/branch joins (reduces N+1 queries)
CREATE INDEX IF NOT EXISTS idx_profiles_team_branch_active
ON profiles(team_id, branch_id, is_active)
WHERE is_active = 1;

-- Index for position-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_position_active
ON profiles(position_id, is_active)
WHERE is_active = 1;

-- Index for full_name lookups (used in deal matching)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
ON profiles(LOWER(TRIM(full_name)));

-- ============================================================================
-- 3. TRANSACTIONS TABLE OPTIMIZATION
-- ============================================================================

-- Index for type and category filtering
CREATE INDEX IF NOT EXISTS idx_transactions_type_category
ON transactions(type, category, created_at DESC);

-- Index for deal_id lookups (finance integration)
CREATE INDEX IF NOT EXISTS idx_transactions_deal_id
ON transactions(deal_id)
WHERE deal_id IS NOT NULL;

-- Index for user-specific transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
ON transactions(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

-- ============================================================================
-- 4. REPORTS TABLE OPTIMIZATION
-- ============================================================================

-- Composite index for user reports with status
CREATE INDEX IF NOT EXISTS idx_reports_user_status_date
ON reports(user_id, status, created_at DESC);

-- Index for type-based filtering
CREATE INDEX IF NOT EXISTS idx_reports_type_date
ON reports(type, created_at DESC);

-- Index for deal_date queries (used in KPI calculations)
CREATE INDEX IF NOT EXISTS idx_reports_deal_date
ON reports(deal_date)
WHERE deal_date IS NOT NULL;

-- ============================================================================
-- 5. SERVICE_REQUESTS TABLE OPTIMIZATION (if exists)
-- ============================================================================

-- Composite index for user activity queries
CREATE INDEX IF NOT EXISTS idx_service_requests_user_type_date
ON service_requests(user_id, type, created_at DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_service_requests_status_date
ON service_requests(status, created_at DESC);

-- ============================================================================
-- 6. ANALYZE TABLES (Update Statistics)
-- ============================================================================

ANALYZE deal_table_rows;
ANALYZE profiles;
ANALYZE transactions;
ANALYZE reports;
ANALYZE service_requests;
ANALYZE positions;
ANALYZE teams;
ANALYZE branches;

-- ============================================================================
-- 7. VACUUM TABLES (Reclaim Space and Update Visibility Map)
-- ============================================================================

VACUUM ANALYZE deal_table_rows;
VACUUM ANALYZE profiles;
VACUUM ANALYZE transactions;

-- ============================================================================
-- Notes:
-- - Run this script during low-traffic periods
-- - Monitor index usage with: SELECT * FROM pg_stat_user_indexes;
-- - Check for unused indexes periodically
-- - Consider REINDEX if indexes become bloated
-- ============================================================================
