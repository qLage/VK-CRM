const db = require('./index').db;
const { pool } = require('./index');

async function migrate() {
    console.log('🔄 Adding phone column to branches...');

    if (db) {
        try {
            db.prepare('ALTER TABLE branches ADD COLUMN phone TEXT').run();
            console.log('✅ Added phone column to SQLite');
        } catch (error) {
            if (error.message.includes('duplicate column name')) {
                console.log('⚠️ Column phone already exists in SQLite');
            } else {
                console.error('❌ SQLite Error:', error.message);
            }
        }
    } else if (pool) {
        try {
            await pool.query('ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone TEXT');
            console.log('✅ Added phone column to PostgreSQL');
        } catch (error) {
            console.error('❌ Postgres Error:', error.message);
        }
    }
}

migrate().then(() => process.exit(0));
