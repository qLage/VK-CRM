import Redis from 'ioredis';
import Decimal from 'decimal.js';

/**
 * Enhanced Cache Service with Materialized View Integration
 * Phase 02-04: Intelligent caching with refresh timestamp-based invalidation
 *
 * Features:
 * - Redis-based caching with ioredis client
 * - Automatic invalidation based on materialized view refresh timestamps
 * - In-memory fallback when Redis unavailable
 * - Cache key generation with refresh timestamp
 * - Pattern-based invalidation
 * - Cache statistics tracking
 */

interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | void;
}

interface CacheStats {
  hits: number;
  misses: number;
  totalKeys: number;
  hitRate: number;
  memoryUsage: number;
}

class CacheService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private inMemoryCache: Map<string, { value: any; expiry: number }> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor() {
    this.initRedis();
  }

  /**
   * Initialize Redis connection with retry strategy
   */
  private initRedis(): void {
    // Skip Redis if URL not configured
    if (!process.env.REDIS_URL) {
      console.log('[Cache] REDIS_URL not set - using in-memory cache fallback');
      this.isConnected = false;
      return;
    }

    try {
      const config: CacheConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      };

      // Use REDIS_URL if provided, otherwise use individual config
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: config.maxRetriesPerRequest,
          retryStrategy: config.retryStrategy,
          tls: { rejectUnauthorized: false }, // Allow self-signed certs (Selectel)
        });
      } else {
        this.redis = new Redis(config);
      }

      this.redis.on('connect', () => {
        console.log('[Cache] Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('error', (err) => {
        console.error('[Cache] Redis connection error:', err.message);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('[Cache] Redis connection closed');
        this.isConnected = false;
      });
    } catch (error) {
      console.error('[Cache] Failed to initialize Redis:', error);
      this.isConnected = false;
      this.redis = null;
    }
  }

  /**
   * Get value from cache
   * Falls back to in-memory cache if Redis unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Try Redis first
      if (this.isConnected && this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          this.stats.hits++;
          this.logCacheHit(key);
          return JSON.parse(value) as T;
        }
      } else {
        // Fallback to in-memory cache
        const cached = this.inMemoryCache.get(key);
        if (cached && cached.expiry > Date.now()) {
          this.stats.hits++;
          this.logCacheHit(key);
          return cached.value as T;
        } else if (cached) {
          // Expired entry
          this.inMemoryCache.delete(key);
        }
      }

      this.stats.misses++;
      this.logCacheMiss(key);
      return null;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   * Falls back to in-memory cache if Redis unavailable
   */
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (this.isConnected && this.redis) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        // Fallback to in-memory cache
        const expiry = Date.now() + ttl * 1000;
        this.inMemoryCache.set(key, { value, expiry });
      }
    } catch (error) {
      console.error('[Cache] Set error:', error);
    }
  }

  /**
   * Invalidate all keys matching pattern
   * Uses SCAN for safe pattern deletion (non-blocking)
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      if (this.isConnected && this.redis) {
        let cursor = '0';
        let deletedCount = 0;

        do {
          const [newCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100
          );
          cursor = newCursor;

          if (keys.length > 0) {
            await this.redis.del(...keys);
            deletedCount += keys.length;
          }
        } while (cursor !== '0');

        console.log(`[Cache] Invalidated ${deletedCount} keys matching pattern: ${pattern}`);
      } else {
        // Fallback: clear in-memory cache entries matching pattern
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        let deletedCount = 0;
        console.log(`[Cache] In-memory invalidate: pattern=${pattern}, regex=${regex.toString()}, cacheSize=${this.inMemoryCache.size}`);
        for (const key of this.inMemoryCache.keys()) {
          if (regex.test(key)) {
            console.log(`[Cache] In-memory deleting key: ${key}`);
            this.inMemoryCache.delete(key);
            deletedCount++;
          }
        }
        console.log(`[Cache] In-memory invalidated ${deletedCount} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error('[Cache] Invalidate error:', error);
    }
  }

  /**
   * Clear entire cache
   */
  async invalidateAll(): Promise<void> {
    try {
      if (this.isConnected && this.redis) {
        await this.redis.flushdb();
        console.log('[Cache] All cache cleared (FLUSHDB)');
      } else {
        this.inMemoryCache.clear();
        console.log('[Cache] In-memory cache cleared');
      }
    } catch (error) {
      console.error('[Cache] InvalidateAll error:', error);
    }
  }

  /**
   * Generate deterministic cache key with refresh timestamp
   * Format: "prefix:param1:param2:...:refreshTimestamp"
   *
   * Refresh timestamp ensures automatic invalidation when materialized views refresh
   */
  generateKey(prefix: string, params: Record<string, any>): string {
    const parts = [prefix];

    // Add all parameters in sorted order for consistency
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      const value = params[key];
      if (value !== undefined && value !== null) {
        // Handle Date objects
        if (value instanceof Date) {
          parts.push(value.toISOString().split('T')[0]);
        }
        // Handle Decimal objects
        else if (value instanceof Decimal) {
          parts.push(value.toString());
        }
        // Handle objects (stringify)
        else if (typeof value === 'object') {
          parts.push(JSON.stringify(value));
        }
        // Handle primitives
        else {
          parts.push(String(value));
        }
      }
    }

    return parts.join(':');
  }

  /**
   * Get value with refresh timestamp check
   * Returns null if refresh timestamp in key doesn't match current timestamp
   * This ensures cache automatically invalidates when materialized views refresh
   */
  async getWithRefreshCheck(key: string, refreshTime: Date | null): Promise<any | null> {
    try {
      // If refresh time provided, check if it matches key
      if (refreshTime) {
        const currentRefreshTime = refreshTime.toISOString();
        if (!key.includes(currentRefreshTime)) {
          console.log('[Cache] Refresh timestamp mismatch - cache invalidated');
          return null;
        }
      }

      // Get from cache normally
      return await this.get(key);
    } catch (error) {
      console.error('[Cache] GetWithRefreshCheck error:', error);
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      let totalKeys = 0;
      let memoryUsage = 0;

      if (this.isConnected && this.redis) {
        totalKeys = await this.redis.dbsize();
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match) {
          memoryUsage = parseInt(match[1], 10);
        }
      } else {
        totalKeys = this.inMemoryCache.size;
        // Rough estimate of in-memory cache size
        memoryUsage = this.inMemoryCache.size * 1024; // Assume 1KB per entry
      }

      const total = this.stats.hits + this.stats.misses;
      const hitRate = total > 0 ? this.stats.hits / total : 0;

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        totalKeys,
        hitRate,
        memoryUsage,
      };
    } catch (error) {
      console.error('[Cache] GetStats error:', error);
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        totalKeys: 0,
        hitRate: 0,
        memoryUsage: 0,
      };
    }
  }

  /**
   * Check Redis connection health
   */
  async healthCheck(): Promise<{ status: string; latency: number }> {
    try {
      if (!this.isConnected || !this.redis) {
        return { status: 'disconnected', latency: -1 };
      }

      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return { status: 'connected', latency };
    } catch (error) {
      return { status: 'error', latency: -1 };
    }
  }

  /**
   * Log cache hit (throttled to avoid spam)
   */
  private logCacheHit(_key: string): void {
    // Log every 100th hit
    if (this.stats.hits % 100 === 0) {
      const total = this.stats.hits + this.stats.misses;
      const hitRate = (this.stats.hits / total * 100).toFixed(1);
      console.log(`[Cache] Hit rate: ${hitRate}% (${this.stats.hits}/${total})`);
    }
  }

  /**
   * Log cache miss
   */
  private logCacheMiss(_key: string): void {
    // Only log misses in development
    // Key parameter prefixed with _ to indicate intentionally unused
    // (kept for API consistency with logCacheHit)
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      console.log('[Cache] Redis connection closed gracefully');
    }
  }
}

// Export singleton instance
const cacheService = new CacheService();
export default cacheService;
