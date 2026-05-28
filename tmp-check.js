const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://admin_crm:fMYnGIEdYNW2@master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru:5432/crm' });
  await c.connect();
  const r1 = await c.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='deal_payouts') AS exists");
  console.log('deal_payouts exists:', r1.rows[0].exists);
  const r2 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='deal_table_rows' AND column_name IN ('mop_percent','rop_percent','mop_revenue','rop_payout','company_id','status','agent_percent_seller','agent_percent_buyer','agent_percent') ORDER BY column_name");
  console.log('deal_table_rows columns:', r2.rows.map(r => r.column_name));
  const r3 = await c.query("SELECT id, status, mop_percent, rop_percent, mop_revenue, rop_payout, agent_percent_seller, agent_percent_buyer, company_id FROM deal_table_rows ORDER BY created_at DESC LIMIT 3");
  console.log('Recent deals:', JSON.stringify(r3.rows, null, 2));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
