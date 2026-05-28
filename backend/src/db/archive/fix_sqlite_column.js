const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../crm.db');
const db = new Database(dbPath, { verbose: console.log });

try {
    console.log('Checking for salary_amount column...');
    const tableInfo = db.pragma('table_info(profiles)');
    const hasColumn = tableInfo.some(col => col.name === 'salary_amount');

    if (!hasColumn) {
        console.log('Adding salary_amount column...');
        db.prepare('ALTER TABLE profiles ADD COLUMN salary_amount REAL DEFAULT 0').run();
        console.log('Column added successfully.');
    } else {
        console.log('Column salary_amount already exists.');
    }
} catch (error) {
    console.error('Error:', error.message);
} finally {
    db.close();
}
