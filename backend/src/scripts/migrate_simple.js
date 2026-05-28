const { Client } = require('pg');
require('dotenv').config({ path: 'b:/VSCode/Projects/CRM/backend/.env' });

async function migrate() {
  const connectionString = process.env.DATABASE_URL.replace('127.0.0.1', 'localhost');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('--- MIGRATION START ---');
    
    console.log('1. Adding columns...');
    await client.query('ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS agent_id UUID;');
    await client.query('ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mop_id UUID;');
    await client.query('ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS rop_id UUID;');
    console.log('Columns added.');
    
    console.log('2. Updating agent_id (exact match)...');
    const res1 = await client.query(`
      UPDATE deal_table_rows dtr
      SET agent_id = p.id
      FROM profiles p
      WHERE TRIM(LOWER(dtr.agent_name)) = TRIM(LOWER(p.full_name))
      AND dtr.agent_id IS NULL;
    `);
    console.log(`Updated ${res1.rowCount} rows.`);

    console.log('3. Updating agent_id (fuzzy match for Belyaev)...');
    const res2 = await client.query(`
      UPDATE deal_table_rows dtr
      SET agent_id = p.id
      FROM profiles p
      WHERE (TRIM(LOWER(dtr.agent_name)) LIKE '%беляев%' AND TRIM(LOWER(p.full_name)) LIKE '%беляев%')
      AND dtr.agent_id IS NULL;
    `);
    console.log(`Updated ${res2.rowCount} rows.`);

    await client.end();
    console.log('--- MIGRATION END ---');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

migrate();
