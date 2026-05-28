const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

console.log('--- Table: auth_users schema ---');
console.log(JSON.stringify(db.prepare("PRAGMA table_info(auth_users)").all(), null, 2));

console.log('\n--- Table: user_roles schema ---');
console.log(JSON.stringify(db.prepare("PRAGMA table_info(user_roles)").all(), null, 2));

console.log('\n--- Table: profiles schema ---');
console.log(JSON.stringify(db.prepare("PRAGMA table_info(profiles)").all(), null, 2));

db.close();
