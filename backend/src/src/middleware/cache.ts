import { Request, Response, NextFunction } from 'express';
import redisService from '../services/redis.service';

/**
 * Cache middleware for Express routes
 * Usage: router.get('/endpoint', cacheMiddleware(300), handler)
 */
function cacheMiddleware(ttl: number = 300) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip cache for non-GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    // Generate cache key from URL and user
    const userId = req.user?.userId || 'anonymous';
    const cacheKey = `cache:${req.originalUrl}:${userId}`;

    try {
      // Try to get from cache
      const cachedData = await redisService.get(cacheKey);

      if (cachedData) {
        console.log(`Cache HIT: ${cacheKey}`);
        res.json(cachedData);
        return;
      }

      console.log(`Cache MISS: ${cacheKey}`);

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function(data: any) {
        // Cache the response
        redisService.set(cacheKey, data, ttl).catch(err => {
          console.error('Cache set error:', err);
        });

        // Send response
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Invalidate cache by pattern
 */
async function invalidateCache(pattern: string): Promise<void> {
  try {
    await redisService.invalidatePattern(pattern);
    console.log(`Cache invalidated: ${pattern}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

export {
  cacheMiddleware,
  invalidateCache
};
