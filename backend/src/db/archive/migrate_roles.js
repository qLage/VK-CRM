const db = require('./index').db;

console.log('Migrating roles...');

try {
    // 1. Rename old table
    db.exec("ALTER TABLE user_roles RENAME TO user_roles_old");

    // 2. Create new table with updated CHECK constraint
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'director', 'commercial', 'head_sales', 'sales_manager', 'realtor', 'manager')), 
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, role),
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )
  `);

    // 3. Copy data
    db.exec(`
    INSERT INTO user_roles (id, user_id, role, created_at)
    SELECT id, user_id, role, created_at FROM user_roles_old
  `);

    // 4. Drop old table
    db.exec("DROP TABLE user_roles_old");

    console.log('Roles migration completed successfully.');
} catch (err) {
    console.error('Migration failed:', err);
}

module.exports = db;
