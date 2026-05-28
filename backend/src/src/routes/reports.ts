import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

// Get paginated reports
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { user } = req;
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let queryText = `
        SELECT
          r.id, r.user_id, r.type, r.template_id, r.status, r.title, r.description,
          r.amount, r.deal_date, r.client_name, r.client_phone,
          r.property_address, r.content, r.approved_by, r.approved_at,
          r.created_at, r.updated_at,
          p.full_name as user_name,
          p.avatar_url,
          p.position_id,
          p.branch_id
        FROM reports r
        LEFT JOIN profiles p ON r.user_id = p.id
        `;
        const params: any[] = [];
        const whereClauses: string[] = [];

        const isManagement = Number(user!.access_level || 0) >= 50;

        if (!isManagement) {
            whereClauses.push(`r.user_id = $${params.length + 1}`);
            params.push(user!.id);
        }

        if (cursor) {
            whereClauses.push(`r.created_at < $${params.length + 1}`);
            params.push(cursor);
        }

        if (whereClauses.length > 0) {
            queryText += ' WHERE ' + whereClauses.join(' AND ');
        }

        queryText += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit + 1);

        const result = await query(queryText, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        const reports = result.rows.map((row: any) => {
            if (row.content && typeof row.content === 'string') {
                try {
                    row.content = JSON.parse(row.content);
                } catch (e) {
                    // ignore
                }
            }
            return row;
        });

        res.json({
            data: reports,
            nextCursor,
            hasNextPage
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Create report
router.post('/',
    authenticateToken,
    [
        body('type').isIn(['daily', 'plan', 'deal', 'expense', 'service_request']),
        body('title').optional().trim(),
        body('description').optional().trim(),
        body('amount').optional().isFloat({ min: 0 }),
        body('deal_date').optional().isISO8601(),
        body('client_name').optional().trim(),
        body('client_phone').optional().trim(),
        body('property_address').optional().trim(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { user } = req;
            const { type, template_id, title, description, amount, deal_date, client_name, client_phone, property_address, content } = req.body;

            const id = uuidv4();

            const contentJson = content ? JSON.stringify(content) : null;

            await query(
                `INSERT INTO reports
          (id, user_id, type, template_id, status, title, description, amount, deal_date, client_name, client_phone, property_address, content)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [id, user!.id, type, template_id, 'pending', title, description, amount, deal_date, client_name, client_phone, property_address, contentJson]
            );

            const result = await query(
                `SELECT
          r.*, p.full_name as user_name
        FROM reports r
        LEFT JOIN profiles p ON r.user_id = p.id
        WHERE r.id = $1`,
                [id]
            );

            if (result.rows[0].content) {
                try {
                    result.rows[0].content = JSON.parse(result.rows[0].content);
                } catch (e) {
                    // keep as string if parse fails
                }
            }

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Create report error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Update report details (Owner or Admin)
router.put('/:id',
    authenticateToken,
    [
        body('title').optional().trim(),
        body('description').optional().trim(),
        body('amount').optional().isFloat({ min: 0 }),
        body('deal_date').optional().isISO8601(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const id = req.params.id as string;
            const { user } = req;
            const { type, template_id, title, description, amount, deal_date, client_name, client_phone, property_address, content } = req.body;

            const checkResult = await query('SELECT user_id, status FROM reports WHERE id = $1', [id]);
            if (checkResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Report not found' } });
                return;
            }
            const report = checkResult.rows[0];

            if (report.user_id !== user!.id && user!.role !== 'admin' && user!.role !== 'director') {
                res.status(403).json({ error: { message: 'Forbidden' } });
                return;
            }

            if (report.status !== 'pending' && user!.role !== 'admin') {
                res.status(400).json({ error: { message: 'Cannot edit processed report' } });
                return;
            }

            const contentJson = content ? JSON.stringify(content) : null;

            const updateFields: string[] = [];
            const params: any[] = [];
            let paramCount = 1;

            if (type) { updateFields.push(`type = $${paramCount++}`); params.push(type); }
            if (template_id) { updateFields.push(`template_id = $${paramCount++}`); params.push(template_id); }
            if (title) { updateFields.push(`title = $${paramCount++}`); params.push(title); }
            if (description) { updateFields.push(`description = $${paramCount++}`); params.push(description); }
            if (amount !== undefined) { updateFields.push(`amount = $${paramCount++}`); params.push(amount); }
            if (deal_date) { updateFields.push(`deal_date = $${paramCount++}`); params.push(deal_date); }
            if (client_name) { updateFields.push(`client_name = $${paramCount++}`); params.push(client_name); }
            if (client_phone) { updateFields.push(`client_phone = $${paramCount++}`); params.push(client_phone); }
            if (property_address) { updateFields.push(`property_address = $${paramCount++}`); params.push(property_address); }
            if (contentJson) { updateFields.push(`content = $${paramCount++}`); params.push(contentJson); }

            updateFields.push(`updated_at = ${isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')"}`);

            params.push(id);

            if (updateFields.length > 1) {
                await query(
                    `UPDATE reports SET ${updateFields.join(', ')} WHERE id = $${paramCount}`,
                    params
                );
            }

            const result = await query(
                `SELECT r.*, p.full_name as user_name
                 FROM reports r
                 LEFT JOIN profiles p ON r.user_id = p.id
                 WHERE r.id = $1`,
                [id]
            );

            if (result.rows[0].content) {
                try {
                    result.rows[0].content = JSON.parse(result.rows[0].content);
                } catch (e) { }
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Update report error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Update report status (managers and admins only)
router.patch('/:id/status',
    authenticateToken,
    requireAccessLevel(50),
    [
        body('status').isIn(['pending', 'approved', 'rejected']),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const id = req.params.id as string;
            const { status } = req.body;
            const { user } = req;

            await query(
                `UPDATE reports
        SET status = $1, approved_by = $2, approved_at = ${isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')"}, updated_at = ${isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')"}
        WHERE id = $3`,
                [status, user!.id, id]
            );

            const result = await query(
                `SELECT
          r.*, p.full_name as user_name
        FROM reports r
        LEFT JOIN profiles p ON r.user_id = p.id
        WHERE r.id = $1`,
                [id]
            );

            const report = result.rows[0];

            if (report && status === 'approved' && report.type === 'deal') {
                try {
                    const txId = uuidv4();
                    const now = new Date().toISOString();
                    const amount = parseFloat(report.amount) || 0;

                    const checkTx = await query('SELECT id FROM transactions WHERE description LIKE $1', [`%Отчет: ${id}%`]);

                    if (checkTx.rows.length === 0 && amount > 0) {
                        await query(
                            `INSERT INTO transactions (id, type, category, amount, description, user_id, account_type, created_at, updated_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                            [txId, 'income', 'deal_commission', amount, `Оплата по сделке: ${report.title || 'Без названия'} (Отчет: ${id})`, report.user_id, 'account', now, now]
                        );

                        const admins = await query(`
                            SELECT p.id as user_id
                            FROM profiles p
                            LEFT JOIN positions pos ON p.position_id = pos.id
                            WHERE COALESCE(pos.access_level, 0) >= 90
                        `);
                        for (const admin of admins.rows) {
                            await query(
                                `INSERT INTO notifications (id, user_id, title, message, type, created_by, created_at)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                                [uuidv4(), admin.user_id, 'Сделка закрыта', `Автоматическое зачисление: ${amount} руб. (${report.user_name})`, 'success', 'system', now]
                            );
                        }
                    }
                } catch (txError) {
                    console.error('Failed to auto-create transaction for deal:', txError);
                }
            }

            res.json(report);
        } catch (error) {
            console.error('Update report status error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Delete report
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { user } = req;

        const checkResult = await query('SELECT user_id FROM reports WHERE id = $1', [id]);

        if (checkResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Report not found' } });
            return;
        }

        const report = checkResult.rows[0];

        const canDeleteOthers = Number(user!.access_level || 0) >= 90;
        if (report.user_id !== user!.id && !canDeleteOthers) {
            res.status(403).json({ error: { message: 'Forbidden' } });
            return;
        }

        await query('DELETE FROM reports WHERE id = $1', [id]);

        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        console.error('Delete report error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
