const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function explore() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- Teams ---');
        const teams = await client.query("SELECT id, name FROM teams");
        console.log(teams.rows);

        console.log('\n--- Employees (subset) ---');
        const employees = await client.query("SELECT id, email, full_name, team_id FROM profiles WHERE full_name ILIKE '%Шишакова%' OR full_name ILIKE '%Ольга%'");
        console.log(employees.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

explore();
