// Keep existing query() and transaction() for backward compatibility
export { query, transaction, withoutRLS, pool, db } from './legacy';

// Export Drizzle client for new code (use different name to avoid conflicts)
export { db as drizzle } from './drizzle';
export * as schema from './schema';
