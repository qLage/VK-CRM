const { query } = require('../index');

/**
 * Migration: Add missing financial and KPI columns to deal_table_rows
 * This fixes the 500 Internal Server Error in activity-feed and KPI reports
 */
async function migrate() {
    try {
        console.log('🔄 Running migration: add_kpi_finance_columns');

        const isPostgres = process.env.DATABASE_URL && !process.env.DB_PATH;
        const realType = isPostgres ? 'NUMERIC(12,2)' : 'REAL';
        const textType = isPostgres ? 'TEXT' : 'TEXT';
        const idType = isPostgres ? 'UUID' : 'TEXT';

        const columnsToAdd = [
            { name: 'document_link', type: textType },
            { name: 'seller', type: textType },
            { name: 'buyer', type: textType },
            { name: 'service', type: textType },
            { name: 'information', type: textType },
            { name: 'branch_id', type: idType },
            { name: 'mortgage_deduction', type: realType, default: '0' },
            { name: 'agent_percent_seller', type: realType, default: '0' },
            { name: 'agent_percent_buyer', type: realType, default: '0' },
            { name: 'mop_percent', type: realType, default: '0' },
            { name: 'payout_date', type: textType },
            { name: 'payout_mop_note', type: textType },
            { name: 'payout_rop_note', type: textType },
            { name: 'mop_revenue', type: realType, default: '0' },
            { name: 'rop_payout', type: realType, default: '0' }
        ];

        for (const col of columnsToAdd) {
            try {
                if (isPostgres) {
                    await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} ${col.default ? 'DEFAULT ' + col.default : ''}`);
                } else {
                    // SQLite doesn't support ADD COLUMN IF NOT EXISTS easily without checking
                    // We check if column exists first
                    const colCheck = await query(`PRAGMA table_info(deal_table_rows)`);
                    const exists = colCheck.rows.some(r => r.name === col.name);
                    if (!exists) {
                        await query(`ALTER TABLE deal_table_rows ADD COLUMN ${col.name} ${col.type} ${col.default ? 'DEFAULT ' + col.default : ''}`);
                    }
                }
                console.log(`✅ Added column ${col.name} to deal_table_rows`);
            } catch (e) {
                console.warn(`⚠️  Could not add column ${col.name}: ${e.message}`);
            }
        }

        console.log('✅ Migration add_kpi_finance_columns completed successfully');
    } catch (error) {
        console.error('❌ Migration add_kpi_finance_columns failed:', error.message);
        throw error;
    }
}

module.exports = migrate;
