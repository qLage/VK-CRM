const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query("SELECT COUNT(*) FROM profiles WHERE is_active=1");
  console.log('profiles count:', r.rows[0].count);
  // Check avatar bloat
  const r3 = await c.query("SELECT id, full_name, length(COALESCE(avatar_url,'')) as avatar_len FROM profiles WHERE is_active=1 ORDER BY length(COALESCE(avatar_url,'')) DESC LIMIT 5");
  console.log('top avatars:', r3.rows);
  // Total bytes
  const r4 = await c.query("SELECT SUM(length(COALESCE(avatar_url,''))) as total_avatar_bytes FROM profiles WHERE is_active=1");
  console.log('total avatar_url bytes:', r4.rows[0]);
  await c.end();
})();
