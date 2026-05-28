/**
 * One-off: ensure deal_table_rows.subcontractor_id + subcontractor_amount exist (migration 0027).
 * Uses DATABASE_URL from environment.
 *
 *   node scripts/apply-0027-subcontractor.js
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (_) {}

const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(`
    ALTER TABLE deal_table_rows
      ADD COLUMN IF NOT EXISTS subcontractor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS subcontractor_amount NUMERIC(12,2) DEFAULT 0
  `);
  console.log('OK: subcontractor_id + subcontractor_amount columns ensured');
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
