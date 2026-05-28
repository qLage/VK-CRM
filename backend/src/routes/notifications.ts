import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler } from '../middleware/errorHandler';

import * as notificationService from '../services/notificationService';
import * as webPushService from '../services/webPushService';
import websocketService from '../services/websocket.service';

const router = express.Router();

// SSE Stream for real-time updates
router.get('/stream', authenticateToken, (req: Request, res: Response): void => {
    console.log('🔌 SSE /stream endpoint hit, userId:', req.user!.id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    notificationService.addClient(req.user!.id, res);

    // Keep connection alive with heartbeat
    const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 30000);

    res.on('close', () => {
        clearInterval(keepAlive);
    });
});

router.delete('/delete-all', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await query('DELETE FROM notifications WHERE user_id = $1', [req.user!.id]);
    res.json({ message: 'All notifications deleted' });
}));

// Get notifications for current user
router.get('/', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { user } = req;
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    let sql = `SELECT n.*, p.full_name as created_by_name
       FROM notifications n
       LEFT JOIN profiles p ON n.created_by = p.id
       WHERE n.user_id = $1`;

    const params: any[] = [user!.id];
    let paramIndex = 2;

    if (cursor) {
        sql += ` AND n.created_at < $${paramIndex}`;
        params.push(cursor);
        paramIndex++;
    }

    sql += ` ORDER BY n.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await query(sql, params);

    let hasNextPage = false;
    if (result.rows.length > limit) {
        hasNextPage = true;
        result.rows.pop();
    }

    const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

    res.json({
        data: result.rows,
        nextCursor,
        hasNextPage
    });
}));

// Send notification (managers and admins)
router.post('/send',
    authenticateToken,
    requireAccessLevel(50),
    [
        body('title').trim().notEmpty(),
        body('message').optional().trim(),
        body('user_id').optional(),
        body('type').optional().isIn(['info', 'warning', 'success', 'error']),
        body('is_forced').optional().isBoolean(),
    ],
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
        }

        const { user } = req;
        const { title, message, user_id, type, is_forced } = req.body;
        const now = new Date().toISOString();

        if (user_id) {
            // Send to single user
            const id = uuidv4();
            const notification = {
                id, user_id, title, message: message || '',
                type: type || 'info',
                is_forced: !!is_forced,
                created_by: user!.id,
                created_at: now,
                is_read: 0
            };

            await query(
                `INSERT INTO notifications (id, user_id, title, message, type, is_forced, created_by, created_at, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, user_id, title, message || '', type || 'info', is_forced ? 1 : 0, user!.id, now, user!.company_id]
            );

            // Send real-time update (SSE + WS)
            notificationService.sendToUser(user_id, { type: 'NOTIFICATION_RECEIVED', notification });
            await websocketService.emitEvent('NOTIFICATION_RECEIVED', { notification }, user_id);

            // Send Web Push (best-effort; skipped if not configured)
            try {
                await webPushService.sendToUser(user_id, {
                    type: 'notification',
                    id,
                    title,
                    message: message || '',
                });
            } catch (e) {
                // Push is optional; do not fail request
            }

            res.status(201).json({ message: 'Notification sent', count: 1 });
        } else {
            // Send to a group based on branch/team filters
            const { branch_id, team_id } = req.body;
            
            let usersSql = 'SELECT id FROM profiles WHERE is_active = 1';
            const usersParams: any[] = [];
            
            if (branch_id && branch_id !== 'all') {
                usersParams.push(branch_id);
                usersSql += ` AND branch_id = $${usersParams.length}`;
            }
            
            if (team_id && team_id !== 'all') {
                usersParams.push(team_id);
                usersSql += ` AND team_id = $${usersParams.length}`;
            }

            const usersResult = await query(usersSql, usersParams);
            console.log(`[Notifications] Found ${usersResult.rows.length} recipients for the following filters:`, { branch_id, team_id, user_role: user!.role });
            
            if (usersResult.rows.length === 0) {
                res.status(200).json({ message: 'No recipients found for given filters', count: 0 });
                return;
            }

            const insertStmt = `INSERT INTO notifications (id, user_id, title, message, type, is_forced, created_by, created_at, company_id)
                               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

            let count = 0;
            for (const u of usersResult.rows) {
                const id = uuidv4();
                const notification = {
                    id,
                    user_id: u.id,
                    title,
                    message: message || '',
                    type: type || 'info',
                    is_forced: !!is_forced,
                    created_by: user!.id,
                    created_at: now,
                    is_read: 0
                };

                await query(insertStmt, [id, u.id, title, message || '', type || 'info', is_forced ? 1 : 0, user!.id, now, user!.company_id]);

                // Send real-time update (SSE + WS)
                console.log(`[Notifications] Sending real-time event to user: ${u.id}`);
                notificationService.sendToUser(u.id, { type: 'NOTIFICATION_RECEIVED', notification });
                await websocketService.emitEvent('NOTIFICATION_RECEIVED', { notification }, u.id);

                // Send Web Push to each user (best-effort)
                try {
                    await webPushService.sendToUser(u.id, {
                        type: 'notification',
                        id,
                        title,
                        message: message || '',
                    });
                } catch (e) {
                    // Push is optional; do not fail request
                }

                count++;
            }

            res.status(201).json({ message: 'Notifications sent', count });
        }
    })
);

// Mark notification as read
router.patch('/:id/read', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await query('UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2', [id, req.user!.id]);
    res.json({ message: 'Marked as read' });
}));

// Mark all as read
router.patch('/read-all', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await query('UPDATE notifications SET is_read = 1 WHERE user_id = $1', [req.user!.id]);
    res.json({ message: 'All marked as read' });
}));

// Get unread count
router.get('/unread-count', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 0',
        [req.user!.id]
    );
    res.json({ count: result.rows[0]?.count || 0 });
}));

export default router;
