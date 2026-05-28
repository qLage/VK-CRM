const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  // Check databases and size
  const cmd = `sudo -u postgres psql -c "\\l" 2>/dev/null || psql "postgresql://root:utDNaf1Q7otD@localhost:5432/postgres" -c "\\l"`;
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
