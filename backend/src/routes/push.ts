import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/vapid-public-key', (_req: Request, res: Response): void => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
        res.status(503).json({ error: { message: 'Push notifications not configured' } });
        return;
    }
    res.json({ publicKey });
});

router.post('/subscribe', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    const { endpoint, keys } = req.body || {};

    console.log('[Push Subscribe] Request from user:', req.user!.id);
    console.log('[Push Subscribe] Endpoint:', endpoint?.substring(0, 50));
    console.log('[Push Subscribe] Keys:', keys ? 'present' : 'missing');

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        console.error('[Push Subscribe] Invalid subscription data');
        res.status(400).json({ error: { message: 'Invalid subscription' } });
        return;
    }

    try {
        const now = new Date().toISOString();

        console.log('[Push Subscribe] Checking for existing subscription...');
        const existing = await query(
            `SELECT id FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2 LIMIT 1`,
            [req.user!.id, endpoint]
        );

        if (existing.rows.length > 0) {
            console.log('[Push Subscribe] Updating existing subscription:', existing.rows[0].id);
            await query(
                `UPDATE push_subscriptions
                 SET p256dh = $1, auth = $2, updated_at = $3
                 WHERE id = $4`,
                [keys.p256dh, keys.auth, now, existing.rows[0].id]
            );
            console.log('[Push Subscribe] ✅ Updated successfully');
        } else {
            const newId = uuidv4();
            console.log('[Push Subscribe] Inserting new subscription:', newId);
            const result = await query(
                `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [newId, req.user!.id, endpoint, keys.p256dh, keys.auth, now, now]
            );
            console.log('[Push Subscribe] ✅ Inserted successfully:', result.rows[0]?.id);
        }

        res.json({ ok: true });
    } catch (error: any) {
        console.error('[Push Subscribe] ❌ Error:', error.message);
        console.error('[Push Subscribe] Stack:', error.stack);
        res.status(500).json({ error: { message: 'Failed to save subscription' } });
    }
});

router.post('/unsubscribe', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    const { endpoint } = req.body || {};

    if (!endpoint) {
        res.status(400).json({ error: { message: 'endpoint required' } });
        return;
    }

    await query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [req.user!.id, endpoint]
    );

    res.json({ ok: true });
});

export default router;
