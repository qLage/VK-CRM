const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

const admins = db.prepare("SELECT * FROM positions WHERE name LIKE '%Админ%'").all();
console.log('--- Admin Position Candidates ---');
console.log(JSON.stringify(admins, null, 2));

const allRoles = db.prepare("SELECT DISTINCT role FROM profiles").all();
console.log('\n--- All Roles in Profiles ---');
console.log(allRoles.map(r => r.role));

db.close();
