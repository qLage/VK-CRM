-- ============================================================================
-- Database Maintenance and Monitoring Script
-- ============================================================================
-- Run this periodically to monitor database health and performance

-- ============================================================================
-- 1. INDEX USAGE STATISTICS
-- ============================================================================

-- Check which indexes are being used
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Find unused indexes (candidates for removal)
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelid NOT IN (
    SELECT indexrelid FROM pg_index WHERE indisprimary OR indisunique
  )
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- 2. TABLE STATISTICS
-- ============================================================================

-- Table sizes and row counts
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
    n_live_tup as row_count,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Tables needing VACUUM
SELECT
    schemaname,
    tablename,
    n_live_tup,
    n_dead_tup,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 100
  AND ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) > 10
ORDER BY dead_ratio DESC;

-- ============================================================================
-- 3. SLOW QUERIES (requires pg_stat_statements extension)
-- ============================================================================

-- Enable extension if not already enabled
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 20 slowest queries by average time
SELECT
    ROUND(mean_exec_time::numeric, 2) as avg_time_ms,
    calls,
    ROUND(total_exec_time::numeric, 2) as total_time_ms,
    ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) as pct_total,
    LEFT(query, 100) as query_preview
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Most frequently called queries
SELECT
    calls,
    ROUND(mean_exec_time::numeric, 2) as avg_time_ms,
    ROUND(total_exec_time::numeric, 2) as total_time_ms,
    LEFT(query, 100) as query_preview
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY calls DESC
LIMIT 20;

-- Queries consuming most total time
SELECT
    ROUND(total_exec_time::numeric, 2) as total_time_ms,
    calls,
    ROUND(mean_exec_time::numeric, 2) as avg_time_ms,
    ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) as pct_total,
    LEFT(query, 100) as query_preview
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- ============================================================================
-- 4. MATERIALIZED VIEW FRESHNESS
-- ============================================================================

-- Check when materialized views were last refreshed
SELECT
    'mv_monthly_agent_summary' as view_name,
    MAX(last_updated) as last_refresh,
    COUNT(*) as row_count,
    EXTRACT(EPOCH FROM (NOW() - MAX(last_updated)))/60 as minutes_since_refresh
FROM mv_monthly_agent_summary
UNION ALL
SELECT
    'mv_monthly_team_summary',
    MAX(last_updated),
    COUNT(*),
    EXTRACT(EPOCH FROM (NOW() - MAX(last_updated)))/60
FROM mv_monthly_team_summary
UNION ALL
SELECT
    'mv_monthly_branch_summary',
    MAX(last_updated),
    COUNT(*),
    EXTRACT(EPOCH FROM (NOW() - MAX(last_updated)))/60
FROM mv_monthly_branch_summary;

-- ============================================================================
-- 5. CONNECTION AND LOCK MONITORING
-- ============================================================================

-- Active connections by state
SELECT
    state,
    COUNT(*) as connection_count,
    MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_seconds_in_state
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY connection_count DESC;

-- Long-running queries (over 30 seconds)
SELECT
    pid,
    usename,
    application_name,
    state,
    EXTRACT(EPOCH FROM (NOW() - query_start)) as seconds_running,
    LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE datname = current_database()
  AND state = 'active'
  AND query_start < NOW() - INTERVAL '30 seconds'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- Blocking queries
SELECT
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- ============================================================================
-- 6. CACHE HIT RATIOS
-- ============================================================================

-- Table cache hit ratio (should be > 99%)
SELECT
    schemaname,
    tablename,
    heap_blks_read as disk_reads,
    heap_blks_hit as cache_hits,
    ROUND(100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0), 2) as cache_hit_ratio
FROM pg_statio_user_tables
WHERE schemaname = 'public'
  AND (heap_blks_hit + heap_blks_read) > 0
ORDER BY cache_hit_ratio;

-- Index cache hit ratio (should be > 99%)
SELECT
    schemaname,
    tablename,
    indexname,
    idx_blks_read as disk_reads,
    idx_blks_hit as cache_hits,
    ROUND(100.0 * idx_blks_hit / NULLIF(idx_blks_hit + idx_blks_read, 0), 2) as cache_hit_ratio
FROM pg_statio_user_indexes
WHERE schemaname = 'public'
  AND (idx_blks_hit + idx_blks_read) > 0
ORDER BY cache_hit_ratio;

-- ============================================================================
-- 7. MAINTENANCE COMMANDS
-- ============================================================================

-- Refresh all materialized views (run during low-traffic periods)
-- SELECT refresh_all_mv();

-- Refresh only current period views (faster, can run more frequently)
-- SELECT refresh_current_period_mv();

-- Vacuum and analyze all tables
-- VACUUM ANALYZE;

-- Reindex if indexes are bloated (check pg_stat_user_indexes first)
-- REINDEX TABLE deal_table_rows;

-- Reset pg_stat_statements (to clear old data)
-- SELECT pg_stat_statements_reset();

-- ============================================================================
-- 8. RECOMMENDED MAINTENANCE SCHEDULE
-- ============================================================================

/*
DAILY:
- Check slow queries
- Monitor materialized view freshness
- Check for long-running queries

WEEKLY:
- Review index usage statistics
- Check table bloat and dead rows
- Analyze cache hit ratios
- Vacuum tables with high dead row ratio

MONTHLY:
- Review and remove unused indexes
- Check for missing indexes on new queries
- Analyze query patterns and optimize
- Review table sizes and growth trends

AFTER MAJOR CHANGES:
- ANALYZE all affected tables
- Refresh materialized views
- Monitor query performance for 24-48 hours
*/

-- ============================================================================
