const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function fix() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- Starting Global Team Synchronization ---');

        // 1. Update deal_table_rows based on agent_name's profile team_id
        console.log('Syncing deal_table_rows.team_id with profile.team_id...');
        const result = await client.query(`
            UPDATE deal_table_rows d
            SET team_id = p.team_id::text
            FROM profiles p
            WHERE (TRIM(LOWER(d.agent_name)) = TRIM(LOWER(p.full_name)))
            AND (d.team_id IS DISTINCT FROM p.team_id::text)
        `);
        console.log(`Updated ${result.rowCount} deals based on agent_name.`);

        // 2. Fallback: Update based on mop_name if team_id is still wrong/null? 
        // No, agent_name is usually the primary.

        // 3. Clear team_id for deals with unknown team_ids that don't match any team
        console.log('Clearing unknown team_ids...');
        const clearResult = await client.query(`
            UPDATE deal_table_rows
            SET team_id = NULL
            WHERE team_id IS NOT NULL
            AND team_id NOT IN (SELECT id::text FROM teams)
        `);
        console.log(`Cleared ${clearResult.rowCount} unknown team_ids.`);

        console.log('✅ Fix completed successfully');

    } catch (e) {
        console.error('❌ Fix failed:', e);
    } finally {
        await client.end();
    }
}

fix();
