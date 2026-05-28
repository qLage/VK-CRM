const { Client } = require('ssh2');
const net = require('net');

const SSH_HOST = '155.212.180.138';
const SSH_USER = 'root';
const SSH_PASS = 'utDNaf1Q7otD';
const LOCAL_PG_HOST = 'localhost';
const LOCAL_PG_PORT = 5432;
const REMOTE_FORWARD_PORT = 15432;
const DUMP_PATH = '/tmp/crm_dump.sql';
const LOCAL_DB_USER = 'crm_user';
const LOCAL_DB_PASS = 'crm_dev_password';
const LOCAL_DB_NAME = 'crm';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected');
  
  // Request reverse port forwarding (remote 15432 -> local 5432)
  conn.forwardIn('127.0.0.1', REMOTE_FORWARD_PORT, (err) => {
    if (err) {
      console.error('ForwardIn error:', err.message);
      conn.end();
      return;
    }
    console.log(`Reverse tunnel active: remote 127.0.0.1:${REMOTE_FORWARD_PORT} -> local ${LOCAL_PG_HOST}:${LOCAL_PG_PORT}`);
    
    // Run psql on remote server to restore dump
    const restoreCmd = `PGPASSWORD="${LOCAL_DB_PASS}" psql -h 127.0.0.1 -p ${REMOTE_FORWARD_PORT} -U ${LOCAL_DB_USER} -d ${LOCAL_DB_NAME} -f ${DUMP_PATH} 2>&1`;
    console.log('Running restore...');
    conn.exec(restoreCmd, (err, stream) => {
      if (err) {
        console.error('Exec error:', err);
        conn.end();
        return;
      }
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        console.log('Restore exit code:', code);
        if (stdout) console.log('STDOUT:', stdout.slice(-2000));
        if (stderr) console.log('STDERR:', stderr.slice(-2000));
        conn.end();
      }).on('data', (data) => { stdout += data; }).stderr.on('data', (data) => { stderr += data; });
    });
  });
}).on('error', (err) => {
  console.error('SSH error:', err.message);
}).on('tcp connection', (info, accept, reject) => {
  // When remote side connects to forwarded port, accept and pipe to local PG
  const socket = net.connect(LOCAL_PG_PORT, LOCAL_PG_HOST, () => {
    const remoteSocket = accept();
    if (!remoteSocket) {
      socket.end();
      return;
    }
    socket.pipe(remoteSocket).pipe(socket);
    socket.on('error', (err) => { console.error('Local socket error:', err.message); remoteSocket.close(); });
    remoteSocket.on('error', (err) => { console.error('Remote socket error:', err.message); socket.end(); });
  });
  socket.on('error', (err) => {
    console.error('Connect to local PG error:', err.message);
    reject();
  });
}).connect({
  host: SSH_HOST,
  port: 22,
  username: SSH_USER,
  password: SSH_PASS,
  readyTimeout: 20000,
});
