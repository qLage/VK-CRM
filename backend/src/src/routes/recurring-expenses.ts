import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all recurring expenses
router.get('/', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = req.user!.company_id;
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let sql = `SELECT re.*, p.full_name as related_user_name
       FROM recurring_expenses re
       LEFT JOIN profiles p ON re.related_user_id = p.id
       WHERE re.company_id = $1`;

        const params: any[] = [companyId];
        if (cursor) {
            sql += ` AND re.created_at < $2`;
            params.push(cursor);
        }

        sql += ` ORDER BY re.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit + 1);

        const result = await query(sql, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        const rows = result.rows.map((row: any) => ({
            ...row,
            payment_days: JSON.parse(row.payment_days || '[]'),
        }));

        res.json({
            data: rows,
            nextCursor,
            hasNextPage
        });
    } catch (error) {
        console.error('Get recurring expenses error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Create recurring expense
router.post('/',
    authenticateToken,
    requireAccessLevel(50),
    [
        body('name').trim().notEmpty(),
        body('category').trim().notEmpty(),
        body('amount').isFloat({ min: 0 }),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { user } = req;
            const { name, category, amount, payment_days, is_active, related_user_id } = req.body;
            const id = uuidv4();

            await query(
                `INSERT INTO recurring_expenses (id, name, category, amount, payment_days, is_active, related_user_id, created_by, company_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, name, category, amount, JSON.stringify(payment_days || []), is_active !== undefined ? (is_active ? 1 : 0) : 1, related_user_id || null, user!.id, user!.company_id]
            );

            const result = await query('SELECT * FROM recurring_expenses WHERE id = $1 AND company_id = $2', [id, user!.company_id]);
            const row = result.rows[0];
            if (row) {
                row.payment_days = JSON.parse(row.payment_days || '[]');
            }

            // Notify admins and directors (position-based, same company)
            try {
                const admins = await query(`
                    SELECT p.id as user_id
                    FROM profiles p
                    LEFT JOIN positions pos ON p.position_id = pos.id
                    WHERE COALESCE(pos.access_level, 0) >= 90
                      AND p.company_id = $1
                `, [user!.company_id]);
                const message = `Создан регулярный расход (${category}): ${name} - ${amount} руб.`;
                const now = new Date().toISOString();
                for (const admin of admins.rows) {
                    await query(
                        `INSERT INTO notifications (id, user_id, title, message, type, created_by, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [uuidv4(), admin.user_id, 'Новый регулярный расход', message, 'info', 'system', now]
                    );
                }
            } catch (err) {
                console.error('Failed to create recurring expense notification:', err);
            }

            res.status(201).json(row);
        } catch (error) {
            console.error('Create recurring expense error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Update recurring expense (PUT - full update)
router.put('/:id',
    authenticateToken,
    requireAccessLevel(50),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const id = req.params.id as string;
            const companyId = req.user!.company_id;
            const updates = req.body;

            // Verify expense belongs to user's company
            const checkResult = await query(
                'SELECT id FROM recurring_expenses WHERE id = $1 AND company_id = $2',
                [id, companyId]
            );

            if (checkResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Recurring expense not found' } });
                return;
            }

            const fields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            const allowedFields = ['name', 'category', 'amount', 'is_active', 'related_user_id'];

            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) {
                    fields.push(`${key} = $${paramIndex}`);
                    if (key === 'is_active') {
                        values.push(updates[key] ? 1 : 0);
                    } else {
                        values.push(updates[key]);
                    }
                    paramIndex++;
                }
            });

            if (updates.payment_days) {
                fields.push(`payment_days = $${paramIndex}`);
                values.push(JSON.stringify(updates.payment_days));
                paramIndex++;
            }

            if (fields.length === 0) {
                res.status(400).json({ error: { message: 'No valid fields to update' } });
                return;
            }

            fields.push(`updated_at = $${paramIndex}`);
            values.push(new Date().toISOString());
            paramIndex++;

            values.push(id);
            values.push(companyId);
            await query(
                `UPDATE recurring_expenses SET ${fields.join(', ')} WHERE id = $${paramIndex} AND company_id = $${paramIndex + 1}`,
                values
            );

            const result = await query('SELECT * FROM recurring_expenses WHERE id = $1 AND company_id = $2', [id, companyId]);
            const row = result.rows[0];
            if (row) {
                row.payment_days = JSON.parse(row.payment_days || '[]');
            }

            res.json(row);
        } catch (error) {
            console.error('Update recurring expense error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Update recurring expense (PATCH - partial update)
router.patch('/:id',
    authenticateToken,
    requireAccessLevel(50),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const id = req.params.id as string;
            const companyId = req.user!.company_id;
            const updates = req.body;

            // Verify expense belongs to user's company
            const checkResult = await query(
                'SELECT id FROM recurring_expenses WHERE id = $1 AND company_id = $2',
                [id, companyId]
            );

            if (checkResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Recurring expense not found' } });
                return;
            }

            const fields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            const allowedFields = ['name', 'category', 'amount', 'is_active', 'related_user_id'];

            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) {
                    fields.push(`${key} = $${paramIndex}`);
                    if (key === 'is_active') {
                        values.push(updates[key] ? 1 : 0);
                    } else {
                        values.push(updates[key]);
                    }
                    paramIndex++;
                }
            });

            if (updates.payment_days) {
                fields.push(`payment_days = $${paramIndex}`);
                values.push(JSON.stringify(updates.payment_days));
                paramIndex++;
            }

            if (fields.length === 0) {
                res.status(400).json({ error: { message: 'No valid fields to update' } });
                return;
            }

            fields.push(`updated_at = $${paramIndex}`);
            values.push(new Date().toISOString());
            paramIndex++;

            values.push(id);
            values.push(companyId);
            await query(
                `UPDATE recurring_expenses SET ${fields.join(', ')} WHERE id = $${paramIndex} AND company_id = $${paramIndex + 1}`,
                values
            );

            const result = await query('SELECT * FROM recurring_expenses WHERE id = $1 AND company_id = $2', [id, companyId]);
            const row = result.rows[0];
            if (row) {
                row.payment_days = JSON.parse(row.payment_days || '[]');
            }

            res.json(row);
        } catch (error) {
            console.error('Update recurring expense error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Delete recurring expense
router.delete('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const companyId = req.user!.company_id;

        // Verify expense belongs to user's company before deleting
        const result = await query('DELETE FROM recurring_expenses WHERE id = $1 AND company_id = $2', [id, companyId]);

        if (result.rowCount === 0) {
            res.status(404).json({ error: { message: 'Recurring expense not found' } });
            return;
        }

        res.json({ message: 'Recurring expense deleted' });
    } catch (error) {
        console.error('Delete recurring expense error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
