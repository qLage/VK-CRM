const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function explore() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- All Tables ---');
        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(tables.rows.map(r => r.table_name));

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

explore();
