import { createClient, RedisClientType } from 'redis';

class RedisService {
  client: RedisClientType | null;
  pubClient: RedisClientType | null;
  subClient: RedisClientType | null;
  isConnected: boolean;

  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    // Skip Redis if REDIS_URL is not set
    if (!process.env.REDIS_URL) {
      console.log('⚠️  REDIS_URL not set - running without Redis (caching disabled)');
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL;

      // Redis client options with disabled auto-reconnect
      const clientOptions = {
        url: redisUrl,
        socket: {
          reconnectStrategy: false as const, // Disable auto-reconnect to prevent spam
          rejectUnauthorized: false, // Allow self-signed certs (Selectel)
          tls: true
        }
      };

      // Main client for caching
      this.client = createClient(clientOptions);

      // Pub/Sub clients (must be separate)
      this.pubClient = createClient(clientOptions);
      this.subClient = createClient(clientOptions);

      // Suppress error logs (we handle them in catch block)
      this.client.on('error', () => {});
      this.pubClient.on('error', () => {});
      this.subClient.on('error', () => {});

      await Promise.all([
        this.client.connect(),
        this.pubClient.connect(),
        this.subClient.connect()
      ]);

      this.isConnected = true;
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.log('⚠️  Redis unavailable - continuing without caching');
      // Clean up failed clients
      this.client = null;
      this.pubClient = null;
      this.subClient = null;
    }
  }

  // Cache methods
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 300): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Redis invalidate pattern error:', error);
      return false;
    }
  }

  // Pub/Sub methods
  async publish(channel: string, message: any): Promise<boolean> {
    if (!this.isConnected || !this.pubClient) return false;
    try {
      await this.pubClient.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Redis PUBLISH error:', error);
      return false;
    }
  }

  async subscribe(channel: string, callback: (data: any) => void): Promise<boolean> {
    if (!this.isConnected || !this.subClient) return false;
    try {
      await this.subClient.subscribe(channel, (message) => {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('Redis message parse error:', error);
        }
      });
      return true;
    } catch (error) {
      console.error('Redis SUBSCRIBE error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await Promise.all([
        this.client?.quit(),
        this.pubClient?.quit(),
        this.subClient?.quit()
      ]);
      this.isConnected = false;
      console.log('Redis disconnected');
    } catch (error) {
      console.error('Redis disconnect error:', error);
    }
  }
}

// Singleton instance
const redisService = new RedisService();

export default redisService;
