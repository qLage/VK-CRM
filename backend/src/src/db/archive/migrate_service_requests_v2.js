const { db, pool } = require('../db');

async function migrate() {
    console.log('Migrating service_requests table (v2)...');

    if (pool) {
        // Postgres
        await pool.query('ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS data TEXT');
    } else {
        // SQLite
        // SQLite doesn't support IF NOT EXISTS in ALTER TABLE nicely in all versions, 
        // but adding a column that exists throws an error. We can check first or catch error.
        try {
            db.prepare('ALTER TABLE service_requests ADD COLUMN data TEXT').run();
        } catch (e) {
            if (!e.message.includes('duplicate column')) {
                throw e;
            }
        }
    }

    console.log('Migration v2 complete.');
}

migrate().catch(console.error);
