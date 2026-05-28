import { query, pool } from './src/db/drizzle';

async function main() {
  console.log('=== Quarterly plans Q2 2026 ===');
  const q1 = await query('SELECT * FROM quarterly_plans WHERE period_year=2026 AND period_quarter=2');
  console.log(JSON.stringify(q1.rows, null, 2));

  console.log('\n=== SUM quarterly plans Q2 2026 ===');
  const q2 = await query('SELECT SUM(target_revenue) as total FROM quarterly_plans WHERE period_year=2026 AND period_quarter=2');
  console.log(JSON.stringify(q2.rows, null, 2));

  console.log('\n=== All quarterly_plans (last 10) ===');
  const q3 = await query('SELECT * FROM quarterly_plans ORDER BY period_year DESC, period_quarter DESC LIMIT 10');
  console.log(JSON.stringify(q3.rows, null, 2));

  console.log('\n=== User plans April 2026 ===');
  const q4 = await query("SELECT period_month, COUNT(*) as cnt, SUM(target_revenue) as total FROM user_plans WHERE period_month='2026-04' GROUP BY period_month");
  console.log(JSON.stringify(q4.rows, null, 2));

  console.log('\n=== Branches ===');
  const q5 = await query('SELECT id, name FROM branches');
  console.log(JSON.stringify(q5.rows, null, 2));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
