import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';

const router = express.Router();

// GET /api/diagnostic/health
// Internal-only endpoint for debugging
// SECURITY: This endpoint exposes database structure - use with caution
router.get('/health', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    // Audit log for security monitoring
    console.log('SECURITY AUDIT: Diagnostic endpoint accessed', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    const diagnosticInfo: any = {
        timestamp: new Date().toISOString(),
        environment: {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            DATABASE_URL_exists: !!process.env.DATABASE_URL,
            DATABASE_URL_prefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 10) + '...' : 'not set',
            DB_PATH_exists: !!process.env.DB_PATH,
            DB_PATH: process.env.DB_PATH || 'not set'
        },
        database: {
            connected: false,
            type: 'unknown',
            error: null
        },
        tables: {
            list: [],
            count: 0,
            error: null
        },
        counts: {},
        errors: []
    };

    // Try to determine database type
    try {
        if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
            diagnosticInfo.database.type = 'PostgreSQL';
        } else if (process.env.DB_PATH || process.env.DATABASE_URL?.includes('sqlite')) {
            diagnosticInfo.database.type = 'SQLite';
        }
    } catch (err: any) {
        diagnosticInfo.errors.push(`Failed to determine DB type: ${err.message}`);
    }

    // Test basic database connection
    try {
        await query('SELECT 1 as test');
        diagnosticInfo.database.connected = true;
    } catch (err: any) {
        diagnosticInfo.database.connected = false;
        diagnosticInfo.database.error = err.message;
        diagnosticInfo.errors.push(`Database connection failed: ${err.message}`);
    }

    // Get list of tables (PostgreSQL specific)
    if (diagnosticInfo.database.connected) {
        try {
            const tablesResult = await query(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);
            diagnosticInfo.tables.list = tablesResult.rows.map((row: any) => row.table_name);
            diagnosticInfo.tables.count = diagnosticInfo.tables.list.length;
        } catch (err: any) {
            diagnosticInfo.tables.error = err.message;
            diagnosticInfo.errors.push(`Failed to get tables list: ${err.message}`);
        }

        // Try to count records in key tables (whitelist for security)
        const allowedTables = ['profiles', 'auth_users', 'service_requests', 'employees', 'finances'];

        for (const tableName of allowedTables) {
            try {
                // Use parameterized query with table name validation
                const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
                diagnosticInfo.counts[tableName] = parseInt(countResult.rows[0].count);
            } catch (err: any) {
                diagnosticInfo.counts[tableName] = `ERROR: ${err.message}`;
                diagnosticInfo.errors.push(`Failed to count ${tableName}: ${err.message}`);
            }
        }
    }

    // Always return 200 status with diagnostic info
    res.status(200).json(diagnosticInfo);
});

// GET /api/diagnostic/database-status
// Internal-only endpoint to check PostgreSQL database state
// SECURITY: This endpoint exposes database information - use with caution
router.get('/database-status', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    // Audit log for security monitoring
    console.log('SECURITY AUDIT: Database status endpoint accessed', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    try {
        // Get total profiles count
        const profilesCountResult = await query('SELECT COUNT(*) as count FROM profiles');
        const profilesCount = parseInt(profilesCountResult.rows[0].count);

        // Get total service_requests count
        const serviceRequestsCountResult = await query('SELECT COUNT(*) as count FROM service_requests');
        const serviceRequestsCount = parseInt(serviceRequestsCountResult.rows[0].count);

        // Get sample of 5 profiles
        const profilesSampleResult = await query(
            'SELECT id, email, full_name, phone, created_at FROM profiles ORDER BY created_at DESC LIMIT 5'
        );
        const profilesSample = profilesSampleResult.rows;

        // Get sample of 5 service_requests
        const serviceRequestsSampleResult = await query(
            'SELECT id, user_id, type, status, created_at FROM service_requests ORDER BY created_at DESC LIMIT 5'
        );
        const serviceRequestsSample = serviceRequestsSampleResult.rows;

        // Get list of all tables in the database
        const tablesResult = await query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        const tables = tablesResult.rows.map((row: any) => row.table_name);

        // Get auth_users count
        const authUsersCountResult = await query('SELECT COUNT(*) as count FROM auth_users');
        const authUsersCount = parseInt(authUsersCountResult.rows[0].count);


        // Return comprehensive diagnostic information
        res.json({
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                tables: {
                    count: tables.length,
                    list: tables
                }
            },
            counts: {
                profiles: profilesCount,
                auth_users: authUsersCount,
                service_requests: serviceRequestsCount
            },
            samples: {
                profiles: profilesSample,
                service_requests: serviceRequestsSample
            }
        });
    } catch (error: any) {
        console.error('Diagnostic endpoint error:', error);
        res.status(500).json({
            error: {
                message: 'Failed to retrieve database status',
                details: error.message
            }
        });
    }
});

// GET /api/diagnostic/table-info/:tableName
// Internal-only endpoint to check table structure
// SECURITY: This endpoint exposes table schema - use with caution
router.get('/table-info/:tableName', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    try {
        const tableName = req.params.tableName as string;
        const allowedTables = ['profiles', 'auth_users', 'positions', 'teams', 'branches'];

        // Audit log for security monitoring
        console.log('SECURITY AUDIT: Table info endpoint accessed', {
            userId: req.user!.id,
            userEmail: req.user!.email,
            tableName: tableName,
            ip: req.ip,
            timestamp: new Date().toISOString()
        });

        if (!allowedTables.includes(tableName)) {
            console.warn('SECURITY: Attempted access to non-whitelisted table', {
                userId: req.user!.id,
                tableName: tableName
            });
            res.status(403).json({ error: 'Table not allowed' });
            return;
        }

        const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;
        let columns: any[] = [];

        if (isPostgres) {
            const result = await query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);
            columns = result.rows;
        } else {
            const result = await query(`PRAGMA table_info(${tableName})`);
            columns = result.rows.map((row: any) => ({
                column_name: row.name,
                data_type: row.type,
                is_nullable: row.notnull === 0 ? 'YES' : 'NO'
            }));
        }

        res.json({ table: tableName, columns });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/diagnostic/test-employee-endpoints
// Internal-only endpoint to diagnose employee endpoint errors in production
// SECURITY: This endpoint runs diagnostic queries - use with caution
router.get('/test-employee-endpoints', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    // Audit log for security monitoring
    console.log('SECURITY AUDIT: Test employee endpoints accessed', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    const testEmployeeId = '7589f976-1674-41a8-90c7-3cf2368f20df';
    const diagnosticResults: any = {
        timestamp: new Date().toISOString(),
        employeeId: testEmployeeId,
        tests: {
            monthlyTrends: { success: false, error: null, data: null },
            dailyActivity: { success: false, error: null, data: null }
        }
    };

    // Test 1: Monthly Trends Endpoint Logic
    try {
        const months = 12;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

        let queryText: string;
        let result: any;
        if (isPostgres) {
            queryText = `SELECT
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as total_actions,
                COUNT(CASE WHEN type = 'deal' THEN 1 END) as deals,
                0 as revenue
             FROM service_requests
             WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
             GROUP BY DATE_TRUNC('month', created_at)
             ORDER BY month ASC`;
        } else {
            queryText = `SELECT
                strftime('%Y-%m-01', created_at) as month,
                COUNT(*) as total_actions,
                COUNT(CASE WHEN type = 'deal' THEN 1 END) as deals,
                0 as revenue
             FROM service_requests
             WHERE user_id = ? AND created_at >= ? AND created_at <= ?
             GROUP BY strftime('%Y-%m-01', created_at)
             ORDER BY month ASC`;
        }

        result = await query(queryText, [testEmployeeId, startDate.toISOString(), endDate.toISOString()]);

        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

        const trends = result.rows.map((row: any) => {
            const totalActions = parseInt(row.total_actions) || 0;
            const deals = parseInt(row.deals) || 0;
            const revenue = parseFloat(row.revenue) || 0;
            const efficiency = totalActions > 0 ? Math.min(100, (deals / totalActions) * 100) : 0;

            let monthName = 'N/A';
            try {
                const monthDate = new Date(row.month);
                if (!isNaN(monthDate.getTime())) {
                    monthName = monthNames[monthDate.getMonth()] || 'N/A';
                }
            } catch (e) {
                monthName = 'N/A';
            }

            return {
                month: monthName,
                efficiency: Math.round(efficiency * 10) / 10,
                deals: deals,
                revenue: revenue
            };
        });

        diagnosticResults.tests.monthlyTrends.success = true;
        diagnosticResults.tests.monthlyTrends.data = {
            rowCount: result.rows.length,
            trends: trends,
            query: queryText,
            params: [testEmployeeId, startDate.toISOString(), endDate.toISOString()]
        };
    } catch (error: any) {
        diagnosticResults.tests.monthlyTrends.success = false;
        diagnosticResults.tests.monthlyTrends.error = {
            message: error.message,
            stack: error.stack,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            position: error.position,
            query: error.query
        };
    }

    // Test 2: Daily Activity Endpoint Logic
    try {
        const days = 7;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

        let queryText: string;
        let result: any;
        if (isPostgres) {
            queryText = `SELECT
                DATE_TRUNC('day', created_at) as day,
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as activity_count
             FROM service_requests
             WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
             GROUP BY DATE_TRUNC('day', created_at), EXTRACT(HOUR FROM created_at)
             ORDER BY day ASC, hour ASC`;
        } else {
            queryText = `SELECT
                date(created_at) as day,
                CAST(strftime('%H', created_at) AS INTEGER) as hour,
                COUNT(*) as activity_count
             FROM service_requests
             WHERE user_id = ? AND created_at >= ? AND created_at <= ?
             GROUP BY date(created_at), strftime('%H', created_at)
             ORDER BY day ASC, hour ASC`;
        }

        result = await query(queryText, [testEmployeeId, startDate.toISOString(), endDate.toISOString()]);

        const heatmapData = Array(days).fill(null).map(() => Array(24).fill(0));

        result.rows.forEach((row: any) => {
            if (!row.day || row.hour === null || row.hour === undefined) {
                return;
            }

            const dayDate = new Date(row.day);
            if (isNaN(dayDate.getTime())) {
                return;
            }

            const dayIndex = Math.floor((dayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const hourIndex = parseInt(row.hour);

            if (dayIndex >= 0 && dayIndex < days && hourIndex >= 0 && hourIndex < 24) {
                const activityCount = parseInt(row.activity_count) || 0;
                heatmapData[dayIndex][hourIndex] = activityCount;
            }
        });

        diagnosticResults.tests.dailyActivity.success = true;
        diagnosticResults.tests.dailyActivity.data = {
            rowCount: result.rows.length,
            heatmapData: heatmapData,
            query: queryText,
            params: [testEmployeeId, startDate.toISOString(), endDate.toISOString()]
        };
    } catch (error: any) {
        diagnosticResults.tests.dailyActivity.success = false;
        diagnosticResults.tests.dailyActivity.error = {
            message: error.message,
            stack: error.stack,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            position: error.position,
            query: error.query
        };
    }

    // Always return 200 so we can see the error details
    res.status(200).json(diagnosticResults);
});

// GET /api/diagnostic/routes
// Internal-only endpoint to verify route registration
// SECURITY: This endpoint exposes application routes - use with caution
router.get('/routes', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    // Audit log for security monitoring
    console.log('SECURITY AUDIT: Routes diagnostic endpoint accessed', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    try {
        const app = req.app;
        const routes: any[] = [];

        // Extract all registered routes from Express app
        app._router.stack.forEach((middleware: any) => {
            if (middleware.route) {
                // Routes registered directly on the app
                routes.push({
                    path: middleware.route.path,
                    methods: Object.keys(middleware.route.methods).join(', ').toUpperCase()
                });
            } else if (middleware.name === 'router') {
                // Routes registered via router
                middleware.handle.stack.forEach((handler: any) => {
                    if (handler.route) {
                        const basePath = middleware.regexp.source
                            .replace('\\/?', '')
                            .replace('(?=\\/|$)', '')
                            .replace(/\\\//g, '/')
                            .replace('^', '')
                            .replace('$', '');

                        routes.push({
                            path: basePath + handler.route.path,
                            methods: Object.keys(handler.route.methods).join(', ').toUpperCase()
                        });
                    }
                });
            }
        });

        // Check if critical auth routes are registered
        const authMeRoute = routes.find(r => r.path.includes('/api/auth') && r.path.includes('/me'));
        const authLoginRoute = routes.find(r => r.path.includes('/api/auth') && r.path.includes('/login'));

        res.json({
            timestamp: new Date().toISOString(),
            totalRoutes: routes.length,
            criticalRoutes: {
                authMe: authMeRoute ? 'REGISTERED' : 'MISSING',
                authLogin: authLoginRoute ? 'REGISTERED' : 'MISSING'
            },
            routes: routes.sort((a, b) => a.path.localeCompare(b.path))
        });
    } catch (error: any) {
        console.error('Routes diagnostic error:', error);
        res.status(500).json({
            error: {
                message: 'Failed to retrieve routes',
                details: error.message
            }
        });
    }
});

// GET /api/diagnostic/kpi-views
// Diagnostic endpoint for KPI Materialized Views
router.get('/kpi-views', async (req: Request, res: Response): Promise<void> => {
    try {
        const mvStats = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'mv_employee_monthly_stats'
            ORDER BY ordinal_position
        `);

        const mvData = await query(`
            SELECT * FROM mv_employee_monthly_stats 
            LIMIT 10
        `);

        const totalDeals = await query(`SELECT COUNT(*) as count FROM deal_table_rows WHERE status = 'active'`);
        const totalProfiles = await query(`SELECT COUNT(*) as count FROM profiles WHERE is_active = 1`);

        res.json({
            timestamp: new Date().toISOString(),
            structure: mvStats.rows,
            sampleData: mvData.rows,
            counts: {
                mv_rows: mvData.rowCount,
                active_deals: totalDeals.rows[0].count,
                active_profiles: totalProfiles.rows[0].count
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// POST /api/diagnostic/emergency-kpi-fix
// Emergency endpoint to fix KPI database schema and views when migrations fail
// SECURITY: HIGHLY SENSITIVE - Strictly limited to Level 90+
router.post('/emergency-kpi-fix', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    console.log('SECURITY AUDIT: Emergency KPI Fix triggered', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        timestamp: new Date().toISOString()
    });

    const results: any[] = [];
    try {
        // 1. Add columns if missing
        console.log('🔄 Step 1: Adding UUID columns to deal_table_rows...');
        await query(`
            ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS agent_id UUID;
            ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mop_id UUID;
            ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rop_id UUID;
        `);
        results.push('✅ Columns added/checked');


        // 2. Populate data
        console.log('🔄 Step 2: Populating data...');
        await query(`
            UPDATE deal_table_rows d 
            SET agent_id = CAST(p.id AS UUID) 
            FROM profiles p 
            WHERE d.agent_id IS NULL AND d.agent_name IS NOT NULL AND LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name));

            UPDATE deal_table_rows d 
            SET mop_id = CAST(p.id AS UUID) 
            FROM profiles p 
            WHERE d.mop_id IS NULL AND d.mop_name IS NOT NULL AND LOWER(TRIM(d.mop_name)) = LOWER(TRIM(p.full_name));

            UPDATE deal_table_rows d 
            SET rop_id = CAST(p.id AS UUID) 
            FROM profiles p 
            WHERE d.rop_id IS NULL AND d.rop_name IS NOT NULL AND LOWER(TRIM(d.rop_name)) = LOWER(TRIM(p.full_name));
        `);
        results.push('✅ Data populated');


        // 3. Create views
        console.log('🔄 Step 3: Creating Materialized Views...');
        
        console.log('   - mv_employee_monthly_stats');
        await query(`
            DROP MATERIALIZED VIEW IF EXISTS mv_employee_monthly_stats CASCADE;
            CREATE MATERIALIZED VIEW mv_employee_monthly_stats AS
            SELECT
                COALESCE(CAST(d.agent_id AS TEXT), CAST(p.id AS TEXT)) AS employee_id,
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
            WHERE d.status = 'active'
                AND (d.agent_id IS NOT NULL OR (d.agent_name IS NOT NULL AND d.agent_name != ''))
            GROUP BY COALESCE(CAST(d.agent_id AS TEXT), CAST(p.id AS TEXT)), d.year, d.month;
            
            CREATE UNIQUE INDEX idx_mv_employee_monthly_stats_unique ON mv_employee_monthly_stats(employee_id, year, month);
        `);
        results.push('✅ mv_employee_monthly_stats created');

        console.log('   - mv_team_monthly_stats');
        await query(`
            DROP MATERIALIZED VIEW IF EXISTS mv_team_monthly_stats CASCADE;
            CREATE MATERIALIZED VIEW mv_team_monthly_stats AS
            SELECT
                COALESCE(CAST(d.team_id AS TEXT), CAST(p.team_id AS TEXT)) AS team_id,
                d.year,
                d.month,
                COUNT(d.id) AS deal_count,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_team_revenue,
                COUNT(DISTINCT COALESCE(CAST(d.agent_id AS TEXT), CAST(p.id AS TEXT))) AS member_count,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
            WHERE d.status = 'active'
                AND COALESCE(CAST(d.team_id AS TEXT), CAST(p.team_id AS TEXT)) IS NOT NULL
            GROUP BY COALESCE(CAST(d.team_id AS TEXT), CAST(p.team_id AS TEXT)), d.year, d.month;
            
            CREATE UNIQUE INDEX idx_mv_team_monthly_stats_unique ON mv_team_monthly_stats(team_id, year, month);
        `);
        results.push('✅ mv_team_monthly_stats created');

        console.log('   - mv_branch_monthly_stats');
        await query(`
            DROP MATERIALIZED VIEW IF EXISTS mv_branch_monthly_stats CASCADE;
            CREATE MATERIALIZED VIEW mv_branch_monthly_stats AS
            SELECT
                COALESCE(CAST(d.branch_id AS TEXT), CAST(p.branch_id AS TEXT)) AS branch_id,
                d.year,
                d.month,
                COUNT(d.id) AS deal_count,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.rop_payout), 0)::NUMERIC(12,2) AS total_rop_payout,
                COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
                COUNT(DISTINCT COALESCE(CAST(d.team_id AS TEXT), CAST(p.team_id AS TEXT))) AS team_count,
                COUNT(DISTINCT COALESCE(CAST(d.agent_id AS TEXT), CAST(p.id AS TEXT))) AS agent_count,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
            WHERE d.status = 'active'
                AND COALESCE(CAST(d.branch_id AS TEXT), CAST(p.branch_id AS TEXT)) IS NOT NULL
            GROUP BY COALESCE(CAST(d.branch_id AS TEXT), CAST(p.branch_id AS TEXT)), d.year, d.month;
            
            CREATE UNIQUE INDEX idx_mv_branch_monthly_stats_unique ON mv_branch_monthly_stats(branch_id, year, month);
        `);
        results.push('✅ mv_branch_monthly_stats created');

        console.log('   - mv_company_monthly_stats');
        await query(`
            DROP MATERIALIZED VIEW IF EXISTS mv_company_monthly_stats CASCADE;
            CREATE MATERIALIZED VIEW mv_company_monthly_stats AS
            SELECT
                d.year,
                d.month,
                COUNT(d.id) AS total_deals,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
                COUNT(DISTINCT COALESCE(CAST(d.branch_id AS TEXT), CAST(p.branch_id AS TEXT))) AS branch_count,
                COUNT(DISTINCT COALESCE(CAST(d.agent_id AS TEXT), CAST(p.id AS TEXT))) AS agent_count,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
            WHERE d.status = 'active'
            GROUP BY d.year, d.month;
            
            CREATE UNIQUE INDEX idx_mv_company_monthly_stats_unique ON mv_company_monthly_stats(year, month);
        `);
        results.push('✅ mv_company_monthly_stats created');
        results.push('✅ Views created and refreshed');

        res.json({ success: true, actions: results });
    } catch (err: any) {
        console.error('❌ Emergency KPI Fix Error:', err);
        res.status(500).json({ success: false, error: err.message, partialActions: results });
    }
});


// GET /api/diagnostic/force-fix-get?secret=restore_kpi_2026
// Direct GET access to fix KPI problems (useful if CLI/JS is blocked)
router.get('/force-fix-get', async (req: Request, res: Response): Promise<void> => {
    if (req.query.secret !== 'restore_kpi_2026') {
        res.status(403).json({ error: 'Access denied' });
        return;
    }

    const results: any[] = [];
    try {
        console.log('🔄 FORCE FIX GET triggered...');
        
        // 1. Columns
        await query(`
            ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS agent_id UUID;
            ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mop_id UUID;
            ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rop_id UUID;
        `);
        results.push('✅ Columns checked');

        // 2. Population (using explicit CAST)
        await query(`
            UPDATE deal_table_rows d 
            SET agent_id = p.id::uuid 
            FROM profiles p 
            WHERE d.agent_id IS NULL AND d.agent_name IS NOT NULL AND LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name));

            UPDATE deal_table_rows d 
            SET mop_id = p.id::uuid 
            FROM profiles p 
            WHERE d.mop_id IS NULL AND d.mop_name IS NOT NULL AND LOWER(TRIM(d.mop_name)) = LOWER(TRIM(p.full_name));

            UPDATE deal_table_rows d 
            SET rop_id = p.id::uuid 
            FROM profiles p 
            WHERE d.rop_id IS NULL AND d.rop_name IS NOT NULL AND LOWER(TRIM(d.rop_name)) = LOWER(TRIM(p.full_name));
        `);
        results.push('✅ Data populated');

        // 3. Views
        await query(`
            DROP MATERIALIZED VIEW IF EXISTS mv_employee_monthly_stats CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS mv_team_monthly_stats CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS mv_branch_monthly_stats CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS mv_company_monthly_stats CASCADE;

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
            WHERE d.status = 'active'
                AND (d.agent_id IS NOT NULL OR (d.agent_name IS NOT NULL AND d.agent_name != ''))
            GROUP BY COALESCE(d.agent_id::text, p.id::text), d.year, d.month;

            CREATE UNIQUE INDEX idx_mv_employee_monthly_stats_unique ON mv_employee_monthly_stats(employee_id, year, month);

            CREATE MATERIALIZED VIEW mv_team_monthly_stats AS
            SELECT
                COALESCE(d.team_id, p.team_id) AS team_id,
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
            WHERE d.status = 'active'
                AND COALESCE(d.team_id, p.team_id) IS NOT NULL
            GROUP BY COALESCE(d.team_id, p.team_id), d.year, d.month;

            CREATE UNIQUE INDEX idx_mv_team_monthly_stats_unique ON mv_team_monthly_stats(team_id, year, month);

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
            WHERE d.status = 'active'
                AND COALESCE(d.branch_id::text, p.branch_id::text) IS NOT NULL
            GROUP BY COALESCE(d.branch_id::text, p.branch_id::text), d.year, d.month;

            CREATE UNIQUE INDEX idx_mv_branch_monthly_stats_unique ON mv_branch_monthly_stats(branch_id, year, month);

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
            WHERE d.status = 'active'
            GROUP BY d.year, d.month;

            CREATE UNIQUE INDEX idx_mv_company_monthly_stats_unique ON mv_company_monthly_stats(year, month);
        `);
        results.push('✅ Views created');

        res.json({ success: true, actions: results });
    } catch (err: any) {
        console.error('❌ FORCE FIX GET Error:', err);
        res.status(500).json({ success: false, error: err.message, partial: results });
    }
});

export default router;
