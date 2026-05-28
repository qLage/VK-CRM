import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env BEFORE any database initialization
// This must happen at module load time, before the isPostgres check below
// When bundled with tsup, __dirname points to dist/, so we need to find the project root
// Strategy: Look for backend/.env relative to common paths
const possiblePaths = [
    path.join(process.cwd(), '.env'),             // From backend/ directory
    path.join(process.cwd(), '../.env'),          // One level up
    path.join(__dirname, '../../../.env'),        // From dist/ -> backend/.env (bundled)
];
const envPath = possiblePaths.find(p => fs.existsSync(p)) || path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

import { Pool, Client, PoolClient } from 'pg';
import Database from 'better-sqlite3';
import extractTableName from './extractTableName';
import { QueryResult, TransactionCallback, WithoutRLSCallback } from '../types/database';

// Prototype monkey-patch for pg driver to handle 'undefined' parameters globally.
// The pg driver crashes if any parameter in the array is 'undefined'.
// This ensures they are all converted to 'null' before reaching the driver core.
const patchQuery = (Proto: typeof Pool | typeof Client) => {
    const originalQuery = Proto.prototype.query as any;
    Proto.prototype.query = function (text: any, params?: any, ...args: any[]): any {
        if (Array.isArray(params)) {
            params = params.map(p => p === undefined ? null : p);
        }
        // Keep the query text intact. Do NOT attempt to interpolate/replace placeholders.
        // Some environments (notably when running `node -e` in bash on Windows) can cause
        // `$1` to be stripped by the shell if not quoted properly. That is an invocation
        // issue, not a DB layer concern.
        return originalQuery.call(this, text, params, ...args);
    };
};
patchQuery(Pool);
patchQuery(Client);

let db: Database.Database | undefined;
let pool: Pool | undefined;
// Explicit SQLite mode if DB_PATH is set (takes priority over DATABASE_URL)
const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

if (isPostgres) {
    console.log('🔌 Connecting to PostgreSQL...');
    const isLocal = process.env.DATABASE_URL!.includes('localhost') || process.env.DATABASE_URL!.includes('127.0.0.1');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        application_name: 'CRM_Backend',
        // Connection pool configuration for optimal performance
        max: 20, // Maximum number of clients in the pool
        min: 5, // Minimum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not available
        maxUses: 7500, // Close and replace client after 7500 uses
    });

    // Add pool error handler
    pool.on('error', (err: Error) => {
        console.error('Unexpected error on idle client', err);
    });

    // Add pool monitoring (only in development)
    if (process.env.NODE_ENV === 'development') {
        pool.on('connect', () => {
            console.log('New client connected to database');
        });

        pool.on('acquire', () => {
            console.log('Client acquired from pool');
        });

        pool.on('remove', () => {
            console.log('Client removed from pool');
        });
    }

    console.log('✅ PostgreSQL pool created');
} else {
    console.log('🔌 Connecting to SQLite...');
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../crm.db');
    console.log('📂 DB path:', dbPath);
    try {
        db = new Database(dbPath, { verbose: undefined });
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        console.log('✅ SQLite initialized');
    } catch (err) {
        console.error('❌ Failed to initialize SQLite:', err);
    }
}

// Function to run initial migrations (moved from top-level for better startup control)
const runInitialMigrations = async (): Promise<void> => {
    if (isPostgres && pool) {
        console.log('📦 Running initial legacy migrations...');
        try {
            await pool.query('ALTER TABLE profiles ALTER COLUMN avatar_url TYPE TEXT');
            console.log('✅ Migration OK: avatar_url type changed to TEXT');
        } catch (e) {}

        try {
            await pool.query('ALTER TABLE service_request_attachments ALTER COLUMN file_url TYPE TEXT');
            console.log('✅ Migration OK: file_url type changed to TEXT');
        } catch (e) {}

        try {
            await pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_deal_commission_income
                ON transactions(deal_id)
                WHERE category = 'deal_commission' AND type = 'income'
            `);
            console.log('✅ Migration OK: unique deal_commission index ensured');
        } catch (e) {}

        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);
            await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_push_subscriptions_user_endpoint ON push_subscriptions(user_id, endpoint)');
            await pool.query('CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user ON push_subscriptions(user_id)');
            await pool.query('CREATE INDEX IF NOT EXISTS ix_push_subscriptions_endpoint ON push_subscriptions(endpoint)');
            console.log('✅ Migration OK: push_subscriptions ensured');
        } catch (e) {}

        // --- ID Migration for deal_table_rows (Added 2026-04-03) ---
        try {
            console.log('🔄 Checking and adding missing UUID columns in deal_table_rows...');
            await pool.query(`
                ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS agent_id UUID;
                ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mop_id UUID;
                ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rop_id UUID;
                
                -- Ensure default status is 'pending' for new deals
                ALTER TABLE deal_table_rows ALTER COLUMN status SET DEFAULT 'pending';
                
                -- Add rejection_reason column for manager feedback
                ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
                
                -- Update agent_id
                UPDATE deal_table_rows d 
                SET agent_id = CAST(p.id AS UUID)
                FROM profiles p 
                WHERE d.agent_id IS NULL AND d.agent_name IS NOT NULL AND LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name));

                -- Update mop_id
                UPDATE deal_table_rows d 
                SET mop_id = CAST(p.id AS UUID)
                FROM profiles p 
                WHERE d.mop_id IS NULL AND d.mop_name IS NOT NULL AND LOWER(TRIM(d.mop_name)) = LOWER(TRIM(p.full_name));

                -- Update rop_id
                UPDATE deal_table_rows d 
                SET rop_id = CAST(p.id AS UUID)
                FROM profiles p 
                WHERE d.rop_id IS NULL AND d.rop_name IS NOT NULL AND LOWER(TRIM(d.rop_name)) = LOWER(TRIM(p.full_name));
            `);
            console.log('✅ Missing ID columns added and populated.');
        } catch (e) {
            console.error('❌ Failed to add ID columns:', e);
        }

        // --- KPI Materialized Views Update (Added 2026-04-03) ---
        try {
            console.log('📊 Updating KPI Materialized Views...');
            await pool.query(`
                DROP MATERIALIZED VIEW IF EXISTS mv_employee_monthly_stats CASCADE;
                DROP MATERIALIZED VIEW IF EXISTS mv_team_monthly_stats CASCADE;
                DROP MATERIALIZED VIEW IF EXISTS mv_branch_monthly_stats CASCADE;
                DROP MATERIALIZED VIEW IF EXISTS mv_company_monthly_stats CASCADE;

                -- 1. Employee Monthly Statistics
                CREATE MATERIALIZED VIEW mv_employee_monthly_stats AS
                SELECT
                    COALESCE(d.agent_id::text, p.id::text) AS employee_id,
                    d.year,
                    d.month,
                    COUNT(d.id) AS deal_count,
                    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                    COALESCE(SUM(d.agent_income), 0)::NUMERIC(12,2) AS total_agent_income,
                    COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_mop_revenue,
                    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                    MAX(d.updated_at) AS last_updated
                FROM deal_table_rows d
                LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
                WHERE d.status IN ('approved', 'active')
                    AND (d.agent_id IS NOT NULL OR (d.agent_name IS NOT NULL AND d.agent_name != ''))
                GROUP BY COALESCE(d.agent_id::text, p.id::text), d.year, d.month;

                CREATE UNIQUE INDEX idx_mv_employee_monthly_stats_unique ON mv_employee_monthly_stats(employee_id, year, month);
                CREATE INDEX idx_mv_employee_monthly_stats_period ON mv_employee_monthly_stats(year, month);

                -- 2. Team Monthly Statistics
                CREATE MATERIALIZED VIEW mv_team_monthly_stats AS
                SELECT
                    COALESCE(d.team_id::text, p.team_id::text) AS team_id,
                    d.year,
                    d.month,
                    COUNT(d.id) AS deal_count,
                    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                    COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_team_revenue,
                    COUNT(DISTINCT COALESCE(d.agent_id::text, p.id::text)) AS member_count,
                    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                    MAX(d.updated_at) AS last_updated
                FROM deal_table_rows d
                LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
                WHERE d.status IN ('approved', 'active')
                    AND COALESCE(d.team_id::text, p.team_id::text) IS NOT NULL
                GROUP BY COALESCE(d.team_id::text, p.team_id::text), d.year, d.month;

                CREATE UNIQUE INDEX idx_mv_team_monthly_stats_unique ON mv_team_monthly_stats(team_id, year, month);
                CREATE INDEX idx_mv_team_monthly_stats_period ON mv_team_monthly_stats(year, month);

                -- 3. Branch Monthly Statistics
                CREATE MATERIALIZED VIEW mv_branch_monthly_stats AS
                SELECT
                    COALESCE(d.branch_id::text, p.branch_id::text) AS branch_id,
                    d.year,
                    d.month,
                    COUNT(d.id) AS deal_count,
                    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                    COALESCE(SUM(d.rop_payout), 0)::NUMERIC(12,2) AS total_rop_payout,
                    COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
                    COUNT(DISTINCT COALESCE(d.team_id::text, p.team_id::text)) AS team_count,
                    COUNT(DISTINCT COALESCE(d.agent_id::text, p.id::text)) AS agent_count,
                    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                    MAX(d.updated_at) AS last_updated
                FROM deal_table_rows d
                LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
                WHERE d.status IN ('approved', 'active')
                    AND COALESCE(d.branch_id::text, p.branch_id::text) IS NOT NULL
                GROUP BY COALESCE(d.branch_id::text, p.branch_id::text), d.year, d.month;

                CREATE UNIQUE INDEX idx_mv_branch_monthly_stats_unique ON mv_branch_monthly_stats(branch_id, year, month);
                CREATE INDEX idx_mv_branch_monthly_stats_period ON mv_branch_monthly_stats(year, month);

                -- 4. Company Monthly Statistics
                CREATE MATERIALIZED VIEW mv_company_monthly_stats AS
                SELECT
                    d.year,
                    d.month,
                    COUNT(d.id) AS total_deals,
                    COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                    COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
                    COUNT(DISTINCT COALESCE(d.branch_id::text, p.branch_id::text)) AS branch_count,
                    COUNT(DISTINCT COALESCE(d.agent_id::text, p.id::text)) AS agent_count,
                    COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                    MAX(d.updated_at) AS last_updated
                FROM deal_table_rows d
                LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
                WHERE d.status IN ('approved', 'active')
                GROUP BY d.year, d.month;

                CREATE UNIQUE INDEX idx_mv_company_monthly_stats_unique ON mv_company_monthly_stats(year, month);

                -- Fresh refresh function
                CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
                RETURNS void AS $$
                BEGIN
                    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_monthly_stats;
                    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_monthly_stats;
                    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_monthly_stats;
                    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_monthly_stats;
                END;
                $$ LANGUAGE plpgsql;
                
                -- Initial population
                SELECT refresh_all_materialized_views();
            `);
            console.log('✅ KPI Materialized Views updated and refreshed');
        } catch (error) {
            console.error('❌ Error updating KPI Materialized Views:', error instanceof Error ? error.message : error);
        }

        // --- Self-employed tax percent column (Added 2026-05-28) ---
        try {
            await pool.query(`
                ALTER TABLE company_payroll_settings
                ADD COLUMN IF NOT EXISTS self_employed_tax_percent REAL NOT NULL DEFAULT 6
            `);
            console.log('✅ Migration OK: self_employed_tax_percent column added');
        } catch (e) {
            console.error('❌ Failed to add self_employed_tax_percent column:', e);
        }

        // Extend payroll_payout_actions CHECK constraint
        try {
            await pool.query(`
                ALTER TABLE payroll_payout_actions
                DROP CONSTRAINT IF EXISTS payroll_payout_actions_kind_check
            `);
            await pool.query(`
                ALTER TABLE payroll_payout_actions
                ADD CONSTRAINT payroll_payout_actions_kind_check CHECK (
                    action_kind IN (
                        'advance',
                        'ndfl_budget_1',
                        'remainder',
                        'ndfl_budget_2',
                        'insurance_contributions',
                        'self_employed_tax'
                    )
                )
            `);
            console.log('✅ Migration OK: payroll_payout_actions constraint updated');
        } catch (e) {
            console.error('❌ Failed to update payroll_payout_actions constraint:', e);
        }
    }
};

// Query helper
const query = async <T = any>(text: string, params: any[] = [], client: PoolClient | null = null): Promise<QueryResult<T>> => {
    const start = Date.now();

    try {
        let result: QueryResult<T> | undefined;

        if (isPostgres && pool) {
            // PostgreSQL execution
            // Use provided client (for transactions) or global pool
            const executor = client || pool;

            // Critical fix: Postgres pg driver crashes if any parameter is 'undefined'.
            // Handled globally by the monkey-patch at the top of this file.
            const res = await executor.query(text, params);
            result = {
                rows: res.rows,
                rowCount: res.rowCount || 0,
                lastInsertRowid: null
            };
        } else if (db) {
            // SQLite execution
            // Convert PostgreSQL $1, $2 to SQLite ?
            let sqliteQuery = text;
            if (params.length > 0) {
                sqliteQuery = text.replace(/\$\d+/g, () => '?');
            }

            const isSelect = sqliteQuery.trim().toUpperCase().startsWith('SELECT');
            const isReturning = sqliteQuery.toUpperCase().includes('RETURNING');

            if (isSelect) {
                const stmt = db.prepare(sqliteQuery);
                const rows = stmt.all(...params) as T[];
                result = { rows, rowCount: rows.length };
            } else if (isReturning) {
                // SQLite: Handle RETURNING clause
                // Extract the RETURNING clause and remove it from the query
                const returningMatch = sqliteQuery.match(/RETURNING\s+(.+?)(?:;|$)/i);
                const returningColumns = returningMatch ? returningMatch[1].trim() : '*';
                const queryWithoutReturning = sqliteQuery.replace(/RETURNING\s+.+?(?:;|$)/i, '').trim();

                const stmt = db.prepare(queryWithoutReturning);
                const info = stmt.run(...params);

                // Fetch the inserted/updated row
                if (info.lastInsertRowid) {
                    // For INSERT, fetch by lastInsertRowid
                    const tableName = extractTableName(queryWithoutReturning);
                    if (tableName) {
                        const selectStmt = db.prepare(`SELECT ${returningColumns} FROM ${tableName} WHERE rowid = ?`);
                        const rows = selectStmt.all(info.lastInsertRowid) as T[];
                        result = { rows, rowCount: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
                    } else {
                        result = { rows: [], rowCount: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
                    }
                } else if (info.changes > 0) {
                    // For UPDATE/DELETE, we can't easily fetch the affected rows in SQLite
                    // Return empty rows array but indicate changes were made
                    result = { rows: [], rowCount: info.changes };
                } else {
                    result = { rows: [], rowCount: 0 };
                }
            } else {
                const stmt = db.prepare(sqliteQuery);
                const info = stmt.run(...params);
                result = {
                    rows: [],
                    rowCount: info.changes,
                    lastInsertRowid: info.lastInsertRowid ? Number(info.lastInsertRowid) : null
                };
            }
        } else {
            throw new Error('Database not initialized');
        }

        if (!result) {
            throw new Error('Query execution failed: no result');
        }

        const duration = Date.now() - start;
        if (duration > 100) console.log('Slow query', { text: text.substring(0, 50), duration });

        return result;
    } catch (error) {
        // Suppress ALTER TABLE errors in test environment (SQLite doesn't support IF NOT EXISTS)
        if (process.env.NODE_ENV !== 'test') {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Query error:', {
                message,
                text: text.substring(0, 200), // Show first 200 chars
                params: params.length > 0 ? params : 'none'
            });
        }
        throw error;
    }
};

// Transaction helper
const transaction = async <T = any>(callback: TransactionCallback<T>): Promise<T> => {
    if (isPostgres && pool) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Tenant context is already set by middleware
            // SET LOCAL automatically scopes to transaction and is cleared after COMMIT/ROLLBACK

            // Pass a special 'tx' object to the callback
            const tx = {
                query: <R = any>(text: string, params?: any[]) => query<R>(text, params, client)
            };
            const result = await callback(tx);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } else {
        // SQLite: emulate the same 'tx' interface for compatibility
        const tx = {
            query: <R = any>(text: string, params?: any[]) => query<R>(text, params)
        };
        return callback(tx);
    }
};

// Helper function to bypass RLS for admin operations
const withoutRLS = async <T = any>(callback: WithoutRLSCallback<T>): Promise<T> => {
    if (isPostgres && pool) {
        const client = await pool.connect();
        try {
            // Disable RLS for this connection
            await client.query('SET LOCAL row_security = off');
            return await callback(client);
        } finally {
            client.release();
        }
    } else if (db) {
        // SQLite doesn't have RLS
        return callback(db);
    } else {
        throw new Error('Database not initialized');
    }
};

export {
    pool,
    db,
    query,
    transaction,
    withoutRLS,
    runInitialMigrations,
};
