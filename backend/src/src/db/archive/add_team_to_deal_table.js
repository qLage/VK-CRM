const { query } = require('./index');

async function addTeamToDealTable() {
  try {
    console.log('📦 Adding team_id to deal_table_rows...');

    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';

    // Check if column exists
    if (isPostgres) {
      const result = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'deal_table_rows' AND column_name = 'team_id'
      `);

      if (result.rows.length === 0) {
        await query(`ALTER TABLE deal_table_rows ADD COLUMN team_id ${idType}`);
        await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_team ON deal_table_rows(team_id)`);
        console.log('✅ team_id column added successfully');
      } else {
        console.log('ℹ️  team_id column already exists');
      }
    } else {
      // SQLite - check if column exists
      const result = await query(`PRAGMA table_info(deal_table_rows)`);
      const hasTeamId = result.some(col => col.name === 'team_id');

      if (!hasTeamId) {
        await query(`ALTER TABLE deal_table_rows ADD COLUMN team_id ${idType}`);
        await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_team ON deal_table_rows(team_id)`);
        console.log('✅ team_id column added successfully');
      } else {
        console.log('ℹ️  team_id column already exists');
      }
    }
  } catch (error) {
    console.error('❌ Error adding team_id:', error.message);
    // Don't throw - allow server to continue
  }
}

module.exports = addTeamToDealTable;
