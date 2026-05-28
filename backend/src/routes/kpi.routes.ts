import express, { Request, Response, Router } from 'express';
// KPI routes - uses kpi.service.js (JavaScript)
// Note: Full TypeScript conversion deferred to Plan 02-02
// Service layer (deal.service.ts, team.service.ts) ready for migration
import kpiService from '../services/kpi.service';
import aggregationService from '../services/aggregation.service';
import { authenticateToken as auth } from '../middleware/auth';
import { query } from '../db';
import { cacheMiddleware, invalidateCacheMiddleware, cacheControlHeaders } from '../middleware/cache.middleware';
import { getCachedStats, setCachedStats } from '../services/dashboardCache';

const router: Router = express.Router();
const BRANCH_SCOPED_ROLES = ['sales_manager', 'head_sales', 'commercial'];

const KPI_MY_STATS_CACHE = 'kpi_my_stats_v17';

/** Same position→role mapping as /my-dual-stats; avoids 400 when JWT has legacy `manager` or auth refresh failed */
async function resolveRoleForMyKpi(userId: string, tokenRole: string): Promise<string> {
    let role = tokenRole === 'admin' ? 'director' : tokenRole;
    try {
        const userRes = await query(
            `SELECT pos.name as position_name
             FROM profiles p
             LEFT JOIN positions pos ON p.position_id = pos.id
             WHERE p.id = $1`,
            [userId]
        );
        if (userRes.rows.length > 0) {
            const positionName = userRes.rows[0]?.position_name || '';
            const posName = String(positionName).toLowerCase();
            if (posName.includes('моп')) role = 'sales_manager';
            else if (posName.includes('роп')) role = 'head_sales';
            else if (posName.includes('директор')) role = 'director';
            else if (posName.includes('коммерческ')) role = 'commercial';
            else if (posName.includes('ипотечн')) role = 'mortgage_broker';
            else if (posName.includes('риел') || posName.includes('риэл')) role = 'realtor';
        }
    } catch (e) {
        console.warn('[KPI /my-stats] Position role resolve failed:', e);
    }
    const allowed = ['realtor', 'mortgage_broker', 'sales_manager', 'head_sales', 'commercial', 'director'];
    if (!allowed.includes(role)) {
        return 'realtor';
    }
    return role;
}

// Cache strategy: HTTP-level caching (middleware) + service-level caching (kpi.service)
// Middleware caches HTTP responses, service caches calculation results
// Both invalidate automatically when materialized views refresh

// Calculate My KPI
router.get('/my-stats', auth, cacheMiddleware({ ttl: 0 }), cacheControlHeaders(0), async (req: Request, res: Response): Promise<void> => {
    try {
        const { start, end, period = 'month' } = req.query;
        const userId = (req.user as any).id;
        let role = await resolveRoleForMyKpi(userId, (req.user as any).role);
        const userBranchId = (req.user as any).branch_id;

        let startDate = start as string;
        let endDate = end as string;

        if (!startDate) {
            const now = new Date();
            if (period === 'quarter') {
                const currentQuarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString();
                endDate = endDate || now.toISOString();
            } else {
                // Use current month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                endDate = endDate || now.toISOString();
            }
        } else {
            endDate = endDate || new Date().toISOString();
        }


        const rawBranchId = req.query.branch_id as string | undefined;
        const requestedBranchId = (!rawBranchId || rawBranchId === 'null' || rawBranchId === 'undefined') ? undefined : rawBranchId;
        const effectiveBranchId = BRANCH_SCOPED_ROLES.includes(role) ? (userBranchId || undefined) : requestedBranchId;

        // Check cache first
        const cached = await getCachedStats(userId, KPI_MY_STATS_CACHE, period as string, effectiveBranchId);
        if (cached) {
            res.json(cached);
            return;
        }

        let result: any = {};

        if (role === 'realtor' || role === 'mortgage_broker') {
            result = await kpiService.calculateRealtorKPI(userId, startDate, endDate, period as string, role as string);
        } else if (role === 'sales_manager') {
            result = await kpiService.calculateTeamKPI(userId, startDate, endDate, period as string);
        } else if (role === 'head_sales' || role === 'commercial' || role === 'director') {
            const branchForCalc = BRANCH_SCOPED_ROLES.includes(role)
                ? (userBranchId || undefined)
                : (effectiveBranchId || 'all');
            result = await kpiService.calculateBranchKPI(userId, startDate, endDate, period as string, branchForCalc as any);
        } else {
            res.status(400).json({ error: { message: 'KPI not available for this role' } });
            return;
        }

        // Store in cache
        await setCachedStats(userId, KPI_MY_STATS_CACHE, result, period as string, effectiveBranchId);

        res.json(result);
    } catch (error: any) {
        console.error('[KPI API] My Stats Error:', {
            userId: (req.user as any).id,
            role: (req.user as any).role,
            query: req.query,
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: { message: error.message, details: error.stack } });
    }
});

// Calculate Dual KPI for management roles
router.get('/my-dual-stats', auth, cacheMiddleware({ ttl: 0 }), (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    next();
}, async (req: Request, res: Response): Promise<void> => {
    try {
        const { start, end, period = 'month', branch_id } = req.query;
        const userId = (req.user as any).id;
        const userBranchId = (req.user as any).branch_id;

        // Cache key uses effective branch
        const requestedBranchId = (!branch_id || branch_id === 'null' || branch_id === 'undefined') ? undefined : branch_id as string;
        const effectiveBranchId = BRANCH_SCOPED_ROLES.includes((req.user as any).role) ? (userBranchId || undefined) : requestedBranchId;
        const cached = await getCachedStats(userId, 'kpi_dual_stats_v15', period as string, effectiveBranchId);
        if (cached) {
            res.json(cached);
            return;
        }

        const userRes = await query(
            `SELECT pos.name as position_name
             FROM profiles p
             LEFT JOIN positions pos ON p.position_id = pos.id
             WHERE p.id = $1`,
            [userId]
        );

        // role is derived from position name
        let role = (req.user as any).role === 'admin' ? 'director' : (req.user as any).role;
        if (userRes.rows.length > 0) {
            const positionName = userRes.rows[0]?.position_name || '';
            const posName = positionName.toLowerCase();
            console.log(`[KPI /my-dual-stats] User ${userId} position: "${positionName}"`);
            if (posName.includes('моп')) role = 'sales_manager';
            else if (posName.includes('роп')) role = 'head_sales';
            else if (posName.includes('директор')) role = 'director';
            else if (posName.includes('коммерческ')) role = 'commercial';
            else if (posName.includes('ипотечн')) role = 'mortgage_broker';
            console.log(`[KPI /my-dual-stats] Derived role: ${role}`);
        }

        let startDate = start as string;
        let endDate = end as string;

        if (!startDate) {
            const now = new Date();
            if (period === 'quarter') {
                const currentQuarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString();
                endDate = endDate || new Date().toISOString();
            } else {
                // Use current month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                endDate = endDate || new Date().toISOString();
            }
        } else {
            endDate = endDate || new Date().toISOString();
        }

        const branchForCalc = BRANCH_SCOPED_ROLES.includes(role) ? (userBranchId || undefined) : effectiveBranchId;
        const result = await kpiService.calculateDualKPI(userId, role, startDate, endDate, period as string, branchForCalc as string | undefined);

        // Store in cache
        await setCachedStats(userId, 'kpi_dual_stats_v15', result, period as string, effectiveBranchId);

        console.log('[KPI /my-dual-stats] Result:', JSON.stringify(result, null, 2));
        res.json(result);
    } catch (error: any) {
        console.error('Dual KPI Error:', error);
        res.status(500).json({ error: { message: error.message, details: error.stack } });
    }
});

// Leaderboard
router.get('/leaderboard', auth, cacheMiddleware({ ttl: 60 }), cacheControlHeaders(60), async (req: Request, res: Response): Promise<void> => {
    try {
        const { start, end, branch, team } = req.query;
        const role = (req.user as any).role === 'admin' ? 'director' : (req.user as any).role;
        const userBranchId = (req.user as any).branch_id;

        // Default to latest period with data
        let startDate = start as string;
        let endDate = end as string;

        if (!startDate) {
            const now = new Date();
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            endDate = endDate || new Date().toISOString();
        } else {
            endDate = endDate || new Date().toISOString();
        }

        const branchForCalc = BRANCH_SCOPED_ROLES.includes(role) ? (userBranchId || undefined) : ((branch || undefined) as any);
        const data = await kpiService.getLeaderboard(startDate, endDate, branchForCalc, (team || undefined) as any);

        // Debug logging for all-time queries
        if (startDate === 'all') {
            console.log(`[Leaderboard API] All-time request: returning ${data?.length || 0} users`);
            if (data && data.length > 0) {
                console.log(`[Leaderboard API] First user:`, JSON.stringify(data[0], null, 2));
            } else {
                console.log(`[Leaderboard API] Empty result - branch: ${branch}, team: ${team}`);
            }
        }

        res.json(data);
    } catch (error: any) {
        console.error('Leaderboard Error:', error);
        res.status(500).json({ error: { message: error.message, details: error.stack } });
    }
});

// Dashboard Stats
router.get('/dashboard-stats', auth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { start, end, period = 'month', branch_id } = req.query;

        let startDate = start as string;
        let endDate = end as string;

        if (!startDate) {
            const now = new Date();
            if (period === 'quarter') {
                const currentQuarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString();
                endDate = endDate || new Date().toISOString();
            } else {
                // Use current month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                endDate = endDate || new Date().toISOString();
            }
        } else {
            endDate = endDate || new Date().toISOString();
        }

        const effectiveRole = (req.user as any).role === 'admin' ? 'director' : (req.user as any).role;
        const userBranchId = (req.user as any).branch_id;
        const effectiveBranchId = BRANCH_SCOPED_ROLES.includes(effectiveRole) ? (userBranchId || undefined) : ((branch_id || undefined) as any);

        // Check cache first
        const cached = await getCachedStats((req.user as any).id, 'kpi_dashboard_stats_v16', period as string, effectiveBranchId as string | undefined);
        if (cached) {
            res.json(cached);
            return;
        }

        const stats = await kpiService.getDashboardStats((req.user as any).id, effectiveRole, startDate, endDate, effectiveBranchId as any);

        // Store in cache
        await setCachedStats((req.user as any).id, 'kpi_dashboard_stats_v16', stats, period as string, effectiveBranchId as string | undefined);

        res.json(stats);
    } catch (error: any) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ error: { message: error.message, details: error.stack } });
    }
});

// Admin/Director/Self: Get Stats for any user
router.get('/user/:userId/dual-stats', auth, cacheMiddleware({ ttl: 300 }), (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    next();
}, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId as string;
        const { start, end, period = 'month' } = req.query;
        const currentUserId = (req.user as any).id;
        const viewerRole = (req.user as any).role === 'admin' ? 'director' : (req.user as any).role;
        const viewerBranchId = (req.user as any).branch_id;
        const isBranchScopedViewer = BRANCH_SCOPED_ROLES.includes(viewerRole);

        // Permission check: management can see anyone, others only themselves
        const canSeeOthers = Number((req.user as any).access_level || 0) >= 90;
        if (!canSeeOthers && userId !== currentUserId) {
            res.status(403).json({ error: { message: 'Forbidden' } });
            return;
        }

        const userRes = await query(
            `SELECT p.branch_id, pos.name as position_name
             FROM profiles p
             LEFT JOIN positions pos ON p.position_id = pos.id
             WHERE p.id = $1`,
            [userId]
        );

        if (userRes.rows.length === 0) {
            res.status(404).json({ error: { message: 'User not found' } });
            return;
        }

        const targetUser = userRes.rows[0];
        const branchId = targetUser.branch_id;
        if (isBranchScopedViewer && String(branchId || '') !== String(viewerBranchId || '')) {
            res.status(403).json({ error: { message: 'Forbidden: cross-branch access denied' } });
            return;
        }

        // Derive KPI role from position name
        let role = (req.user as any).role === 'admin' ? 'director' : 'realtor';
        if (targetUser.position_name) {
            const posName = targetUser.position_name.toLowerCase();
            if (posName.includes('моп')) role = 'sales_manager';
            else if (posName.includes('роп')) role = 'head_sales';
            else if (posName.includes('директор')) role = 'director';
            else if (posName.includes('коммерческ')) role = 'commercial';
        }

        // Fallback to token role if we couldn't infer (should be rare)
        if (!role) role = (req.user as any).role || 'realtor';

        // Permission check already done above

        // For branch-level KPI, keep branch scope


        let startDate = start as string;
        let endDate = end as string;

        if (!startDate) {
            const now = new Date();
            if (period === 'quarter') {
                const currentQuarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString();
                endDate = endDate || now.toISOString();
            } else {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                endDate = endDate || now.toISOString();
            }
        } else {
            endDate = endDate || new Date().toISOString();
        }

        const result = await kpiService.calculateDualKPI(userId, role, startDate, endDate, period as string, branchId);
        res.json(result);
    } catch (error: any) {
        console.error('User Dual KPI Error:', error);
        res.status(500).json({ error: { message: error.message, details: error.stack } });
    }
});

// Trigger management KPI recalculation
router.post('/refresh-management-kpi', auth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const { updateManagementKpi } = require('../services/kpiAutoUpdate');
        const result = await updateManagementKpi();
        res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('Refresh Management KPI Error:', error);
        res.status(500).json({ error: { message: error.message } });
    }
});

// Refresh materialized views (Plan 02-03)
// Admin/Director only - triggers manual refresh of all KPI materialized views
router.post('/refresh-views', auth, invalidateCacheMiddleware(), async (req: Request, res: Response): Promise<void> => {
    try {
        // Check authorization - only admin or commercial_director can refresh views
        const userRole = (req.user as any).role;
        if (userRole !== 'admin' && userRole !== 'commercial' && userRole !== 'director') {
            res.status(403).json({ error: { message: 'Unauthorized: Only admins and directors can refresh materialized views' } });
            return;
        }

        const startTime = Date.now();
        console.log('[KPI] Manual materialized view refresh requested by:', (req.user as any).id);

        // Refresh all materialized views
        await aggregationService.refreshViews();

        // Get last refresh time
        const lastRefresh = await aggregationService.getLastRefreshTime();

        const duration = Date.now() - startTime;

        res.json({
            success: true,
            duration_ms: duration,
            last_refresh: lastRefresh,
            message: 'Materialized views refreshed successfully'
        });
    } catch (error: any) {
        console.error('Refresh Views Error:', error);
        res.status(500).json({ error: { message: error.message } });
    }
});

export default router;
