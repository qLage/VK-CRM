const { query } = require('../index');

/**
 * Migration: Add mop_name field to deal_table_rows
 * Purpose: Enable MOP (sales_manager) revenue tracking
 * Date: 2026-03-11
 */
async function addMopNameToDealTable() {
  try {
    console.log('📦 Adding mop_name field to deal_table_rows...');

    // Check if column already exists
    const checkRes = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'deal_table_rows' AND column_name = 'mop_name'
    `).catch(() => ({ rows: [] }));

    if (checkRes.rows && checkRes.rows.length > 0) {
      console.log('✅ mop_name column already exists, skipping migration');
      return;
    }

    // Add mop_name column after agent_name
    await query(`
      ALTER TABLE deal_table_rows
      ADD COLUMN IF NOT EXISTS mop_name TEXT
    `);

    // Create index for performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_deal_table_mop ON deal_table_rows(mop_name)
    `);

    console.log('✅ mop_name field added successfully');
  } catch (error) {
    console.error('❌ Error adding mop_name field:', error.message);
    throw error;
  }
}

module.exports = addMopNameToDealTable;
