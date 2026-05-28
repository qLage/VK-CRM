const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function explore() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- All Profiles ---');
        const profiles = await client.query("SELECT id, full_name, team_id FROM profiles");
        console.log(profiles.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

explore();
