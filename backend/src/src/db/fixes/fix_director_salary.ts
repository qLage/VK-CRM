import { query } from '../db';

async function fixDirectorSalary() {
    console.log('🚀 Fixing Director salary in positions table...');
    
    // 1. Check current state
    const result = await query("SELECT id, name, base_salary, management_base_salary FROM positions WHERE id = 'pos-director' OR lower(name) LIKE '%директор%'");
    console.log('Current positions data:', JSON.stringify(result.rows, null, 2));
    
    // 2. Clear salary for ordinary director (but keep it for commercial)
    // We only want to target 'Director' but NOT 'Commercial Director'
    await query(`
        UPDATE positions 
        SET base_salary = 0, management_base_salary = 0 
        WHERE id = 'pos-director' OR (lower(name) = 'директор' AND id != 'pos-comm')
    `);
    
    // 3. Verify
    const final = await query("SELECT id, name, base_salary, management_base_salary FROM positions WHERE id = 'pos-director' OR lower(name) LIKE '%директор%'");
    console.log('Final positions data:', JSON.stringify(final.rows, null, 2));
    
    console.log('✅ Director salary fix completed.');
}

fixDirectorSalary().catch(console.error);
