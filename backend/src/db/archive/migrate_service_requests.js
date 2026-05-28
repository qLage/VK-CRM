const { db, pool } = require('../db');

async function migrate() {
    console.log('Migrating service_requests table...');

    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS service_requests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'pending', -- pending, approved, rejected
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES profiles(id)
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
