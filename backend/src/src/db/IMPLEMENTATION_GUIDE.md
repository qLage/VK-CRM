# Database Performance Optimization - Implementation Guide

## Quick Start

This guide provides step-by-step instructions for implementing the database performance optimizations.

---

## Prerequisites

- PostgreSQL database access with DDL permissions
- Backup of the database (recommended)
- Low-traffic time window for applying changes (optional but recommended)

---

## Phase 1: Apply Critical Indexes (30 minutes)

### Step 1: Backup Database
```bash
pg_dump $DATABASE_URL > crm_backup_$(date +%Y%m%d).sql
```

### Step 2: Apply Performance Indexes
```bash
psql $DATABASE_URL -f backend/src/db/performance_optimization.sql
```

**Expected output:**
- 15+ indexes created
- ANALYZE completed for all tables
- No errors

**Verification:**
```sql
-- Check that indexes were created
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_deal_table%'
ORDER BY tablename, indexname;
```

### Step 3: Monitor Performance
```bash
# Run a test query before and after
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT COUNT(*), SUM(commission_total_fact) FROM deal_table_rows WHERE year = 2024 AND month = 3;"
```

**Expected improvement:** Query time should drop by 70-90%

---

## Phase 2: Create Materialized Views (1 hour)

### Step 1: Create Views
```bash
psql $DATABASE_URL -f backend/src/db/materialized_views.sql
```

**Expected output:**
- 4 materialized views created
- Unique indexes created for concurrent refresh
- Refresh functions created

### Step 2: Initial Population
```sql
-- This may take 1-5 minutes depending on data volume
SELECT refresh_all_mv();
```

### Step 3: Verify Views
```sql
-- Check row counts
SELECT 'mv_monthly_agent_summary' as view, COUNT(*) as rows FROM mv_monthly_agent_summary
UNION ALL
SELECT 'mv_monthly_team_summary', COUNT(*) FROM mv_monthly_team_summary
UNION ALL
SELECT 'mv_monthly_branch_summary', COUNT(*) FROM mv_monthly_branch_summary
UNION ALL
SELECT 'mv_employee_kpi_current', COUNT(*) FROM mv_employee_kpi_current;
```

### Step 4: Set Up Automated Refresh

**Option A: Cron Job (Linux/Mac)**
```bash
# Add to crontab (crontab -e)
# Refresh every hour
0 * * * * psql $DATABASE_URL -c "SELECT refresh_all_mv();" >> /var/log/crm_mv_refresh.log 2>&1
```

**Option B: Node.js Cron (backend/src/services/cronJobs.js)**
```javascript
const cron = require('node-cron');
const { query } = require('../db');

// Refresh materialized views every hour
cron.schedule('0 * * * *', async () => {
    try {
        console.log('Refreshing materialized views...');
        await query('SELECT refresh_all_mv()');
        console.log('Materialized views refreshed successfully');
    } catch (error) {
        console.error('Failed to refresh materialized views:', error);
    }
});
```

**Option C: Trigger on Deal Update**
```javascript
// In backend/src/models/DealTableRow.js
// After create/update/delete operations:
async function refreshMaterializedViews() {
    try {
        await query('SELECT refresh_current_period_mv()');
    } catch (error) {
        console.error('MV refresh failed:', error);
        // Non-blocking - don't fail the request
    }
}
```

---

## Phase 3: Update Application Code (2-4 hours)

### Step 1: Update Employee Stats Endpoint

**File:** `backend/src/routes/employees.js`

Replace the existing stats logic with:
```javascript
const { getSingleEmployeeStats } = require('../services/employeeStatsOptimized');

router.get('/:id/stats', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const stats = await getSingleEmployeeStats(id, year, month);
        res.json(stats);
    } catch (error) {
        console.error('Get employee stats error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});
```

### Step 2: Update Team Deals Grouped Endpoint

**File:** `backend/src/routes/deal-table.js:100-194`

Replace with materialized view query:
```javascript
router.get('/team-deals-grouped', authenticateToken, requireAccessLevel(50), async (req, res) => {
    try {
        const { year, month, team_id } = req.query;

        // Use materialized view instead of aggregating on the fly
        const result = await query(`
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
            ORDER BY agent_name
        `, [team_id, year, month]);

        // Calculate totals
        const totals = result.rows.reduce((acc, row) => {
            acc.deal_count += parseInt(row.deal_count);
            acc.total_commission_fact += parseFloat(row.total_commission_fact || 0);
            acc.total_agent_income += parseFloat(row.total_agent_income || 0);
            // ... other fields
            return acc;
        }, { deal_count: 0, total_commission_fact: 0, total_agent_income: 0 });

        res.json({ groups: result.rows, totals });
    } catch (error) {
        console.error('Error fetching grouped team deals:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});
```

### Step 3: Cache User Profile in Middleware

**File:** `backend/src/middleware/auth.js`

Add profile data to req.user:
```javascript
// After token verification
const profileResult = await query(`
    SELECT
        p.id, p.full_name, p.team_id, p.branch_id, p.position_id,
        pos.access_level, pos.can_view_finances, pos.can_manage_finances,
        t.name as team_name, b.name as branch_name
    FROM profiles p
    LEFT JOIN positions pos ON p.position_id = pos.id
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE p.id = $1
`, [userId]);

req.user = {
    ...req.user,
    ...profileResult.rows[0]
};
```

Then in route handlers, replace:
```javascript
// BEFORE
const profileResult = await query('SELECT team_id FROM profiles WHERE id = $1', [req.user.id]);
const teamId = profileResult.rows[0].team_id;

// AFTER
const teamId = req.user.team_id;
```

---

## Phase 4: Testing & Validation (1-2 hours)

### Test 1: Index Usage
```sql
-- Run this after some queries have been executed
SELECT
    schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_deal_table%'
ORDER BY idx_scan DESC;
```

**Expected:** All new indexes should show idx_scan > 0

### Test 2: Query Performance
```bash
# Test employee stats endpoint
time curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/employees/USER_ID/stats

# Should be < 100ms (was 1-3 seconds)
```

### Test 3: Materialized View Freshness
```sql
SELECT MAX(last_updated) FROM mv_monthly_agent_summary;
-- Should be recent (within last hour if cron is set up)
```

### Test 4: Application Functionality
- [ ] Employee stats page loads quickly
- [ ] Team deals grouped endpoint returns correct data
- [ ] Branch hierarchy queries are fast
- [ ] KPI calculations complete in < 1 second
- [ ] Leaderboard loads in < 500ms

---

## Monitoring & Maintenance

### Daily Checks
```bash
# Run monitoring script
psql $DATABASE_URL -f backend/src/db/monitoring_maintenance.sql
```

Look for:
- Slow queries (> 100ms average)
- Unused indexes
- Tables needing VACUUM
- Materialized view freshness

### Weekly Maintenance
```sql
-- Vacuum and analyze
VACUUM ANALYZE;

-- Check for bloated indexes
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- Refresh materialized views
SELECT refresh_all_mv();
```

### Monthly Review
- Review slow query log
- Check for new N+1 query patterns
- Analyze table growth trends
- Optimize new queries

---

## Rollback Plan

If issues occur, you can rollback changes:

### Remove Indexes
```sql
-- List all new indexes
DROP INDEX IF EXISTS idx_deal_table_year_month;
DROP INDEX IF EXISTS idx_deal_table_agent_name_lower;
-- ... (see performance_optimization.sql for full list)
```

### Remove Materialized Views
```sql
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_agent_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_team_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_branch_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_employee_kpi_current CASCADE;
DROP FUNCTION IF EXISTS refresh_all_mv();
DROP FUNCTION IF EXISTS refresh_current_period_mv();
```

### Restore from Backup
```bash
psql $DATABASE_URL < crm_backup_YYYYMMDD.sql
```

---

## Performance Benchmarks

### Before Optimization
- Employee stats endpoint: 1-3 seconds
- Team deals grouped: 300-800ms
- KPI calculations: 2-5 seconds
- Leaderboard: 1-2 seconds

### After Optimization (Expected)
- Employee stats endpoint: 50-150ms (95% improvement)
- Team deals grouped: 20-50ms (90% improvement)
- KPI calculations: 100-300ms (90% improvement)
- Leaderboard: 50-100ms (90% improvement)

---

## Troubleshooting

### Issue: Indexes not being used
**Solution:** Run ANALYZE on tables
```sql
ANALYZE deal_table_rows;
ANALYZE profiles;
```

### Issue: Materialized view refresh fails
**Solution:** Check for concurrent updates
```sql
-- Use non-concurrent refresh if needed
REFRESH MATERIALIZED VIEW mv_monthly_agent_summary;
```

### Issue: Queries still slow
**Solution:** Check query plan
```sql
EXPLAIN ANALYZE <your query>;
```

### Issue: High disk usage
**Solution:** Vacuum tables
```sql
VACUUM FULL deal_table_rows;
```

---

## Support

For issues or questions:
1. Check the monitoring queries in `monitoring_maintenance.sql`
2. Review the analysis document in `PERFORMANCE_ANALYSIS.md`
3. Consult the query examples in `query_optimization_examples.sql`

---

## Summary

**Total implementation time:** 4-8 hours
**Expected performance improvement:** 70-90% reduction in query times
**Risk level:** Low (all changes are reversible)
**Maintenance overhead:** ~30 minutes per week

**Files created:**
- `performance_optimization.sql` - Index definitions
- `materialized_views.sql` - Pre-calculated views
- `query_optimization_examples.sql` - Query templates
- `employeeStatsOptimized.js` - Optimized service functions
- `monitoring_maintenance.sql` - Monitoring queries
- `PERFORMANCE_ANALYSIS.md` - Detailed analysis
- `IMPLEMENTATION_GUIDE.md` - This file
