/**
 * Migration: Fix Materialized View Schema
 *
 * Issue: Production mv_employee_kpi_summary references old 'deals' table
 * instead of current 'deal_table_rows' table used for financial tracking.
 *
 * This migration:
 * 1. Drops the outdated materialized view
 * 2. Recreates it with correct schema using deal_table_rows
 * 3. Adds proper indexes for performance
 */

const { query, pool } = require('../index');

async function up() {
    console.log('🔄 Starting materialized view schema fix...');

    try {
        // Only run on PostgreSQL
        if (!pool) {
            console.log('⚠️  Skipping: SQLite does not support materialized views');
            return;
        }

        // 1. Drop existing outdated materialized view
        console.log('📦 Dropping outdated mv_employee_kpi_summary...');
        await query(`DROP MATERIALIZED VIEW IF EXISTS mv_employee_kpi_summary CASCADE`);

        // 2. Create updated materialized view using deal_table_rows
        console.log('📦 Creating updated mv_employee_kpi_summary...');
        await query(`
            CREATE MATERIALIZED VIEW mv_employee_kpi_summary AS
            SELECT
                p.id AS employee_id,
                p.full_name,
                p.branch_id,
                p.team_id,
                DATE_TRUNC('month', TO_DATE(d.year || '-' || d.month || '-01', 'YYYY-MM-DD')) AS report_month,
                d.year AS report_year,
                d.month AS report_month_num,
                COUNT(d.id) AS total_deals,
                COALESCE(SUM(d.commission_total_fact), 0) AS total_revenue,
                COALESCE(SUM(d.agent_income), 0) AS total_agent_income,
                COALESCE(SUM(d.mop_revenue), 0) AS total_mop_revenue,
                COALESCE(SUM(d.company_revenue), 0) AS total_company_revenue,
                COALESCE(AVG(d.commission_total_fact), 0) AS avg_deal_size,
                MAX(d.updated_at) AS last_updated
            FROM profiles p
            LEFT JOIN deal_table_rows d
                ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
            WHERE p.is_active = 1
            GROUP BY
                p.id,
                p.full_name,
                p.branch_id,
                p.team_id,
                d.year,
                d.month
        `);

        // 3. Create unique index for concurrent refresh
        console.log('📦 Creating unique index...');
        await query(`
            CREATE UNIQUE INDEX idx_mv_employee_kpi_summary_unique
            ON mv_employee_kpi_summary(employee_id, report_year, report_month_num)
        `);

        // 4. Create additional indexes for filtering
        console.log('📦 Creating additional indexes...');
        await query(`
            CREATE INDEX idx_mv_employee_kpi_summary_branch
            ON mv_employee_kpi_summary(branch_id, report_year, report_month_num)
        `);

        await query(`
            CREATE INDEX idx_mv_employee_kpi_summary_team
            ON mv_employee_kpi_summary(team_id, report_year, report_month_num)
        `);

        await query(`
            CREATE INDEX idx_mv_employee_kpi_summary_month
            ON mv_employee_kpi_summary(report_month)
        `);

        // 5. Initial population
        console.log('📦 Populating materialized view...');
        await query(`REFRESH MATERIALIZED VIEW mv_employee_kpi_summary`);

        console.log('✅ Materialized view schema fix completed successfully');

        return { success: true };
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

async function down() {
    console.log('🔄 Rolling back materialized view schema fix...');

    try {
        if (!pool) {
            console.log('⚠️  Skipping: SQLite does not support materialized views');
            return;
        }

        // Drop the new view
        await query(`DROP MATERIALIZED VIEW IF EXISTS mv_employee_kpi_summary CASCADE`);

        // Recreate the old view (for rollback purposes)
        await query(`
            CREATE MATERIALIZED VIEW mv_employee_kpi_summary AS
            SELECT
                p.id AS employee_id,
                p.branch_id,
                COUNT(d.id) AS total_deals,
                COALESCE(SUM(d.mortgage_amount), 0) AS total_revenue,
                DATE_TRUNC('month', d.created_at) AS report_month
            FROM profiles p
            LEFT JOIN deal_participants dp ON p.id = dp.employee_id
            LEFT JOIN deals d ON dp.deal_id = d.id AND d.status = 'won'
            GROUP BY p.id, p.branch_id, DATE_TRUNC('month', d.created_at)
        `);

        await query(`
            CREATE UNIQUE INDEX idx_mv_employee_kpi_summary_unique
            ON mv_employee_kpi_summary(employee_id, report_month)
        `);

        console.log('✅ Rollback completed');

        return { success: true };
    } catch (error) {
        console.error('❌ Rollback failed:', error);
        throw error;
    }
}

// Run migration if executed directly
if (require.main === module) {
    up()
        .then(() => {
            console.log('Migration completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { up, down };
