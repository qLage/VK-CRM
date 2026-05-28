const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function debug() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- Teams in DB ---');
        const teams = await client.query('SELECT id, name FROM teams');
        console.log(teams.rows);

        console.log('\n--- Deal Table Rows Grouping ---');
        const groups = await client.query(`
            SELECT 
                team_id, 
                branch_id, 
                COUNT(*) as count,
                MIN(agent_name) as sample_agent
            FROM deal_table_rows 
            GROUP BY team_id, branch_id
        `);
        console.log(groups.rows);

        console.log('\n--- Checking Shishakova Deals ---');
        const shishakova = await client.query("SELECT id, agent_name, team_id, branch_id FROM deal_table_rows WHERE agent_name ILIKE '%Шишакова%'");
        console.log(shishakova.rows);

        console.log('\n--- Checking Olga Deals ---');
        const olga = await client.query("SELECT id, agent_name, team_id, branch_id FROM deal_table_rows WHERE agent_name ILIKE '%Ольга Николаевна%' OR agent_name ILIKE '%Матвеева%'");
        console.log(olga.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

debug();
