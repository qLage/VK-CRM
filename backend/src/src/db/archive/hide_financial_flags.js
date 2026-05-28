const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

console.log('--- Disabling Financial Flags for Protected Roles ---');
const result = db.prepare(`
    UPDATE positions 
    SET is_salary_enabled = 0, 
        is_kpi_enabled = 0 
    WHERE id IN ('pos-director', 'pos-admin')
`).run();

console.log('Rows affected:', result.changes);
db.close();
