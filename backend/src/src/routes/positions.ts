import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { invalidateCacheMiddleware } from '../middleware/cache.middleware';

const router = express.Router();

// Get all positions
router.get('/', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    let sql = `
        SELECT id, name, description, base_salary, commission_percent, default_personal_kpi_min, default_personal_kpi_max, default_management_kpi_min, default_management_kpi_max, management_base_salary, access_level, can_view_finances, can_manage_finances, can_manage_branches, can_manage_users, participates_in_rating, is_salary_enabled, is_kpi_enabled, is_new_building, is_system, sort_order, created_at, updated_at
        FROM positions
    `;

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

    const positions = result.rows.map((p: any) => ({
        ...p,
        participates_in_rating: p.participates_in_rating == null ? true : Boolean(p.participates_in_rating),
        is_salary_enabled: p.is_salary_enabled == null ? true : Boolean(p.is_salary_enabled),
        is_kpi_enabled: p.is_kpi_enabled == null ? true : Boolean(p.is_kpi_enabled),
        is_new_building: p.is_new_building == null ? false : Boolean(p.is_new_building),
        is_system: p.is_system == null ? false : Boolean(p.is_system),
    }));

    res.json({
        data: positions,
        nextCursor,
        hasNextPage
    });
}));

// Create position
router.post('/', authenticateToken, requirePermission('can_manage_users'), invalidateCacheMiddleware(), [
    body('name').trim().notEmpty().withMessage('Position name is required'),
    body('description').optional().trim(),
    body('base_salary').optional().isNumeric().withMessage('base_salary must be a number'),
    body('commission_percent').optional().isNumeric().withMessage('commission_percent must be a number'),
    body('default_personal_kpi_min').optional().isFloat({ min: 0, max: 100 }).withMessage('default_personal_kpi_min must be between 0 and 100'),
    body('default_personal_kpi_max').optional().isFloat({ min: 0, max: 100 }).withMessage('default_personal_kpi_max must be between 0 and 100'),
    body('default_management_kpi_min').optional().isFloat({ min: 0, max: 100 }).withMessage('default_management_kpi_min must be between 0 and 100'),
    body('default_management_kpi_max').optional().isFloat({ min: 0, max: 100 }).withMessage('default_management_kpi_max must be between 0 and 100')
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { name, description, base_salary, commission_percent, default_personal_kpi_min, default_personal_kpi_max, default_management_kpi_min, default_management_kpi_max, management_base_salary, participates_in_rating, is_salary_enabled, is_kpi_enabled, is_new_building } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(
        `INSERT INTO positions (id, name, description, base_salary, commission_percent, default_personal_kpi_min, default_personal_kpi_max, default_management_kpi_min, default_management_kpi_max, management_base_salary, participates_in_rating, is_salary_enabled, is_kpi_enabled, is_new_building, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [id, name, description || null, base_salary || 0, commission_percent || 0, default_personal_kpi_min || 40, default_personal_kpi_max || 60, default_management_kpi_min || 0, default_management_kpi_max || 0, management_base_salary || 0, participates_in_rating ? 1 : 0, is_salary_enabled !== false ? 1 : 0, is_kpi_enabled !== false ? 1 : 0, is_new_building ? 1 : 0, now, now]
    );

    const result = await query('SELECT * FROM positions WHERE id = $1', [id]);
    const position = result.rows[0];
    if (position) {
        position.participates_in_rating = Boolean(position.participates_in_rating);
        position.is_salary_enabled = Boolean(position.is_salary_enabled);
        position.is_kpi_enabled = Boolean(position.is_kpi_enabled);
        position.is_new_building = Boolean(position.is_new_building);
        position.is_system = Boolean(position.is_system);
    }

    res.status(201).json(position);
}));

// Update position
router.patch('/:id', authenticateToken, requirePermission('can_manage_users'), invalidateCacheMiddleware(), [
    body('name').optional().trim().notEmpty().withMessage('Position name cannot be empty'),
    body('description').optional().trim(),
    body('base_salary').optional().isNumeric().withMessage('base_salary must be a number'),
    body('commission_percent').optional().isNumeric().withMessage('commission_percent must be a number'),
    body('default_personal_kpi_min').optional().isFloat({ min: 0, max: 100 }).withMessage('default_personal_kpi_min must be between 0 and 100'),
    body('default_personal_kpi_max').optional().isFloat({ min: 0, max: 100 }).withMessage('default_personal_kpi_max must be between 0 and 100'),
    body('default_management_kpi_min').optional().isFloat({ min: 0, max: 100 }).withMessage('default_management_kpi_min must be between 0 and 100'),
    body('default_management_kpi_max').optional().isFloat({ min: 0, max: 100 }).withMessage('default_management_kpi_max must be between 0 and 100')
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { id } = req.params;
    const { name, description, base_salary, commission_percent, default_personal_kpi_min, default_personal_kpi_max, default_management_kpi_min, default_management_kpi_max, management_base_salary, participates_in_rating, is_salary_enabled, is_kpi_enabled, is_new_building } = req.body;

    // Check exists
    const existingResult = await query('SELECT id, is_system FROM positions WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
        throw new AppError('Position not found', 404, 'POSITION_NOT_FOUND');
    }
    const existing = existingResult.rows[0];

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
        if (existing.is_system) {
            // Block renaming for system positions
        } else {
            updates.push(`name = $${paramIndex++}`); values.push(name);
        }
    }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
    if (base_salary !== undefined) { updates.push(`base_salary = $${paramIndex++}`); values.push(base_salary); }
    if (commission_percent !== undefined) { updates.push(`commission_percent = $${paramIndex++}`); values.push(commission_percent); }
    if (default_personal_kpi_min !== undefined) { updates.push(`default_personal_kpi_min = $${paramIndex++}`); values.push(Math.round(default_personal_kpi_min)); }
    if (default_personal_kpi_max !== undefined) { updates.push(`default_personal_kpi_max = $${paramIndex++}`); values.push(Math.round(default_personal_kpi_max)); }
    if (default_management_kpi_min !== undefined) { updates.push(`default_management_kpi_min = $${paramIndex++}`); values.push(Math.round(default_management_kpi_min)); }
    if (default_management_kpi_max !== undefined) { updates.push(`default_management_kpi_max = $${paramIndex++}`); values.push(Math.round(default_management_kpi_max)); }
    if (management_base_salary !== undefined) { updates.push(`management_base_salary = $${paramIndex++}`); values.push(management_base_salary); }
    if (participates_in_rating !== undefined) { updates.push(`participates_in_rating = $${paramIndex++}`); values.push(participates_in_rating ? 1 : 0); }
    if (is_salary_enabled !== undefined) { updates.push(`is_salary_enabled = $${paramIndex++}`); values.push(is_salary_enabled ? 1 : 0); }
    if (is_kpi_enabled !== undefined) { updates.push(`is_kpi_enabled = $${paramIndex++}`); values.push(is_kpi_enabled ? 1 : 0); }
    if (is_new_building !== undefined) { updates.push(`is_new_building = $${paramIndex++}`); values.push(is_new_building ? 1 : 0); }

    if (updates.length > 0) {
        updates.push(`updated_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
        values.push(id);

        await query(
            `UPDATE positions SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        // SYNC WITH PROFILES (Affect whole site as requested)
        const syncUpdates: string[] = [];
        const syncValues: any[] = [];
        let sIdx = 1;
        if (base_salary !== undefined) { syncUpdates.push(`salary_amount = $${sIdx++}`); syncValues.push(base_salary); }
        if (commission_percent !== undefined) { syncUpdates.push(`commission_percent = $${sIdx++}`); syncValues.push(commission_percent); }
        if (is_salary_enabled !== undefined) { syncUpdates.push(`has_salary = $${sIdx++}`); syncValues.push(is_salary_enabled ? 1 : 0); }
        if (is_kpi_enabled !== undefined) { syncUpdates.push(`is_kpi_enabled = $${sIdx++}`); syncValues.push(is_kpi_enabled ? 1 : 0); }
        if (is_new_building !== undefined) { syncUpdates.push(`is_new_building = $${sIdx++}`); syncValues.push(is_new_building ? 1 : 0); }

        if (syncUpdates.length > 0) {
            syncValues.push(id);
            await query(`UPDATE profiles SET ${syncUpdates.join(', ')} WHERE position_id = $${sIdx}`, syncValues);
        }
    }

    const result = await query('SELECT * FROM positions WHERE id = $1', [id]);
    const position = result.rows[0];
    if (position) {
        position.participates_in_rating = Boolean(position.participates_in_rating);
        position.is_salary_enabled = Boolean(position.is_salary_enabled);
        position.is_kpi_enabled = Boolean(position.is_kpi_enabled);
        position.is_new_building = Boolean(position.is_new_building);
        position.is_system = Boolean(position.is_system);
    }

    res.json(position);
}));

// Delete position
router.delete('/:id', authenticateToken, requirePermission('can_manage_users'), invalidateCacheMiddleware(), asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    // Check if employees are assigned to this position
    const empCheck = await query('SELECT count(*) FROM profiles WHERE position_id = $1', [id]);
    if (parseInt(empCheck.rows[0].count) > 0) {
        throw new AppError('Cannot delete position: employees are assigned to it', 400, 'POSITION_IN_USE');
    }

    const existingResult = await query('SELECT id, is_system FROM positions WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
        throw new AppError('Position not found', 404, 'POSITION_NOT_FOUND');
    }
    if (existingResult.rows[0].is_system) {
        throw new AppError('Cannot delete system position', 400, 'SYSTEM_POSITION_DELETE');
    }

    await query('DELETE FROM positions WHERE id = $1', [id]);

    res.status(204).send();
}));

export default router;
