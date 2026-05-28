require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const addIndexes = async () => {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL');
    console.log('🚀 Adding performance indexes...');

    await client.query('BEGIN');

    // Indexes for profiles table (most queried)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON profiles(team_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_profiles_position_id ON profiles(position_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);`);

    // Indexes for user_roles (frequently joined)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);`);

    // Indexes for service_requests (heavy filtering)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_type ON service_requests(type);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_status_type ON service_requests(status, type);`);

    // Indexes for reports (revenue calculations)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_deal_date ON reports(deal_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_status_date ON reports(status, deal_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);`);

    // Indexes for user_plans (plan lookups)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_plans_period_month ON user_plans(period_month);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_plans_user_period ON user_plans(user_id, period_month);`);

    // Indexes for quarterly_plans
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quarterly_plans_year_quarter ON quarterly_plans(period_year, period_quarter);`);

    // Indexes for attendance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);`);

    // Indexes for notifications
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);`);

    // Indexes for teams
    await client.query(`CREATE INDEX IF NOT EXISTS idx_teams_branch_id ON teams(branch_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_teams_leader_id ON teams(leader_id);`);

    // Indexes for service_request_attachments
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attachments_request_id ON service_request_attachments(request_id);`);

    await client.query('COMMIT');
    console.log('✅ All indexes created successfully');
    console.log('📊 Database performance optimized');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Index creation failed:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

addIndexes();
