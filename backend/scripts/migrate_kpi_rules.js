/**
 * Migrate KPI rules for realtors to correct 40-60% tiers.
 * Run on production server: node scripts/migrate_kpi_rules.js
 */

const { Pool } = require('pg');

const REQUIRED_REALTOR_TIERS = [
  { min_threshold: 0, percent: 40 },
  { min_threshold: 700000, percent: 45 },
  { min_threshold: 900000, percent: 50 },
  { min_threshold: 1200000, percent: 55 },
  { min_threshold: 1550000, percent: 60 },
];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Check current realtor tiers
    const current = await pool.query(
      'SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC',
      ['realtor']
    );

    console.log('Current realtor tiers:');
    console.table(current.rows);

    const expected = REQUIRED_REALTOR_TIERS;
    const needsUpdate =
      current.rows.length !== expected.length ||
      current.rows.some((row, i) =>
        Number(row.min_threshold) !== expected[i].min_threshold ||
        Number(row.percent) !== expected[i].percent
      );

    if (!needsUpdate) {
      console.log('✅ Realtor tiers are already correct. No changes needed.');
      return;
    }

    console.log('🔄 Updating realtor tiers...');

    await pool.query('BEGIN');
    await pool.query('DELETE FROM kpi_rules WHERE role = $1', ['realtor']);

    for (const tier of REQUIRED_REALTOR_TIERS) {
      await pool.query(
        'INSERT INTO kpi_rules (role, min_threshold, percent) VALUES ($1, $2, $3)',
        ['realtor', tier.min_threshold, tier.percent]
      );
    }

    await pool.query('COMMIT');

    const updated = await pool.query(
      'SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC',
      ['realtor']
    );
    console.log('✅ Updated realtor tiers:');
    console.table(updated.rows);

    // Clear any caches
    try {
      await pool.query("DELETE FROM dashboard_cache WHERE cache_key LIKE 'kpi_%'");
      console.log('🧹 Cleared dashboard KPI cache');
    } catch {
      // table may not exist
    }
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
