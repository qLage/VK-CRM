const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  const dumpCmd = `PGPASSWORD="fMYnGIEdYNW2" pg_dump -h master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru -U admin_crm -d crm --no-owner --no-privileges --clean --if-exists > /tmp/crm_dump.sql 2>&1 && echo "DUMP_OK" || echo "DUMP_FAILED"`;
  console.log('Running dump...');
  conn.exec(dumpCmd, (err, stream) => {
    if (err) { console.error('Exec error:', err); conn.end(); return; }
    let stdout = '';
    let stderr = '';
    stream.on('close', (code) => {
      console.log('Exit code:', code);
      console.log('STDOUT:', stdout);
      console.log('STDERR:', stderr);
      
      if (stdout.includes('DUMP_OK')) {
        console.log('Dump completed, downloading...');
        conn.sftp((err, sftp) => {
          if (err) { console.error('SFTP error:', err); conn.end(); return; }
          const remotePath = '/tmp/crm_dump.sql';
          const localPath = path.join(__dirname, '../../crm_dump.sql');
          sftp.fastGet(remotePath, localPath, (err) => {
            if (err) {
              console.error('Download error:', err.message);
            } else {
              const stats = fs.statSync(localPath);
              console.log('Downloaded to:', localPath, 'Size:', stats.size, 'bytes');
            }
            conn.end();
          });
        });
      } else {
        console.error('Dump failed');
        conn.end();
      }
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
