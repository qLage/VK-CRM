const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  const cmd = `PGPASSWORD="fMYnGIEdYNW2" psql -h master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru -U admin_crm -d crm -t -c "SELECT 'teams' as t, count(*) as c FROM teams UNION ALL SELECT 'deals', count(*) FROM deals UNION ALL SELECT 'transactions', count(*) FROM transactions UNION ALL SELECT 'user_roles', count(*) FROM user_roles UNION ALL SELECT 'commission_rules', count(*) FROM commission_rules UNION ALL SELECT 'service_requests', count(*) FROM service_requests UNION ALL SELECT 'recurring_expenses', count(*) FROM recurring_expenses;"`;
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
