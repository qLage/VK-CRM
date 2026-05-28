import { query } from './index';
import cacheService from '../lib/cache.service';
import fs from 'fs';

async function nuclearWipe() {
    console.log('🚀 NUCLEAR WIPE SEQUENCER STARTING...');
    try {
        const tables = [
            'deal_table_rows', 'deals', 'deal_participants', 
            'deal_commissions', 'deal_documents', 'deal_activities',
            'transactions', 'service_requests', 'leads', 'notifications',
            'agent_instances', 'agent_events'
        ];
        
        for (const t of tables) {
            console.log(`🧹 Truncating ${t}...`);
            await query(`TRUNCATE ${t} CASCADE`);
        }
        
        console.log('👤 Cleaning profiles...');
        await query("DELETE FROM profiles WHERE email != 'admin@crm.local'");
        await query("DELETE FROM auth_users WHERE email != 'admin@crm.local'");
        
        console.log('⚡ Invalidating cache...');
        await cacheService.invalidateAll();
        
        fs.writeFileSync('WIPE_SUCCESS_REPORT.txt', `Wiped ${new Date().toISOString()}`);
        console.log('✅ ALL SYSTEMS CLEAR.');
        process.exit(0);
    } catch (error) {
        console.error('❌ WIPE FAILED:', error);
        fs.writeFileSync('WIPE_SUCCESS_REPORT.txt', `FAILED: ${error}`);
        process.exit(1);
    }
}

nuclearWipe();
