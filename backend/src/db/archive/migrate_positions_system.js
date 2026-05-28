const db = require('./index').db;

console.log('Migrating positions (System Flags & KPI)...');

// 1. Add columns
const columns = [
    { name: 'is_system', def: 'INTEGER DEFAULT 0' },
    { name: 'is_kpi_enabled', def: 'INTEGER DEFAULT 1' }
];

columns.forEach(col => {
    try {
        db.exec(`ALTER TABLE positions ADD COLUMN ${col.name} ${col.def};`);
        console.log(`✅ Added ${col.name} column`);
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log(`⚠️ Column ${col.name} already exists`);
        } else {
            console.error(`❌ Error adding ${col.name}:`, e.message);
        }
    }
});

// 2. Mark System Positions
const systemRoles = ['Риелтор', 'МОП', 'РОП', 'Коммерческий директор'];
const placeholders = systemRoles.map(() => '?').join(',');

const updateStmt = db.prepare(`UPDATE positions SET is_system = 1 WHERE name IN (${placeholders})`);
const info = updateStmt.run(...systemRoles);

console.log(`✅ Marked ${info.changes} positions as SYSTEM roles`);
