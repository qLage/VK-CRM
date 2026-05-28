const { query } = require('./index');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const logFile = path.join(__dirname, 'delete_log.txt');
function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(msg);
}

async function deleteDeals() {
    log('🗑️ Starting deletion of all deals...');
    try {
        const result = await query('DELETE FROM deal_table_rows');
        log(`✅ Successfully deleted ${result.rowCount} deals.`);
        process.exit(0);
    } catch (error) {
        log(`❌ Failed to delete deals: ${error.message}`);
        log(error.stack);
        process.exit(1);
    }
}

fs.writeFileSync(logFile, '--- DELETE OPERATION START ---\n');
deleteDeals();
