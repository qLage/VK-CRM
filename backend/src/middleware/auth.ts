import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { query } from '../db';

// Debounce map for session last_active updates (session_id -> last update timestamp)
const sessionLastUpdateMap = new Map<string, number>();
const SESSION_UPDATE_INTERVAL = 60_000; // 1 minute

// Lazy initialization - JWT_SECRET will be validated on first use
let JWT_SECRET: string | null = null;

function getJwtSecret(): string {
    if (JWT_SECRET) return JWT_SECRET;

    // Validate JWT_SECRET on first access
    if (!process.env.JWT_SECRET) {
        console.error('FATAL ERROR: JWT_SECRET environment variable is not set');
        console.error('Generate a strong secret with: openssl rand -base64 64');
        process.exit(1);
    }

    if (process.env.JWT_SECRET.length < 32) {
        console.error('FATAL ERROR: JWT_SECRET must be at least 32 characters long');
        console.error('Current length:', process.env.JWT_SECRET.length);
        console.error('Generate a strong secret with: openssl rand -base64 64');
        process.exit(1);
    }

    JWT_SECRET = process.env.JWT_SECRET;
    return JWT_SECRET;
}

interface JWTPayload {
    id: string;
    email: string;
    role: string;
    company_id: string;
    access_level?: number;
    [key: string]: any;
}

function deriveRoleFromLiveProfile(accessLevel: number, positionNameRaw: string): string {
    const positionName = String(positionNameRaw || '').toLowerCase();
    if (accessLevel >= 100) return 'admin';
    if (positionName.includes('коммерческ')) return 'commercial';
    if (positionName.includes('роп')) return 'head_sales';
    if (positionName.includes('моп')) return 'sales_manager';
    if (positionName.includes('ипотеч')) return 'mortgage_broker';
    if (positionName.includes('директор') || accessLevel >= 90) return 'director';
    return 'realtor';
}

const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let authHeader = req.headers.authorization;
    let token = '';

    if (authHeader) {
        // Support both "Bearer <token>" and just "<token>"
        token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : authHeader;
    } else if (req.query.token && (req.path === '/stream' || req.path.endsWith('/notifications/stream'))) {
        // SECURITY: Only allow token in query params for SSE (Server-Sent Events) endpoint
        // EventSource API doesn't support custom headers, so query param is necessary
        // Works with both relative (/stream) and absolute (/api/notifications/stream) paths
        // WARNING: Tokens in URLs are logged by proxies/browsers/servers
        // Mitigation: SSE tokens should be short-lived (consider separate token type)
        token = req.query.token as string;
    }

    if (!token) {
        res.status(401).json({ error: { message: 'No authorization header or token' } });
        return;
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;

        // Validate company_id exists in token (multi-tenant requirement)
        if (!decoded.company_id) {
            console.warn(`[AUTH] 401 Unauthorized: Missing company_id for user_id=${decoded.id}, email=${decoded.email}. Token may be from an old version.`);
            res.status(401).json({ error: { message: 'Invalid token format. Please re-login.', code: 'TOKEN_LEGACY' } });
            return;
        }

        req.user = {
            ...decoded,
            full_name: decoded.full_name || '',
        };

        // Session validity check (Telegram-like behavior):
        // token is valid only while its concrete session exists in DB.
        if (decoded.session_id) {
            try {
                const sessRes = await query(
                    'SELECT id FROM user_sessions WHERE id = $1 AND user_id = $2 LIMIT 1',
                    [decoded.session_id, decoded.id]
                );
                if (!sessRes.rows[0]) {
                    res.status(401).json({ error: { message: 'Session not found or revoked', code: 'SESSION_REVOKED' } });
                    return;
                }
            } catch (sessErr: any) {
                // Avoid accidental logout on transient DB glitches during deploy.
                console.warn('[AUTH] Session check failed, fallback to token:', sessErr?.message || sessErr);
            }
        }

        // Always refresh access scope from DB so role/permissions update immediately
        // after employee position changes (without forcing re-login).
        try {
            const liveUserRes = await query(
                `SELECT
                    p.id,
                    p.company_id,
                    p.branch_id,
                    p.team_id,
                    p.position_id,
                    p.full_name,
                    COALESCE(pos.name, '') as position_name,
                    COALESCE(pos.access_level, 0) as access_level,
                    COALESCE(pos.can_view_finances, 0) as can_view_finances,
                    COALESCE(pos.can_manage_finances, 0) as can_manage_finances,
                    COALESCE(pos.can_manage_branches, 0) as can_manage_branches,
                    COALESCE(pos.can_manage_users, 0) as can_manage_users
                 FROM profiles p
                 LEFT JOIN positions pos ON p.position_id = pos.id
                 WHERE p.id = $1
                 LIMIT 1`,
                [decoded.id]
            );

            const live = liveUserRes.rows[0];
            if (live) {
                // Enforce tenant consistency.
                if (String(live.company_id || '') !== String(decoded.company_id || '')) {
                    res.status(401).json({ error: { message: 'Invalid tenant context', code: 'TOKEN_TENANT_MISMATCH' } });
                    return;
                }

                const liveAccess = Number(live.access_level || 0);
                const liveRole = deriveRoleFromLiveProfile(liveAccess, String(live.position_name || ''));
                req.user = {
                    ...decoded,
                    role: liveRole,
                    access_level: liveAccess,
                    full_name: live.full_name || '',
                    can_view_finances: Number(live.can_view_finances || 0),
                    can_manage_finances: Number(live.can_manage_finances || 0),
                    can_manage_branches: Number(live.can_manage_branches || 0),
                    can_manage_users: Number(live.can_manage_users || 0),
                    branch_id: live.branch_id,
                    team_id: live.team_id,
                    position_id: live.position_id,
                    company_id: live.company_id,
                };
            }
        } catch (liveErr: any) {
            // Fallback to JWT payload if DB refresh fails.
            console.warn('[AUTH] Live permission refresh failed, fallback to token:', liveErr?.message || liveErr);
            req.user = {
                ...decoded,
                full_name: decoded.full_name || '',
            };
        }

        // Update session last_active (debounced)
        if (decoded.session_id) {
            const now = Date.now();
            const lastUpdate = sessionLastUpdateMap.get(decoded.session_id) || 0;
            if (now - lastUpdate > SESSION_UPDATE_INTERVAL) {
                sessionLastUpdateMap.set(decoded.session_id, now);
                query(
                    'UPDATE user_sessions SET last_active = NOW(), is_current = true WHERE id = $1 AND user_id = $2',
                    [decoded.session_id, decoded.id]
                ).catch(() => {});
            }
        }

        next();
    } catch (error: any) {
        // Expired or malformed JWT means the user is not authenticated → 401.
        // 403 is reserved for "authenticated but not allowed".
        const isExpired = error?.name === 'TokenExpiredError';
        console.warn(`[AUTH] 401 Unauthorized: ${isExpired ? 'expired' : 'invalid'} token. Error: ${error.message}. IP: ${req.ip}, Path: ${req.originalUrl}`);
        res.status(401).json({ error: { message: isExpired ? 'Token expired' : 'Invalid token', code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' } });
    }
};

const requireAccessLevel = (minLevel: number) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: { message: 'Unauthorized' } });
            return;
        }

        const level = Number(req.user.access_level || 0);
        console.log(`[AUTH] requireAccessLevel check: user=${req.user.email}, access_level=${level}, required=${minLevel}, pass=${level >= minLevel}`);
        if (level >= minLevel) {
            next();
            return;
        }

        res.status(403).json({ error: { message: 'Доступ запрещен' } });
    };
};

const requirePermission = (permissionKey: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: { message: 'Unauthorized' } });
            return;
        }

        // permissions are encoded as numeric 0/1 in JWT
        const val = Number(req.user[permissionKey] || 0);
        if (val === 1) {
            next();
            return;
        }

        res.status(403).json({ error: { message: 'Доступ запрещен' } });
    };
};

// Compatibility wrapper: old routes call requireRole(['admin','director']).
// We now authorize based on position-derived access_level, not user_roles.
const requireRole = (roles: string | string[]) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    // Map classic roles to levels.
    // admin => 100, director => 90, manager => 50
    let minLevel = 0;
    if (allowedRoles.includes('admin')) minLevel = Math.max(minLevel, 100);
    if (allowedRoles.includes('director')) minLevel = Math.max(minLevel, 90);
    if (allowedRoles.includes('manager')) minLevel = Math.max(minLevel, 50);

    if (minLevel > 0) return requireAccessLevel(minLevel);

    // Fallback to token role for non-management roles while we migrate the rest of the UI.
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: { message: 'Unauthorized' } });
            return;
        }
        const currentRole = req.user.role;
        if (allowedRoles.includes(currentRole)) {
            next();
            return;
        }
        res.status(403).json({ error: { message: 'Доступ запрещен' } });
    };
};

export { authenticateToken, requireRole, requireAccessLevel, requirePermission, getJwtSecret };
