/**
 * Migration: Add Performance Indexes
 *
 * This migration adds critical indexes to improve query performance
 * Safe to run multiple times (uses IF NOT EXISTS)
 *
 * Run with: node backend/src/db/migrations/add_performance_indexes.js
 */

const { query, pool } = require('../index');

async function up() {
    console.log('🚀 Starting performance index migration...');

    try {
        // Start transaction
        await query('BEGIN');

        // 1. deal_table_rows indexes
        console.log('Creating deal_table_rows indexes...');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_table_year_month
            ON deal_table_rows(year DESC, month DESC)
        `);
        console.log('✅ idx_deal_table_year_month');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_table_agent_name_lower
            ON deal_table_rows(LOWER(TRIM(agent_name)))
        `);
        console.log('✅ idx_deal_table_agent_name_lower');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_table_team_year_month
            ON deal_table_rows(team_id, year DESC, month DESC)
            WHERE team_id IS NOT NULL
        `);
        console.log('✅ idx_deal_table_team_year_month');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_table_branch_year_month
            ON deal_table_rows(branch_id, year DESC, month DESC)
            WHERE branch_id IS NOT NULL
        `);
        console.log('✅ idx_deal_table_branch_year_month');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_table_updated_at
            ON deal_table_rows(updated_at DESC)
        `);
        console.log('✅ idx_deal_table_updated_at');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_table_aggregations
            ON deal_table_rows(year, month, team_id, branch_id)
            INCLUDE (commission_total_fact, agent_income, mop_revenue, company_revenue)
        `);
        console.log('✅ idx_deal_table_aggregations (covering index)');

        // 2. profiles indexes
        console.log('Creating profiles indexes...');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_team_branch_active
            ON profiles(team_id, branch_id, is_active)
            WHERE is_active = 1
        `);
        console.log('✅ idx_profiles_team_branch_active');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_position_active
            ON profiles(position_id, is_active)
            WHERE is_active = 1
        `);
        console.log('✅ idx_profiles_position_active');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_full_name_lower
            ON profiles(LOWER(TRIM(full_name)))
        `);
        console.log('✅ idx_profiles_full_name_lower');

        // 3. transactions indexes
        console.log('Creating transactions indexes...');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type_category
            ON transactions(type, category, created_at DESC)
        `);
        console.log('✅ idx_transactions_type_category');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_deal_id
            ON transactions(deal_id)
            WHERE deal_id IS NOT NULL
        `);
        console.log('✅ idx_transactions_deal_id');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_date
            ON transactions(user_id, created_at DESC)
            WHERE user_id IS NOT NULL
        `);
        console.log('✅ idx_transactions_user_date');

        // 4. reports indexes
        console.log('Creating reports indexes...');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_user_status_date
            ON reports(user_id, status, created_at DESC)
        `);
        console.log('✅ idx_reports_user_status_date');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_type_date
            ON reports(type, created_at DESC)
        `);
        console.log('✅ idx_reports_type_date');

        await query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_deal_date
            ON reports(deal_date)
            WHERE deal_date IS NOT NULL
        `);
        console.log('✅ idx_reports_deal_date');

        // 5. service_requests indexes (if table exists)
        try {
            await query(`
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_requests_user_type_date
                ON service_requests(user_id, type, created_at DESC)
            `);
            console.log('✅ idx_service_requests_user_type_date');

            await query(`
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_requests_status_date
                ON service_requests(status, created_at DESC)
            `);
            console.log('✅ idx_service_requests_status_date');
        } catch (e) {
            console.log('⚠️  service_requests table not found, skipping indexes');
        }

        // 6. Analyze tables
        console.log('Analyzing tables to update statistics...');
        await query('ANALYZE deal_table_rows');
        await query('ANALYZE profiles');
        await query('ANALYZE transactions');
        await query('ANALYZE reports');
        console.log('✅ Table statistics updated');

        // Commit transaction
        await query('COMMIT');

        console.log('✅ Performance index migration completed successfully!');
        console.log('📊 Run monitoring queries to verify index usage');

        return { success: true };
    } catch (error) {
        await query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

async function down() {
    console.log('🔄 Rolling back performance indexes...');

    try {
        await query('BEGIN');

        const indexes = [
            'idx_deal_table_year_month',
            'idx_deal_table_agent_name_lower',
            'idx_deal_table_team_year_month',
            'idx_deal_table_branch_year_month',
            'idx_deal_table_updated_at',
            'idx_deal_table_aggregations',
            'idx_profiles_team_branch_active',
            'idx_profiles_position_active',
            'idx_profiles_full_name_lower',
            'idx_transactions_type_category',
            'idx_transactions_deal_id',
            'idx_transactions_user_date',
            'idx_reports_user_status_date',
            'idx_reports_type_date',
            'idx_reports_deal_date',
            'idx_service_requests_user_type_date',
            'idx_service_requests_status_date'
        ];

        for (const indexName of indexes) {
            try {
                await query(`DROP INDEX IF EXISTS ${indexName}`);
                console.log(`✅ Dropped ${indexName}`);
            } catch (e) {
                console.log(`⚠️  Could not drop ${indexName}: ${e.message}`);
            }
        }

        await query('COMMIT');
        console.log('✅ Rollback completed');

        return { success: true };
    } catch (error) {
        await query('ROLLBACK');
        console.error('❌ Rollback failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'down') {
        down()
            .then(() => {
                console.log('Migration rolled back successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('Migration rollback failed:', error);
                process.exit(1);
            });
    } else {
        up()
            .then(() => {
                console.log('Migration completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('Migration failed:', error);
                process.exit(1);
            });
    }
}

module.exports = { up, down };
