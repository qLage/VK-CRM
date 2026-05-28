import cron from 'node-cron';
import aggregationService from '../services/aggregation.service';

/**
 * Background Job: Refresh Materialized Views
 * Phase 02-03: Automated hourly refresh of KPI materialized views
 *
 * Schedule: Every hour at :05 past the hour (e.g., 1:05, 2:05, 3:05)
 * This ensures views are refreshed regularly without blocking user requests.
 */

let refreshTask: cron.ScheduledTask | null = null;

/**
 * Start the materialized view refresh job
 * Runs every hour at :05 past the hour
 */
export function startMaterializedViewRefreshJob(): void {
  // Don't start if already running
  if (refreshTask) {
    console.log('[Job] Materialized view refresh job already running');
    return;
  }

  console.log('[Job] Starting materialized view refresh job (schedule: every hour at :05)');

  // Schedule: '5 * * * *' = minute 5, every hour, every day
  refreshTask = cron.schedule('5 * * * *', async () => {
    const startTime = Date.now();
    console.log('[Job] Starting scheduled materialized view refresh...');

    try {
      // Refresh all materialized views
      await aggregationService.refreshViews();

      const duration = Date.now() - startTime;
      console.log(`[Job] Materialized view refresh completed successfully in ${duration}ms`);

      // Get last refresh time for logging
      const lastRefresh = await aggregationService.getLastRefreshTime();
      if (lastRefresh) {
        console.log(`[Job] Last refresh timestamp: ${lastRefresh.toISOString()}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Job] Materialized view refresh failed after ${duration}ms:`, error);
      // Don't throw - let the job continue on next schedule
    }
  }, {
    scheduled: true,
    timezone: 'UTC' // Use UTC for consistency across servers
  });

  console.log('[Job] Materialized view refresh job started successfully');
}

/**
 * Stop the materialized view refresh job
 * Called during graceful shutdown
 */
export function stopMaterializedViewRefreshJob(): void {
  if (refreshTask) {
    console.log('[Job] Stopping materialized view refresh job...');
    refreshTask.stop();
    refreshTask = null;
    console.log('[Job] Materialized view refresh job stopped');
  }
}

/**
 * Check if the job is currently running
 */
export function isJobRunning(): boolean {
  return refreshTask !== null;
}
