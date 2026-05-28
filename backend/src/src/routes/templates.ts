import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all active templates
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let sql = `SELECT * FROM report_templates WHERE is_active = 1`;

        const params: any[] = [];
        if (cursor) {
            sql += ` AND created_at < $1`;
            params.push(cursor);
        }

        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit + 1);

        const result = await query(sql, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        const templates = result.rows.map((t: any) => ({
            ...t,
            fields: JSON.parse(t.fields)
        }));

        res.json({
            data: templates,
            nextCursor,
            hasNextPage
        });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Admin: Create template
router.post('/',
    authenticateToken,
    requireAccessLevel(90),
    [
        body('title').trim().notEmpty(),
        body('fields').isArray(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { title, description, fields } = req.body;
            const id = uuidv4();

            await query(
                `INSERT INTO report_templates (id, title, description, fields)
         VALUES ($1, $2, $3, $4)`,
                [id, title, description, JSON.stringify(fields)]
            );

            const result = await query('SELECT * FROM report_templates WHERE id = $1', [id]);
            const template = result.rows[0];
            template.fields = JSON.parse(template.fields);

            res.status(201).json(template);
        } catch (error) {
            console.error('Create template error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Admin: Delete/Archive template
router.delete('/:id',
    authenticateToken,
    requireAccessLevel(90),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            await query('UPDATE report_templates SET is_active = 0 WHERE id = $1', [id]);
            res.json({ message: 'Template archived' });
        } catch (error) {
            console.error('Delete template error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

export default router;
