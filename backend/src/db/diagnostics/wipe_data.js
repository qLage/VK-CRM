const { query } = require('./index');

async function wipeData() {
    console.log('🧹 Starting deep data wipe...');

    try {
        // Order is important due to foreign keys if they are enforced
        const tablesToClear = [
            'reports',
            'transactions',
            'quarterly_plans',
            'user_plans',
            'attendance',
            'service_requests',
            'notifications',
            'kpi_records',
            'profiles'
        ];

        for (const table of tablesToClear) {
            console.log(`🗑️ Clearing table: ${table}...`);
            await query(`DELETE FROM ${table}`);
        }

        console.log('✅ Data wipe complete. Branches and Positions were preserved.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during wipe:', error);
        process.exit(1);
    }
}

wipeData();
