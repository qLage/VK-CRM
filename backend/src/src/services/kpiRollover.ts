import { query } from '../db';
import kpiService from './kpi.service';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from 'date-fns';

/**
 * KPI Rollover Service
 * Recalculates and sets the baseline KPI for employees at the start of a new period
 */
async function rolloverEmployeeKpis(periodType: 'month' | 'quarter' = 'quarter'): Promise<{ updated: number }> {
    console.log(`🔄 Starting KPI rollover for ${periodType}...`);
    
    // 1. Determine the range of the COMPLETED period
    const now = new Date();
    let startDate: string;
    let endDate: string;

    if (periodType === 'month') {
        const d = subMonths(now, 1);
        startDate = startOfMonth(d).toISOString();
        endDate = endOfMonth(d).toISOString();
    } else {
        // Quarter rollover
        const d = subMonths(startOfQuarter(now), 1);
        startDate = startOfQuarter(d).toISOString();
        endDate = endOfQuarter(d).toISOString();
    }

    console.log(`📊 Calculating performance from ${startDate} to ${endDate}`);

    // 2. Get leaderboard results for the COMPLETED period
    // This gives us the 'kpiRate' each employee should have earned
    const results = await kpiService.getLeaderboard(startDate, endDate);
    
    if (!results || results.length === 0) {
        console.warn('⚠️ No performance data found for the completed period. Rollover skipped.');
        return { updated: 0 };
    }

    // 3. Update profiles with the earned KPI rate
    let updatedCount = 0;
    for (const entry of results) {
        try {
            const role = (entry.role || '').toLowerCase();
            const isManagement = ['sales_manager', 'head_sales', 'director', 'commercial'].includes(role) 
              || (entry.positionName || '').toLowerCase().includes('моп')
              || (entry.positionName || '').toLowerCase().includes('роп');

            if (isManagement) {
                // Update management KPI
                await query(`
                    UPDATE profiles 
                    SET management_kpi_current = $1,
                        kpi_last_updated = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [entry.kpiRate, entry.userId]);
            } else {
                // Update personal KPI (Realtors)
                await query(`
                    UPDATE profiles 
                    SET personal_kpi_current = $1,
                        kpi_last_updated = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [entry.kpiRate, entry.userId]);
            }
            updatedCount++;
        } catch (error) {
            console.error(`❌ Failed to update employee ${entry.userId}:`, error);
        }
    }

    console.log(`✅ KPI rollover complete. Updated ${updatedCount} employees.`);
    return { updated: updatedCount };
}

export { rolloverEmployeeKpis };
