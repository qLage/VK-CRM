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

        console.log('\n--- Deal Table Rows Grouping (Non-Null Teams) ---');
        const groups = await client.query(`
            SELECT 
                team_id, 
                branch_id, 
                COUNT(*) as count
            FROM deal_table_rows 
            WHERE team_id IS NOT NULL
            GROUP BY team_id, branch_id
        `);
        console.log(groups.rows);

        // Find team_ids that are NOT in teams table
        console.log('\n--- Team IDs NOT in teams table ---');
        const invalid = await client.query(`
            SELECT DISTINCT team_id 
            FROM deal_table_rows 
            WHERE team_id IS NOT NULL 
            AND team_id NOT IN (SELECT id FROM teams)
        `);
        console.log(invalid.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

debug();
