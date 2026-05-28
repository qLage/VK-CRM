const path = require('path');
// Seed may be executed with a different process cwd, so resolve from this file's directory.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./index');

async function seed() {
  console.log('Seeding database (idempotent)...');

  try {
    const adminEmail = 'admin@crm.local';
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const now = new Date().toISOString();

    // Find or create admin user
    const existingUser = await query('SELECT id FROM auth_users WHERE email = $1', [adminEmail]);
    const adminId = existingUser.rows[0]?.id || uuidv4();

    if (!existingUser.rows[0]) {
      await query(
        `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, adminEmail, adminPasswordHash, now, now, now]
      );
    }

    if (existingUser.rows[0]) {
      await query(
        `UPDATE auth_users
         SET encrypted_password = $1,
             updated_at = $2
         WHERE email = $3`,
        [adminPasswordHash, now, adminEmail]
      );
    }

    // Ensure admin profile exists
    const existingProfile = await query('SELECT id FROM profiles WHERE id = $1', [adminId]);
    if (!existingProfile.rows[0]) {
      const posRes = await query(
        `SELECT id FROM positions
         WHERE LOWER(name) LIKE '%админ%' OR LOWER(name) LIKE '%администратор%'
         ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order
         LIMIT 1`
      );
      const positionId = posRes.rows[0]?.id || null;

      // Get a company_id (first company, or null if table doesn't exist)
      let companyId = null;
      try {
        const compRes = await query('SELECT id FROM companies LIMIT 1');
        companyId = compRes.rows[0]?.id || null;
      } catch(e) { /* companies table might not exist yet */ }

      await query(
        `INSERT INTO profiles (id, email, full_name, phone, position_id, company_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [adminId, adminEmail, 'Администратор', null, positionId, companyId, 1, now, now]
      );
    }

    // Ensure admin role exists
    const existingRole = await query('SELECT id FROM user_roles WHERE user_id = $1 AND role = $2', [adminId, 'admin']);
    if (!existingRole.rows[0]) {
      await query(
        `INSERT INTO user_roles (id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), adminId, 'admin', now]
      );
    }

    console.log('Seeding completed');
    return;
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

module.exports = seed;

if (require.main === module) {
  seed();
}
