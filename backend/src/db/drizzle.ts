import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { pool } from './legacy';

/**
 * Drizzle Database Client
 * 
 * Consolidates connection pooling by reusing the 'pool' instance from legacy.ts.
 * This is CRITICAL for production to stay within connection limits.
 */

if (!pool && process.env.DATABASE_URL && !process.env.DB_PATH) {
  console.warn('⚠️ Drizzle: Shared pool not found in legacy.ts, but DATABASE_URL is set.');
}

// Export the Drizzle client
export const db = pool ? drizzle(pool, { schema }) : null as any;

// Re-export the pool for monitoring or manual queries if needed
export { pool };

// Add pool monitoring (only in development)
if (process.env.NODE_ENV === 'development' && pool) {
  pool.on('connect', () => {
    console.log('New client connected to database (via Drizzle pool)');
  });

  pool.on('acquire', () => {
    // console.log('Client acquired from shared pool');
  });
}
