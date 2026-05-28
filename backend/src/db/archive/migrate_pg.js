require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL');
    console.log('🛠 Starting migration...');

    await client.query('BEGIN');

    // Auth Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        encrypted_password TEXT NOT NULL,
        email_confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Positions
    await client.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Position Permissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS position_permissions (
        id TEXT PRIMARY KEY,
        position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        avatar_url TEXT,
        position_id TEXT REFERENCES positions(id),
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

    // User Roles
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('admin', 'director', 'commercial', 'head_sales', 'sales_manager', 'manager', 'realtor')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, role)
      );
    `);

    // Attendance
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        check_in TIMESTAMP,
        check_out TIMESTAMP,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        title TEXT,
        description TEXT,
        amount REAL,
        deal_date TIMESTAMP,
        client_name TEXT,
        client_phone TEXT,
        property_address TEXT,
        approved_by TEXT,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        user_id TEXT REFERENCES auth_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        agent_commission_percent REAL,
        rop_commission_percent REAL
      );
    `);

    // Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Recurring Expenses
    await client.query(`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_days TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        related_user_id TEXT REFERENCES auth_users(id),
        created_by TEXT REFERENCES auth_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // KPI Rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS kpi_rules (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        period_type TEXT NOT NULL,
        min_threshold REAL NOT NULL,
        percent REAL NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // KPI Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS kpi_records (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES auth_users(id),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_revenue REAL DEFAULT 0,
        current_percent REAL DEFAULT 0,
        bonus_amount REAL DEFAULT 0,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, period_start, period_end)
      );
    `);

    // Quarterly Plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS quarterly_plans (
        id TEXT PRIMARY KEY,
        period_year INTEGER NOT NULL,
        period_quarter INTEGER NOT NULL,
        target_revenue REAL DEFAULT 0,
        target_deals INTEGER DEFAULT 0,
        target_deposits INTEGER DEFAULT 0,
        target_objects INTEGER DEFAULT 0,
        target_newbuildings INTEGER DEFAULT 0,
        target_attendance INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(period_year, period_quarter)
      );
    `);

    // User Plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        period_month TEXT NOT NULL,
        target_revenue REAL DEFAULT 0,
        target_deals INTEGER DEFAULT 0,
        target_deposits INTEGER DEFAULT 0,
        target_objects INTEGER DEFAULT 0,
        target_newbuildings INTEGER DEFAULT 0,
        target_attendance INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, period_month)
      );
    `);

    // Daily Plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_daily_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        period_date DATE NOT NULL,
        target_deposits INTEGER DEFAULT 0,
        target_objects INTEGER DEFAULT 0,
        target_revenue REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, period_date)
      );
    `);

    // Default Positions
    const positions = [
      { id: 'pos-1', name: 'Руководитель отдела', description: 'Управление командой', base_salary: 50000, commission_percent: 60 },
      { id: 'pos-2', name: 'Старший риелтор', description: 'Опытный специалист', base_salary: 35000, commission_percent: 50 },
      { id: 'pos-3', name: 'Риелтор', description: 'Специалист по недвижимости', base_salary: 25000, commission_percent: 40 },
      { id: 'pos-4', name: 'Стажер', description: 'Начинающий специалист', base_salary: 15000, commission_percent: 30 }
    ];

    for (const pos of positions) {
      await client.query(`
        INSERT INTO positions (id, name, description, base_salary, commission_percent)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [pos.id, pos.name, pos.description, pos.base_salary, pos.commission_percent]);
    }
    // Branches
    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Teams
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        leader_id TEXT REFERENCES auth_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add columns to profiles
    try {
      await client.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES branches(id);`);
      await client.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id);`);
      await client.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary_amount REAL DEFAULT 0;`);
    } catch (e) {
      console.log('Columns likely exist', e.message);
    }

    // Add is_in_fields column to attendance
    try {
      await client.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_in_fields INTEGER DEFAULT 0;`);
    } catch (e) {
      console.log('is_in_fields column likely exists', e.message);
    }

    console.log('✅ Default positions inserted');

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
