const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query("SELECT COUNT(*) FROM profiles WHERE is_active=1");
  console.log('profiles count:', r.rows[0].count);
  const r2 = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='profiles' ORDER BY ordinal_position");
  console.log('profiles cols:', r2.rows.map(x => `${x.column_name}:${x.data_type}`));
  // Check sample row size
  const r3 = await c.query("SELECT id, full_name, length(COALESCE(avatar_url,'')) as avatar_len, length(COALESCE(cached_stats::text,'')) as cs_len FROM profiles WHERE is_active=1 ORDER BY length(COALESCE(avatar_url,'')) DESC LIMIT 5");
  console.log('top avatars:', r3.rows);
  await c.end();
})();
