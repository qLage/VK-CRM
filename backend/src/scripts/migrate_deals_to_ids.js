const { Client } = require('pg');
require('dotenv').config({ path: 'b:/VSCode/Projects/CRM/backend/.env' });

async function migrate() {
  const connectionString = process.env.DATABASE_URL.replace('127.0.0.1', 'localhost');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    // 1. Add columns if they don't exist
    await client.query(`
      ALTER TABLE deal_table_rows 
      ADD COLUMN IF NOT EXISTS agent_id UUID,
      ADD COLUMN IF NOT EXISTS mop_id UUID,
      ADD COLUMN IF NOT EXISTS rop_id UUID;
    `);
    console.log('Columns added (or already exist)');
    
    // 2. Populate agent_id by matching agent_name to profiles.full_name
    const updateResult = await client.query(`
      UPDATE deal_table_rows dtr
      SET agent_id = p.id
      FROM profiles p
      WHERE TRIM(LOWER(dtr.agent_name)) = TRIM(LOWER(p.full_name))
      AND dtr.agent_id IS NULL;
    `);
    console.log(`Updated ${updateResult.rowCount} rows with agent_id`);

    // 3. Populate mop_id by matching mop_name
    const mopUpdateResult = await client.query(`
      UPDATE deal_table_rows dtr
      SET mop_id = p.id
      FROM profiles p
      WHERE TRIM(LOWER(dtr.mop_name)) = TRIM(LOWER(p.full_name))
      AND dtr.mop_id IS NULL;
    `);
    console.log(`Updated ${mopUpdateResult.rowCount} rows with mop_id`);

    // 4. Populate rop_id by matching rop_name
    const ropUpdateResult = await client.query(`
      UPDATE deal_table_rows dtr
      SET rop_id = p.id
      FROM profiles p
      WHERE TRIM(LOWER(dtr.rop_name)) = TRIM(LOWER(p.full_name))
      AND dtr.rop_id IS NULL;
    `);
    console.log(`Updated ${ropUpdateResult.rowCount} rows with rop_id`);
    
    // Special check for Igor Belyaev mismatch
    // If agent_name was "Беляев Игорь" but profile is "Игорь Беляев"
    const fixResult = await client.query(`
      UPDATE deal_table_rows dtr
      SET agent_id = p.id
      FROM profiles p
      WHERE (TRIM(LOWER(dtr.agent_name)) LIKE '%беляев%' AND TRIM(LOWER(p.full_name)) LIKE '%беляев%')
      AND dtr.agent_id IS NULL;
    `);
    console.log(`Fuzzy fixed ${fixResult.rowCount} rows for Belyaev and others`);

    await client.end();
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
