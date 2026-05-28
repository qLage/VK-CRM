const { query } = require('../db');
const bcrypt = require('bcryptjs');

async function fixUser() {
    try {
        console.log('Fixing user credentials...');

        // 1. Generate hash for "1234"
        const password = '1234';
        const hash = bcrypt.hashSync(password, 10);
        console.log(`Generated hash for "${password}": ${hash.substring(0, 20)}...`);

        // 2. Target phone number (clean format)
        const targetPhone = '+79968999991';

        // 3. Find user (try various formats just to be sure)
        // We know from previous logs the ID is 'c035264e-309e-41b6-b5db-c59ec7fc8cea' or similar prefix
        // Let's search by ID prefix if possible or just update by email if known, or by phone variations.
        // The logs said: Update auth_users ... WHERE id = 'c035264e...'

        // Let's just update based on the phone number we WANT to use, assuming the user exists.
        // Or update by the email 'director@test.com' if that's him?
        // Wait, Alexander Matveev might NOT use 'director@test.com'.
        // Let's search by name "Александр Матвеев" or just update the one with the phone.

        const userRes = await query("SELECT id, full_name, phone FROM profiles WHERE full_name LIKE '%Александр Матвеев%' OR phone LIKE '%996%899%99%91%'");

        if (userRes.rows.length === 0) {
            console.log('User not found!');
            return;
        }

        const user = userRes.rows[0];
        console.log('Found user:', user);

        // 4. Update Profile Phone (Clean)
        await query("UPDATE profiles SET phone = $1 WHERE id = $2", [targetPhone, user.id]);
        console.log('Updated profile phone to:', targetPhone);

        // 5. Update Auth Password
        await query("UPDATE auth_users SET encrypted_password = $1 WHERE id = $2", [hash, user.id]);
        console.log('Updated auth password.');

        // 6. Verify
        const check = await query("SELECT p.phone, u.encrypted_password FROM profiles p JOIN auth_users u ON p.id = u.id WHERE p.id = $1", [user.id]);
        console.log('Verification:', check.rows[0]);

    } catch (e) {
        console.error('Error:', e);
    }
}

fixUser();
