const db = require('./index').db;

console.log('Migrating profiles (Sync Flags)...');

const columns = [
    { name: 'is_kpi_enabled', def: 'INTEGER DEFAULT 1' },
    { name: 'is_new_building', def: 'INTEGER DEFAULT 0' }
];

columns.forEach(col => {
    try {
        db.exec(`ALTER TABLE profiles ADD COLUMN ${col.name} ${col.def};`);
        console.log(`✅ Added ${col.name} column to profiles`);
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log(`⚠️ Column ${col.name} already exists in profiles`);
        } else {
            console.error(`❌ Error adding ${col.name} to profiles:`, e.message);
        }
    }
});
