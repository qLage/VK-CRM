/**
 * Database Optimization Script
 *
 * Performs routine maintenance and optimization tasks:
 * - VACUUM ANALYZE to reclaim space and update statistics
 * - REINDEX to rebuild bloated indexes
 * - Refresh materialized views
 *
 * Usage: node backend/src/db/scripts/optimize_database.js [--full]
 */

const { query, pool } = require('../index');

class DatabaseOptimizer {
    constructor(options = {}) {
        this.fullOptimization = options.full || false;
    }

    async run() {
        console.log('🔧 Starting Database Optimization...\n');

        if (!pool) {
            console.log('⚠️  SQLite detected - limited optimization available');
            await this.optimizeSQLite();
            return;
        }

        try {
            await this.vacuumAnalyze();

            if (this.fullOptimization) {
                await this.reindexTables();
            }

            await this.refreshMaterializedViews();
            await this.updateStatistics();

            console.log('\n✅ Database optimization completed successfully!');
        } catch (error) {
            console.error('\n❌ Optimization failed:', error);
            throw error;
        }
    }

    async vacuumAnalyze() {
        console.log('🧹 Running VACUUM ANALYZE...');

        try {
            // Get tables with most dead tuples
            const result = await query(`
                SELECT tablename, n_dead_tup
                FROM pg_stat_user_tables
                WHERE schemaname = 'public'
                  AND n_dead_tup > 100
                ORDER BY n_dead_tup DESC
            `);

            if (result.rows.length === 0) {
                console.log('   ✅ No tables need vacuuming\n');
                return;
            }

            console.log(`   Found ${result.rows.length} tables to vacuum:`);

            for (const row of result.rows) {
                console.log(`   - Vacuuming ${row.tablename} (${row.n_dead_tup} dead tuples)...`);
                await query(`VACUUM ANALYZE ${row.tablename}`);
            }

            console.log('   ✅ VACUUM ANALYZE completed\n');
        } catch (error) {
            console.error('   ❌ VACUUM ANALYZE failed:', error.message);
        }
    }

    async reindexTables() {
        console.log('🔄 Rebuilding indexes (REINDEX)...');
        console.log('   ⚠️  This may take several minutes for large tables\n');

        try {
            const tables = ['deal_table_rows', 'profiles', 'transactions', 'reports'];

            for (const table of tables) {
                console.log(`   - Reindexing ${table}...`);
                await query(`REINDEX TABLE ${table}`);
            }

            console.log('   ✅ REINDEX completed\n');
        } catch (error) {
            console.error('   ❌ REINDEX failed:', error.message);
        }
    }

    async refreshMaterializedViews() {
        console.log('🔄 Refreshing materialized views...');

        try {
            // Get all materialized views
            const result = await query(`
                SELECT matviewname
                FROM pg_matviews
                WHERE schemaname = 'public'
            `);

            if (result.rows.length === 0) {
                console.log('   ℹ️  No materialized views to refresh\n');
                return;
            }

            for (const row of result.rows) {
                console.log(`   - Refreshing ${row.matviewname}...`);

                try {
                    // Try concurrent refresh first (requires unique index)
                    await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${row.matviewname}`);
                    console.log(`     ✅ Concurrent refresh successful`);
                } catch (e) {
                    // Fall back to regular refresh
                    console.log(`     ⚠️  Concurrent refresh not available, using regular refresh`);
                    await query(`REFRESH MATERIALIZED VIEW ${row.matviewname}`);
                    console.log(`     ✅ Regular refresh successful`);
                }
            }

            console.log('   ✅ All materialized views refreshed\n');
        } catch (error) {
            console.error('   ❌ Materialized view refresh failed:', error.message);
        }
    }

    async updateStatistics() {
        console.log('📊 Updating table statistics...');

        try {
            const tables = [
                'deal_table_rows',
                'profiles',
                'transactions',
                'reports',
                'service_requests',
                'teams',
                'branches',
                'positions'
            ];

            for (const table of tables) {
                try {
                    await query(`ANALYZE ${table}`);
                    console.log(`   ✅ ${table}`);
                } catch (e) {
                    console.log(`   ⚠️  ${table} (table might not exist)`);
                }
            }

            console.log('');
        } catch (error) {
            console.error('   ❌ Statistics update failed:', error.message);
        }
    }

    async optimizeSQLite() {
        console.log('🔧 Optimizing SQLite database...');

        try {
            const { db } = require('../index');

            // Run VACUUM to reclaim space
            console.log('   - Running VACUUM...');
            db.prepare('VACUUM').run();

            // Analyze tables
            console.log('   - Running ANALYZE...');
            db.prepare('ANALYZE').run();

            // Optimize
            console.log('   - Running PRAGMA optimize...');
            db.prepare('PRAGMA optimize').run();

            console.log('   ✅ SQLite optimization completed\n');
        } catch (error) {
            console.error('   ❌ SQLite optimization failed:', error.message);
        }
    }
}

// Run optimization if executed directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const fullOptimization = args.includes('--full');

    if (fullOptimization) {
        console.log('⚠️  Running FULL optimization (includes REINDEX)');
        console.log('   This may take several minutes and will lock tables temporarily\n');
    }

    const optimizer = new DatabaseOptimizer({ full: fullOptimization });
    optimizer.run()
        .then(() => {
            console.log('Optimization completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Optimization failed:', error);
            process.exit(1);
        });
}

module.exports = DatabaseOptimizer;
