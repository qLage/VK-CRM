import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import webpush from 'web-push';
import { query } from '../db';

interface PushData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  entityId?: string;
  type?: string;
  data?: any;
  requireInteraction?: boolean;
}

interface PushJobData {
  userId: string;
  pushData: PushData;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let pushQueue: Queue | null = null;
let connection: Redis | null = null;

console.log('[Push Service] Initializing...');
console.log('[Push Service] Redis URL:', process.env.REDIS_URL ? 'configured' : 'MISSING');
console.log('[Push Service] VAPID Public Key:', process.env.VAPID_PUBLIC_KEY ? 'configured' : 'MISSING');
console.log('[Push Service] VAPID Private Key:', process.env.VAPID_PRIVATE_KEY ? 'configured' : 'MISSING');

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ Web Push VAPID configured');
  } catch (e) {
    console.warn('⚠️ VAPID keys invalid - push notifications disabled');
  }
} else {
  console.warn('⚠️ VAPID keys not configured - push notifications disabled');
}

const initPushService = (): void => {
  if (!process.env.REDIS_URL) {
    console.log('⚠️ Running without Redis (Push Notifications disabled)');
    return;
  }

  try {
    connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null,
      tls: { rejectUnauthorized: false } // Allow self-signed certs (Selectel)
    });

    // Suppress error logs
    connection.on('error', () => {});

    // Очередь пушей с задержкой (Debounce)
    pushQueue = new Queue('smart-push', { connection: { url: process.env.REDIS_URL, tls: { rejectUnauthorized: false } } });
    console.log('✅ BullMQ Push Queue initialized');
  } catch (e) {
    console.log('⚠️ Push Queue unavailable - notifications disabled');
    connection = null;
    pushQueue = null;
  }
};

/**
 * Отправляет Push с дедупликацией
 * Если приходит 5 уведомлений по одной сделке за 30 сек, они объединятся
 */
const sendSmartPush = async (userId: string, pushData: PushData): Promise<void> => {
  console.log('[Push Service] sendSmartPush called for user:', userId);
  console.log('[Push Service] Push data:', pushData);

  if (!pushQueue) {
    console.warn('[Push Service] Push queue not initialized - notification will not be sent');
    return;
  }

  // В BullMQ job ID = userId + entityId. Если такой джоб уже в очереди, он игнорируется или заменяется
  // Если entityId нет, генерируем случайный, чтобы пуш ушел
  const entityId = pushData.entityId || Math.random().toString(36).slice(2, 9);
  const jobId = `${userId}-${entityId}`;

  console.log('[Push Service] Adding job to queue with ID:', jobId);

  await pushQueue.add('send-push', { userId, pushData }, {
    jobId, // Дедупликация!
    delay: 5000, // Debounce 5 секунд (ждем может еще прилетят связанные события)
    removeOnComplete: true,
    removeOnFail: 100 // Keep last 100 failures
  });

  console.log('[Push Service] Job added to queue successfully');
};

const startPushWorker = (): Worker | null => {
  if (!connection) {
    console.log('⚠️ Push Worker disabled - no Redis connection');
    return null;
  }

  console.log('[Push Worker] Starting worker...');

  const worker = new Worker<PushJobData>('smart-push', async (job: Job<PushJobData>) => {
    const { userId, pushData } = job.data;

    console.log(`[Push Worker] Processing job for user ${userId}`);

    try {
      // Get all push subscriptions for this user
      const result = await query(
        'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );

      console.log(`[Push Worker] Found ${result.rows.length} subscriptions for user ${userId}`);

      if (result.rows.length === 0) {
        console.log(`[Push Worker] No subscriptions found for user ${userId}`);
        return;
      }

      // Send to all user's devices
      const sendPromises = result.rows.map(async (row: PushSubscriptionRow) => {
        const subscription = {
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth
          }
        };

        console.log(`[Push Worker] Sending to endpoint: ${row.endpoint.slice(-50)}`);

        try {
          const payload = JSON.stringify(pushData);
          console.log(`[Push Worker] Payload:`, payload);

          await webpush.sendNotification(subscription, payload);
          console.log(`[Push Worker] ✅ Successfully sent to ${userId} (${row.endpoint.slice(-20)})`);
        } catch (error: any) {
          console.error(`[Push Worker] ❌ Failed to send to ${userId}:`, error.message);
          console.error(`[Push Worker] Error details:`, error);

          // If subscription is invalid (410 Gone), remove it
          if (error.statusCode === 410) {
            await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
            console.log(`[Push Worker] Removed expired subscription for ${userId}`);
          }
        }
      });

      await Promise.allSettled(sendPromises);
      console.log(`[Push Worker] Finished processing job for user ${userId}`);
    } catch (error: any) {
      console.error(`[Push Worker] ❌ Error processing job for ${userId}:`, error.message);
      console.error(`[Push Worker] Stack trace:`, error.stack);
      throw error; // Re-throw to mark job as failed
    }
  }, { connection: { url: process.env.REDIS_URL, tls: { rejectUnauthorized: false } } });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Push Worker] ❌ Job ${job?.id} failed with error:`, err.message);
  });

  worker.on('completed', (job: Job) => {
    console.log(`[Push Worker] ✅ Job ${job?.id} completed successfully`);
  });

  console.log('✅ BullMQ Push Worker started');
  return worker;
};

// Initialize connection automatically
initPushService();

export { pushQueue, sendSmartPush, startPushWorker };
export default { pushQueue, sendSmartPush, startPushWorker };
