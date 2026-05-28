import { query } from './index';
import fs from 'fs';
import path from 'path';

async function purgeDatabase() {
    console.log('🔥 Starting database purge...');
    
    try {
        const sqlPath = path.join(__dirname, '../../purge.sql');
        if (!fs.existsSync(sqlPath)) {
            console.error('❌ purge.sql not found at', sqlPath);
            process.exit(1);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Execute the entire script
        // Note: split by semicolon if your query runner doesn't support multiple statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);
            await query(statement);
        }

        console.log('✅ Database purge completed successfully!');
    } catch (error) {
        console.error('❌ Database purge failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    purgeDatabase();
}

export default purgeDatabase;
