const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function debug() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- Agents in Phantom Team f0cab82d-67d4-4f34-a03b-19a5412a5362 ---');
        const g1 = await client.query("SELECT DISTINCT agent_name FROM deal_table_rows WHERE team_id = 'f0cab82d-67d4-4f34-a03b-19a5412a5362'");
        console.log(g1.rows.map(r => r.agent_name));

        console.log('\n--- Agents in Phantom Team c8887e9c-1ad5-4b87-8adc-34ddd10e00eb ---');
        const g2 = await client.query("SELECT DISTINCT agent_name FROM deal_table_rows WHERE team_id = 'c8887e9c-1ad5-4b87-8adc-34ddd10e00eb'");
        console.log(g2.rows.map(r => r.agent_name));

        console.log('\n--- Profile for Shishakova ---');
        const p1 = await client.query("SELECT id, full_name, team_id FROM profiles WHERE full_name ILIKE '%Шишакова%'");
        console.log(p1.rows);

        console.log('\n--- Profile for Olga ---');
        const p2 = await client.query("SELECT id, full_name, team_id FROM profiles WHERE full_name ILIKE '%Матвеева%' OR full_name ILIKE '%Ольга Николаевна%'");
        console.log(p2.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

debug();
