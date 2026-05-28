import redisService from './redis.service';

interface JobData {
  userId?: string;
  [key: string]: any;
}

interface GenerateExcelResult {
  url: string;
}

interface CalculateAnalyticsResult {
  status: string;
  processedRecords: number;
}

interface FakeJob {
  id: string;
  name: string;
  data: JobData;
}

/**
 * In-memory queue replacement for BullMQ.
 * Jobs are executed directly (no Redis required).
 */

const addReportJob = async (jobName: string, data: JobData): Promise<FakeJob> => {
  const job: FakeJob = { id: `job_${Date.now()}`, name: jobName, data };
  console.log(`[Queue] Processing job directly: ${job.id} (${jobName})`);

  // Execute immediately in background
  setTimeout(async () => {
    try {
      let result: any;
      switch (jobName) {
        case 'generateExcel':
          result = await processGenerateExcel(data);
          break;
        case 'calculateComplexAnalytics':
          result = await processCalculateAnalytics(data);
          break;
        default:
          throw new Error(`Unknown job name: ${jobName}`);
      }

      console.log(`✅ Job ${job.id} completed!`);
      if (data.userId) {
        redisService.publish('ws-user', {
          targetUserId: data.userId,
          type: 'REPORT_READY',
          payload: {
            message: 'Ваш отчет готов!',
            result
          }
        });
      }
    } catch (err: any) {
      console.error(`❌ Job ${job.id} failed:`, err);
      if (data.userId) {
        redisService.publish('ws-user', {
          targetUserId: data.userId,
          type: 'ERROR',
          payload: { message: `Ошибка при формировании отчета: ${err.message}` }
        });
      }
    }
  }, 0);

  return job;
};

const startWorker = (): null => {
  console.log('[Queue] Using direct execution mode (no BullMQ worker needed)');
  return null;
};

async function processGenerateExcel(_data: JobData): Promise<GenerateExcelResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ url: `/uploads/reports/report_${Date.now()}.xlsx` });
    }, 5000);
  });
}

async function processCalculateAnalytics(_data: JobData): Promise<CalculateAnalyticsResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ status: 'done', processedRecords: 15420 });
    }, 8000);
  });
}

export {
  addReportJob,
  startWorker
};
