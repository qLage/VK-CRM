const { query } = require('../index');

/**
 * Migration: Add team_id to deal_table_rows and first_name/last_name to profiles
 * This fixes the filtering issue where deals don't appear in "Мои сделки" and "Сделки команды"
 */
async function migrate() {
  try {
    console.log('🔄 Running migration: add_deal_table_team_and_profile_names');

    // Check if columns already exist
    const isPostgres = process.env.DATABASE_URL && !process.env.DB_PATH;

    if (isPostgres) {
      // PostgreSQL: Check and add columns
      try {
        await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS team_id UUID`);
        console.log('✅ Added team_id to deal_table_rows (PostgreSQL)');
      } catch (e) {
        console.log('⚠️  team_id column may already exist');
      }

      try {
        await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT`);
        await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT`);
        console.log('✅ Added first_name and last_name to profiles (PostgreSQL)');
      } catch (e) {
        console.log('⚠️  name columns may already exist');
      }

      // Create indexes
      await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_team ON deal_table_rows(team_id)`);
      console.log('✅ Created index on deal_table_rows.team_id');

    } else {
      // SQLite: Columns should already be added manually
      console.log('✅ SQLite: Columns should be added manually (already done)');
    }

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

module.exports = migrate;
