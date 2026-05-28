import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Get all branches
router.get('/', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    let sql = `SELECT * FROM branches`;

    const params: any[] = [];
    if (cursor) {
        sql += ` WHERE created_at < $1`;
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

    res.json({
        data: result.rows,
        nextCursor,
        hasNextPage
    });
}));

// Get single branch
router.get('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const result = await query('SELECT * FROM branches WHERE id = $1', [id]);
    const branch = result.rows[0];

    if (!branch) {
        throw new AppError('Branch not found', 404, 'BRANCH_NOT_FOUND');
    }

    res.json(branch);
}));

// Create branch (Admin/Director only)
router.post('/', authenticateToken, requirePermission('can_manage_branches'), [
    body('name').trim().notEmpty().withMessage('Branch name is required'),
    body('city').optional().trim(),
    body('address').optional().trim(),
    body('phone').optional().trim()
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const { name, city, address, phone } = req.body;
        const id = uuidv4();
        const now = new Date().toISOString();
        const companyId = req.user?.company_id || '00000000-0000-0000-0000-000000000001';

        await query(
            'INSERT INTO branches (id, name, city, address, phone, company_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [id, name, city, address, phone, companyId, now, now]
        );

        await logAudit(req, 'CREATE', 'branch', id, { name: name || '' });
        res.status(201).json({ id, name, city, address, phone, created_at: now, updated_at: now });
    } catch (error: any) {
        console.error('Error creating branch:', error);
        res.status(500).json({ error: { message: error.message || 'Internal server error' } });
    }
});

// Update branch (Admin/Director only)
router.put('/:id', authenticateToken, requirePermission('can_manage_branches'), [
    body('name').optional().trim().notEmpty().withMessage('Branch name cannot be empty'),
    body('city').optional().trim(),
    body('address').optional().trim(),
    body('phone').optional().trim()
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const { id } = req.params;
        const { name, city, address, phone } = req.body;
        const now = new Date().toISOString();

        const result = await query(
            'UPDATE branches SET name = $1, city = $2, address = $3, phone = $4, updated_at = $5 WHERE id = $6 RETURNING *',
            [name, city, address, phone, now, id]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ error: { message: 'Branch not found' } });
            return;
        }
        const changes: Record<string, any> = {};
        if (name !== undefined) changes.name = name;
        if (city !== undefined) changes.city = city;
        if (address !== undefined) changes.address = address;
        if (phone !== undefined) changes.phone = phone;
        await logAudit(req, 'UPDATE', 'branch', id, { name: name || result.rows[0]?.name || '', ...changes });
        res.json(result.rows[0] || { id, name, city, address, phone, updated_at: now });
    } catch (error) {
        console.error('Error updating branch:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Delete branch (Admin only)
router.delete('/:id', authenticateToken, requirePermission('can_manage_branches'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const existing = await query('SELECT name FROM branches WHERE id = $1', [id]);
        // Unlink users first
        await query('UPDATE profiles SET branch_id = NULL WHERE branch_id = $1', [id]);
        // Delete branch
        const result = await query('DELETE FROM branches WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            res.status(404).json({ error: { message: 'Branch not found' } });
            return;
        }
        await logAudit(req, 'DELETE', 'branch', id, { name: existing.rows[0]?.name || '' });
        res.json({ message: 'Branch deleted' });
    } catch (error) {
        console.error('Error deleting branch:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

export default router;
