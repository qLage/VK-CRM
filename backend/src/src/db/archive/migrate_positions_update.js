const db = require('./index').db;

console.log('Migrating positions (Renaming & Adding is_new_building)...');

// 1. Add is_new_building column
try {
    db.exec(`
    ALTER TABLE positions
    ADD COLUMN is_new_building INTEGER DEFAULT 0;
  `);
    console.log('✅ Added is_new_building column');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('⚠️ Column is_new_building already exists');
    } else {
        console.error('❌ Error adding column:', e.message);
    }
}

// 2. Rename positions
const updates = [
    { old: 'Руководитель отдела', new: 'РОП' },
    { old: 'Старший риелтор', new: 'Коммерческий директор' },
    { old: 'Стажер', new: 'МОП' }
];

const updateStmt = db.prepare('UPDATE positions SET name = ? WHERE name = ?');

updates.forEach(upd => {
    const info = updateStmt.run(upd.new, upd.old);
    if (info.changes > 0) {
        console.log(`✅ Renamed "${upd.old}" -> "${upd.new}"`);
    } else {
        console.log(`ℹ️ Position "${upd.old}" not found (might differ or already renamed)`);
    }
});

// 3. Ensure "Commercial Director" exists if "Senior Realtor" didn't
// (Optional: if we want to force these roles, but for now just renaming existing is safer)
