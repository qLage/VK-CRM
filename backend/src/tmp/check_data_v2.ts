import { query } from '../db/legacy';

async function checkData() {
    console.log('🔍 Checking deal_table_rows for mortgage deals...');
    try {
        const result = await query(`
            SELECT id, agent_name, mop_name, service, mortgage, status, year, month
            FROM deal_table_rows
            WHERE status IN ('approved', 'active')
            LIMIT 50;
        `);
        
        console.log('📊 Recent approved/active deals:');
        result.rows.forEach(row => {
            console.log(`- ID: ${row.id} | Agent: ${row.agent_name} | MOP: ${row.mop_name} | Mortgage: ${row.mortgage} | Service: ${row.service} | Period: ${row.month}/${row.year}`);
        });

        const stats = await query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE mortgage = 1) as mortgage_count,
                COUNT(*) FILTER (WHERE agent_id IS NOT NULL) as has_agent_id,
                COUNT(*) FILTER (WHERE rop_id IS NOT NULL) as has_rop_id,
                COUNT(*) FILTER (WHERE mop_id IS NOT NULL) as has_mop_id
            FROM deal_table_rows;
        `);
        console.log('\n📈 Stats:', stats.rows[0]);

    } catch (error) {
        console.error('❌ Error checking data:', error);
    } finally {
        process.exit(0);
    }
}

checkData();
