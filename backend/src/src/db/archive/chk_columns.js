const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { query } = require('./index');

async function check() {
    try {
        console.log('Checking profiles table schema...');
        // Postgres specific query to list columns
        const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'profiles';
    `);
        console.log('Columns:', res.rows.map(r => `${r.column_name} (${r.data_type})`));
        process.exit(0);
    } catch (err) {
        console.error('Check failed:', err);
        process.exit(1);
    }
}

check();
