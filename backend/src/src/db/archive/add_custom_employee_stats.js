const { pool, db } = require('./index');

async function addCustomEmployeeStats() {
    try {
        console.log('Running migration: Add custom employee stats columns...');

        if (pool) {
            // PostgreSQL migration
            await pool.query(`
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS custom_total_deals INTEGER DEFAULT 0
            `);

            await pool.query(`
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS custom_total_objects INTEGER DEFAULT 0
            `);

            await pool.query(`
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS custom_total_revenue DECIMAL(15, 2) DEFAULT 0
            `);

            await pool.query(`
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS registration_date TIMESTAMP
            `);

            console.log('✅ Migration OK: Custom employee stats columns added (PostgreSQL)');
        } else if (db) {
            // SQLite migration - check if columns exist first
            const tableInfo = db.prepare('PRAGMA table_info(profiles)').all();
            const existingColumns = tableInfo.map(col => col.name);

            if (!existingColumns.includes('custom_total_deals')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN custom_total_deals INTEGER DEFAULT 0').run();
                console.log('✅ Added column: custom_total_deals');
            }

            if (!existingColumns.includes('custom_total_objects')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN custom_total_objects INTEGER DEFAULT 0').run();
                console.log('✅ Added column: custom_total_objects');
            }

            if (!existingColumns.includes('custom_total_revenue')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN custom_total_revenue REAL DEFAULT 0').run();
                console.log('✅ Added column: custom_total_revenue');
            }

            if (!existingColumns.includes('registration_date')) {
                db.prepare('ALTER TABLE profiles ADD COLUMN registration_date TEXT').run();
                console.log('✅ Added column: registration_date');
            }

            console.log('✅ Migration OK: Custom employee stats columns added (SQLite)');
        } else {
            console.log('⚠️ No database connection available');
        }
    } catch (error) {
        if (error.code === '42701') {
            console.log('Migration skipped: Columns already exist');
        } else {
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    }
}

module.exports = addCustomEmployeeStats;
