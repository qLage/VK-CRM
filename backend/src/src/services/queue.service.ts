import { Queue, Worker, Job } from 'bullmq';
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

// Настройки подключения к Redis для BullMQ
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
};

// Проверяем, есть ли Redis URL (для Render)
if (process.env.REDIS_URL) {
  // В BullMQ v5 connection может принимать URL
  console.log('Using REDIS_URL for Queue Connection');
}

// 1. Создаем очередь для генерации отчетов
const reportQueue = new Queue('heavy-reports', {
  connection: process.env.REDIS_URL
    ? { url: process.env.REDIS_URL, tls: { rejectUnauthorized: false } }
    : connection
});

// 2. Функция добавления задачи в очередь
const addReportJob = async (jobName: string, data: JobData): Promise<Job> => {
  try {
    const job = await reportQueue.add(jobName, data, {
      removeOnComplete: true, // удалять после выполнения
      removeOnFail: false,   // оставлять для дебага
      attempts: 3,           // 3 попытки при ошибке
      backoff: { type: 'exponential', delay: 1000 }
    });
    console.log(`Job added to queue: ${job.id} (${jobName})`);
    return job;
  } catch (error) {
    console.error('Failed to add job to queue:', error);
    throw error;
  }
};

// 3. Инициализация Воркера
const startWorker = (): Worker | null => {
  // Skip worker initialization if REDIS_URL is not set
  if (!process.env.REDIS_URL) {
    console.log('⚠ REDIS_URL not set - heavy-reports Worker disabled');
    return null;
  }

  console.log('🛠️  Starting heavy-reports Worker...');

  // Воркер берет задачи из очереди 'heavy-reports'
  const worker = new Worker('heavy-reports', async (job: Job) => {
    console.log(`Processing job ${job.id}: ${job.name}`);

    switch (job.name) {
      case 'generateExcel':
        return await processGenerateExcel(job.data);
      case 'calculateComplexAnalytics':
        return await processCalculateAnalytics(job.data);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }, {
    connection: { url: process.env.REDIS_URL, tls: { rejectUnauthorized: false } },
    concurrency: 2 // Одновременно не более 2 тяжелых задач
  });

  // Обработка событий воркера
  worker.on('completed', (job: Job, returnvalue: any) => {
    console.log(`✅ Job ${job.id} completed!`);

    // Отправляем уведомление пользователю по WebSocket через Redis PubSub
    if (job.data?.userId) {
      redisService.publish('ws-user', {
        targetUserId: job.data.userId,
        type: 'REPORT_READY',
        payload: {
          message: 'Ваш отчет готов!',
          result: returnvalue // URL файла или данные
        }
      });
    }
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`❌ Job ${job?.id} failed:`, err);

    if (job?.data?.userId) {
      redisService.publish('ws-user', {
        targetUserId: job.data.userId,
        type: 'ERROR',
        payload: { message: `Ошибка при формировании отчета: ${err.message}` }
      });
    }
  });

  return worker;
};

// Имитация тяжелой работы
async function processGenerateExcel(_data: JobData): Promise<GenerateExcelResult> {
  // В реальности здесь логика exceljs
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ url: `/uploads/reports/report_${Date.now()}.xlsx` });
    }, 5000); // 5 сек задержки
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
  reportQueue,
  addReportJob,
  startWorker
};
