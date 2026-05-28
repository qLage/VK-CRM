const redis = require('redis');

class CacheService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.init();
    }

    async init() {
        // Skip Redis initialization if REDIS_URL is not set
        if (!process.env.REDIS_URL) {
            console.log('⚠ REDIS_URL not set - running without cache');
            this.isConnected = false;
            this.client = null;
            return;
        }

        try {
            const redisUrl = process.env.REDIS_URL;
            this.client = redis.createClient({ url: redisUrl });

            this.client.on('error', (err) => {
                // Silently handle Redis errors - cache is optional
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('✓ Redis connected');
                this.isConnected = true;
            });

            await this.client.connect();
        } catch (error) {
            console.warn('⚠ Redis not available, running without cache');
            this.isConnected = false;
            this.client = null;
        }
    }

    async get(key) {
        if (!this.isConnected) return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }

    async set(key, value, ttlSeconds = 300) {
        if (!this.isConnected) return false;
        try {
            await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected) return false;
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Cache del error:', error);
            return false;
        }
    }

    async invalidatePattern(pattern) {
        if (!this.isConnected) return false;
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
            return true;
        } catch (error) {
            console.error('Cache invalidate error:', error);
            return false;
        }
    }

    // Generate cache key for KPI data
    kpiKey(type, userId, startDate, endDate, extra = '') {
        const start = new Date(startDate).toISOString().split('T')[0];
        const end = new Date(endDate).toISOString().split('T')[0];
        return `kpi:${type}:${userId}:${start}:${end}${extra ? ':' + extra : ''}`;
    }

    // Generate cache key for leaderboard
    leaderboardKey(startDate, endDate, branchId = null, teamId = null) {
        const start = startDate === 'all' ? 'all' : new Date(startDate).toISOString().split('T')[0];
        const end = new Date(endDate).toISOString().split('T')[0];
        return `leaderboard:${start}:${end}:${branchId || 'all'}:${teamId || 'all'}`;
    }
}

module.exports = new CacheService();
