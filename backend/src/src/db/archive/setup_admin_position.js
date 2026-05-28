const sqlite3 = require('better-sqlite3');
const db = new sqlite3('b:\\VSCode\\Projects\\CRM\\backend\\crm.db');

console.log('--- Database Operations ---');

// 1. Create pos-admin if it doesn't exist
const existingAdminPos = db.prepare("SELECT * FROM positions WHERE id = 'pos-admin'").get();
if (!existingAdminPos) {
    console.log('Creating pos-admin position...');
    db.prepare(`
        INSERT INTO positions (id, name, description, base_salary, commission_percent, is_salary_enabled, is_kpi_enabled, is_system)
        VALUES ('pos-admin', 'Администратор', 'Техническое управление системой', 0, 0, 0, 0, 1)
    `).run();
} else {
    console.log('pos-admin already exists, updating it...');
    db.prepare(`
        UPDATE positions 
        SET is_system = 1, base_salary = 0, commission_percent = 0, is_salary_enabled = 0, is_kpi_enabled = 0 
        WHERE id = 'pos-admin'
    `).run();
}

// 2. Update profiles to use the new position
console.log('Updating admin profiles...');
const adminRoleUsers = db.prepare(`
    SELECT user_id FROM user_roles WHERE role = 'admin'
`).all();

const updateProfile = db.prepare("UPDATE profiles SET position_id = 'pos-admin' WHERE id = ?");
for (const user of adminRoleUsers) {
    updateProfile.run(user.user_id);
}

console.log('Successfully updated', adminRoleUsers.length, 'admin profiles.');

db.close();
