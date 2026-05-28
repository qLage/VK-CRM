// Re-export the main database connection to ensure deals module uses the same DB
// This prevents split-brain scenario where deals use PostgreSQL and main app uses SQLite
import { pool, db } from '../db';
import type { Pool } from 'pg';
import type Database from 'better-sqlite3';

console.log('📦 Deals module: Using shared database connection');

// Export pool for backward compatibility with existing deals code
const dbConnection: Pool | Database.Database | undefined = pool || db;
export default dbConnection;
