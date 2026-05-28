import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { normalizePhone } from '../utils/phone';
import { getJwtSecret, authenticateToken } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

// JWT expiration - default to 1 hour for better security
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

const router = express.Router();

interface LoginRequestBody {
    email?: string;
    phone?: string;
    password: string;
}

interface UserRow {
    id: string;
    email: string;
    encrypted_password: string;
    full_name: string;
    phone: string;
    avatar_url: string;
    position_id: string;
    branch_id: string;
    team_id: string;
    company_id: string;
    is_active: number;
}

interface PositionPermissions {
    id: string;
    name: string;
    access_level: number;
    can_view_finances: number;
    can_manage_finances: number;
    can_manage_branches: number;
    can_manage_users: number;
}

// Login - with strict rate limiting (5 attempts per 15 minutes)
router.post('/login',
    authLimiter, // Apply strict rate limiting only to login
    [
        body('email').optional().isEmail().withMessage('Некорректный email'),
        body('phone').optional().isString().withMessage('Некорректный телефон'),
        body('password').notEmpty().withMessage('Введите пароль')
    ],
    async (req: Request<{}, {}, LoginRequestBody>, res: Response): Promise<void> => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
            return;
        }
        try {
            const { email, phone, password } = req.body;

            if (!password) {
                res.status(400).json({ error: { message: 'Введите пароль' } });
                return;
            }

            if (!email && !phone) {
                res.status(400).json({ error: { message: 'Укажите email или телефон' } });
                return;
            }

            // Find user by email or phone
            let userResult;

            if (email) {
                userResult = await query<UserRow>(
                    'SELECT u.id, u.email, u.encrypted_password, p.full_name, p.phone, p.avatar_url, p.position_id, p.branch_id, p.team_id, p.company_id, p.is_active FROM auth_users u LEFT JOIN profiles p ON u.id = p.id WHERE u.email = $1',
                    [email]
                );
            } else if (phone) {
                // Search by phone in profiles
                // Normalize phone input: remove spaces, parens, dashes, etc.
                const cleanPhone = normalizePhone(phone);

                userResult = await query<UserRow>(
                    'SELECT u.id, u.email, u.encrypted_password, p.full_name, p.phone, p.avatar_url, p.position_id, p.branch_id, p.team_id, p.company_id, p.is_active FROM auth_users u LEFT JOIN profiles p ON u.id = p.id WHERE p.phone = $1',
                    [cleanPhone]
                );
            }

            if (!userResult || userResult.rows.length === 0) {
                res.status(401).json({ error: { message: 'Неверный логин или пароль' } });
                return;
            }

            const user = userResult.rows[0];

            if (!user.is_active || user.is_active === 0) {
                res.status(403).json({ error: { message: 'Аккаунт неактивен. Обратитесь к администратору' } });
                return;
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.encrypted_password);

            if (!isValidPassword) {
                // Log failed login attempt without PII
                console.warn('Failed login attempt', {
                    userId: user.id,
                    timestamp: new Date().toISOString()
                });
                res.status(401).json({ error: { message: 'Неверный логин или пароль' } });
                return;
            }

            // Position-based permissions (single source of truth)
            // We still return a computed `role` for frontend compatibility, but it is derived from position.access_level.
            const positionPermResult = await query<PositionPermissions>(
                `SELECT
                    pos.id,
                    pos.name,
                    COALESCE(pos.access_level, 0) as access_level,
                    COALESCE(pos.can_view_finances, 0) as can_view_finances,
                    COALESCE(pos.can_manage_finances, 0) as can_manage_finances,
                    COALESCE(pos.can_manage_branches, 0) as can_manage_branches,
                    COALESCE(pos.can_manage_users, 0) as can_manage_users
                 FROM positions pos
                 WHERE pos.id = $1`,
                [user.position_id]
            );

            const positionPerm = positionPermResult.rows[0] || null;
            const accessLevel = Number(positionPerm?.access_level || 0);
            const computedRole = accessLevel >= 100 ? 'admin' : accessLevel >= 90 ? 'director' : 'realtor';

            // Generate JWT
            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    role: computedRole, // compatibility
                    access_level: accessLevel,
                    can_view_finances: Number(positionPerm?.can_view_finances || 0),
                    can_manage_finances: Number(positionPerm?.can_manage_finances || 0),
                    can_manage_branches: Number(positionPerm?.can_manage_branches || 0),
                    can_manage_users: Number(positionPerm?.can_manage_users || 0),
                    position_id: user.position_id,
                    branch_id: user.branch_id,
                    team_id: user.team_id,
                    company_id: user.company_id  // Multi-tenant context
                },
                getJwtSecret(),
                { expiresIn: JWT_EXPIRES_IN } as SignOptions
            );

            // Return user data and token
            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    phone: user.phone,
                    avatar_url: user.avatar_url,
                    position_id: user.position_id,
                    branch_id: user.branch_id,
                    team_id: user.team_id,
                    role: computedRole,
                    access_level: accessLevel,
                    permissions: positionPerm ? {
                        can_view_finances: Number(positionPerm.can_view_finances || 0),
                        can_manage_finances: Number(positionPerm.can_manage_finances || 0),
                        can_manage_branches: Number(positionPerm.can_manage_branches || 0),
                        can_manage_users: Number(positionPerm.can_manage_users || 0),
                    } : {
                        can_view_finances: 0,
                        can_manage_finances: 0,
                        can_manage_branches: 0,
                        can_manage_users: 0,
                    },
                },
            });
        } catch (error: any) {
            require('fs').appendFileSync('auth_err.log', '[LOGIN ERROR] ' + (error.stack || error.message || String(error)) + '\n');
            console.error('Login error:', error);
            if (error.code === '23505') {
                // Duplicate key error
                res.status(409).json({ error: { message: 'Пользователь с таким email уже существует' } });
                return;
            }
            res.status(500).json({ error: { message: 'Ошибка сервера. Попробуйте позже' } });
        }
    }
);

// Get current user
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userResult = await query(
            `SELECT p.*, pos.name as position_name, b.name as branch_name, t.name as team_name
             FROM profiles p
             LEFT JOIN positions pos ON p.position_id = pos.id
             LEFT JOIN branches b ON p.branch_id = b.id
             LEFT JOIN teams t ON p.team_id = t.id
             WHERE p.id = $1`,
            [req.user!.id]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'User not found' } });
            return;
        }

        const row = userResult.rows[0];

        // Position-based permissions
        const positionPermResult = await query<PositionPermissions>(
            `SELECT
                pos.id,
                pos.name,
                COALESCE(pos.access_level, 0) as access_level,
                COALESCE(pos.can_view_finances, 0) as can_view_finances,
                COALESCE(pos.can_manage_finances, 0) as can_manage_finances,
                COALESCE(pos.can_manage_branches, 0) as can_manage_branches,
                COALESCE(pos.can_manage_users, 0) as can_manage_users
             FROM positions pos
             WHERE pos.id = $1`,
            [row.position_id]
        );

        const positionPerm = positionPermResult.rows[0] || null;
        const accessLevel = Number(positionPerm?.access_level || req.user!.access_level || 0);
        const computedRole = accessLevel >= 100 ? 'admin' : accessLevel >= 90 ? 'director' : 'realtor';

        res.json({
            ...row,
            role: computedRole, // compatibility
            access_level: accessLevel,
            permissions: positionPerm ? {
                can_view_finances: Number(positionPerm.can_view_finances || 0),
                can_manage_finances: Number(positionPerm.can_manage_finances || 0),
                can_manage_branches: Number(positionPerm.can_manage_branches || 0),
                can_manage_users: Number(positionPerm.can_manage_users || 0),
            } : {
                can_view_finances: Number(req.user!.can_view_finances || 0),
                can_manage_finances: Number(req.user!.can_manage_finances || 0),
                can_manage_branches: Number(req.user!.can_manage_branches || 0),
                can_manage_users: Number(req.user!.can_manage_users || 0),
            },
            position: row.position_id ? { id: row.position_id, name: row.position_name } : null,
            branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
            team: row.team_id ? { id: row.team_id, name: row.team_name } : null,
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
