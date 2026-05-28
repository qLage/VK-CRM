const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  const cmd = `PGPASSWORD="fMYnGIEdYNW2" psql -h master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru -U admin_crm -d crm -t -c "
SELECT 'deals' as t, count(*) as c FROM deals
UNION ALL SELECT 'deal_commissions', count(*) FROM deal_commissions
UNION ALL SELECT 'deal_participants', count(*) FROM deal_participants
UNION ALL SELECT 'deal_documents', count(*) FROM deal_documents
UNION ALL SELECT 'deal_activities', count(*) FROM deal_activities
UNION ALL SELECT 'commission_rules', count(*) FROM commission_rules
UNION ALL SELECT 'payroll_monthly_state', count(*) FROM payroll_monthly_state
UNION ALL SELECT 'payroll_payout_actions', count(*) FROM payroll_payout_actions
UNION ALL SELECT 'kpi_records', count(*) FROM kpi_records
UNION ALL SELECT 'agent_instances', count(*) FROM agent_instances
UNION ALL SELECT 'agent_events', count(*) FROM agent_events
UNION ALL SELECT 'properties', count(*) FROM properties;"`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Exec error:', err); conn.end(); return; }
    let stdout = '';
    let stderr = '';
    stream.on('close', (code) => {
      console.log('Exit code:', code);
      console.log('STDOUT:', stdout);
      console.log('STDERR:', stderr);
      conn.end();
    }).on('data', (data) => { stdout += data; }).stderr.on('data', (data) => { stderr += data; });
  });
}).on('error', (err) => {
  console.error('SSH error:', err.message);
}).connect({
  host: '155.212.180.138',
  port: 22,
  username: 'root',
  password: 'utDNaf1Q7otD',
  readyTimeout: 20000,
});
