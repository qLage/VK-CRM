/**
 * Database Health Check Script
 *
 * Comprehensive health check for CRM database
 * Checks indexes, table sizes, query performance, and materialized views
 *
 * Usage: node backend/src/db/scripts/database_health_check.js
 */

const { query, pool } = require('../index');

class DatabaseHealthCheck {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            checks: [],
            warnings: [],
            errors: [],
            recommendations: []
        };
    }

    async run() {
        console.log('🏥 Starting Database Health Check...\n');

        if (!pool) {
            console.log('⚠️  SQLite detected - limited health checks available');
            return this.results;
        }

        try {
            await this.checkDatabaseSize();
            await this.checkTableSizes();
            await this.checkIndexUsage();
            await this.checkMissingIndexes();
            await this.checkMaterializedViews();
            await this.checkSlowQueries();
            await this.checkTableBloat();
            await this.checkConnectionStats();

            this.printSummary();
            return this.results;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            this.results.errors.push({
                check: 'overall',
                error: error.message
            });
            return this.results;
        }
    }

    async checkDatabaseSize() {
        console.log('📊 Checking database size...');

        try {
            const result = await query(`
                SELECT pg_size_pretty(pg_database_size(current_database())) as size
            `);

            const size = result.rows[0].size;
            this.results.checks.push({
                name: 'Database Size',
                status: 'ok',
                value: size
            });
            console.log(`   ✅ Database size: ${size}\n`);
        } catch (error) {
            this.results.errors.push({
                check: 'database_size',
                error: error.message
            });
        }
    }

    async checkTableSizes() {
        console.log('📊 Checking table sizes...');

        try {
            const result = await query(`
                SELECT
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
                    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY size_bytes DESC
                LIMIT 10
            `);

            console.log('   Top 10 largest tables:');
            result.rows.forEach(row => {
                console.log(`   - ${row.tablename}: ${row.size}`);
            });

            this.results.checks.push({
                name: 'Table Sizes',
                status: 'ok',
                tables: result.rows
            });
            console.log('');
        } catch (error) {
            this.results.errors.push({
                check: 'table_sizes',
                error: error.message
            });
        }
    }

    async checkIndexUsage() {
        console.log('📊 Checking index usage...');

        try {
            const result = await query(`
                SELECT
                    schemaname,
                    tablename,
                    indexname,
                    idx_scan,
                    idx_tup_read,
                    idx_tup_fetch,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
                FROM pg_stat_user_indexes
                WHERE schemaname = 'public'
                ORDER BY idx_scan ASC
                LIMIT 10
            `);

            const unusedIndexes = result.rows.filter(row => row.idx_scan === 0 || row.idx_scan === '0');

            if (unusedIndexes.length > 0) {
                console.log(`   ⚠️  Found ${unusedIndexes.length} unused indexes:`);
                unusedIndexes.forEach(row => {
                    console.log(`   - ${row.indexname} on ${row.tablename} (${row.index_size})`);
                    this.results.warnings.push({
                        type: 'unused_index',
                        index: row.indexname,
                        table: row.tablename,
                        size: row.index_size
                    });
                });
                this.results.recommendations.push(
                    'Consider dropping unused indexes to save space and improve write performance'
                );
            } else {
                console.log('   ✅ All indexes are being used');
            }

            this.results.checks.push({
                name: 'Index Usage',
                status: unusedIndexes.length > 0 ? 'warning' : 'ok',
                unused_count: unusedIndexes.length
            });
            console.log('');
        } catch (error) {
            this.results.errors.push({
                check: 'index_usage',
                error: error.message
            });
        }
    }

    async checkMissingIndexes() {
        console.log('📊 Checking for missing indexes...');

        try {
            // Check if critical tables have proper indexes
            const criticalIndexes = [
                { table: 'deal_table_rows', column: 'year, month' },
                { table: 'deal_table_rows', column: 'agent_name' },
                { table: 'deal_table_rows', column: 'team_id' },
                { table: 'profiles', column: 'team_id' },
                { table: 'profiles', column: 'branch_id' },
                { table: 'transactions', column: 'deal_id' }
            ];

            let missingCount = 0;

            for (const { table, column } of criticalIndexes) {
                const result = await query(`
                    SELECT COUNT(*) as count
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = $1
                      AND indexdef ILIKE '%' || $2 || '%'
                `, [table, column.split(',')[0].trim()]);

                if (parseInt(result.rows[0].count) === 0) {
                    console.log(`   ⚠️  Missing index on ${table}(${column})`);
                    missingCount++;
                    this.results.warnings.push({
                        type: 'missing_index',
                        table,
                        column
                    });
                }
            }

            if (missingCount === 0) {
                console.log('   ✅ All critical indexes present');
            } else {
                this.results.recommendations.push(
                    'Run performance optimization migration to add missing indexes'
                );
            }

            this.results.checks.push({
                name: 'Missing Indexes',
                status: missingCount > 0 ? 'warning' : 'ok',
                missing_count: missingCount
            });
            console.log('');
        } catch (error) {
            this.results.errors.push({
                check: 'missing_indexes',
                error: error.message
            });
        }
    }

    async checkMaterializedViews() {
        console.log('📊 Checking materialized views...');

        try {
            const result = await query(`
                SELECT
                    schemaname,
                    matviewname,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
                FROM pg_matviews
                WHERE schemaname = 'public'
            `);

            if (result.rows.length === 0) {
                console.log('   ⚠️  No materialized views found');
                this.results.warnings.push({
                    type: 'no_materialized_views',
                    message: 'Consider creating materialized views for performance'
                });
                this.results.recommendations.push(
                    'Deploy materialized views for agent/team/branch summaries'
                );
            } else {
                console.log(`   ✅ Found ${result.rows.length} materialized views:`);
                result.rows.forEach(row => {
                    console.log(`   - ${row.matviewname} (${row.size})`);
                });

                // Check freshness
                for (const row of result.rows) {
                    try {
                        const freshnessResult = await query(`
                            SELECT MAX(last_updated) as last_refresh
                            FROM ${row.matviewname}
                        `);

                        if (freshnessResult.rows[0]?.last_refresh) {
                            const lastRefresh = new Date(freshnessResult.rows[0].last_refresh);
                            const ageMinutes = (Date.now() - lastRefresh.getTime()) / 1000 / 60;

                            if (ageMinutes > 60) {
                                console.log(`   ⚠️  ${row.matviewname} is ${Math.round(ageMinutes)} minutes old`);
                                this.results.warnings.push({
                                    type: 'stale_materialized_view',
                                    view: row.matviewname,
                                    age_minutes: Math.round(ageMinutes)
                                });
                            }
                        }
                    } catch (e) {
                        // View might not have last_updated column
                    }
                }
            }

            this.results.checks.push({
                name: 'Materialized Views',
                status: result.rows.length > 0 ? 'ok' : 'warning',
                count: result.rows.length
            });
            console.log('');
        } catch (error) {
            this.results.errors.push({
                check: 'materialized_views',
                error: error.message
            });
        }
    }

    async checkSlowQueries() {
        console.log('📊 Checking for slow queries...');

        try {
            // Check if pg_stat_statements extension is available
            const extResult = await query(`
                SELECT COUNT(*) as count
                FROM pg_extension
                WHERE extname = 'pg_stat_statements'
            `);

            if (parseInt(extResult.rows[0].count) === 0) {
                console.log('   ⚠️  pg_stat_statements extension not installed');
                this.results.recommendations.push(
                    'Install pg_stat_statements extension for query performance monitoring'
                );
            } else {
                const result = await query(`
                    SELECT
                        LEFT(query, 100) as query_preview,
                        calls,
                        ROUND(total_exec_time::numeric, 2) as total_time_ms,
                        ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
                        ROUND(max_exec_time::numeric, 2) as max_time_ms
                    FROM pg_stat_statements
                    WHERE mean_exec_time > 100
                    ORDER BY mean_exec_time DESC
                    LIMIT 5
                `);

                if (result.rows.length > 0) {
                    console.log('   ⚠️  Found slow queries (mean > 100ms):');
                    result.rows.forEach(row => {
                        console.log(`   - ${row.query_preview}...`);
                        console.log(`     Mean: ${row.mean_time_ms}ms, Max: ${row.max_time_ms}ms, Calls: ${row.calls}`);
                    });
                    this.results.warnings.push({
                        type: 'slow_queries',
                        count: result.rows.length
                    });
                } else {
                    console.log('   ✅ No slow queries detected');
                }
            }

            this.results.checks.push({
                name: 'Slow Queries',
                status: 'ok'
            });
            console.log('');
        } catch (error) {
            // Extension might not be available
            console.log('   ℹ️  Query statistics not available');
        }
    }

    async checkTableBloat() {
        console.log('📊 Checking table bloat...');

        try {
            const result = await query(`
                SELECT
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
                    n_dead_tup,
                    n_live_tup,
                    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent
                FROM pg_stat_user_tables
                WHERE schemaname = 'public'
                  AND n_dead_tup > 1000
                ORDER BY n_dead_tup DESC
                LIMIT 5
            `);

            if (result.rows.length > 0) {
                console.log('   ⚠️  Tables with significant dead tuples:');
                result.rows.forEach(row => {
                    console.log(`   - ${row.tablename}: ${row.n_dead_tup} dead tuples (${row.dead_tuple_percent}%)`);
                });
                this.results.warnings.push({
                    type: 'table_bloat',
                    tables: result.rows.map(r => r.tablename)
                });
                this.results.recommendations.push(
                    'Run VACUUM ANALYZE on bloated tables to reclaim space'
                );
            } else {
                console.log('   ✅ No significant table bloat detected');
            }

            this.results.checks.push({
                name: 'Table Bloat',
                status: result.rows.length > 0 ? 'warning' : 'ok'
            });
            console.log('');
        } catch (error) {
            this.results.errors.push({
                check: 'table_bloat',
                error: error.message
            });
        }
    }

    async checkConnectionStats() {
        console.log('📊 Checking connection statistics...');

        try {
            const result = await query(`
                SELECT
                    COUNT(*) as total_connections,
                    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
                    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
                    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
                FROM pg_stat_activity
                WHERE datname = current_database()
            `);

            const stats = result.rows[0];
            console.log(`   Total connections: ${stats.total_connections}`);
            console.log(`   Active: ${stats.active_connections}`);
            console.log(`   Idle: ${stats.idle_connections}`);
            console.log(`   Idle in transaction: ${stats.idle_in_transaction}`);

            if (parseInt(stats.idle_in_transaction) > 5) {
                this.results.warnings.push({
                    type: 'idle_in_transaction',
                    count: stats.idle_in_transaction
                });
                this.results.recommendations.push(
                    'High number of idle-in-transaction connections detected - check for long-running transactions'
                );
            }

            this.results.checks.push({
                name: 'Connection Stats',
                status: 'ok',
                stats
            });
            console.log('');
        } catch (error) {
            this.results.errors.push({
                check: 'connection_stats',
                error: error.message
            });
        }
    }

    printSummary() {
        console.log('═══════════════════════════════════════════════════════');
        console.log('📋 HEALTH CHECK SUMMARY');
        console.log('═══════════════════════════════════════════════════════\n');

        const totalChecks = this.results.checks.length;
        const warnings = this.results.warnings.length;
        const errors = this.results.errors.length;

        console.log(`✅ Checks completed: ${totalChecks}`);
        console.log(`⚠️  Warnings: ${warnings}`);
        console.log(`❌ Errors: ${errors}\n`);

        if (this.results.recommendations.length > 0) {
            console.log('💡 RECOMMENDATIONS:');
            this.results.recommendations.forEach((rec, i) => {
                console.log(`   ${i + 1}. ${rec}`);
            });
            console.log('');
        }

        if (errors === 0 && warnings === 0) {
            console.log('🎉 Database health is EXCELLENT!');
        } else if (errors === 0) {
            console.log('✅ Database health is GOOD (minor warnings)');
        } else {
            console.log('⚠️  Database health needs ATTENTION');
        }

        console.log('═══════════════════════════════════════════════════════\n');
    }
}

// Run health check if executed directly
if (require.main === module) {
    const healthCheck = new DatabaseHealthCheck();
    healthCheck.run()
        .then((results) => {
            // Optionally save results to file
            const fs = require('fs');
            const path = require('path');
            const outputPath = path.join(__dirname, '../diagnostics/health_check_results.json');

            try {
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
                console.log(`📄 Results saved to: ${outputPath}`);
            } catch (e) {
                console.log('⚠️  Could not save results to file');
            }

            process.exit(results.errors.length > 0 ? 1 : 0);
        })
        .catch((error) => {
            console.error('Health check failed:', error);
            process.exit(1);
        });
}

module.exports = DatabaseHealthCheck;
