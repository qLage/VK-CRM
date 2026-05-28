import express, { Request, Response, Router } from 'express';
import cacheService from '../lib/cache.service';
import { authenticateToken as auth } from '../middleware/auth';

/**
 * Cache Management Routes
 * Phase 02-04: Cache monitoring and health check endpoints
 *
 * Endpoints:
 * - GET /api/cache/stats - Cache statistics (admin only)
 * - POST /api/cache/clear - Clear entire cache (admin only)
 * - GET /api/cache/health - Redis connection health check (public)
 */

const router: Router = express.Router();

/**
 * Get cache statistics
 * Admin only - returns hit rate, miss rate, total keys, memory usage
 */
router.get('/stats', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Check authorization - only admin can view cache stats
    const userRole = (req.user as any).role;
    const accessLevel = Number((req.user as any).access_level || 0);

    if (userRole !== 'admin' && userRole !== 'director' && accessLevel < 90) {
      res.status(403).json({ error: { message: 'Unauthorized: Admin access required' } });
      return;
    }

    // Get cache statistics
    const stats = await cacheService.getStats();

    res.json({
      success: true,
      stats: {
        hits: stats.hits,
        misses: stats.misses,
        totalKeys: stats.totalKeys,
        hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
        memoryUsage: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Cache] Error getting stats:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * Clear entire cache
 * Admin only - clears all cached data
 */
router.post('/clear', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Check authorization - only admin can clear cache
    const userRole = (req.user as any).role;
    const userId = (req.user as any).id;

    if (userRole !== 'admin' && userRole !== 'director') {
      res.status(403).json({ error: { message: 'Unauthorized: Admin access required' } });
      return;
    }

    // Clear entire cache
    await cacheService.invalidateAll();

    console.log(`[Cache] Cache cleared by user ${userId} (${userRole})`);

    res.json({
      success: true,
      message: 'Cache cleared successfully',
      clearedBy: userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Cache] Error clearing cache:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * Check Redis connection health
 * Public endpoint - returns connection status and latency
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await cacheService.healthCheck();

    res.json({
      success: true,
      redis: {
        status: health.status,
        latency: health.latency >= 0 ? `${health.latency}ms` : 'N/A',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Cache] Error checking health:', error);
    res.status(500).json({
      success: false,
      redis: {
        status: 'error',
        latency: 'N/A',
      },
      error: error.message,
    });
  }
});

export default router;
