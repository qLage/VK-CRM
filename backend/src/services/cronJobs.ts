import cron from 'node-cron';
import { updateManagementKpi } from './kpiAutoUpdate';
import { rolloverEmployeeKpis } from './kpiRollover';

/**
 * Cron Jobs Service
 * Manages scheduled tasks for the CRM system
 */

/**
 * Start all cron jobs
 */
function startAllCronJobs(): void {
  console.log('🚀 Starting cron jobs...');

  // Update management KPI daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('⏰ Running daily KPI auto-update...');
    try {
      await updateManagementKpi();
    } catch (error) {
      console.error('❌ KPI auto-update cron job failed:', error);
    }
  });

  // Monthly KPI Rollover (1st of the month at 00:01)
  cron.schedule('1 0 1 * *', async () => {
    console.log('⏰ Running monthly KPI rollover...');
    try {
      await rolloverEmployeeKpis('month');
    } catch (error) {
      console.error('❌ Monthly KPI rollover failed:', error);
    }
  });

  // Quarterly KPI Rollover (1st of the quarter at 00:02)
  // Quarters start on months 1, 4, 7, 10
  cron.schedule('2 0 1 1,4,7,10 *', async () => {
    console.log('⏰ Running quarterly KPI rollover...');
    try {
      await rolloverEmployeeKpis('quarter');
    } catch (error) {
      console.error('❌ Quarterly KPI rollover failed:', error);
    }
  });

  console.log('✅ Cron jobs started: KPI auto-update (daily), Monthly Rollover (1st), Quarterly Rollover (1st)');

  // Also run on startup after 30 seconds to populate values
  setTimeout(async () => {
    console.log('⏰ Running startup KPI auto-update...');
    try {
      await updateManagementKpi();
    } catch (error) {
      console.error('❌ Startup KPI auto-update failed:', error);
    }
  }, 30000);
}

export {
  startAllCronJobs
};
