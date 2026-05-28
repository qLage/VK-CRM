const { query } = require('../db');

async function fixDealTableSchema() {
  console.log('--- FIXING DEAL TABLE SCHEMA ---');
  
  const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
  const idType = isPostgres ? 'UUID' : 'TEXT';

  const columnsToAdd = [
    ['agent_id', idType],
    ['rop_id', idType],
    ['mop_id', idType]
  ];

  for (const [colName, colType] of columnsToAdd) {
    try {
      console.log(`Adding column ${colName}...`);
      await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS ${colName} ${colType}`);
      console.log(`Column ${colName} added successfully.`);
    } catch (err) {
      console.error(`Error adding column ${colName}:`, err.message);
    }
  }

  console.log('--- SCHEMA FIX COMPLETED ---');
}

fixDealTableSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error during schema fix:', err);
    process.exit(1);
  });
