import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

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

const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
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
            console.warn(`[AUTH] 403 Forbidden: Missing company_id for user_id=${decoded.id}, email=${decoded.email}. Token may be from an old version.`);
            res.status(403).json({ error: { message: 'Invalid token format. Please re-login.' } });
            return;
        }

        req.user = decoded;
        next();
    } catch (error: any) {
        console.warn(`[AUTH] 403 Forbidden: Invalid or expired token. Error: ${error.message}. IP: ${req.ip}, Path: ${req.originalUrl}`);
        res.status(403).json({ error: { message: 'Invalid or expired token' } });
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
