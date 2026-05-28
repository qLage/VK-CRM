import Decimal from 'decimal.js';

/**
 * Enhanced Cache Service - In-Memory Implementation
 * Redis dependency removed, using pure in-memory Map-based cache
 */

interface CacheStats {
  hits: number;
  misses: number;
  totalKeys: number;
  hitRate: number;
  memoryUsage: number;
}

class CacheService {
  private inMemoryCache: Map<string, { value: any; expiry: number }> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor() {
    console.log('[Cache] Using in-memory cache');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = this.inMemoryCache.get(key);
      if (cached && cached.expiry > Date.now()) {
        this.stats.hits++;
        this.logCacheHit(key);
        return cached.value as T;
      } else if (cached) {
        this.inMemoryCache.delete(key);
      }

      this.stats.misses++;
      this.logCacheMiss(key);
      return null;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      const expiry = Date.now() + ttl * 1000;
      this.inMemoryCache.set(key, { value, expiry });
    } catch (error) {
      console.error('[Cache] Set error:', error);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      let deletedCount = 0;
      for (const key of this.inMemoryCache.keys()) {
        if (regex.test(key)) {
          this.inMemoryCache.delete(key);
          deletedCount++;
        }
      }
      console.log(`[Cache] Invalidated ${deletedCount} keys matching pattern: ${pattern}`);
    } catch (error) {
      console.error('[Cache] Invalidate error:', error);
    }
  }

  async invalidateAll(): Promise<void> {
    this.inMemoryCache.clear();
    console.log('[Cache] In-memory cache cleared');
  }

  generateKey(prefix: string, params: Record<string, any>): string {
    const parts = [prefix];
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      const value = params[key];
      if (value !== undefined && value !== null) {
        if (value instanceof Date) {
          parts.push(value.toISOString().split('T')[0]);
        } else if (value instanceof Decimal) {
          parts.push(value.toString());
        } else if (typeof value === 'object') {
          parts.push(JSON.stringify(value));
        } else {
          parts.push(String(value));
        }
      }
    }
    return parts.join(':');
  }

  async getWithRefreshCheck(key: string, refreshTime: Date | null): Promise<any | null> {
    try {
      if (refreshTime) {
        const currentRefreshTime = refreshTime.toISOString();
        if (!key.includes(currentRefreshTime)) {
          return null;
        }
      }
      return await this.get(key);
    } catch (error) {
      console.error('[Cache] GetWithRefreshCheck error:', error);
      return null;
    }
  }

  async getStats(): Promise<CacheStats> {
    const totalKeys = this.inMemoryCache.size;
    const memoryUsage = this.inMemoryCache.size * 1024;
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalKeys,
      hitRate,
      memoryUsage,
    };
  }

  async healthCheck(): Promise<{ status: string; latency: number }> {
    return { status: 'in-memory', latency: 0 };
  }

  private logCacheHit(_key: string): void {
    if (this.stats.hits % 100 === 0) {
      const total = this.stats.hits + this.stats.misses;
      const hitRate = (this.stats.hits / total * 100).toFixed(1);
      console.log(`[Cache] Hit rate: ${hitRate}% (${this.stats.hits}/${total})`);
    }
  }

  private logCacheMiss(_key: string): void {}

  async close(): Promise<void> {
    this.inMemoryCache.clear();
    console.log('[Cache] Cache closed');
  }
}

const cacheService = new CacheService();
export default cacheService;
