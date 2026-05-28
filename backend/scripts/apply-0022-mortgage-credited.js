/**
 * One-off: ensure deal_table_rows.mortgage_credited_id exists (migration 0022).
 * Uses DATABASE_URL from environment (Docker Compose injects it on the server).
 * Does NOT run automatically — execute manually when the DB is missing the column.
 *
 *   node scripts/apply-0022-mortgage-credited.js
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
  await c.query(
    'ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mortgage_credited_id UUID'
  );
  await c.query(`
    CREATE INDEX IF NOT EXISTS idx_deal_table_rows_mortgage_credited
      ON deal_table_rows (mortgage_credited_id)
      WHERE mortgage_credited_id IS NOT NULL
  `);
  console.log('OK: mortgage_credited_id column + index ensured');
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
