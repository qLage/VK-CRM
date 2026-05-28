const { query } = require('./index');

async function migrate() {
  console.log('🚀 Starting database migration...');
  const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

  const now = isPostgres ? 'CURRENT_TIMESTAMP' : "(datetime('now'))";
  const timestampType = isPostgres ? 'TIMESTAMP' : 'TEXT';
  const textType = 'TEXT';
  const realType = isPostgres ? 'DECIMAL(15,2)' : 'REAL';
  const idType = textType;

  try {
    // Auth schema tables
    await query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id ${idType} PRIMARY KEY,
        email ${textType} UNIQUE,
        encrypted_password ${textType} NOT NULL,
        email_confirmed_at ${textType},
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Add Alter for Postgres if needed
    if (isPostgres) {
      try {
        await query('ALTER TABLE auth_users ALTER COLUMN email DROP NOT NULL');
      } catch (e) { /* ignore if already dropped */ }
    }

    // Positions table
    await query(`
      CREATE TABLE IF NOT EXISTS positions (
        id ${idType} PRIMARY KEY,
        name ${textType} NOT NULL,
        description ${textType},
        base_salary ${realType} DEFAULT 0,
        commission_percent ${realType} DEFAULT 0,
        default_personal_kpi_min ${realType} DEFAULT 40,
        default_personal_kpi_max ${realType} DEFAULT 60,
        default_management_kpi_min ${realType} DEFAULT 0,
        default_management_kpi_max ${realType} DEFAULT 0,
        management_base_salary ${realType} DEFAULT 0,
        participates_in_rating INTEGER DEFAULT 1,
        is_salary_enabled INTEGER DEFAULT 1,
        is_kpi_enabled INTEGER DEFAULT 1,
        is_new_building INTEGER DEFAULT 0,
        is_system INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 100,
        -- Position-based permissions (single source of truth)
        access_level INTEGER DEFAULT 0,
        can_view_finances INTEGER DEFAULT 0,
        can_manage_finances INTEGER DEFAULT 0,
        can_manage_branches INTEGER DEFAULT 0,
        can_manage_users INTEGER DEFAULT 0,
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Position permissions table
    await query(`
      CREATE TABLE IF NOT EXISTS position_permissions (
        id ${idType} PRIMARY KEY,
        position_id ${idType} NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
        permission ${textType} NOT NULL,
        created_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Profiles table
    await query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id ${idType} PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
        email ${textType} UNIQUE,
        full_name ${textType},
        first_name ${textType},
        last_name ${textType},
        phone ${textType},
        avatar_url ${textType},
        position_id ${idType} REFERENCES positions(id),
        has_salary INTEGER DEFAULT 1,
        salary_amount ${realType} DEFAULT 0,
        commission_percent ${realType} DEFAULT 0,
        personal_kpi_current ${realType},
        management_kpi_current ${realType},
        kpi_last_updated ${timestampType},
        is_active INTEGER DEFAULT 1,
        is_kpi_enabled INTEGER DEFAULT 1,
        is_new_building INTEGER DEFAULT 0,
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    if (isPostgres) {
      try {
        await query('ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL');
      } catch (e) { /* ignore if already dropped */ }
    }

    // User roles table
    await query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id ${idType} PRIMARY KEY,
        user_id ${idType} NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role ${textType} NOT NULL,
        created_at ${timestampType} DEFAULT ${now},
        UNIQUE(user_id, role)
      );
    `);

    // Attendance table
    await query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id ${idType} PRIMARY KEY,
        user_id ${idType} NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        check_in ${textType},
        check_out ${textType},
        date ${textType} NOT NULL,
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Report Templates table
    await query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        fields TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ${now},
        updated_at TEXT DEFAULT ${now}
      );
    `);

    // Reports table
    await query(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        template_id TEXT REFERENCES report_templates(id),
        status TEXT DEFAULT 'pending',
        title TEXT,
        description TEXT,
        amount REAL,
        deal_date TEXT,
        client_name TEXT,
        client_phone TEXT,
        property_address TEXT,
        content TEXT,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT DEFAULT ${now},
        updated_at TEXT DEFAULT ${now}
      );
    `);

    // Transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        account_type TEXT DEFAULT 'cash',
        description TEXT,
        user_id TEXT REFERENCES auth_users(id),
        agent_commission_percent REAL,
        rop_commission_percent REAL,
        created_at TEXT DEFAULT ${now},
        updated_at TEXT DEFAULT ${now}
      );
    `);

    // Notifications table
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TEXT DEFAULT ${now}
      );
    `);

    // Recurring expenses table
    await query(`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_days TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        related_user_id TEXT REFERENCES auth_users(id),
        created_by TEXT REFERENCES auth_users(id),
        created_at TEXT DEFAULT ${now},
        updated_at TEXT DEFAULT ${now}
      );
    `);

    // KPI Rules table
    await query(`
      CREATE TABLE IF NOT EXISTS kpi_rules (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        period_type TEXT NOT NULL,
        min_threshold REAL NOT NULL,
        percent REAL NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT ${now}
      );
    `);

    // KPI Records table
    await query(`
      CREATE TABLE IF NOT EXISTS kpi_records (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES auth_users(id),
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        total_revenue REAL DEFAULT 0,
        current_percent REAL DEFAULT 0,
        bonus_amount REAL DEFAULT 0,
        calculated_at TEXT DEFAULT ${now},
        UNIQUE(user_id, period_start, period_end)
      );
    `);

    // Branches table
    await query(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        created_at TEXT DEFAULT ${now},
        updated_at TEXT DEFAULT ${now}
      );
    `);

    // Teams table
    await query(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        leader_id TEXT REFERENCES auth_users(id),
        created_at TEXT DEFAULT ${now},
        updated_at TEXT DEFAULT ${now}
      );
    `);

    // Quarterly Plans
    await query(`
      CREATE TABLE IF NOT EXISTS quarterly_plans (
        id ${idType} PRIMARY KEY,
        period_year INTEGER NOT NULL,
        period_quarter INTEGER NOT NULL,
        branch_id ${idType} NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        target_revenue ${realType} DEFAULT 0,
        target_deals INTEGER DEFAULT 0,
        target_deposits INTEGER DEFAULT 0,
        target_objects INTEGER DEFAULT 0,
        target_newbuildings INTEGER DEFAULT 0,
        target_attendance INTEGER DEFAULT 0,
        target_mortgage INTEGER DEFAULT 0,
        created_by ${idType} REFERENCES auth_users(id),
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now},
        UNIQUE(period_year, period_quarter, branch_id)
      );
    `);

    // User Plans
    await query(`
      CREATE TABLE IF NOT EXISTS user_plans (
        id ${idType} PRIMARY KEY,
        user_id ${idType} NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        period_month ${textType} NOT NULL,
        target_revenue ${realType} DEFAULT 0,
        target_deals INTEGER DEFAULT 0,
        target_deposits INTEGER DEFAULT 0,
        target_objects INTEGER DEFAULT 0,
        target_newbuildings INTEGER DEFAULT 0,
        target_attendance INTEGER DEFAULT 0,
        target_mortgage INTEGER DEFAULT 0,
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now},
        UNIQUE(user_id, period_month)
      );
    `);

    // Service Requests
    await query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id ${idType} PRIMARY KEY,
        user_id ${idType} NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        type ${textType} NOT NULL,
        title ${textType} NOT NULL,
        description ${textType},
        priority ${textType} DEFAULT 'normal',
        status ${textType} DEFAULT 'pending',
        data ${textType},
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Service Request Attachments
    await query(`
      CREATE TABLE IF NOT EXISTS service_request_attachments (
        id ${idType} PRIMARY KEY,
        request_id ${idType} NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        file_name ${textType} NOT NULL,
        file_url ${textType} NOT NULL,
        file_size INTEGER,
        uploaded_by ${idType} REFERENCES auth_users(id),
        created_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Add missing columns (for existing databases)
    const alterTable = async (table, column, type) => {
      try {
        if (isPostgres) {
          // In Postgres, we can check if column exists to avoid log clutter
          const checkColumn = await query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          `, [table, column]);

          if (checkColumn.rows.length === 0) {
            await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
          }
        } else {
          await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        }
      } catch (e) {
        // Safe to ignore if column exists (SQLite and fallback)
      }
    };

    await alterTable('branches', 'phone', 'TEXT');
    await alterTable('profiles', 'branch_id', 'TEXT REFERENCES branches(id)');
    await alterTable('profiles', 'team_id', 'TEXT REFERENCES teams(id)');
    await alterTable('profiles', 'realtor_type', "TEXT DEFAULT 'universal'");
    await alterTable('profiles', 'is_kpi_enabled', 'INTEGER DEFAULT 1');
    await alterTable('profiles', 'is_new_building', 'INTEGER DEFAULT 0');

    await alterTable('positions', 'is_salary_enabled', 'INTEGER DEFAULT 1');
    await alterTable('positions', 'is_kpi_enabled', 'INTEGER DEFAULT 1');
    await alterTable('positions', 'is_new_building', 'INTEGER DEFAULT 0');
    await alterTable('positions', 'sort_order', 'INTEGER DEFAULT 100');

    await alterTable('attendance', 'is_in_fields', 'INTEGER DEFAULT 0');
    await alterTable('quarterly_plans', 'branch_id', 'TEXT REFERENCES branches(id)');

    // Sync quarterly_plans columns if they were created with old names
    if (isPostgres) {
      const checkRevCol = await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'quarterly_plans' AND column_name = 'year'");
      if (checkRevCol.rows.length > 0) {
        await query("ALTER TABLE quarterly_plans RENAME COLUMN year TO period_year");
        await query("ALTER TABLE quarterly_plans RENAME COLUMN quarter TO period_quarter");
      }

      const checkUserPlanCol = await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'year'");
      if (checkUserPlanCol.rows.length > 0) {
        // This is a bit tricky since we changed year/quarter to period_month
        // For now, let's just add period_month column
        await alterTable('user_plans', 'period_month', 'TEXT');

        try {
          console.log('🗑️ Dropping deprecated columns from user_plans (year, quarter)...');
          await query('ALTER TABLE user_plans DROP COLUMN IF EXISTS year CASCADE');
          await query('ALTER TABLE user_plans DROP COLUMN IF EXISTS quarter CASCADE');
        } catch (e) {
          console.error('Failed to drop old user_plans columns:', e.message);
        }

        try {
          // Ensure the new unique constraint is added
          await query('ALTER TABLE user_plans ADD CONSTRAINT user_plans_user_id_period_month_key UNIQUE(user_id, period_month)');
        } catch (e) {
          // Constraint might already exist, safe to ignore
        }
      }
      await alterTable('quarterly_plans', 'created_by', 'TEXT REFERENCES auth_users(id)');
    } else {
      // SQLite: check if period_month exists in user_plans
      try {
        await query("ALTER TABLE user_plans ADD COLUMN period_month TEXT");
      } catch (e) { }
      try {
        await query("ALTER TABLE quarterly_plans RENAME COLUMN year TO period_year");
        await query("ALTER TABLE quarterly_plans RENAME COLUMN quarter TO period_quarter");
      } catch (e) { }
    }

    // Ensure Unique Constraints for ON CONFLICT in Postgres
    if (isPostgres) {
      console.log('🔍 Checking unique constraints for Postgres...');
      const ensureUnique = async (table, constraintName, columns) => {
        try {
          const check = await query(`
            SELECT 1 FROM pg_constraint WHERE conname = $1
          `, [constraintName]);
          if (check.rows.length === 0) {
            console.log(`➕ Adding unique constraint ${constraintName} to ${table}...`);
            await query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} UNIQUE (${columns})`);
          }
        } catch (e) {
          console.error(`Failed to add unique constraint to ${table}:`, e.message);
        }
      };

      await ensureUnique('user_plans', 'user_plans_user_id_period_month_key', 'user_id, period_month');
      await ensureUnique('quarterly_plans', 'quarterly_plans_period_year_period_quarter_branch_id_key', 'period_year, period_quarter, branch_id');
      await ensureUnique('kpi_records', 'kpi_records_user_id_period_start_period_end_key', 'user_id, period_start, period_end');
    }

    // Default positions with explicit sort order
    const positions = [
      { id: 'pos-director', name: 'Директор', description: 'Руководство компанией', base_salary: 0, commission_percent: 0, sort_order: 10 },
      { id: 'pos-admin', name: 'Администратор', description: 'Администрирование системы', base_salary: 0, commission_percent: 0, sort_order: 20 },
      { id: 'pos-comm', name: 'Коммерческий директор', description: 'Коммерческое управление', base_salary: 0, commission_percent: 0, sort_order: 30 },
      { id: 'pos-rop', name: 'РОП', description: 'Руководитель отдела продаж', base_salary: 0, commission_percent: 0, sort_order: 40 },
      { id: 'pos-mop', name: 'МОП', description: 'Менеджер отдела продаж', base_salary: 0, commission_percent: 0, sort_order: 50 },
      { id: 'pos-realtor', name: 'Риелтор', description: 'Специалист по недвижимости', base_salary: 0, commission_percent: 0, sort_order: 60 }
    ];

    const conflictClause = isPostgres ? 'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order' : '';
    const insertPrefix = isPostgres ? 'INSERT INTO' : 'INSERT OR REPLACE INTO';

    // 1. Insert/Update system positions FIRST so they exist as foreign keys
    for (const pos of positions) {
      await query(`
        ${insertPrefix} positions (id, name, description, base_salary, commission_percent, is_system, sort_order)
        VALUES ($1, $2, $3, $4, $5, 1, $6)
        ${conflictClause}
      `, [pos.id, pos.name, pos.description, pos.base_salary, pos.commission_percent, pos.sort_order]);
    }

    // 2. Re-assign users from old temporary IDs to new system IDs BEFORE deletion
    await query("UPDATE profiles SET position_id = 'pos-admin' WHERE position_id = 'pos-1'");
    await query("UPDATE profiles SET position_id = 'pos-rop' WHERE position_id = 'pos-2'");
    await query("UPDATE profiles SET position_id = 'pos-realtor' WHERE position_id IN ('pos-3', 'pos-4')");

    // 3. NOW it's safe to delete old non-system positions
    await query("DELETE FROM positions WHERE is_system = 0 OR id IN ('pos-1', 'pos-2', 'pos-3', 'pos-4')");

    // Deals module tables
    console.log('📦 Creating deals tables...');

    await query(`
      CREATE TABLE IF NOT EXISTS deals (
        id ${idType} PRIMARY KEY,
        property_object ${textType} NOT NULL,
        document_type ${textType} NOT NULL,
        document_date ${textType},
        seller_name ${textType},
        seller_phone ${textType},
        buyer_name ${textType},
        buyer_phone ${textType},
        deposit_date ${textType},
        deal_date ${textType},
        receipt_date ${textType},
        service_type ${textType},
        has_mortgage INTEGER DEFAULT 0,
        mortgage_amount ${realType},
        status ${textType} DEFAULT 'draft',
        period_month INTEGER,
        period_year INTEGER,
        created_by ${idType} NOT NULL REFERENCES auth_users(id),
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_participants (
        id ${idType} PRIMARY KEY,
        deal_id ${idType} NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        employee_id ${idType} NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role ${textType} NOT NULL,
        side ${textType} NOT NULL,
        created_at ${timestampType} DEFAULT ${now}
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_commissions (
        id ${idType} PRIMARY KEY,
        deal_id ${idType} UNIQUE NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        commission_seller_plan ${realType} DEFAULT 0,
        commission_buyer_plan ${realType} DEFAULT 0,
        commission_seller_fact ${realType} DEFAULT 0,
        commission_buyer_fact ${realType} DEFAULT 0,
        agent_percent_seller ${realType} DEFAULT 0,
        agent_percent_buyer ${realType} DEFAULT 0,
        rop_percent ${realType} DEFAULT 0,
        mortgage_expense ${realType} DEFAULT 0,
        other_expenses ${realType} DEFAULT 0,
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id ${idType} PRIMARY KEY,
        document_type ${textType},
        property_type ${textType},
        agent_percent_default ${realType} NOT NULL,
        rop_percent_default ${realType} NOT NULL,
        priority INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS deal_payouts (
        id ${idType} PRIMARY KEY,
        deal_id ${idType} NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        employee_id ${idType} NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        payout_type ${textType} NOT NULL,
        amount_calculated ${realType} NOT NULL,
        amount_paid ${realType} DEFAULT 0,
        status ${textType} DEFAULT 'pending',
        approved_at ${textType},
        paid_at ${textType},
        approved_by ${idType} REFERENCES auth_users(id),
        notes ${textType},
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS finance_summary_cache (
        id ${idType} PRIMARY KEY,
        cache_key ${textType} UNIQUE NOT NULL,
        summary_data ${textType} NOT NULL,
        calculated_at ${timestampType} DEFAULT ${now},
        expires_at ${textType} NOT NULL,
        created_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Seed default commission rules
    console.log('📦 Seeding commission rules...');
    const defaultRules = [
      { id: 'rule-default', document_type: null, property_type: null, agent_percent: 50, rop_percent: 10, priority: 0 },
      { id: 'rule-sale', document_type: 'купля-продажа', property_type: null, agent_percent: 50, rop_percent: 10, priority: 10 },
      { id: 'rule-rent', document_type: 'аренда', property_type: null, agent_percent: 60, rop_percent: 8, priority: 10 }
    ];

    for (const rule of defaultRules) {
      await query(`
        ${insertPrefix} commission_rules (id, document_type, property_type, agent_percent_default, rop_percent_default, priority, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        ${conflictClause}
      `, [rule.id, rule.document_type, rule.property_type, rule.agent_percent, rule.rop_percent, rule.priority]);
    }

    // Deal Table Rows (Excel-like financial table)
    console.log('📦 Creating deal_table_rows...');
    await query(`
      CREATE TABLE IF NOT EXISTS deal_table_rows (
        id ${idType} PRIMARY KEY,

        -- Dates
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        deposit_date ${textType},
        deal_date ${textType},
        payment_date ${textType},

        -- Basic info
        property_name ${textType} NOT NULL,
        document_type ${textType} NOT NULL,
        agent_name ${textType},
        rop_name ${textType},
        mortgage INTEGER DEFAULT 0,
        comment ${textType},

        -- Manual commissions
        commission_seller_plan ${realType} DEFAULT 0,
        commission_buyer_plan ${realType} DEFAULT 0,
        commission_seller_fact ${realType} DEFAULT 0,
        commission_buyer_fact ${realType} DEFAULT 0,

        -- Manual percentages
        agent_percent ${realType} DEFAULT 0,
        rop_percent ${realType} DEFAULT 0,

        -- Manual bonuses/expenses
        agent_manual_bonus ${realType} DEFAULT 0,
        rop_manual_bonus ${realType} DEFAULT 0,
        other_expenses ${realType} DEFAULT 0,

        -- Calculated fields (stored, not computed on query)
        commission_total_fact ${realType} DEFAULT 0,
        agent_income ${realType} DEFAULT 0,
        rop_income ${realType} DEFAULT 0,
        company_revenue ${realType} DEFAULT 0,
        plan_completion ${realType} DEFAULT 0,
        marginality ${realType} DEFAULT 0,

        -- Metadata
        created_by ${idType} REFERENCES auth_users(id),
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Indexes for performance
    console.log('📦 Creating indexes for deal_table_rows...');
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_year_month ON deal_table_rows(year, month);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_agent ON deal_table_rows(agent_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_rop ON deal_table_rows(rop_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_document_type ON deal_table_rows(document_type);`);

    console.log('✅ Database migrated successfully');

    // --- KPI Materialized Views Update (Added 2026-04-03) ---
    if (isPostgres) {
      console.log('🔄 Checking and adding missing UUID columns in deal_table_rows...');
      await query(`
        ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS agent_id UUID;
        ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mop_id UUID;
        ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rop_id UUID;
        
        -- Update agent_id
        UPDATE deal_table_rows d 
        SET agent_id = p.id 
        FROM profiles p 
        WHERE d.agent_id IS NULL AND d.agent_name IS NOT NULL AND LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name));

        -- Update mop_id
        UPDATE deal_table_rows d 
        SET mop_id = p.id 
        FROM profiles p 
        WHERE d.mop_id IS NULL AND d.mop_name IS NOT NULL AND LOWER(TRIM(d.mop_name)) = LOWER(TRIM(p.full_name));

        -- Update rop_id
        UPDATE deal_table_rows d 
        SET rop_id = p.id 
        FROM profiles p 
        WHERE d.rop_id IS NULL AND d.rop_name IS NOT NULL AND LOWER(TRIM(d.rop_name)) = LOWER(TRIM(p.full_name));
      `);
      console.log('✅ Missing ID columns added and populated.');

      console.log('📊 Updating KPI Materialized Views...');
      await query(`
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
          WHERE d.status = 'active'
              AND (d.agent_id IS NOT NULL OR (d.agent_name IS NOT NULL AND d.agent_name != ''))
          GROUP BY COALESCE(d.agent_id::text, p.id::text), d.year, d.month;

          CREATE UNIQUE INDEX idx_mv_employee_monthly_stats_unique ON mv_employee_monthly_stats(employee_id, year, month);

          -- 2. Team Monthly Statistics
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

          -- 3. Branch Monthly Statistics
          CREATE MATERIALIZED VIEW mv_branch_monthly_stats AS
          SELECT
              COALESCE(d.branch_id, p.branch_id) AS branch_id,
              d.year,
              d.month,
              COUNT(d.id) AS deal_count,
              COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
              COALESCE(SUM(d.rop_payout), 0)::NUMERIC(12,2) AS total_rop_payout,
              COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
              COUNT(DISTINCT COALESCE(d.team_id, p.team_id)) AS team_count,
              COUNT(DISTINCT COALESCE(d.agent_id::text, p.id::text)) AS agent_count,
              COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
              MAX(d.updated_at) AS last_updated
          FROM deal_table_rows d
          LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
          WHERE d.status = 'active'
              AND COALESCE(d.branch_id, p.branch_id) IS NOT NULL
          GROUP BY COALESCE(d.branch_id, p.branch_id), d.year, d.month;

          CREATE UNIQUE INDEX idx_mv_branch_monthly_stats_unique ON mv_branch_monthly_stats(branch_id, year, month);

          -- 4. Company Monthly Statistics
          CREATE MATERIALIZED VIEW mv_company_monthly_stats AS
          SELECT
              d.year,
              d.month,
              COUNT(d.id) AS total_deals,
              COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
              COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
              COUNT(DISTINCT COALESCE(d.branch_id, p.branch_id)) AS branch_count,
              COUNT(DISTINCT COALESCE(d.agent_id::text, p.id::text)) AS agent_count,
              COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
              MAX(d.updated_at) AS last_updated
          FROM deal_table_rows d
          LEFT JOIN profiles p ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
          WHERE d.status = 'active'
          GROUP BY d.year, d.month;

          CREATE UNIQUE INDEX idx_mv_company_monthly_stats_unique ON mv_company_monthly_stats(year, month);

          -- Re-create the refresh function
          CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
          RETURNS void AS $$
          BEGIN
              REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_monthly_stats;
              REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_monthly_stats;
              REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_monthly_stats;
              REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_monthly_stats;
          END;
          $$ LANGUAGE plpgsql;

          SELECT refresh_all_materialized_views();
      `);
      console.log('✅ KPI Materialized Views updated and refreshed');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    // When run as a standalone script, fail the process.
    // When imported (e.g., during server startup), throw so the caller can decide.
    if (require.main === module) {
      process.exit(1);
    }
    throw error;
  }
}

module.exports = migrate;

if (require.main === module) {
  migrate();
}
