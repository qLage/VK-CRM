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

console.log('[Push Service] Initializing (in-memory mode, no Redis/BullMQ)...');

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

// Debounce map: jobId -> timeout
const pendingJobs = new Map<string, NodeJS.Timeout>();

/**
 * Sends push notification directly (replaces BullMQ queue).
 * Uses a 5-second debounce to deduplicate rapid events for the same entity.
 */
const sendSmartPush = async (userId: string, pushData: PushData): Promise<void> => {
  const entityId = pushData.entityId || Math.random().toString(36).slice(2, 9);
  const jobId = `${userId}-${entityId}`;

  // Cancel previous pending job for same entity (debounce)
  if (pendingJobs.has(jobId)) {
    clearTimeout(pendingJobs.get(jobId)!);
  }

  // Schedule execution after 5 seconds (debounce)
  const timeout = setTimeout(async () => {
    pendingJobs.delete(jobId);
    await executePushJob({ userId, pushData });
  }, 5000);

  pendingJobs.set(jobId, timeout);
};

/**
 * Actually sends the push notification to all user's devices
 */
async function executePushJob(jobData: PushJobData): Promise<void> {
  const { userId, pushData } = jobData;

  try {
    const result = await query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) return;

    const sendPromises = result.rows.map(async (row: PushSubscriptionRow) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      try {
        const payload = JSON.stringify(pushData);
        await webpush.sendNotification(subscription, payload);
      } catch (error: any) {
        console.error(`[Push] Failed to send to ${userId}:`, error.message);
        if (error.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (error: any) {
    console.error(`[Push] Error processing push for ${userId}:`, error.message);
  }
}

const startPushWorker = (): null => {
  console.log('[Push] Using direct execution mode (no BullMQ worker needed)');
  return null;
};

export { sendSmartPush, startPushWorker };
export default { sendSmartPush, startPushWorker };
