import cron from 'node-cron';
import aggregationService from '../services/aggregation.service';
import cacheService from '../lib/cache.service';
import { query } from '../db';

/**
 * Cache Warming Job
 * Phase 02-04: Daily cache warming for active users
 *
 * Runs daily at 6 AM to pre-populate cache before business hours
 * Calculates KPI for all active users to ensure fast first access
 */

let warmingJob: cron.ScheduledTask | null = null;

/**
 * Warm cache for active users
 * Calculates KPI for current month to populate cache
 */
async function warmCache(): Promise<void> {
  const startTime = Date.now();
  console.log('[Cache Warming] Starting cache warming job...');

  try {
    // Get all active users
    const result = await query(`
      SELECT p.id, p.full_name, ur.role
      FROM profiles p
      JOIN user_roles ur ON p.id = ur.user_id
      WHERE p.is_active = 1
      ORDER BY p.id
    `);

    const users = result.rows;
    console.log(`[Cache Warming] Found ${users.length} active users`);

    // Get current month date range
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = now.toISOString();

    // Get refresh timestamp for cache keys
    const refreshTime = await aggregationService.getLastRefreshTime();

    let successCount = 0;
    let errorCount = 0;

    // Warm cache for each user
    for (const user of users) {
      try {
        // Generate cache key with refresh timestamp
        const cacheKey = cacheService.generateKey('kpi:realtor', {
          userId: user.id,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          period: 'month',
          cacheVersion: 'v17',
          refreshTime: refreshTime ? refreshTime.toISOString() : new Date().toISOString()
        });

        // Check if already cached
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          // Already warm, skip
          continue;
        }

        // Calculate KPI to populate cache
        // Import kpiService dynamically to avoid circular dependencies
        const kpiService = require('../services/kpi.service').default;

        if (user.role === 'realtor') {
          await kpiService.calculateRealtorKPI(user.id, startDate, endDate, 'month');
        } else if (user.role === 'sales_manager') {
          await kpiService.calculateTeamKPI(user.id, startDate, endDate, 'month');
        } else if (user.role === 'head_sales' || user.role === 'commercial' || user.role === 'director') {
          await kpiService.calculateBranchKPI(user.id, startDate, endDate, 'month');
        }

        successCount++;
      } catch (error) {
        console.error(`[Cache Warming] Error warming cache for user ${user.id}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Cache Warming] Completed in ${duration}ms - Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Cache Warming] Failed after ${duration}ms:`, error);
  }
}

/**
 * Start cache warming job
 * Runs daily at 6 AM (before business hours)
 */
export function startCacheWarmingJob(): void {
  // Check feature flag
  const enabled = process.env.ENABLE_CACHE_WARMING !== 'false';

  if (!enabled) {
    console.log('[Cache Warming] Cache warming disabled by feature flag');
    return;
  }

  // Schedule: Daily at 6:00 AM
  // Cron format: minute hour day month weekday
  warmingJob = cron.schedule('0 6 * * *', async () => {
    await warmCache();
  }, {
    timezone: 'UTC'
  });

  console.log('[Cache Warming] Job scheduled - runs daily at 6:00 AM UTC');
}

/**
 * Stop cache warming job
 * Called during graceful shutdown
 */
export function stopCacheWarmingJob(): void {
  if (warmingJob) {
    warmingJob.stop();
    console.log('[Cache Warming] Job stopped');
  }
}

/**
 * Manual cache warming trigger
 * Can be called from admin endpoint for testing
 */
export async function triggerCacheWarming(): Promise<{ success: boolean; duration: number; stats: { success: number; errors: number } }> {
  const startTime = Date.now();

  try {
    await warmCache();
    const duration = Date.now() - startTime;

    return {
      success: true,
      duration,
      stats: {
        success: 0, // Would need to track in warmCache
        errors: 0
      }
    };
  } catch (error) {
    throw error;
  }
}
