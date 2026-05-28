const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

console.log('--- Updating Director Position ---');
const result = db.prepare(`
    UPDATE positions 
    SET is_system = 1, 
        base_salary = 0, 
        commission_percent = 0, 
        is_salary_enabled = 0, 
        is_kpi_enabled = 0 
    WHERE id = 'pos-director'
`).run();

console.log('Rows affected:', result.changes);

const updated = db.prepare("SELECT * FROM positions WHERE id = 'pos-director'").get();
console.log('Updated Record:', JSON.stringify(updated, null, 2));

db.close();
