import { query, pool, db } from './index';
import fs from 'fs';
import path from 'path';
import cacheService from '../lib/cache.service';

async function applyRLSPolicies(): Promise<void> {
    console.log('--- APPLYING ROW-LEVEL SECURITY POLICIES ---');

    try {
        // Find RLS policy file - check multiple possible locations
        const possiblePaths = [
            path.join(__dirname, 'rls_policies.sql'),
            path.join(__dirname, '../db/rls_policies.sql'),
            path.join(process.cwd(), 'src/db/rls_policies.sql'),
            path.join(process.cwd(), 'backend/src/db/rls_policies.sql')
        ];
        
        const rlsPoliciesPath = possiblePaths.find(p => fs.existsSync(p));

        if (!rlsPoliciesPath) {
            console.log('⚠️ Note: rls_policies.sql not found in any expected location, skipping RLS setup');
            return;
        }

        console.log(`📜 Loading RLS policies from: ${rlsPoliciesPath}`);

        const rlsPolicies = fs.readFileSync(rlsPoliciesPath, 'utf8');

        // Split by semicolon and execute each statement
        const statements = rlsPolicies
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            try {
                await query(statement);
            } catch (error) {
                // Ignore "already exists" errors for idempotency
                const msg = error instanceof Error ? error.message : String(error);
                if (!msg.includes('already exists') && !msg.includes('does not exist')) {
                    console.error('RLS policy error:', msg);
                    throw error;
                }
                // Log quietly for "already exists"
                if (msg.includes('already exists')) {
                    // console.log(`Policy/Index already exists (skipped)`);
                }
            }
        }

        console.log('✅ Row-Level Security policies applied successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to apply RLS policies:', message);
        // Don't throw - allow server to start even if RLS fails
    }
}

async function ensureCoreSchema(): Promise<void> {
    // Safe-only bootstrap: add missing tables/columns needed by current code.
    // Do NOT modify existing data (no deletes / reassignments).

    // --- Companies table (multi-tenant foundation) ---
    await query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        domain VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on slug for fast lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug)
    `);

    // Create index on domain for domain-based tenant resolution
    await query(`
      CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL
    `);

    // Add seed company for development/testing
    await query(`
      INSERT INTO companies (id, name, slug, domain, is_active)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'Demo Company',
        'demo',
        'demo.example.com',
        true
      )
      ON CONFLICT (slug) DO NOTHING
    `);

    // --- Core tables (auth, positions, profiles) ---
    await query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        encrypted_password TEXT NOT NULL,
        email_confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        base_salary REAL DEFAULT 0,
        commission_percent REAL DEFAULT 0,
        default_personal_kpi_min REAL DEFAULT 40,
        default_personal_kpi_max REAL DEFAULT 60,
        default_management_kpi_min REAL DEFAULT 0,
        default_management_kpi_max REAL DEFAULT 0,
        management_base_salary REAL DEFAULT 0,
        participates_in_rating INTEGER DEFAULT 1,
        is_salary_enabled INTEGER DEFAULT 1,
        is_kpi_enabled INTEGER DEFAULT 1,
        is_new_building INTEGER DEFAULT 0,
        is_system INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 100,
        access_level INTEGER DEFAULT 0,
        can_view_finances INTEGER DEFAULT 0,
        can_manage_finances INTEGER DEFAULT 0,
        can_manage_branches INTEGER DEFAULT 0,
        can_manage_users INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        avatar_url TEXT,
        position_id TEXT REFERENCES positions(id),
        branch_id TEXT,
        team_id TEXT,
        has_salary INTEGER DEFAULT 1,
        salary_amount REAL DEFAULT 0,
        commission_percent REAL DEFAULT 0,
        personal_kpi_current REAL,
        management_kpi_current REAL,
        kpi_last_updated TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        is_kpi_enabled INTEGER DEFAULT 1,
        is_new_building INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Service requests ---
    await query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'pending',
        data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS service_request_attachments (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        uploaded_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Finances ---
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        user_id TEXT,
        account_type TEXT DEFAULT 'cash',
        agent_commission_percent REAL,
        rop_commission_percent REAL,
        deal_id TEXT,
        component_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_by TEXT,
        is_forced INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Branches and Teams ---
    await query(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        branch_id TEXT,
        leader_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Leads ---
    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        source TEXT,
        status TEXT DEFAULT 'new',
        assigned_to TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Deals ---
    await query(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        property_object TEXT,
        document_type TEXT,
        document_date TEXT,
        seller_name TEXT,
        seller_phone TEXT,
        buyer_name TEXT,
        buyer_phone TEXT,
        deposit_date TEXT,
        deal_date TEXT,
        receipt_date TEXT,
        service_type TEXT,
        has_mortgage INTEGER DEFAULT 0,
        mortgage_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'draft',
        period_month INTEGER,
        period_year INTEGER,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_participants (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        role TEXT NOT NULL,
        side TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_commissions (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        commission_type TEXT NOT NULL,
        amount REAL DEFAULT 0,
        percentage REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_documents (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        document_name TEXT NOT NULL,
        document_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_activities (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id TEXT PRIMARY KEY,
        position_id TEXT,
        rule_type TEXT NOT NULL,
        percentage REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Multi-tenant: Add company_id to organizational tables ---
    await query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});

    // Backfill with demo company for existing records
    await query(`UPDATE branches SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});
    await query(`UPDATE teams SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});
    await query(`UPDATE profiles SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});

    // Make company_id NOT NULL after backfill (PostgreSQL only)
    if (pool) {
        await query(`ALTER TABLE branches ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
        await query(`ALTER TABLE teams ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
        await query(`ALTER TABLE profiles ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
    }

    // Create composite indexes for organizational tables
    await query(`CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_teams_company_branch ON teams(company_id, branch_id)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id)`).catch(() => {});

    // --- Multi-tenant: Add company_id to deal tables ---
    await query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE deal_participants ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE deal_commissions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE deal_documents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE deal_activities ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});

    // Backfill with demo company
    const dealTables = ['deals', 'deal_participants', 'deal_commissions', 'deal_documents', 'deal_activities', 'deal_table_rows'];
    for (const table of dealTables) {
        await query(`UPDATE ${table} SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});
        if (pool) {
            await query(`ALTER TABLE ${table} ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
        }
    }

    // Create composite indexes for common query patterns
    await query(`CREATE INDEX IF NOT EXISTS idx_deals_company_status ON deals(company_id, status)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_deals_company_period ON deals(company_id, period_year, period_month)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_deals_company_created_by ON deals(company_id, created_by)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_participants_company_employee ON deal_participants(company_id, employee_id)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_commissions_company ON deal_commissions(company_id)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_rows_company_year_month ON deal_table_rows(company_id, year, month)`).catch(() => {});

    // --- Multi-tenant: Add company_id to financial tables ---
    await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});

    await query(`UPDATE transactions SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});
    await query(`UPDATE commission_rules SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});

    if (pool) {
        await query(`ALTER TABLE transactions ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
        await query(`ALTER TABLE commission_rules ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
    }

    await query(`CREATE INDEX IF NOT EXISTS idx_transactions_company_type ON transactions(company_id, type)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_transactions_company_date ON transactions(company_id, created_at)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_commission_rules_company ON commission_rules(company_id)`).catch(() => {});

    // --- Multi-tenant: Add company_id to supporting tables ---
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});
    await query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`).catch(() => {});

    const supportTables = ['leads', 'notifications', 'service_requests'];
    for (const table of supportTables) {
        await query(`UPDATE ${table} SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL`).catch(() => {});
        if (pool) {
            await query(`ALTER TABLE ${table} ALTER COLUMN company_id SET NOT NULL`).catch(() => {});
        }
    }

    await query(`CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_company_user ON notifications(company_id, user_id, is_read)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_service_requests_company_status ON service_requests(company_id, status)`).catch(() => {});

    // Apply Row-Level Security policies (PostgreSQL only)
    if (pool) {
        await applyRLSPolicies();
    }

    // Keep existing schemas compatible (older DBs may lack newer columns)
    const alterStmts = [
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'cash'`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_commission_percent REAL`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS rop_commission_percent REAL`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deal_id TEXT`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS component_type TEXT`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by TEXT`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_forced INTEGER DEFAULT 0`,
        `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id TEXT`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type TEXT`,
    ];
    for (const stmt of alterStmts) {
        try { await query(stmt); } catch (e) { /* ignore */ }
    }

    try {
        await query(
            `CREATE INDEX IF NOT EXISTS idx_transactions_user_component ON transactions(user_id, component_type, created_at) WHERE component_type IS NOT NULL`,
        );
    } catch (e) {
        /* ignore */
    }

    if (!pool && db) {
        try {
            const prag = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>;
            if (!prag.some((c) => c.name === 'component_type')) {
                db.prepare('ALTER TABLE transactions ADD COLUMN component_type TEXT').run();
            }
        } catch (_) {
            /* ignore */
        }
    }

    try { await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 100`); } catch (e) { /* ignore */ }

    // Position-based permissions
    const positionPermissionAlters = [
        `ALTER TABLE positions ADD COLUMN IF NOT EXISTS access_level INTEGER DEFAULT 0`,
        `ALTER TABLE positions ADD COLUMN IF NOT EXISTS can_view_finances INTEGER DEFAULT 0`,
        `ALTER TABLE positions ADD COLUMN IF NOT EXISTS can_manage_finances INTEGER DEFAULT 0`,
        `ALTER TABLE positions ADD COLUMN IF NOT EXISTS can_manage_branches INTEGER DEFAULT 0`,
        `ALTER TABLE positions ADD COLUMN IF NOT EXISTS can_manage_users INTEGER DEFAULT 0`,
    ];
    for (const stmt of positionPermissionAlters) {
        try { await query(stmt); } catch (e) { /* ignore */ }
    }


    // Insert default system positions
    const defaultPositions = [
      { id: 'pos-director', name: 'Директор', description: 'Руководство компанией', sort_order: 10, access_level: 100, can_view_finances: 1, can_manage_finances: 1, can_manage_branches: 1, can_manage_users: 1 },
      { id: 'pos-admin', name: 'Администратор', description: 'Администрирование системы', sort_order: 20, access_level: 100, can_view_finances: 1, can_manage_finances: 1, can_manage_branches: 1, can_manage_users: 1 },
      { id: 'pos-comm', name: 'Коммерческий директор', description: 'Коммерческое управление', sort_order: 30, access_level: 90, can_view_finances: 1, can_manage_finances: 1, can_manage_branches: 1, can_manage_users: 1 },
      { id: 'pos-rop', name: 'РОП', description: 'Руководитель отдела продаж', sort_order: 40, access_level: 70, can_view_finances: 1, can_manage_finances: 1, can_manage_branches: 0, can_manage_users: 0 },
      { id: 'pos-mop', name: 'МОП', description: 'Менеджер отдела продаж', sort_order: 50, access_level: 50, can_view_finances: 1, can_manage_finances: 0, can_manage_branches: 0, can_manage_users: 0 },
      { id: 'pos-realtor', name: 'Риелтор', description: 'Специалист по недвижимости', sort_order: 60, access_level: 0, can_view_finances: 0, can_manage_finances: 0, can_manage_branches: 0, can_manage_users: 0 }
    ];

    for (const pos of defaultPositions) {
      try {
        await query(`
          INSERT INTO positions (id, name, description, base_salary, commission_percent, is_system, sort_order, access_level, can_view_finances, can_manage_finances, can_manage_branches, can_manage_users, created_at, updated_at)
          VALUES ($1, $2, $3, 0, 0, 1, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `, [pos.id, pos.name, pos.description, pos.sort_order, pos.access_level, pos.can_view_finances, pos.can_manage_finances, pos.can_manage_branches, pos.can_manage_users]);
      } catch (e) { /* ignore */ }
    }

    // Backfill permissions by position name
    try {
        await query(`UPDATE positions SET access_level = 100, can_view_finances = 1, can_manage_finances = 1, can_manage_branches = 1, can_manage_users = 1 WHERE (access_level IS NULL OR access_level < 100) AND (LOWER(name) LIKE '%админ%' OR LOWER(name) LIKE '%администратор%')`);
    } catch (e) {
        console.debug('Migration skip: admin backfill', e instanceof Error ? e.message : '');
    }

    try {
        await query(`UPDATE positions SET access_level = 90, can_view_finances = 1, can_manage_finances = 1, can_manage_branches = 1, can_manage_users = 1 WHERE (access_level IS NULL OR access_level < 90) AND (LOWER(name) LIKE '%директор%' OR LOWER(name) LIKE '%коммерческ%')`);
    } catch (e) {
        console.debug('Migration skip: director backfill', e instanceof Error ? e.message : '');
    }

    try {
        await query(`UPDATE positions SET access_level = 70, can_view_finances = 1, can_manage_finances = 1, can_manage_branches = 0, can_manage_users = 0 WHERE (access_level IS NULL OR access_level < 70) AND LOWER(name) LIKE '%роп%'`);
    } catch (e) {
        console.debug('Migration skip: ROP backfill', e instanceof Error ? e.message : '');
    }

    try {
        await query(`UPDATE positions SET access_level = 50, can_view_finances = 1, can_manage_finances = 0, can_manage_branches = 0, can_manage_users = 0 WHERE (access_level IS NULL OR access_level < 50) AND LOWER(name) LIKE '%моп%'`);
    } catch (e) {
        console.debug('Migration skip: MOP backfill', e instanceof Error ? e.message : '');
    }

    // Backfill from user_roles if exists
    try {
        await query(`UPDATE positions SET access_level = 100, can_view_finances = 1, can_manage_finances = 1, can_manage_branches = 1, can_manage_users = 1 WHERE (access_level IS NULL OR access_level < 100) AND id IN (SELECT DISTINCT p.position_id FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'admin' AND p.position_id IS NOT NULL)`);
    } catch (e) {
        console.debug('Migration skip: position backfill (admin)', e instanceof Error ? e.message : '');
    }

    try {
        await query(`UPDATE positions SET access_level = 90, can_view_finances = 1, can_manage_finances = 1, can_manage_branches = 1, can_manage_users = 1 WHERE (access_level IS NULL OR access_level < 90) AND id IN (SELECT DISTINCT p.position_id FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'director' AND p.position_id IS NOT NULL)`);
    } catch (e) {
        console.debug('Migration skip: position backfill (director)', e instanceof Error ? e.message : '');
    }
}

async function updateAnalyticsSchema(): Promise<void> {
    console.log('--- ADDING ANALYTICS COLUMNS TO quarterly_plans & user_plans ---');
    const cols = ['target_calls', 'target_meetings', 'target_showings'];
    const tables = ['quarterly_plans', 'user_plans'];

    for (const table of tables) {
        for (const col of cols) {
            try {
                await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} INTEGER DEFAULT 0`);
            } catch (e) {
                // Silently ignore if already exists
                console.debug(`Migration skip: column ${col} in ${table} might already exist`);
            }
        }
    }
}

async function addCustomEmployeeStats(): Promise<void> {
    console.log('--- ADDING CUSTOM EMPLOYEE STATS ---');
    if (pool) {
        await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_total_deals INTEGER DEFAULT 0');
        await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_total_objects INTEGER DEFAULT 0');
        await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_total_revenue DECIMAL(15, 2) DEFAULT 0');
        await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registration_date TIMESTAMP');
    } else if (db) {
        const tableInfo = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
        const existingColumns = tableInfo.map(col => col.name);
        if (!existingColumns.includes('custom_total_deals')) db.prepare('ALTER TABLE profiles ADD COLUMN custom_total_deals INTEGER DEFAULT 0').run();
        if (!existingColumns.includes('custom_total_objects')) db.prepare('ALTER TABLE profiles ADD COLUMN custom_total_objects INTEGER DEFAULT 0').run();
        if (!existingColumns.includes('custom_total_revenue')) db.prepare('ALTER TABLE profiles ADD COLUMN custom_total_revenue REAL DEFAULT 0').run();
        if (!existingColumns.includes('registration_date')) db.prepare('ALTER TABLE profiles ADD COLUMN registration_date TEXT').run();
    }
}

async function addPayrollTables(): Promise<void> {
    console.log('--- ADDING PAYROLL TABLES ---');
    // SQLite dev DB: pool is unset but payroll routes still run via `query()` + `db`.
    if (db) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS company_payroll_settings (
                    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
                    ndfl_percent REAL NOT NULL DEFAULT 13,
                    advance_percent REAL NOT NULL DEFAULT 40,
                    insurance_percent REAL NOT NULL DEFAULT 30,
                    base_salary_sales_manager REAL NOT NULL DEFAULT 0,
                    base_salary_head_sales REAL NOT NULL DEFAULT 0,
                    base_salary_commercial REAL NOT NULL DEFAULT 0,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
            `);
            db.exec(`
                CREATE TABLE IF NOT EXISTS payroll_monthly_state (
                    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    payroll_year INTEGER NOT NULL,
                    payroll_month INTEGER NOT NULL,
                    advance_gross_paid REAL NOT NULL DEFAULT 0,
                    ndfl_from_advance REAL NOT NULL DEFAULT 0,
                    ndfl_from_remainder REAL NOT NULL DEFAULT 0,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (company_id, profile_id, payroll_year, payroll_month)
                );
            `);
            db.exec(`
                CREATE TABLE IF NOT EXISTS payroll_payout_actions (
                    id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    accrual_year INTEGER NOT NULL,
                    accrual_month INTEGER NOT NULL,
                    action_kind TEXT NOT NULL,
                    transaction_id TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT payroll_payout_actions_kind_sqlite_check CHECK (action_kind IN (
                        'advance', 'remainder', 'ndfl_budget_1', 'ndfl_budget_2', 'insurance_contributions'
                    ))
                );
            `);
            db.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payout_once
                ON payroll_payout_actions(company_id, profile_id, accrual_year, accrual_month, action_kind);
            `);
            console.log('✅ Payroll tables ensured (SQLite)');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('SQLite payroll tables migration warning:', message);
        }
    }
    if (!pool) {
        if (!db) console.log('⏩ Skipping payroll tables (no database)');
        return;
    }
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS company_payroll_settings (
                company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
                ndfl_percent REAL NOT NULL DEFAULT 13,
                advance_percent REAL NOT NULL DEFAULT 40,
                insurance_percent REAL NOT NULL DEFAULT 30,
                base_salary_sales_manager REAL NOT NULL DEFAULT 0,
                base_salary_head_sales REAL NOT NULL DEFAULT 0,
                base_salary_commercial REAL NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS payroll_monthly_state (
                company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                payroll_year INTEGER NOT NULL,
                payroll_month INTEGER NOT NULL,
                advance_gross_paid REAL NOT NULL DEFAULT 0,
                ndfl_from_advance REAL NOT NULL DEFAULT 0,
                ndfl_from_remainder REAL NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (company_id, profile_id, payroll_year, payroll_month)
            )
        `);
        await query(
            `CREATE INDEX IF NOT EXISTS idx_payroll_state_lookup
             ON payroll_monthly_state(company_id, profile_id, payroll_year, payroll_month)`,
        );
        await query(`
            CREATE TABLE IF NOT EXISTS payroll_payout_actions (
                id TEXT PRIMARY KEY,
                company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                accrual_year INTEGER NOT NULL,
                accrual_month INTEGER NOT NULL,
                action_kind TEXT NOT NULL,
                transaction_id TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT payroll_payout_actions_kind_check CHECK (action_kind IN (
                    'advance', 'remainder', 'ndfl_budget_1', 'ndfl_budget_2', 'insurance_contributions'
                ))
            )
        `);
        await query(
            `CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payout_once
             ON payroll_payout_actions(company_id, profile_id, accrual_year, accrual_month, action_kind)`,
        );
        console.log('✅ Payroll tables ensured');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Payroll tables migration warning:', message);
    }
}

/** Lump оклад (category salary) vs official stepped payroll preview/payout — default flat for existing rows. */
async function addProfileUsesOfficialPayrollColumn(): Promise<void> {
    console.log('--- ADDING profiles.uses_official_payroll ---');
    try {
        if (pool) {
            await query(
                `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS uses_official_payroll BOOLEAN NOT NULL DEFAULT FALSE`,
            );
        } else if (db) {
            const tableInfo = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
            const existingColumns = new Set(tableInfo.map((col) => col.name));
            if (!existingColumns.has('uses_official_payroll')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN uses_official_payroll INTEGER NOT NULL DEFAULT 0').run();
            }
        }
        console.log('✅ profiles.uses_official_payroll ensured');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Profile uses_official_payroll migration warning:', message);
    }
}

async function addProfileExtraInfoFields(): Promise<void> {
    console.log('--- ADDING PROFILE EXTRA INFO FIELDS ---');
    try {
        if (pool) {
            await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passport_series_number TEXT');
            await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extra_phone TEXT');
            await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contacts JSONB DEFAULT '[]'::jsonb`);
            await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passport_address TEXT');
            await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS residential_address TEXT');
            await query(`UPDATE profiles SET emergency_contacts = '[]'::jsonb WHERE emergency_contacts IS NULL`);
        } else if (db) {
            const tableInfo = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
            const existingColumns = new Set(tableInfo.map(col => col.name));
            if (!existingColumns.has('passport_series_number')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN passport_series_number TEXT').run();
            }
            if (!existingColumns.has('extra_phone')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN extra_phone TEXT').run();
            }
            if (!existingColumns.has('emergency_contacts')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN emergency_contacts TEXT').run();
            }
            if (!existingColumns.has('passport_address')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN passport_address TEXT').run();
            }
            if (!existingColumns.has('residential_address')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN residential_address TEXT').run();
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Profile extra info fields migration warning:', message);
    }
}

async function applyIndexes(): Promise<void> {
    console.log('--- APPLYING PERFORMANCE INDEXES ---');

    try {
        const possiblePaths = [
            path.join(__dirname, 'add_indexes.sql'),
            path.join(__dirname, '../db/add_indexes.sql'),
            path.join(process.cwd(), 'src/db/add_indexes.sql'),
            path.join(process.cwd(), 'backend/src/db/add_indexes.sql')
        ];
        
        const sqlPath = possiblePaths.find(p => fs.existsSync(p));
        if (!sqlPath) {
            console.log('⚠️ Note: add_indexes.sql not found, skipping performance indexes');
            return;
        }

        console.log(`📜 Loading indexes from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        const statements = sql
            .split(/;\s*(?:\r?\n|$)/)
            .map(s => s.trim())
            .filter(Boolean);

        for (const stmt of statements) {
            try {
                await query(stmt);
            } catch (e) {
                const msg = e instanceof Error ? e.message : '';
                if (msg.includes('does not exist') || msg.includes('already exists')) {
                    continue;
                }
                throw e;
            }
        }

        console.log('✅ Performance indexes applied');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.log('Note: Indexes might already exist:', message);
    }
}

async function createDealTableRows(): Promise<void> {
    console.log('--- CREATING/UPDATING deal_table_rows ---');
    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';
    const textType = 'TEXT';
    const realType = isPostgres ? 'NUMERIC(12,2)' : 'REAL';
    const timestampType = isPostgres ? 'TIMESTAMP' : 'TEXT';
    const now = 'CURRENT_TIMESTAMP';

    await query(`
      CREATE TABLE IF NOT EXISTS deal_table_rows (
        id ${idType} PRIMARY KEY,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        deposit_date ${textType},
        deal_date ${textType},
        payment_date ${textType},
        property_name ${textType} NOT NULL,
        document_type ${textType} NOT NULL,
        document_link ${textType},
        seller ${textType},
        buyer ${textType},
        service ${textType},
        information ${textType},
        agent_name ${textType},
        agent_id ${idType},
        mop_name ${textType},
        mop_id ${idType},
        rop_name ${textType},
        rop_id ${idType},
        team_id ${idType},
        branch_id ${idType},
        comment ${textType},
        commission_seller_plan ${realType} DEFAULT 0,
        commission_buyer_plan ${realType} DEFAULT 0,
        commission_seller_fact ${realType} DEFAULT 0,
        commission_buyer_fact ${realType} DEFAULT 0,
        agent_percent ${realType} DEFAULT 0,
        rop_percent ${realType} DEFAULT 0,
        agent_percent_seller ${realType} DEFAULT 0,
        agent_percent_buyer ${realType} DEFAULT 0,
        mop_percent ${realType} DEFAULT 0,
        agent_manual_bonus ${realType} DEFAULT 0,
        rop_manual_bonus ${realType} DEFAULT 0,
        other_expenses ${realType} DEFAULT 0,
        mortgage_deduction ${realType} DEFAULT 0,
        payout_date ${textType},
        payout_mop_note ${textType},
        payout_rop_note ${textType},
        commission_total_fact ${realType} DEFAULT 0,
        agent_income ${realType} DEFAULT 0,
        rop_payout ${realType} DEFAULT 0,
        mop_revenue ${realType} DEFAULT 0,
        company_revenue ${realType} DEFAULT 0,
        plan_completion ${realType} DEFAULT 0,
        marginality ${realType} DEFAULT 0,
        company_id ${idType},
        created_by ${idType},
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    if (isPostgres) {
        const columns: Array<[string, string, string?]> = [
            ['agent_id', idType],
            ['mop_name', textType],
            ['mop_id', idType],
            ['rop_name', textType],
            ['rop_id', idType],
            ['team_id', idType],
            ['branch_id', idType],
            ['comment', textType],
            ['payout_date', textType],
            ['payout_mop_note', textType],
            ['payout_rop_note', textType],
            ['commission_total_fact', realType, '0'],
            ['agent_income', realType, '0'],
            ['rop_payout', realType, '0'],
            ['mop_revenue', realType, '0'],
            ['company_revenue', realType, '0'],
            ['plan_completion', realType, '0'],
            ['marginality', realType, '0'],
            ['company_id', idType],
            ['subcontractor_id', idType],
            ['subcontractor_amount', realType, '0'],

        ];
        for (const [colName, colType, defaultVal] of columns) {
            try {
                await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS ${colName} ${colType}${defaultVal ? ` DEFAULT ${defaultVal}` : ''};`);
            } catch (err) { }
        }
    }

    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_year_month ON deal_table_rows(year, month);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_agent ON deal_table_rows(agent_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_mop ON deal_table_rows(mop_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_rop ON deal_table_rows(rop_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_team ON deal_table_rows(team_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_document_type ON deal_table_rows(document_type);`);

    if (isPostgres) {
        try {
            await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS status ${textType} DEFAULT 'active';`);
            await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS deal_amount ${realType} DEFAULT 0;`);
            await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mortgage INTEGER DEFAULT 0;`);
            await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mortgage_credited_id ${idType};`);
            await query(
              `CREATE INDEX IF NOT EXISTS idx_deal_table_mortgage_credited ON deal_table_rows (mortgage_credited_id) WHERE mortgage_credited_id IS NOT NULL`
            ).catch(() => {});
            await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rejection_reason ${textType};`);
            await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_status ON deal_table_rows(status);`);
            await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_amount ON deal_table_rows(deal_amount);`);
            await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_mortgage ON deal_table_rows(mortgage);`);
            
            // Backfill mortgage flag based on service text
            await query(`UPDATE deal_table_rows SET mortgage = 1 WHERE mortgage = 0 AND LOWER(service) LIKE '%ипотек%';`);
            
            // Backfill agent_id/rop_id/mop_id from profiles if they are null but names are present
            await query(`
              UPDATE deal_table_rows dtr
              SET agent_id = p.id
              FROM profiles p
              WHERE dtr.agent_id IS NULL AND dtr.agent_name IS NOT NULL 
                AND TRIM(LOWER(p.full_name)) = TRIM(LOWER(dtr.agent_name));
            `);
            await query(`
              UPDATE deal_table_rows dtr
              SET rop_id = p.id
              FROM profiles p
              WHERE dtr.rop_id IS NULL AND dtr.rop_name IS NOT NULL 
                AND TRIM(LOWER(p.full_name)) = TRIM(LOWER(dtr.rop_name));
            `);
            await query(`
              UPDATE deal_table_rows dtr
              SET mop_id = p.id
              FROM profiles p
              WHERE dtr.mop_id IS NULL AND dtr.mop_name IS NOT NULL 
                AND TRIM(LOWER(p.full_name)) = TRIM(LOWER(dtr.mop_name));
            `);
        } catch (err) {
            console.debug('Migration skip: deal_table_rows backfill', err instanceof Error ? err.message : '');
        }
    } else {
        try {
            await query(`ALTER TABLE deal_table_rows ADD COLUMN status TEXT DEFAULT 'active';`);
        } catch (err) { }
        try {
            await query(`ALTER TABLE deal_table_rows ADD COLUMN deal_amount REAL DEFAULT 0;`);
        } catch (err) { }
        try {
            await query(`ALTER TABLE deal_table_rows ADD COLUMN mortgage_credited_id TEXT;`);
        } catch (err) { }
    }
}

async function addTeamToDealTable(): Promise<void> {
    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';
    try {
        await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS team_id ${idType}`);
        await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_team ON deal_table_rows(team_id)`);
    } catch (e) { }
}

async function createMortgageServiceRowsTable(): Promise<void> {
    console.log('--- CREATING mortgage_service_rows ---');
    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';
    const realType = isPostgres ? 'NUMERIC(12,2)' : 'REAL';
    const textType = 'TEXT';

    await query(`
      CREATE TABLE IF NOT EXISTS mortgage_service_rows (
        id ${idType} PRIMARY KEY,
        company_id ${idType} NOT NULL,
        branch_id ${idType},
        team_id ${idType},
        deal_date ${textType} NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        bank_name ${textType} NOT NULL DEFAULT '',
        program_name ${textType} NOT NULL DEFAULT '',
        bank_program ${textType} NOT NULL DEFAULT '',
        service_cost ${realType} NOT NULL DEFAULT 0,
        client_name ${textType} NOT NULL DEFAULT '',
        client_id ${idType},
        broker_id ${idType},
        broker_name ${textType},
        agent_id ${idType},
        agent_name ${textType},
        agent_fee ${realType} NOT NULL DEFAULT 0,
        broker_share ${realType} NOT NULL DEFAULT 0,
        agency_share ${realType} NOT NULL DEFAULT 0,
        broker_payout_status ${textType} NOT NULL DEFAULT 'pending',
        broker_paid_at ${textType},
        broker_paid_note ${textType},
        status ${textType} NOT NULL DEFAULT 'approved',
        rejection_reason ${textType},
        created_by ${idType},
        created_at ${textType} DEFAULT CURRENT_TIMESTAMP,
        updated_at ${textType} DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_mortgage_svc_company_ym ON mortgage_service_rows (company_id, year, month);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_mortgage_svc_broker ON mortgage_service_rows (broker_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_mortgage_svc_agent ON mortgage_service_rows (agent_id);`);

    try {
        await query(`ALTER TABLE mortgage_service_rows ADD COLUMN IF NOT EXISTS bank_name ${textType} NOT NULL DEFAULT ''`);
        await query(`ALTER TABLE mortgage_service_rows ADD COLUMN IF NOT EXISTS program_name ${textType} NOT NULL DEFAULT ''`);
        await query(`ALTER TABLE mortgage_service_rows ADD COLUMN IF NOT EXISTS client_id ${idType}`);
    } catch (_) {
        /* ignore */
    }
    try {
        if (isPostgres) {
            await query(`
              UPDATE mortgage_service_rows
              SET bank_name = CASE
                    WHEN POSITION(',' IN TRIM(COALESCE(bank_program, ''))) > 0
                    THEN TRIM(SUBSTRING(TRIM(COALESCE(bank_program, '')) FROM 1 FOR POSITION(',' IN TRIM(COALESCE(bank_program, ''))) - 1))
                    ELSE TRIM(COALESCE(bank_program, ''))
                  END,
                  program_name = CASE
                    WHEN POSITION(',' IN TRIM(COALESCE(bank_program, ''))) > 0
                    THEN TRIM(SUBSTRING(TRIM(COALESCE(bank_program, '')) FROM POSITION(',' IN TRIM(COALESCE(bank_program, ''))) + 1))
                    ELSE ''
                  END,
                  bank_program = TRIM(COALESCE(bank_program, ''))
              WHERE COALESCE(TRIM(bank_name), '') = ''
                 AND COALESCE(TRIM(program_name), '') = ''
                 AND TRIM(COALESCE(bank_program, '')) <> ''
            `);
        } else {
            await query(`
              UPDATE mortgage_service_rows
              SET bank_name = CASE
                    WHEN instr(trim(COALESCE(bank_program, '')), ',') > 0
                    THEN trim(substr(trim(COALESCE(bank_program, '')), 1, instr(trim(COALESCE(bank_program, '')), ',') - 1))
                    ELSE trim(COALESCE(bank_program, ''))
                  END,
                  program_name = CASE
                    WHEN instr(trim(COALESCE(bank_program, '')), ',') > 0
                    THEN trim(substr(trim(COALESCE(bank_program, '')), instr(trim(COALESCE(bank_program, '')), ',') + 1))
                    ELSE ''
                  END
              WHERE (bank_name IS NULL OR trim(bank_name) = '')
                AND (program_name IS NULL OR trim(program_name) = '')
                AND trim(COALESCE(bank_program, '')) <> ''
            `);
        }
    } catch (err) {
        console.debug('Migration skip: mortgage_service_rows bank split', err instanceof Error ? err.message : '');
    }

    try {
        await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS mortgage_service_row_id ${idType}`);
    } catch (e) {
        if (!isPostgres && db) {
            try {
                const prag = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>;
                if (!prag.some((c) => c.name === 'mortgage_service_row_id')) {
                    db.prepare(`ALTER TABLE transactions ADD COLUMN mortgage_service_row_id ${textType}`).run();
                }
            } catch (_) { /* ignore */ }
        }
    }
}

async function addMortgageBrokerPosition(): Promise<void> {
    try {
        await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 100`);

        await query(`
            INSERT INTO positions (id, name, description, base_salary, commission_percent, participates_in_rating, is_new_building, is_salary_enabled, is_system, is_kpi_enabled, sort_order, created_at, updated_at)
            VALUES ('pos-mortgage', 'Ипотечный Брокер', 'Специалист по ипотеке', 0, 40, 1, 0, 1, 0, 1, 55, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, base_salary = EXCLUDED.base_salary, commission_percent = EXCLUDED.commission_percent, participates_in_rating = EXCLUDED.participates_in_rating, is_new_building = EXCLUDED.is_new_building, is_salary_enabled = EXCLUDED.is_salary_enabled, is_kpi_enabled = EXCLUDED.is_kpi_enabled, sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP
        `);
    } catch (e) { }
}

async function addKpiFields(): Promise<void> {
    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    try {
        if (isPostgres) {
            await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS default_personal_kpi_min DECIMAL(5,2) DEFAULT 40`);
            await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS default_personal_kpi_max DECIMAL(5,2) DEFAULT 60`);
            await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS default_management_kpi_min DECIMAL(5,2) DEFAULT 0`);
            await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS default_management_kpi_max DECIMAL(5,2) DEFAULT 0`);
            await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS management_base_salary DECIMAL(10,2) DEFAULT 0`);

            await query(`UPDATE positions SET default_personal_kpi_min = 40, default_personal_kpi_max = 60, default_management_kpi_min = 3, default_management_kpi_max = 5, management_base_salary = 40000 WHERE name ILIKE '%менеджер%' OR name ILIKE '%МОП%'`);
            await query(`UPDATE positions SET default_personal_kpi_min = 40, default_personal_kpi_max = 60, default_management_kpi_min = 3, default_management_kpi_max = 6, management_base_salary = 80000 WHERE name ILIKE '%руководитель%' OR name ILIKE '%РОП%'`);
            await query(`UPDATE positions SET default_personal_kpi_min = 40, default_personal_kpi_max = 60, default_management_kpi_min = 3, default_management_kpi_max = 6, management_base_salary = 80000 WHERE name ILIKE '%коммерческий%' OR name ILIKE '%директор%'`);

            await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_kpi_current DECIMAL(5,2)`);
            await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS management_kpi_current DECIMAL(5,2)`);
            await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kpi_last_updated TIMESTAMP`);
        } else {
            try { await query(`ALTER TABLE positions ADD COLUMN default_personal_kpi_min REAL DEFAULT 40`); } catch (e) { }
            try { await query(`ALTER TABLE positions ADD COLUMN default_personal_kpi_max REAL DEFAULT 60`); } catch (e) { }
            try { await query(`ALTER TABLE positions ADD COLUMN default_management_kpi_min REAL DEFAULT 0`); } catch (e) { }
            try { await query(`ALTER TABLE positions ADD COLUMN default_management_kpi_max REAL DEFAULT 0`); } catch (e) { }
            try { await query(`ALTER TABLE positions ADD COLUMN management_base_salary REAL DEFAULT 0`); } catch (e) { }

            try { await query(`ALTER TABLE profiles ADD COLUMN personal_kpi_current REAL`); } catch (e) { }
            try { await query(`ALTER TABLE profiles ADD COLUMN management_kpi_current REAL`); } catch (e) { }
            try { await query(`ALTER TABLE profiles ADD COLUMN kpi_last_updated TEXT`); } catch (e) { }
        }
    } catch (e) { }
}

async function addAgentTables(): Promise<void> {
    console.log('--- ADDING AGENT LIFECYCLE TABLES ---');
    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';
    const textType = 'TEXT';
    const intType = 'INTEGER';
    const timestampType = isPostgres ? 'TIMESTAMP' : 'TEXT';
    const now = 'CURRENT_TIMESTAMP';

    try {
        await query(`
          CREATE TABLE IF NOT EXISTS agent_instances (
            id ${idType} PRIMARY KEY,
            agent_type ${textType} NOT NULL,
            status ${textType} NOT NULL,
            task_name ${textType},
            task_description ${textType},
            progress_percent ${intType} DEFAULT 0,
            error_message ${textType},
            metadata ${textType},
            user_id ${idType},
            created_at ${timestampType} DEFAULT ${now},
            updated_at ${timestampType} DEFAULT ${now},
            completed_at ${timestampType}
          );
        `);
    } catch (e) {
        console.log('Note: agent_instances table might already exist');
    }

    try {
        await query(`
          CREATE TABLE IF NOT EXISTS agent_events (
            id ${idType} PRIMARY KEY,
            agent_id ${idType} NOT NULL,
            event_type ${textType} NOT NULL,
            old_status ${textType},
            new_status ${textType},
            data ${textType},
            timestamp ${timestampType} DEFAULT ${now}
          );
        `);
    } catch (e) {
        console.log('Note: agent_events table might already exist');
    }

    await query(`CREATE INDEX IF NOT EXISTS idx_agent_instances_status ON agent_instances(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_agent_instances_user_id ON agent_instances(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_agent_instances_type ON agent_instances(agent_type);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_agent_events_agent_id ON agent_events(agent_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);`);

    console.log('✅ Agent lifecycle tables created');
}

async function addDailyPlansTable(): Promise<void> {
    console.log('--- ADDING user_daily_plans TABLE ---');
    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';
    const realType = isPostgres ? 'REAL' : 'REAL';

    try {
        await query(`
          CREATE TABLE IF NOT EXISTS user_daily_plans (
            id ${idType} PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            period_date DATE NOT NULL,
            target_deposits INTEGER DEFAULT 0,
            target_objects INTEGER DEFAULT 0,
            target_revenue ${realType} DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, period_date)
          );
        `);
        console.log('✅ user_daily_plans table created');
    } catch (e) {
        console.log('Note: user_daily_plans table might already exist');
    }
}

async function purgeData(): Promise<void> {
    if (process.env.PURGE_DATABASE === 'true') {
        console.log('🔥 PERMANENT DATA ERADICATION IN PROGRESS...');
        try {
            await query('TRUNCATE deal_table_rows CASCADE');
            await query('TRUNCATE deals CASCADE');
            await query('TRUNCATE deal_participants CASCADE');
            await query('TRUNCATE deal_commissions CASCADE');
            await query('TRUNCATE deal_documents CASCADE');
            await query('TRUNCATE deal_activities CASCADE');
            await query('TRUNCATE transactions CASCADE');
            await query('TRUNCATE service_requests CASCADE');
            await query('TRUNCATE service_request_attachments CASCADE');
            await query('TRUNCATE notifications CASCADE');
            await query('TRUNCATE agent_instances CASCADE');
            await query('TRUNCATE agent_events CASCADE');
            await query('TRUNCATE leads CASCADE');
            
            // Delete non-admin profiles and users
            await query("DELETE FROM profiles WHERE email != 'admin@crm.local'");
            await query("DELETE FROM auth_users WHERE email != 'admin@crm.local'");
            
            // Flush Redis
            await cacheService.invalidateAll();
            
            fs.writeFileSync(path.join(process.cwd(), 'purge_status.txt'), `PURGE SUCCESSFUL AT ${new Date().toISOString()}`);
            console.log('✅ ALL DATA ERADICATED SUCCESSFULLY');
        } catch (error) {
            const err = error as Error;
            fs.writeFileSync(path.join(process.cwd(), 'purge_status.txt'), `PURGE FAILED: ${err.message}`);
            console.error('❌ Data eradication failed:', err);
        }
    }
}

async function runConsolidatedMigrations(): Promise<void> {
    console.log('🚀 Starting consolidated database migrations...');
    
    // Step 0: One-time purge if requested
    await purgeData();
    
    console.log('📍 Migration step 1/10: Core schema');

    try {
        await ensureCoreSchema();
        console.log('✅ Core schema complete');

        console.log('📍 Migration step 2/10: Analytics schema');
        await updateAnalyticsSchema();
        console.log('✅ Analytics schema complete');

        console.log('📍 Migration step 3/10: Custom employee stats');
        await addCustomEmployeeStats();
        console.log('✅ Custom employee stats complete');

        console.log('📍 Migration step 3b/11: Profile extra info');
        await addProfileExtraInfoFields();
        console.log('✅ Profile extra info complete');

        console.log('📍 Migration step 3c/11: Payroll schema');
        await addPayrollTables();
        console.log('✅ Payroll schema complete');

        console.log('📍 Migration step 3d/11: Profile payroll scheme (uses_official_payroll)');
        await addProfileUsesOfficialPayrollColumn();
        console.log('✅ Profile payroll scheme column complete');

        console.log('📍 Migration step 4/10: Performance indexes');
        await applyIndexes();
        console.log('✅ Performance indexes complete');

        console.log('📍 Migration step 5/11: Deal table rows');
        await createDealTableRows();
        console.log('✅ Deal table rows complete');

        console.log('📍 Migration step 5b/11: Mortgage service rows');
        await createMortgageServiceRowsTable();
        console.log('✅ Mortgage service rows complete');

        console.log('📍 Migration step 6/11: Team to deal table');
        await addTeamToDealTable();
        console.log('✅ Team to deal table complete');

        console.log('📍 Migration step 7/10: Mortgage broker position');
        await addMortgageBrokerPosition();
        console.log('✅ Mortgage broker position complete');

        console.log('📍 Migration step 8/10: KPI fields');
        await addKpiFields();
        console.log('✅ KPI fields complete');

        console.log('📍 Migration step 9/10: Agent tables');
        await addAgentTables();
        console.log('✅ Agent tables complete');

        console.log('📍 Migration step 10/11: Daily plans table');
        await addDailyPlansTable();
        console.log('✅ Daily plans table complete');

        console.log('📍 Migration step 11/11: Seed data');
        if (process.env.DISABLE_SEEDING === 'true') {
            console.log('⏩ Seeding disabled by environment variable');
        } else {
            console.log('📍 Migration step 10/10: Seed data');
            try {
                const seedModule = await import('./seed');
                const seedDev = seedModule.default || seedModule;
                
                if (typeof seedDev === 'function') {
                    await seedDev();
                    console.log('✅ Seed data complete');
                } else {
                    console.warn('⚠️ Seed data found but it is not a function');
                }
            } catch (seedError) {
                console.error('❌ Failed to run seed data:', seedError instanceof Error ? seedError.message : seedError);
            }
        }

        console.log('✅ All consolidated migrations completed successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const stack = error instanceof Error ? error.stack : '';
        console.error('❌ Consolidated migrations failed:', message);
        console.error('Stack trace:', stack);
        throw error;
    }
}

export default runConsolidatedMigrations;
export { ensureCoreSchema };
