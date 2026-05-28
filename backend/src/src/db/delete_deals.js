const { query } = require('./index');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function deleteDeals() {
    console.log('🗑️ Starting deletion of all deals...');
    try {
        const result = await query('DELETE FROM deal_table_rows');
        console.log(`✅ Successfully deleted ${result.rowCount} deals.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to delete deals:', error);
        process.exit(1);
    }
}

deleteDeals();
