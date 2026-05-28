import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireRole } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all permissions for a position
router.get('/position/:positionId', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { positionId } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let sql = `SELECT id, position_id, permission, created_at FROM position_permissions WHERE position_id = $1`;

        const params: any[] = [positionId];
        let paramIndex = 2;

        if (cursor) {
            sql += ` AND created_at < $${paramIndex}`;
            params.push(cursor);
            paramIndex++;
        }

        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
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
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Get all permissions grouped by position
router.get('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let sql = `SELECT
                pp.id,
                pp.position_id,
                pp.permission,
                pp.created_at,
                p.name as position_name
            FROM position_permissions pp
            LEFT JOIN positions p ON pp.position_id = p.id`;

        const params: any[] = [];
        if (cursor) {
            sql += ` WHERE pp.created_at < $1`;
            params.push(cursor);
        }

        sql += ` ORDER BY p.name, pp.permission DESC LIMIT $${params.length + 1}`;
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
    } catch (error) {
        console.error('Get all permissions error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Add permission to position
router.post('/', authenticateToken, requireRole('admin'), [
    body('position_id').isUUID().withMessage('Valid position_id is required'),
    body('permission').trim().notEmpty().withMessage('Permission is required')
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const { position_id, permission } = req.body;

        // Check if permission already exists
        const existing = await query(
            'SELECT id FROM position_permissions WHERE position_id = $1 AND permission = $2',
            [position_id, permission]
        );

        if (existing.rows.length > 0) {
            res.status(400).json({ error: { message: 'Permission already exists' } });
            return;
        }

        const id = uuidv4();
        const now = new Date().toISOString();

        await query(
            'INSERT INTO position_permissions (id, position_id, permission, created_at) VALUES ($1, $2, $3, $4)',
            [id, position_id, permission, now]
        );

        const result = await query(
            'SELECT * FROM position_permissions WHERE id = $1',
            [id]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create permission error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Remove permission from position
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await query('DELETE FROM position_permissions WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: { message: 'Permission not found' } });
            return;
        }

        res.status(204).send();
    } catch (error) {
        console.error('Delete permission error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Bulk update permissions for a position
router.put('/position/:positionId', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { positionId } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            res.status(400).json({ error: { message: 'permissions must be an array' } });
            return;
        }

        // Delete all existing permissions for this position
        await query('DELETE FROM position_permissions WHERE position_id = $1', [positionId]);

        // Insert new permissions
        const now = new Date().toISOString();
        for (const permission of permissions) {
            const id = uuidv4();
            await query(
                'INSERT INTO position_permissions (id, position_id, permission, created_at) VALUES ($1, $2, $3, $4)',
                [id, positionId, permission, now]
            );
        }

        // Return updated permissions
        const result = await query(
            'SELECT * FROM position_permissions WHERE position_id = $1',
            [positionId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Bulk update permissions error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
