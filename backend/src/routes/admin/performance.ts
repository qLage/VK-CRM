import express, { Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth';
import { query } from '../../db';
import materializedViewRefreshService from '../../services/materializedViewRefresh';

const router = express.Router();

// All routes require admin access
router.use(authenticateToken);
router.use(requirePermission('can_manage_finances')); // Using this as proxy for admin

interface IndexStat {
  schemaname: string;
  tablename: string;
  indexname: string;
  scans: number;
  tuples_read: number;
  tuples_fetched: number;
  index_size: string;
}

interface SlowQuery {
  avg_time_ms: number;
  calls: number;
  total_time_ms: number;
  pct_total: number;
  query_preview: string;
}

interface TableStat {
  schemaname: string;
  tablename: string;
  total_size: string;
  table_size: string;
  row_count: number;
  dead_rows: number;
  dead_ratio: number;
  last_vacuum: Date | null;
  last_autovacuum: Date | null;
  last_analyze: Date | null;
}

interface CacheHitRatio {
  schemaname: string;
  tablename: string;
  indexname?: string;
  disk_reads: number;
  cache_hits: number;
  cache_hit_ratio: number;
}

interface ConnectionStat {
  state: string;
  connection_count: number;
  max_seconds_in_state: number;
}

/**
 * GET /api/admin/performance/indexes
 * Get index usage statistics
 */
router.get('/indexes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<IndexStat>(`
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
      ORDER BY idx_scan DESC
      LIMIT 50
    `);

    res.json({
      indexes: result.rows,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching index stats:', error);
    res.status(500).json({ error: { message: 'Failed to fetch index statistics' } });
  }
});

/**
 * GET /api/admin/performance/slow-queries
 * Get slow query statistics (requires pg_stat_statements)
 */
router.get('/slow-queries', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<SlowQuery>(`
      SELECT
        ROUND(mean_exec_time::numeric, 2) as avg_time_ms,
        calls,
        ROUND(total_exec_time::numeric, 2) as total_time_ms,
        ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) as pct_total,
        LEFT(query, 200) as query_preview
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC
      LIMIT 20
    `);

    res.json({
      slowQueries: result.rows,
      timestamp: new Date()
    });
  } catch (error) {
    // pg_stat_statements might not be enabled
    console.error('Error fetching slow queries:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch slow queries. Ensure pg_stat_statements extension is enabled.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

/**
 * GET /api/admin/performance/table-stats
 * Get table size and statistics
 */
router.get('/table-stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<TableStat>(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio,
        last_vacuum,
        last_autovacuum,
        last_analyze
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    res.json({
      tables: result.rows,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching table stats:', error);
    res.status(500).json({ error: { message: 'Failed to fetch table statistics' } });
  }
});

/**
 * GET /api/admin/performance/materialized-views
 * Get materialized view freshness and statistics
 */
router.get('/materialized-views', async (_req: Request, res: Response): Promise<void> => {
  try {
    const freshness = await materializedViewRefreshService.getViewFreshness();
    const stats = materializedViewRefreshService.getStats();
    const history = materializedViewRefreshService.getHistory(10);

    res.json({
      freshness,
      stats,
      history,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching MV stats:', error);
    res.status(500).json({ error: { message: 'Failed to fetch materialized view statistics' } });
  }
});

/**
 * POST /api/admin/performance/materialized-views/refresh
 * Manually trigger materialized view refresh
 */
router.post('/materialized-views/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type = 'full' } = req.body;

    let result;
    if (type === 'current') {
      result = await materializedViewRefreshService.refreshCurrentPeriod();
    } else {
      result = await materializedViewRefreshService.refreshAll();
    }

    res.json(result);
  } catch (error) {
    console.error('Error refreshing materialized views:', error);
    res.status(500).json({ error: { message: 'Failed to refresh materialized views' } });
  }
});

/**
 * GET /api/admin/performance/cache-hit-ratio
 * Get database cache hit ratios
 */
router.get('/cache-hit-ratio', async (_req: Request, res: Response): Promise<void> => {
  try {
    const tableResult = await query<CacheHitRatio>(`
      SELECT
        schemaname,
        tablename,
        heap_blks_read as disk_reads,
        heap_blks_hit as cache_hits,
        ROUND(100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0), 2) as cache_hit_ratio
      FROM pg_statio_user_tables
      WHERE schemaname = 'public'
        AND (heap_blks_hit + heap_blks_read) > 0
      ORDER BY cache_hit_ratio
      LIMIT 20
    `);

    const indexResult = await query<CacheHitRatio>(`
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
      ORDER BY cache_hit_ratio
      LIMIT 20
    `);

    res.json({
      tables: tableResult.rows,
      indexes: indexResult.rows,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching cache hit ratios:', error);
    res.status(500).json({ error: { message: 'Failed to fetch cache hit ratios' } });
  }
});

/**
 * POST /api/admin/performance/vacuum
 * Trigger VACUUM ANALYZE on specified table
 */
router.post('/vacuum', async (req: Request, res: Response): Promise<void> => {
  try {
    const { table } = req.body;

    if (!table) {
      res.status(400).json({ error: { message: 'Table name required' } });
      return;
    }

    // Validate table name to prevent SQL injection
    const validTables = ['deal_table_rows', 'profiles', 'transactions', 'reports', 'service_requests'];
    if (!validTables.includes(table)) {
      res.status(400).json({ error: { message: 'Invalid table name' } });
      return;
    }

    await query(`VACUUM ANALYZE ${table}`);

    res.json({
      success: true,
      message: `VACUUM ANALYZE completed for ${table}`,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error running VACUUM:', error);
    res.status(500).json({ error: { message: 'Failed to run VACUUM' } });
  }
});

/**
 * GET /api/admin/performance/connections
 * Get active database connections
 */
router.get('/connections', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<ConnectionStat>(`
      SELECT
        state,
        COUNT(*) as connection_count,
        MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_seconds_in_state
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
      ORDER BY connection_count DESC
    `);

    res.json({
      connections: result.rows,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching connections:', error);
    res.status(500).json({ error: { message: 'Failed to fetch connection statistics' } });
  }
});

export default router;
