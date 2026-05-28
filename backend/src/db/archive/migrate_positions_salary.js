const db = require('./index').db;

console.log('Migrating positions table...');

try {
    db.exec(`
    ALTER TABLE positions
    ADD COLUMN is_salary_enabled INTEGER DEFAULT 1;
  `);
    console.log('✅ Added is_salary_enabled column to positions table');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('⚠️ Column is_salary_enabled already exists');
    } else {
        console.error('❌ Error adding column:', e.message);
    }
}
