const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        const teams = {
            bogaty: '7286eecf-3a05-43ac-9666-11f3788360bf', // Богатый Риелтор
            sales1: '0252a964-832a-4cf1-90f9-ce83c8dc1033'  // Группа продаж №1
        };

        const employees = {
            shishakova: '8178c43a-025b-466e-bdf7-fa57fc7fc5a7', // Шишакова Мария
            olga: 'ecd7e888-5899-4731-9f77-92041d741ed1'        // Ольга Николаевна Матвеева
        };

        console.log('--- Starting Migration ---');

        // 1. Update Profiles (ensure they belong to the teams)
        console.log('Updating profile team associations...');
        await client.query("UPDATE profiles SET team_id = $1 WHERE id = $2", [teams.bogaty, employees.shishakova]);
        await client.query("UPDATE profiles SET team_id = $1 WHERE id = $2", [teams.sales1, employees.olga]);

        // 2. Update Deal Table Rows (the core "deals")
        // We match by names as that's how the current system often links them
        console.log('Updating deal_table_rows team associations...');
        
        // Shishakova deals
        await client.query(`
            UPDATE deal_table_rows 
            SET team_id = $1 
            WHERE (agent_name ILIKE '%Шишакова%' OR mop_name ILIKE '%Шишакова%')
            AND (team_id IS NULL OR team_id != $1)
        `, [teams.bogaty]);

        // Olga deals
        await client.query(`
            UPDATE deal_table_rows 
            SET team_id = $1 
            WHERE (agent_name ILIKE '%Матвеева%Ольга%' OR mop_name ILIKE '%Матвеева%Ольга%' OR agent_name ILIKE '%Ольга Николаевна%')
            AND (team_id IS NULL OR team_id != $1)
        `, [teams.sales1]);

        // 3. Skip Reports and Service Requests as they don't have team_id column
        console.log('Skipping reports and service_requests (no team_id column)...');

        console.log('✅ Migration completed successfully');

    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        await client.end();
    }
}

migrate();
