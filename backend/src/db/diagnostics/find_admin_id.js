const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

const admins = db.prepare(`
    SELECT ur.role, p.position_id, pos.name as position_name, p.full_name
    FROM user_roles ur
    JOIN profiles p ON ur.user_id = p.id
    LEFT JOIN positions pos ON p.position_id = pos.id
    WHERE ur.role = 'admin'
`).all();

console.log('--- Admin Users and their Positions ---');
console.log(JSON.stringify(admins, null, 2));

db.close();
