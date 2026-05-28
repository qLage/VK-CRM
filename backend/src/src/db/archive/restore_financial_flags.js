const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

console.log('--- Re-enabling Financial Flags ---');
const result = db.prepare(`
    UPDATE positions 
    SET is_salary_enabled = 1, 
        is_kpi_enabled = 1 
    WHERE id IN ('pos-director', 'pos-admin')
`).run();

console.log('Rows affected:', result.changes);
db.close();
