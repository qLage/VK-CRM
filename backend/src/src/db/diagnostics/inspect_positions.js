const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

console.log('--- Table Schema ---');
const schema = db.prepare("PRAGMA table_info(positions)").all();
console.log(JSON.stringify(schema, null, 2));

console.log('\n--- All Positions ---');
const all = db.prepare("SELECT * FROM positions").all();
console.log(JSON.stringify(all, null, 2));

db.close();
