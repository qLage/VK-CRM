import { query } from '../db';
import cron, { ScheduledTask } from 'node-cron';

interface RefreshResult {
  success: boolean;
  duration?: number;
  timestamp?: Date;
  message?: string;
  error?: string;
}

interface HistoryEntry {
  timestamp: Date;
  duration: number;
  success: boolean;
  type: string;
  error?: string;
}

interface ViewFreshness {
  view_name: string;
  last_refresh: Date;
  row_count: number;
  minutes_since_refresh: number;
}

interface RefreshStats {
  lastRefresh: Date | null;
  isRefreshing: boolean;
  totalRefreshes: number;
  successfulRefreshes: number;
  failedRefreshes: number;
  averageDuration: number;
  successRate: number;
}

/**
 * Materialized View Refresh Service
 *
 * Manages automatic refresh of materialized views for performance optimization
 */
class MaterializedViewRefreshService {
  private isRefreshing: boolean;
  private lastRefresh: Date | null;
  private refreshHistory: HistoryEntry[];
  private maxHistorySize: number;
  private cronJob: ScheduledTask | null;
  private dealUpdateTimeout: NodeJS.Timeout | null;

  constructor() {
    this.isRefreshing = false;
    this.lastRefresh = null;
    this.refreshHistory = [];
    this.maxHistorySize = 100;
    this.cronJob = null;
    this.dealUpdateTimeout = null;
  }

  /**
   * Refresh all materialized views
   */
  async refreshAll(): Promise<RefreshResult> {
    if (this.isRefreshing) {
      console.log('⚠️  Refresh already in progress, skipping...');
      return { success: false, message: 'Refresh already in progress' };
    }

    this.isRefreshing = true;
    const startTime = Date.now();

    try {
      console.log('🔄 Starting materialized view refresh...');

      // Check if views exist
      const viewsExist = await this.checkViewsExist();
      if (!viewsExist) {
        console.log('⚠️  Materialized views not found. Run materialized_views.sql first.');
        return { success: false, message: 'Views not found' };
      }

      // Refresh all views
      await query('SELECT refresh_all_mv()');

      const duration = Date.now() - startTime;
      this.lastRefresh = new Date();

      // Record in history
      this.addToHistory({
        timestamp: this.lastRefresh,
        duration,
        success: true,
        type: 'full'
      });

      console.log(`✅ Materialized views refreshed successfully in ${duration}ms`);

      return {
        success: true,
        duration,
        timestamp: this.lastRefresh
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.addToHistory({
        timestamp: new Date(),
        duration,
        success: false,
        type: 'full',
        error: error.message
      });

      console.error('❌ Failed to refresh materialized views:', error);
      return {
        success: false,
        error: error.message,
        duration
      };
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Refresh only current period views (faster)
   */
  async refreshCurrentPeriod(): Promise<RefreshResult> {
    if (this.isRefreshing) {
      console.log('⚠️  Refresh already in progress, skipping...');
      return { success: false, message: 'Refresh already in progress' };
    }

    this.isRefreshing = true;
    const startTime = Date.now();

    try {
      console.log('🔄 Refreshing current period views...');

      await query('SELECT refresh_current_period_mv()');

      const duration = Date.now() - startTime;
      this.lastRefresh = new Date();

      this.addToHistory({
        timestamp: this.lastRefresh,
        duration,
        success: true,
        type: 'current_period'
      });

      console.log(`✅ Current period views refreshed in ${duration}ms`);

      return {
        success: true,
        duration,
        timestamp: this.lastRefresh
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.addToHistory({
        timestamp: new Date(),
        duration,
        success: false,
        type: 'current_period',
        error: error.message
      });

      console.error('❌ Failed to refresh current period views:', error);
      return {
        success: false,
        error: error.message,
        duration
      };
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Check if materialized views exist
   */
  async checkViewsExist(): Promise<boolean> {
    try {
      const result = await query(`
        SELECT COUNT(*) as count
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname IN (
            'mv_monthly_agent_summary',
            'mv_monthly_team_summary',
            'mv_monthly_branch_summary',
            'mv_employee_kpi_current'
          )
      `);

      return parseInt(result.rows[0].count) === 4;
    } catch (error) {
      console.error('Error checking views:', error);
      return false;
    }
  }

  /**
   * Get view freshness information
   */
  async getViewFreshness(): Promise<ViewFreshness[]> {
    try {
      const result = await query(`
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
        FROM mv_monthly_branch_summary
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting view freshness:', error);
      return [];
    }
  }

  /**
   * Add entry to refresh history
   */
  private addToHistory(entry: HistoryEntry): void {
    this.refreshHistory.unshift(entry);
    if (this.refreshHistory.length > this.maxHistorySize) {
      this.refreshHistory.pop();
    }
  }

  /**
   * Get refresh history
   */
  getHistory(limit: number = 20): HistoryEntry[] {
    return this.refreshHistory.slice(0, limit);
  }

  /**
   * Get refresh statistics
   */
  getStats(): RefreshStats {
    const successful = this.refreshHistory.filter(h => h.success);
    const failed = this.refreshHistory.filter(h => !h.success);

    const avgDuration = successful.length > 0
      ? successful.reduce((sum, h) => sum + h.duration, 0) / successful.length
      : 0;

    return {
      lastRefresh: this.lastRefresh,
      isRefreshing: this.isRefreshing,
      totalRefreshes: this.refreshHistory.length,
      successfulRefreshes: successful.length,
      failedRefreshes: failed.length,
      averageDuration: Math.round(avgDuration),
      successRate: this.refreshHistory.length > 0
        ? Math.round((successful.length / this.refreshHistory.length) * 100)
        : 0
    };
  }

  /**
   * Start automatic refresh schedule
   * @param schedule - Cron schedule (default: every hour)
   */
  startSchedule(schedule: string = '0 * * * *'): void {
    if (this.cronJob) {
      console.log('⚠️  Cron job already running');
      return;
    }

    this.cronJob = cron.schedule(schedule, async () => {
      console.log('⏰ Scheduled materialized view refresh triggered');
      await this.refreshAll();
    });

    console.log(`✅ Materialized view refresh scheduled: ${schedule}`);
  }

  /**
   * Stop automatic refresh schedule
   */
  stopSchedule(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('✅ Materialized view refresh schedule stopped');
    }
  }

  /**
   * Trigger refresh after deal update (debounced)
   */
  async refreshAfterDealUpdate(): Promise<void> {
    // Clear existing timeout
    if (this.dealUpdateTimeout) {
      clearTimeout(this.dealUpdateTimeout);
    }

    // Debounce: wait 5 seconds after last update
    this.dealUpdateTimeout = setTimeout(async () => {
      console.log('🔄 Refreshing views after deal update...');
      await this.refreshCurrentPeriod();
    }, 5000);
  }
}

// Singleton instance
const materializedViewRefreshService = new MaterializedViewRefreshService();

export default materializedViewRefreshService;
