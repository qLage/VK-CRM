/**
 * In-memory cache replacement for Redis
 * All Redis functionality replaced with local Map-based storage
 */

const cache = new Map<string, { value: any; expires: number }>();

// Simple pub/sub using callbacks
const subscribers = new Map<string, ((data: any) => void)[]>();

class RedisService {
  isConnected: boolean = true;

  async connect(): Promise<void> {
    console.log('[Cache] Using in-memory cache (Redis removed)');
  }

  async get<T = any>(key: string): Promise<T | null> {
    const item = cache.get(key);
    if (!item) return null;
    if (item.expires < Date.now()) {
      cache.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set(key: string, value: any, ttl: number = 300): Promise<boolean> {
    cache.set(key, { value, expires: Date.now() + ttl * 1000 });
    return true;
  }

  async del(key: string): Promise<boolean> {
    cache.delete(key);
    return true;
  }

  async invalidatePattern(pattern: string): Promise<boolean> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of cache.keys()) {
      if (regex.test(key)) cache.delete(key);
    }
    return true;
  }

  async publish(channel: string, message: any): Promise<boolean> {
    const callbacks = subscribers.get(channel);
    if (callbacks) {
      callbacks.forEach(cb => cb(message));
    }
    return true;
  }

  async subscribe(channel: string, callback: (data: any) => void): Promise<boolean> {
    if (!subscribers.has(channel)) {
      subscribers.set(channel, []);
    }
    subscribers.get(channel)!.push(callback);
    return true;
  }

  async disconnect(): Promise<void> {
    cache.clear();
    subscribers.clear();
    console.log('[Cache] In-memory cache cleared');
  }
}

const redisService = new RedisService();

export default redisService;
