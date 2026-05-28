import { query } from '../db';

async function checkSchema() {
    console.log('🔍 Checking schema for deal_table_rows...');
    try {
        const result = await query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'deal_table_rows'
            ORDER BY ordinal_position;
        `);
        console.log('📊 Columns found:');
        result.rows.forEach(row => {
            console.log(`- ${row.column_name} (${row.data_type}) | Nullable: ${row.is_nullable} | Default: ${row.column_default}`);
        });
        
        const countResult = await query('SELECT count(*) FROM deal_table_rows');
        console.log(`\n📈 Total rows: ${countResult.rows[0].count}`);
    } catch (error) {
        console.error('❌ Error checking schema:', error);
    } finally {
        process.exit(0);
    }
}

checkSchema();
