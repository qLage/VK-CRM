import { query, pool } from './index';
import cacheService from '../lib/cache.service';
import fs from 'fs';
import path from 'path';

async function wipeData() {
    console.log('🚀 SYSTEM WIPE INITIALIZED...');
    
    const tablesToWipe = [
        'deal_table_rows',
        'deals',
        'deal_participants',
        'deal_commissions',
        'deal_documents',
        'deal_activities',
        'transactions',
        'service_requests',
        'service_request_attachments',
        'notifications',
        'agent_instances',
        'agent_events',
        'leads',
        'attendance',
        'recurring_expenses'
    ];

    try {
        for (const table of tablesToWipe) {
            console.log(`🧹 Wiping table: ${table}...`);
            try {
                await query(`TRUNCATE ${table} CASCADE`);
                console.log(`✅ ${table} wiped.`);
            } catch (err: any) {
                console.log(`⚠️  Could not wipe ${table}: ${err.message}`);
            }
        }

        console.log('👤 Cleaning up users...');
        await query("DELETE FROM profiles WHERE email != 'admin@crm.local'");
        await query("DELETE FROM auth_users WHERE email != 'admin@crm.local'");
        console.log('✅ Users cleaned (Admin preserved).');

        console.log('⚡ Flushing Redis cache...');
        await cacheService.invalidateAll();
        console.log('✅ Cache flushed.');

        const statusPath = path.join(process.cwd(), 'purge_status.txt');
        fs.writeFileSync(statusPath, `PURGE SUCCESSFUL AT ${new Date().toISOString()}`);
        
        console.log('\n✨ ALL SYSTEMS CLEAN. DATA ERADICATED.');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ CRITICAL ERROR DURING WIPE:', error);
        process.exit(1);
    }
}

wipeData();
