const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        console.log('Connected to DB');
        await client.query('ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rejection_reason TEXT');
        console.log('Column added');
        await client.query("ALTER TABLE deal_table_rows ALTER COLUMN status SET DEFAULT 'pending'");
        console.log('Default status set');
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
        process.exit(0);
    }
}

run();
