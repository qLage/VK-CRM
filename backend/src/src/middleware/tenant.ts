// Tenant context middleware for multi-tenant isolation
// This middleware validates that the authenticated user has a valid company_id
// and sets PostgreSQL session variable for Row-Level Security

import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/index';

const setTenantContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Validate company_id exists in JWT
    if (!req.user?.company_id) {
        res.status(403).json({
            error: { message: 'Missing tenant context. Please re-login.' }
        });
        return;
    }

    // Set PostgreSQL session variable for RLS
    // This must be set on EVERY request before any queries
    if (pool) {
        try {
            await pool.query(
                'SET LOCAL app.current_tenant_id = $1',
                [req.user.company_id]
            );
        } catch (error) {
            console.error('Failed to set tenant context:', error);
            res.status(500).json({
                error: { message: 'Failed to set tenant context' }
            });
            return;
        }
    }

    next();
};

export { setTenantContext };
