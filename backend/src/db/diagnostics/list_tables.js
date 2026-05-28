const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('--- Tables ---');
console.log(tables.map(t => t.name));

db.close();
