const { db, pool } = require('../db');

async function migrate() {
    console.log('Migrating system_settings table...');

    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;

    if (pool) {
        await pool.query(createTableQuery);
    } else {
        db.exec(createTableQuery);
    }

    console.log('Migration complete.');
}

migrate().catch(console.error);
