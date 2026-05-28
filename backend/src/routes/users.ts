import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { normalizePhone } from '../utils/phone';
import { logAudit } from '../utils/audit';

const router = express.Router();
const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

// Get all users (admin and director)
router.get('/', authenticateToken, requirePermission('can_manage_users'), async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let sql = `
            SELECT
                p.id, p.email, p.full_name, p.phone,
                CASE
                    WHEN p.avatar_url LIKE 'data:%' THEN '/api/profiles/' || p.id || '/avatar'
                    ELSE p.avatar_url
                END as avatar_url,
                p.position_id, p.is_active, p.created_at,
                COALESCE(pos.access_level, 0) as access_level,
                pos.name as position_name
            FROM profiles p
            LEFT JOIN positions pos ON p.position_id = pos.id
        `;

        const params: any[] = [];
        if (cursor) {
            sql += ` WHERE p.created_at < $1`;
            params.push(cursor);
        }

        sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`;
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
        console.error('Get users error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Create new user (admin, director, commercial, head_sales)
router.post('/',
    authenticateToken,
    requirePermission('can_manage_users'),
    [
        body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
        body('password').optional().isLength({ min: 6 }),
        body('full_name').trim().notEmpty(),
        body('phone').optional().trim(),
        body('position_id').optional({ nullable: true }),
        body('has_salary').optional().isBoolean(),
        body('commission_percent').optional().isFloat({ min: 0, max: 100 }),
        body('branch_id').optional({ nullable: true }),
        body('team_id').optional({ nullable: true }),
        body('realtor_type').optional().isIn(['universal', 'secondary', 'newbuildings']),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { email, full_name, phone, position_id, has_salary, commission_percent, branch_id, team_id } = req.body;
            const realtorTypeRaw = req.body.realtor_type;
            const realtor_type =
                realtorTypeRaw === 'secondary' || realtorTypeRaw === 'newbuildings' || realtorTypeRaw === 'universal'
                    ? realtorTypeRaw
                    : 'universal';

            const password = req.body.password || crypto.randomBytes(12).toString('base64').slice(0, 16);

            if (email) {
                const existing = await query('SELECT id FROM auth_users WHERE email = $1', [email]);
                if (existing && existing.rows.length > 0) {
                    res.status(400).json({ error: { message: 'Email already exists' } });
                    return;
                }
            }

            if (position_id) {
                const posCheck = await query('SELECT id FROM positions WHERE id = $1', [position_id]);
                if (!posCheck.rows[0]) {
                    res.status(400).json({ error: { message: 'Invalid position_id' } });
                    return;
                }
            }

            const userId = uuidv4();
            const hashedPassword = bcrypt.hashSync(password, 10);

            await query(
                `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at) VALUES ($1, $2, $3, ${isPostgres ? 'CURRENT_TIMESTAMP' : 'datetime(\'now\')'})`,
                [userId, email || null, hashedPassword]
            );

            const commission = commission_percent !== undefined ? commission_percent : 0;
            const salary = has_salary === true || has_salary === 'true' ? 1 : 0;

            const companyId = (req.user as any).company_id;

            await query(
                'INSERT INTO profiles (id, email, full_name, phone, position_id, has_salary, commission_percent, is_active, branch_id, team_id, company_id, realtor_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
                [userId, email || null, full_name, normalizePhone(phone), position_id, salary, commission, 1, branch_id, team_id, companyId, realtor_type]
            );

            const result = await query(
                `SELECT
          p.id, p.email, p.full_name, p.phone, p.avatar_url,
          p.position_id, p.is_active, p.created_at,
          COALESCE(pos.access_level, 0) as access_level,
          pos.name as position_name
        FROM profiles p
        LEFT JOIN positions pos ON p.position_id = pos.id
        WHERE p.id = $1`,
                [userId]
            );

            const response: any = result.rows[0];
            if (!req.body.password) {
                response.temporaryPassword = password;
            }

            await logAudit(req, 'CREATE', 'user', userId, { name: full_name || '' });
            res.status(201).json(response);
        } catch (error) {
            console.error('Create user error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Update user password (admin or self)
router.patch('/:id/password',
    authenticateToken,
    [
        body('password').isLength({ min: 6 }),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const id = req.params.id as string;
            const { password } = req.body;
            const { user } = req;

            const canReset = Number(user!.access_level || 0) >= 90 || user!.id === id;
            if (!canReset) {
                res.status(403).json({ error: { message: 'Forbidden' } });
                return;
            }

            const hashedPassword = bcrypt.hashSync(password, 10);

            await query(
                'UPDATE auth_users SET encrypted_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [hashedPassword, id]
            );

            res.json({ message: 'Password updated successfully' });
        } catch (error) {
            console.error('Update password error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);

// Update user role endpoint is deprecated
router.patch('/:id/role',
    authenticateToken,
    requirePermission('can_manage_users'),
    async (_req: Request, res: Response): Promise<void> => {
        res.status(410).json({ error: { message: 'Role management is deprecated. Use positions-based permissions.' } });
    }
);

export default router;
