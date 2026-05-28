import webpush from 'web-push';
import { query } from '../db';

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: any;
  [key: string]: any;
}

interface SendResult {
  sent: number;
  skipped?: boolean;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function configure(): boolean {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  return true;
}

async function sendToUser(userId: string, payload: PushPayload): Promise<SendResult> {
  if (!configure()) return { sent: 0, skipped: true };

  const subs = await query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  let sent = 0;

  for (const s of subs.rows as SubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: {
            p256dh: s.p256dh,
            auth: s.auth,
          },
        },
        JSON.stringify(payload)
      );

      sent++;
    } catch (e: any) {
      const status = e?.statusCode;
      // Subscription is no longer valid
      if (status === 404 || status === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      }
    }
  }

  return { sent };
}

export {
  sendToUser,
};
