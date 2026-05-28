import { Request, Response, NextFunction } from 'express';
import cacheService from '../lib/cache.service';

/**
 * Cache Middleware for HTTP-level caching
 * Phase 02-04: Two-level caching strategy (HTTP + service level)
 *
 * Features:
 * - Caches GET request responses
 * - Generates cache keys from URL and user context
 * - Adds X-Cache-Status header (HIT/MISS)
 * - Intercepts res.json to cache responses
 * - Invalidation middleware for mutations
 */

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

/**
 * Cache middleware for GET requests
 * Usage: router.get('/endpoint', cacheMiddleware({ ttl: 300 }), handler)
 */
export function cacheMiddleware(options: CacheOptions = {}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const { ttl = 300, keyGenerator, condition } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip cache for non-GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    // Check condition if provided
    if (condition && !condition(req)) {
      next();
      return;
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator
        ? keyGenerator(req)
        : generateDefaultCacheKey(req);

      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        // Cache HIT
        res.setHeader('X-Cache-Status', 'HIT');
        res.json(cachedData);
        return;
      }

      // Cache MISS
      res.setHeader('X-Cache-Status', 'MISS');

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function (data: any) {
        // Cache the response asynchronously (don't block response)
        cacheService.set(cacheKey, data, ttl).catch((err) => {
          console.error('[Cache Middleware] Failed to cache response:', err);
        });

        // Send response
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[Cache Middleware] Error:', error);
      // Don't block request on cache errors
      next();
    }
  };
}

/**
 * Invalidate cache middleware for POST/PUT/DELETE routes
 * Usage: router.post('/endpoint', handler, invalidateCacheMiddleware())
 */
export function invalidateCacheMiddleware(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json to invalidate cache after successful response
    res.json = function (data: any) {
      // Only invalidate on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Extract entity type from route path
        const entityType = extractEntityType(req.path);

        // Invalidate relevant cache keys
        invalidateCacheByEntity(entityType, req).catch((err) => {
          console.error('[Cache Middleware] Failed to invalidate cache:', err);
        });
      }

      // Send response
      return originalJson(data);
    };

    next();
  };
}

/**
 * Add cache control headers to response
 * Usage: router.get('/endpoint', cacheControlHeaders(300), handler)
 */
export function cacheControlHeaders(maxAge: number): (_req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // Set Cache-Control headers for CDN and browser caching
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, must-revalidate`);
    next();
  };
}

/**
 * Generate default cache key from request
 */
function generateDefaultCacheKey(req: Request): string {
  const userId = (req.user as any)?.userId || (req.user as any)?.id || 'anonymous';
  const url = req.originalUrl || req.url;

  // Include query parameters in cache key
  return `http-cache:${url}:user:${userId}`;
}

/**
 * Extract entity type from route path
 * Examples: /api/deals -> deals, /api/kpi/my-stats -> kpi
 */
function extractEntityType(path: string): string {
  const parts = path.split('/').filter(Boolean);

  // Skip 'api' prefix if present
  const startIndex = parts[0] === 'api' ? 1 : 0;

  // Return first meaningful segment
  const entity = parts[startIndex] || 'unknown';
  if (entity === 'positions' || entity === 'position') return 'positions';
  return entity;
}

/**
 * Invalidate cache by entity type
 */
async function invalidateCacheByEntity(entityType: string, req: Request): Promise<void> {
  const userId = (req.user as any)?.userId || (req.user as any)?.id;

  switch (entityType) {
    case 'deals':
    case 'deal':
      // Invalidate all KPI caches (deals affect KPI calculations)
      await cacheService.invalidate('kpi:*');
      await cacheService.invalidate('http-cache:/api/kpi/*');
      console.log('[Cache Middleware] Invalidated KPI caches after deal mutation');
      break;

    case 'kpi-settings':
    case 'kpi':
    case 'positions':
      // Invalidate all KPI-related caches (v3, v9 Dual, and generic kpi:*)
      // Positions affect base salary, so they must invalidate KPI too.
      await cacheService.invalidate('kpi:*');
      await cacheService.invalidate('v9:dual:*');
      await cacheService.invalidate('http-cache:*/api/kpi/*');
      await cacheService.invalidate('http-cache:*/api/kpi-settings/*');
      if (entityType === 'positions') {
        await cacheService.invalidate('http-cache:*/api/positions/*');
      }
      console.log(`[Cache Middleware] Invalidated all KPI caches and related data after ${entityType} mutation`);
      break;

    case 'profiles':
    case 'users':
      // Invalidate user-related caches
      await cacheService.invalidate('kpi:*');
      await cacheService.invalidate('http-cache:/api/kpi/*');
      console.log('[Cache Middleware] Invalidated caches after user mutation');
      break;

    default:
      // For unknown entities, invalidate related HTTP cache only
      await cacheService.invalidate(`http-cache:*/api/${entityType}/*`);
      console.log(`[Cache Middleware] Invalidated ${entityType} HTTP cache`);
  }
}
