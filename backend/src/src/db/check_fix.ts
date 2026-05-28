import { query } from './index';

async function checkFix() {
    try {
        const res = await query(`
            SELECT column_name, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'deal_table_rows' AND column_name = 'status'
        `);
        console.log('--- DB Fix Check ---');
        console.log('Status default:', res.rows[0]?.column_default);

        const viewRes = await query(`
            SELECT definition 
            FROM pg_matviews 
            WHERE matviewname = 'mv_employee_monthly_stats'
        `);
        console.log('View definition contains "approved":', viewRes.rows[0]?.definition.includes('approved'));
        
        process.exit(0);
    } catch (e) {
        console.error('Check failed:', e.message);
        process.exit(1);
    }
}

checkFix();
