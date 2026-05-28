import express, { Request, Response, Router } from 'express';
import cacheService from '../lib/cache.service';
import { query } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { normalizePhone } from '../utils/phone';
import bcrypt from 'bcryptjs';
import { getLatestPeriodWithData, getPeriodDates } from '../utils/periodHelper';
import {
    getSingleEmployeeStats,
    getEmployeeStatsForPeriod,
    getEmployeeActivityFeed,
    getEmployeeMonthlyTrends
} from '../services/employeeStatsOptimized';
import { emitKpiEvent, emitProfileEvent } from '../services/realtime-broadcaster.service';
import { pushAvitoFeedAfterOwnerContactChange } from '../services/avito.service';
import { logAudit } from '../utils/audit';

const router: Router = express.Router();

const isPostgresDb = !process.env.DB_PATH && !!process.env.DATABASE_URL;
const ALLOWED_EMERGENCY_RELATIONS = new Set(['relative', 'friend', 'acquaintance']);

/** PATCH fields that non-management users may not change even for their own profile */
const SELF_NON_MANAGEMENT_EXTRA_INFO_KEYS = [
    'passport_series_number',
    'extra_phone',
    'emergency_contacts',
    'passport_address',
    'residential_address',
] as const;

function parseEmergencyContactsFromDb(value: unknown): any[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function sanitizeEmergencyContacts(input: unknown): any[] {
    if (input === null) return [];
    if (!Array.isArray(input)) {
        throw new Error('INVALID_EMERGENCY_CONTACTS');
    }
    const out: any[] = [];
    for (const item of input) {
        const fullName = String((item as any)?.fullName || '').trim().slice(0, 200);
        const phoneRaw = (item as any)?.phone;
        const phone = phoneRaw ? normalizePhone(String(phoneRaw)) : '';
        let relation = String((item as any)?.relation || 'relative');
        if (!ALLOWED_EMERGENCY_RELATIONS.has(relation)) relation = 'relative';
        if (!fullName && !phone) continue;
        out.push({ fullName, phone, relation });
    }
    return out;
}

// 1. Static/Specific Routes FIRST (to prevent collision with /:id)

// Get employee stats (deals, objects, meetings, etc.)
router.get('/:id/stats', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        // kpi.service.js mixes CJS + ESM exports, so the bundled require can return
        // either the instance directly or { default: instance }. Handle both.
        const kpiServiceMod = require('../services/kpi.service');
        const kpiService = kpiServiceMod?.default || kpiServiceMod;
        const { startOfMonth, endOfMonth, parseISO } = require('date-fns');

        // Use query params for period or default to current month
        const now = new Date();
        const start = req.query.start ? parseISO(req.query.start as string) : startOfMonth(now);
        const end = req.query.end ? parseISO(req.query.end as string) : endOfMonth(now);

        // Adjust for UTC/Local offset (12 hours) to ensure correct year/month
        const adjStart = new Date(start.getTime() + 12 * 60 * 60 * 1000);
        const adjEnd = new Date(end.getTime() - 12 * 60 * 60 * 1000); // Step back for end of month

        const stats = await kpiService.getUserActions(id, start, end);

        // Use period aggregation instead of single month
        const employeeStats = await getEmployeeStatsForPeriod(
            id, 
            adjStart.getUTCFullYear(), 
            adjStart.getUTCMonth() + 1,
            adjEnd.getUTCFullYear(),
            adjEnd.getUTCMonth() + 1
        );

        if (!employeeStats) {
            res.status(404).json({ error: { message: 'Employee not found' } });
            return;
        }

        // If period is requested, prioritize actual period stats over manual custom overrides
        const isPeriodRequest = req.query.start && req.query.end;

        res.json({
            deals: stats.deals || 0,
            deposits: stats.deposits || 0,
            listings: stats.takes || 0,
            meetings: stats.meetings || 0,
            showings: stats.showings || 0,
            // Stats from optimized query
            custom_deals: isPeriodRequest ? employeeStats.current_deal_count : (employeeStats.custom_total_deals || employeeStats.current_deal_count || 0),
            custom_objects: isPeriodRequest ? employeeStats.current_deal_count : (employeeStats.custom_total_objects || employeeStats.current_deal_count || 0),
            custom_revenue: isPeriodRequest ? employeeStats.current_revenue : (employeeStats.custom_total_revenue || employeeStats.current_revenue || 0),
            mop_revenue: employeeStats.current_mop_revenue || 0,
            rop_payout: employeeStats.current_rop_payout || 0,
            mortgage_deduction: employeeStats.current_mortgage_deduction || 0,
            other_expenses: employeeStats.current_other_expenses || 0
        });
    } catch (error: any) {
        console.error('Get employee stats error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

/**
 * GET /:id/profile-stats
 * Aggregated stats for employee profile main widget.
 * Query: period = 'all' | 'quarter' | 'month' (default: month)
 *
 * Returns:
 *   - totalRevenue: gross revenue (from approved reports of revenue types) for the selected period
 *   - propertiesInSale: count of properties owned with status 'approved'/active (current snapshot)
 *   - propertiesTotal: total count of properties created by user (all time, current snapshot)
 *   - deposits: count of deposit reports (служебка задаток) for period
 *   - showings: count of showing reports (показы) for period
 *   - dailyCalls: sum of calls_in + calls_out from daily reports for period
 */
router.get('/:id/profile-stats', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const period = (req.query.period as string) || 'month';

        // Build date range
        const now = new Date();
        let start: Date;
        if (period === 'all') {
            start = new Date(2000, 0, 1);
        } else if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), q * 3, 1);
        } else {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        const startISO = start.toISOString();
        const endISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        // 1. Revenue: from approved reports of revenue types (deal/sale/purchase/booking/deposit)
        //    Pull amount from reports.amount or reports.content->>'amount'
        //    Note: reports.content may be TEXT or JSONB depending on environment.
        const revenueSql = `
            SELECT COALESCE(SUM(
                COALESCE(NULLIF(amount::text, '')::numeric,
                         NULLIF((content::jsonb->>'amount'), '')::numeric,
                         NULLIF((content::jsonb->>'commission'), '')::numeric,
                         0)
            ), 0)::float as total
            FROM reports
            WHERE user_id = $1
              AND status = 'approved'
              AND type IN ('deal', 'sale', 'purchase', 'booking', 'booking_new', 'deal_new_after', 'deposit', 'prepayment')
              AND created_at::timestamptz >= $2::timestamptz AND created_at::timestamptz <= $3::timestamptz
        `;
        const revenueRes = await query(revenueSql, [id, startISO, endISO]);
        const totalRevenue = Number(revenueRes.rows[0]?.total || 0);

        // 2. Properties counts (current snapshot, not period-bound)
        const propsSql = `
            SELECT
              COUNT(*) FILTER (WHERE status IN ('approved', 'avito_approved', 'published_avito', 'in_feed'))::int AS in_sale,
              COUNT(*)::int AS total
            FROM properties
            WHERE owner_id = $1
        `;
        const propsRes = await query(propsSql, [id]);
        const propertiesInSale = propsRes.rows[0]?.in_sale || 0;
        const propertiesTotal = propsRes.rows[0]?.total || 0;

        // 3. Deposits + showings from service_requests for period
        const actionsSql = `
            SELECT
              COUNT(*) FILTER (WHERE type IN ('deposit', 'prepayment'))::int AS deposits,
              COUNT(*) FILTER (WHERE type = 'showing')::int AS showings
            FROM service_requests
            WHERE user_id = $1 AND created_at::timestamptz BETWEEN $2::timestamptz AND $3::timestamptz
        `;
        const actionsRes = await query(actionsSql, [id, startISO, endISO]);
        const deposits = actionsRes.rows[0]?.deposits || 0;
        const showings = actionsRes.rows[0]?.showings || 0;

        // 4. Daily calls (calls_in + calls_out) from daily reports
        const callsSql = `
            SELECT COALESCE(SUM(
                COALESCE(NULLIF(content::jsonb->>'calls_in', '')::numeric, 0) +
                COALESCE(NULLIF(content::jsonb->>'calls_out', '')::numeric, 0)
            ), 0)::int AS total
            FROM reports
            WHERE user_id = $1
              AND type = 'daily'
              AND created_at::timestamptz BETWEEN $2::timestamptz AND $3::timestamptz
        `;
        const callsRes = await query(callsSql, [id, startISO, endISO]);
        const dailyCalls = callsRes.rows[0]?.total || 0;

        res.json({
            period,
            totalRevenue,
            propertiesInSale,
            propertiesTotal,
            deposits,
            showings,
            dailyCalls,
        });
    } catch (error: any) {
        console.error('Get employee profile-stats error:', error);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

/**
 * GET /:id/calls-stats
 * Daily calls statistics from daily reports for "Звонки" widget.
 * Query: period = 'week' | 'month' | 'quarter' (default: month)
 *
 * Returns per-day counts and aggregate conversion KPIs:
 *   - series: [{ date, in, out, total, meetings }]
 *   - totals: { in, out, total, meetings, days }
 *   - conversion: meetings / total calls (%)
 */
router.get('/:id/calls-stats', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const period = (req.query.period as string) || 'month';

        const now = new Date();
        let start: Date;
        if (period === 'week') {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        } else if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), q * 3, 1);
        } else {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        const startISO = start.toISOString();
        const endISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        const sql = `
            SELECT
              DATE_TRUNC('day', created_at::timestamptz)::date AS day,
              COALESCE(SUM(NULLIF(content::jsonb->>'calls_in', '')::numeric), 0)::int AS calls_in,
              COALESCE(SUM(NULLIF(content::jsonb->>'calls_out', '')::numeric), 0)::int AS calls_out,
              COALESCE(SUM(NULLIF(content::jsonb->>'meetings_fact', '')::numeric), 0)::int AS meetings
            FROM reports
            WHERE user_id = $1
              AND type = 'daily'
              AND created_at::timestamptz BETWEEN $2::timestamptz AND $3::timestamptz
            GROUP BY day
            ORDER BY day ASC
        `;
        const r = await query(sql, [id, startISO, endISO]);

        const series = r.rows.map((row: any) => ({
            date: typeof row.day === 'string' ? row.day : row.day.toISOString().slice(0, 10),
            in: Number(row.calls_in) || 0,
            out: Number(row.calls_out) || 0,
            total: (Number(row.calls_in) || 0) + (Number(row.calls_out) || 0),
            meetings: Number(row.meetings) || 0,
        }));

        const totals = series.reduce(
            (a: any, x: any) => ({
                in: a.in + x.in,
                out: a.out + x.out,
                total: a.total + x.total,
                meetings: a.meetings + x.meetings,
                days: a.days + (x.total > 0 ? 1 : 0),
            }),
            { in: 0, out: 0, total: 0, meetings: 0, days: 0 }
        );

        const conversion = totals.total > 0 ? (totals.meetings / totals.total) * 100 : 0;
        const avgPerDay = totals.days > 0 ? Math.round(totals.total / totals.days) : 0;
        const bestDay = series.reduce((b: any, x: any) => (x.total > (b?.total || 0) ? x : b), null);

        res.json({
            period,
            series,
            totals,
            conversion: Number(conversion.toFixed(1)),
            avgPerDay,
            bestDay,
        });
    } catch (error: any) {
        console.error('Get employee calls-stats error:', error);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

// Get employee activity feed (optimized with indexed query)
router.get('/:id/activity-feed', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const limit = parseInt(req.query.limit as string) || 15;

        // Check if service_requests table exists, if not skip
        let srResult: any = { rows: [] };
        try {
            srResult = await query(
                `SELECT id, type, title, description, created_at as timestamp, data as metadata
                 FROM service_requests
                 WHERE user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [id, limit]
            );
        } catch (srError) {
            console.log('service_requests table not found or error, using fallback');
        }

        if (srResult.rows && srResult.rows.length > 0) {
            const activities = srResult.rows.map((row: any) => {
                let metadata = null;
                if (row.metadata) {
                    try { metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata; }
                    catch (e) { metadata = null; }
                }
                return { id: row.id, type: row.type, title: row.title, description: row.description, timestamp: row.timestamp, metadata };
            });
            res.json(activities);
            return;
        }

        // Use optimized activity feed query
        const activities = await getEmployeeActivityFeed(id, limit);
        res.json(activities);
    } catch (error: any) {
        console.error('Get employee activity feed error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

// Get employee monthly trends (optimized with window functions)
router.get('/:id/monthly-trends', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const months = parseInt(req.query.months as string) || 12;

        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

        // Use optimized query with window functions
        const trendsData = await getEmployeeMonthlyTrends(id, months);

        // Get plan targets for efficiency calculation
        const planRes = await query(
            `SELECT period_month, target_revenue FROM user_plans WHERE user_id = $1`,
            [id]
        );
        const planMap: Record<string, number> = {};
        planRes.rows.forEach((r: any) => {
            planMap[r.period_month] = parseFloat(r.target_revenue) || 0;
        });

        const trends = trendsData.map((row: any) => {
            const planKey = `${row.year}-${String(row.month).padStart(2, '0')}`;
            const planRevenue = planMap[planKey] || 0;
            const efficiency = planRevenue > 0
                ? Math.min(100, Math.round((row.revenue / planRevenue) * 100))
                : (row.deal_count > 0 ? Math.min(100, row.deal_count * 10) : 0);

            return {
                month: monthNames[row.month - 1],
                efficiency,
                deals: parseInt(row.deal_count) || 0,
                revenue: parseFloat(row.revenue) || 0
            };
        });

        res.json(trends);
    } catch (error: any) {
        console.error('Get employee monthly trends error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

// Get employee daily activity heatmap (from deal_table_rows)
router.get('/:id/daily-activity', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const days = parseInt(req.query.days as string) || 7;

        if (days < 1 || days > 365) {
            res.status(400).json({ error: { message: 'Days parameter must be between 1 and 365' } });
            return;
        }

        // Initialize 2D array [days][24 hours]
        const heatmapData = Array(days).fill(null).map(() => Array(24).fill(0));

        // Get agent name
        const profileRes = await query('SELECT full_name FROM profiles WHERE id = $1', [id]);
        if (!profileRes.rows?.length) {
            res.json(heatmapData);
            return;
        }
        const agentName = profileRes.rows[0]?.full_name;
        if (!agentName) {
            console.warn(`No agent name found for employee ${id}`);
            res.json(heatmapData);
            return;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get deals from deal_table_rows with created_at timestamp
        const result = await query(
            `SELECT
                DATE_TRUNC('day', created_at::timestamp) as day,
                EXTRACT(HOUR FROM created_at::timestamp) as hour,
                COUNT(*) as activity_count
             FROM deal_table_rows
             WHERE agent_name = $1 AND created_at >= $2 AND created_at <= $3 AND status IN ('approved', 'active')
             GROUP BY DATE_TRUNC('day', created_at::timestamp), EXTRACT(HOUR FROM created_at::timestamp)
             ORDER BY day ASC, hour ASC`,
            [agentName, startDate.toISOString(), endDate.toISOString()]
        );

        if (!result.rows.length) {
            // Fallback: spread deals evenly across months using year/month fields
            // Show synthetic activity based on how many deals per month
            const monthResult = await query(
                `SELECT year, month, COUNT(*) as cnt FROM deal_table_rows WHERE agent_name = $1 AND status IN ('approved', 'active') GROUP BY year, month`,
                [agentName]
            );
            if (monthResult.rows.length > 0) {
                // Put synthetic activity in working hours (9-18) spread across weekdays
                const totalDeals = monthResult.rows.reduce((s: number, r: any) => s + (parseInt(r.cnt) || 0), 0);
                const dealsPerDay = Math.max(1, Math.round(totalDeals / days));
                for (let d = 0; d < days; d++) {
                    const dow = new Date(startDate.getTime() + d * 86400000).getDay();
                    if (dow >= 1 && dow <= 5) { // weekdays only
                        const hour = 9 + (d % 9); // 9–17
                        heatmapData[d][hour] = dealsPerDay;
                    }
                }
            }
            res.json(heatmapData);
            return;
        }

        result.rows.forEach((row: any) => {
            try {
                if (!row.day || row.hour === null) return;
                const dayDate = new Date(row.day);
                if (isNaN(dayDate.getTime())) return;
                const dayIndex = Math.floor((dayDate.getTime() - startDate.getTime()) / 86400000);
                const hourIndex = parseInt(row.hour);
                if (dayIndex >= 0 && dayIndex < days && hourIndex >= 0 && hourIndex < 24) {
                    heatmapData[dayIndex][hourIndex] = parseInt(row.activity_count) || 0;
                }
            } catch (e) { /* skip bad row */ }
        });

        res.json(heatmapData);
    } catch (error: any) {
        console.error('Get employee daily activity error:', error);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

// Get positions list (compatibility/fallback)
router.get('/positions/list', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(_req.query.limit as string) || 50;
        const cursor = _req.query.cursor as string; // ISO string date

        let sql = `SELECT id, name, description, base_salary, commission_percent FROM positions`;

        const params: any[] = [];
        if (cursor) {
            sql += ` WHERE created_at < $1`;
            params.push(cursor);
        }

        sql += ` ORDER BY name DESC LIMIT $${params.length + 1}`;
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
    } catch (error: any) {
        console.error('Get positions error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// 2. Resource Collection Routes

// Get all employees (management roles + team members)
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { startOfQuarter, endOfQuarter, parseISO } = require('date-fns');
        const { role, branch_id: userBranchId } = req.user as any;
        const accessLevel = Number((req.user as any).access_level || 0);
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string; // ISO string date

        // Admins / Directors (position-based) and Commercial see EVERYTHING
        const isGlobal = accessLevel >= 90 || ['commercial'].includes(role);

        // Branch restricted roles
        const isBranchRestricted = ['head_sales', 'sales_manager', 'manager', 'realtor'].includes(role);

        // Build filters for optimized query
        const filters: any = { is_active: 1 };
        if (!isGlobal && isBranchRestricted && userBranchId) {
            filters.branch_id = userBranchId;
        }

        // Use query params for period or default to current quarter
        const now = new Date();
        const startRaw = req.query.start ? parseISO(req.query.start as string) : startOfQuarter(now);
        const endRaw = req.query.end ? parseISO(req.query.end as string) : endOfQuarter(now);

        // Adjust for UTC/Local offset (12 hours) to ensure correct year/month
        const adjStart = new Date(startRaw.getTime() + 12 * 60 * 60 * 1000);
        const adjEnd = new Date(endRaw.getTime() - 12 * 60 * 60 * 1000);

        const startPeriod = (adjStart.getUTCFullYear() * 100) + (adjStart.getUTCMonth() + 1);
        const endPeriod = (adjEnd.getUTCFullYear() * 100) + (adjEnd.getUTCMonth() + 1);

        const isPeriodRequest = req.query.start && req.query.end;

        // Use optimized query that eliminates N+1 problem.
        // IMPORTANT: avatar_url can hold a 5+ MB base64 string. Replacing it with
        // a stable URL pointer cuts response size from ~9 MB → ~few KB and
        // eliminates the slow JSON serialization that was making /employees take
        // tens of seconds. The actual image is served by /api/profiles/:id/avatar
        // (cached for 24h).
        let queryText = `
            SELECT
                p.id, p.email, p.full_name, p.phone,
                '/api/profiles/' || p.id || '/avatar' as avatar_url,
                p.position_id, p.has_salary, p.salary_amount, p.commission_percent, p.is_active,
                p.is_kpi_enabled, p.is_new_building,
                p.personal_kpi_current, p.management_kpi_current, p.kpi_last_updated,
                p.branch_id, p.team_id,
                p.created_at, p.updated_at,
                p.custom_total_deals, p.custom_total_objects, p.custom_total_revenue, p.registration_date,
                p.realtor_type,
                p.passport_series_number, p.extra_phone, p.emergency_contacts, p.passport_address, p.residential_address,
                pos.name as position_name, pos.sort_order as position_sort_order,
                pos.access_level as access_level,
                pos.default_personal_kpi_min, pos.default_personal_kpi_max,
                pos.default_management_kpi_min, pos.default_management_kpi_max,
                pos.management_base_salary,
                b.name as branch_name,
                t.name as team_name,
                -- Optimized: Get period stats in single query
                COALESCE(SUM(CASE
                    WHEN (d.year * 100 + d.month) BETWEEN $1 AND $2
                    THEN 1
                    ELSE 0
                END), 0) as period_deal_count,
                COALESCE(SUM(CASE
                    WHEN (d.year * 100 + d.month) BETWEEN $1 AND $2
                    THEN d.commission_total_fact - COALESCE(d.mop_revenue, 0)
                    ELSE 0
                END), 0) as period_revenue
            FROM profiles p
            LEFT JOIN positions pos ON p.position_id = pos.id
            LEFT JOIN branches b ON p.branch_id = b.id
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN deal_table_rows d ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name)) AND d.status IN ('approved', 'active')
        `;

        const params: any[] = [startPeriod, endPeriod];
        let paramIndex = 3;
        const whereConditions: string[] = [];

        if (!isGlobal && isBranchRestricted && userBranchId) {
            whereConditions.push(`p.branch_id = $${paramIndex}`);
            params.push(userBranchId);
            paramIndex++;
        }

        if (cursor) {
            whereConditions.push(`p.created_at < $${paramIndex}`);
            params.push(cursor);
            paramIndex++;
        }

        if (whereConditions.length > 0) {
            queryText += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        queryText += `
            GROUP BY
                p.id, p.email, p.full_name, p.phone,
                p.avatar_url,
                p.position_id, p.has_salary, p.salary_amount, p.commission_percent, p.is_active,
                p.is_kpi_enabled, p.is_new_building,
                p.personal_kpi_current, p.management_kpi_current, p.kpi_last_updated,
                p.branch_id, p.team_id, p.created_at, p.updated_at,
                p.custom_total_deals, p.custom_total_objects, p.custom_total_revenue, p.registration_date,
                p.realtor_type,
                p.passport_series_number, p.extra_phone, p.emergency_contacts, p.passport_address, p.residential_address,
                pos.name, pos.sort_order, pos.access_level, pos.default_personal_kpi_min, pos.default_personal_kpi_max,
                pos.default_management_kpi_min, pos.default_management_kpi_max, pos.management_base_salary,
                b.name, t.name
            ORDER BY p.created_at DESC
            LIMIT $${paramIndex}
        `;
        params.push(limit + 1);

        const result = await query(queryText, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        const employees = result.rows.map((row: any) => {
            return {
                ...row,
                emergency_contacts: parseEmergencyContactsFromDb(row.emergency_contacts),
                // Replace manual overrides with period stats if period is requested
                deal_count: parseInt(row.period_deal_count) || 0,
                total_revenue: parseFloat(row.period_revenue) || 0,
                custom_total_deals: isPeriodRequest ? (parseInt(row.period_deal_count) || 0) : (row.custom_total_deals || parseInt(row.period_deal_count) || 0),
                custom_total_revenue: isPeriodRequest ? (parseFloat(row.period_revenue) || 0) : (row.custom_total_revenue || parseFloat(row.period_revenue) || 0),
                current_month_revenue: parseFloat(row.period_revenue) || 0,
                branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
                team: row.team_id ? { id: row.team_id, name: row.team_name } : null,
                position: row.position_id ? {
                    id: row.position_id,
                    name: row.position_name,
                    sort_order: row.position_sort_order,
                    default_personal_kpi_min: row.default_personal_kpi_min,
                    default_personal_kpi_max: row.default_personal_kpi_max,
                    default_management_kpi_min: row.default_management_kpi_min,
                    default_management_kpi_max: row.default_management_kpi_max,
                    management_base_salary: row.management_base_salary
                } : null
            };
        });

        res.json({
            data: employees,
            nextCursor,
            hasNextPage
        });
    } catch (error: any) {
        console.error('Get employees error:', error);
        res.status(500).json({ 
            error: { 
                message: 'Server error', 
                details: error.message 
            } 
        });
    }
});

// 3. Dynamic Parameter Routes (Place at the end)

// Get single employee
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const result = await query(
            `SELECT
        p.id, p.email, p.full_name, p.phone,
        '/api/profiles/' || p.id || '/avatar' as avatar_url,
        p.position_id, p.has_salary, p.salary_amount, p.commission_percent, p.is_active,
        p.is_kpi_enabled, p.is_new_building,
        p.personal_kpi_current, p.management_kpi_current, p.kpi_last_updated,
        p.branch_id, p.team_id,
        p.created_at, p.updated_at,
        p.custom_total_deals, p.custom_total_objects, p.custom_total_revenue, p.registration_date,
        p.realtor_type,
        p.passport_series_number, p.extra_phone, p.emergency_contacts, p.passport_address, p.residential_address,
        pos.name as position_name, pos.sort_order as position_sort_order,
        pos.default_personal_kpi_min, pos.default_personal_kpi_max,
        pos.default_management_kpi_min, pos.default_management_kpi_max,
        pos.management_base_salary,
        b.name as branch_name,
        t.name as team_name
      FROM profiles p
      LEFT JOIN positions pos ON p.position_id = pos.id
      LEFT JOIN branches b ON p.branch_id = b.id
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: { message: 'Employee not found' } });
            return;
        }

        const row = result.rows[0];
        const employee = {
            ...row,
            emergency_contacts: parseEmergencyContactsFromDb(row.emergency_contacts),
            branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
            team: row.team_id ? { id: row.team_id, name: row.team_name } : null,
            position: row.position_id ? { id: row.position_id, name: row.position_name, sort_order: row.position_sort_order } : null
        };

        res.json(employee);
    } catch (error: any) {
        console.error('Get employee error:', error);
        require('fs').appendFileSync('employee_err.log', `[${new Date().toISOString()}] GET /employees/${req.params.id} ERROR: ${error.stack || error}\n`);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Update employee
router.patch('/:id',
    authenticateToken,
    [
        body('full_name').optional().trim(),
        body('phone').optional().trim(),
        body('position_id').optional({ nullable: true }),
        body('has_salary').optional().isBoolean(),
        body('salary_amount').optional().isFloat({ min: 0 }),
        body('commission_percent').optional().isFloat({ min: 0, max: 100 }),
        body('is_active').optional().isBoolean(),
        body('is_kpi_enabled').optional().isBoolean(),
        body('is_new_building').optional().isBoolean(),
        body('branch_id').optional({ nullable: true }),
        body('team_id').optional({ nullable: true }),
        body('email').optional().trim(),
        body('realtor_type').optional().isIn(['universal', 'secondary', 'newbuildings']),
        // role is deprecated: permissions come from positions
        body('custom_total_deals').optional().isInt({ min: 0 }),
        body('custom_total_objects').optional().isInt({ min: 0 }),
        body('custom_total_revenue').optional().isFloat({ min: 0 }),
        body('registration_date').optional({ nullable: true }),
        body('personal_kpi_current').optional().isFloat({ min: 0, max: 100 }),
        body('management_kpi_current').optional().isFloat({ min: 0, max: 100 }),
        body('passport_series_number').optional({ nullable: true }).isString().isLength({ max: 32 }),
        body('extra_phone').optional({ nullable: true }).isString(),
        body('emergency_contacts').optional(),
        body('passport_address').optional({ nullable: true }).isString().isLength({ max: 500 }),
        body('residential_address').optional({ nullable: true }).isString().isLength({ max: 500 }),
    ],
    async (req: Request, res: Response): Promise<void> => {
        let updateQuery = '';
        let values: any[] = [];
        try {
            const id = req.params.id as string;
            const { user } = req as any;
            const updates = { ...req.body };

            const isManagement = Number(user.access_level || 0) >= 90 || ['commercial', 'head_sales', 'sales_manager', 'manager'].includes(user.role);
            const isSelf = String(user.id) === String(id);

            if (!isManagement && !isSelf) {
                res.status(403).json({ error: { message: 'Forbidden' } });
                return;
            }

            if (isSelf && !isManagement) {
                const attemptedExtra = SELF_NON_MANAGEMENT_EXTRA_INFO_KEYS.filter((k) =>
                    Object.prototype.hasOwnProperty.call(req.body, k),
                );
                if (attemptedExtra.length > 0) {
                    res.status(403).json({
                        error: {
                            message:
                                'Изменение дополнительных сведений (паспорт, доп. телефон, контакты для связи, адреса) доступно только руководителю. Обратитесь к руководителю.',
                        },
                    });
                    return;
                }
            }

            console.log(`[PATCH /api/employees/${id}] Initial updates:`, JSON.stringify(updates));

            // role is deprecated: ignore any incoming role updates
            if (updates.role !== undefined) {
                delete updates.role;
            }

            if (Object.prototype.hasOwnProperty.call(updates, 'emergency_contacts')) {
                try {
                    updates.emergency_contacts = sanitizeEmergencyContacts(updates.emergency_contacts);
                } catch {
                    res.status(400).json({ error: { message: 'Некорректные контакты для экстренной связи' } });
                    return;
                }
            }

            // Check if email is already taken by ANOTHER user
            if (updates.email) {
                const existing = await query('SELECT id FROM profiles WHERE email = $1 AND id != $2', [updates.email, id]);
                if (existing.rows.length > 0) {
                    res.status(400).json({ error: { message: 'Сотрудник с таким Email уже существует' } });
                    return;
                }
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ errors: errors.array() });
                return;
            }

            // Snapshot current team/branch for post-update deal sync.
            const beforeProfile = await query(
                'SELECT team_id, branch_id FROM profiles WHERE id = $1',
                [id]
            );
            const prevTeamId = beforeProfile.rows[0]?.team_id ?? null;
            const prevBranchId = beforeProfile.rows[0]?.branch_id ?? null;

            if (updates.is_active !== undefined) updates.is_active = updates.is_active ? 1 : 0;
            if (updates.has_salary !== undefined) updates.has_salary = updates.has_salary ? 1 : 0;
            if (updates.is_kpi_enabled !== undefined) updates.is_kpi_enabled = updates.is_kpi_enabled ? 1 : 0;
            if (updates.is_new_building !== undefined) updates.is_new_building = updates.is_new_building ? 1 : 0;

            // Validate personal KPI values - must be one of valid tier values
            const validPersonalKPIs = [40, 45, 50, 55, 60];
            if (updates.personal_kpi_current !== undefined && updates.personal_kpi_current !== null) {
                const roundedValue = Math.round(updates.personal_kpi_current);
                if (!validPersonalKPIs.includes(roundedValue)) {
                    res.status(400).json({ error: { message: 'Личный KPI должен быть 40%, 45%, 50%, 55% или 60%' } });
                    return;
                }
                updates.personal_kpi_current = roundedValue;
            }

            // Validate management KPI values and role eligibility
            const validManagementKPIs = [3, 4, 5];
            if (updates.management_kpi_current !== undefined && updates.management_kpi_current !== null) {
                const roundedValue = Math.round(updates.management_kpi_current);
                if (!validManagementKPIs.includes(roundedValue)) {
                    res.status(400).json({ error: { message: 'Управленческий KPI должен быть 3%, 4% или 5%' } });
                    return;
                }
                updates.management_kpi_current = roundedValue;

                // Check if position supports management KPI - fetch current position if not being updated
                const positionId = updates.position_id || (await query('SELECT position_id FROM profiles WHERE id = $1', [id])).rows[0]?.position_id;
                if (positionId) {
                    const positionRes = await query('SELECT name FROM positions WHERE id = $1', [positionId]);
                    if (positionRes.rows.length > 0) {
                        const positionName = positionRes.rows[0].name.toLowerCase();
                        const isManagementRole = positionName.includes('моп') || positionName.includes('роп') || positionName.includes('коммерческий');
                        if (!isManagementRole) {
                            // Soft fallback: ignore stale field from UI when switching to non-management role.
                            delete updates.management_kpi_current;
                        }
                    }
                }
            }
            // If position is explicitly switched to a non-management role,
            // forcibly reset management KPI to avoid stale values leaking into UI/calculations.
            if (Object.prototype.hasOwnProperty.call(updates, 'position_id')) {
                const nextPositionId = updates.position_id;
                if (nextPositionId) {
                    const positionRes = await query('SELECT name FROM positions WHERE id = $1', [nextPositionId]);
                    const positionName = String(positionRes.rows[0]?.name || '').toLowerCase();
                    const isManagementRole = positionName.includes('моп') || positionName.includes('роп') || positionName.includes('коммерческий');
                    if (!isManagementRole) {
                        updates.management_kpi_current = 0;
                    }
                } else {
                    updates.management_kpi_current = 0;
                }
            }

            const fields: string[] = [];
            values = [];
            let paramIndex = 1;

            Object.keys(updates).forEach(key => {
                if (['full_name', 'phone', 'email', 'realtor_type', 'position_id', 'has_salary', 'salary_amount', 'commission_percent', 'is_active', 'branch_id', 'team_id', 'is_kpi_enabled', 'is_new_building', 'custom_total_deals', 'custom_total_objects', 'custom_total_revenue', 'registration_date', 'personal_kpi_current', 'management_kpi_current', 'passport_series_number', 'extra_phone', 'emergency_contacts', 'passport_address', 'residential_address'].includes(key)) {
                    let val = updates[key];

                    // Normalize empty strings to null for nullable fields
                    if (typeof val === 'string' && val.trim() === '') {
                        val = null;
                    }

                    if (key === 'phone' && val !== null) val = normalizePhone(val);
                    if (key === 'extra_phone' && val !== null) val = normalizePhone(String(val));
                    if (key === 'emergency_contacts') {
                        if (!isPostgresDb) {
                            val = JSON.stringify(Array.isArray(val) ? val : []);
                        }
                    }
                    if (key === 'personal_kpi_current' && val !== null) val = Math.round(val);
                    if (key === 'management_kpi_current' && val !== null) val = Math.round(val);

                    fields.push(`${key} = $${paramIndex}`);
                    values.push(val);
                    paramIndex++;
                }
            });

            // Auto-update kpi_last_updated if KPI fields changed
            if (updates.personal_kpi_current !== undefined || updates.management_kpi_current !== undefined) {
                fields.push(`kpi_last_updated = CURRENT_TIMESTAMP`);
            }

            if (fields.length === 0) {
                res.status(400).json({ error: { message: 'No valid fields to update' } });
                return;
            }

            values.push(id);
            updateQuery = `UPDATE profiles SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`;
            await query(updateQuery, values);

            // Keep deals aligned when employee moves from "без команды" to a team (or changes branch/team later).
            const hasTeamUpdate = Object.prototype.hasOwnProperty.call(updates, 'team_id');
            const hasBranchUpdate = Object.prototype.hasOwnProperty.call(updates, 'branch_id');
            if (hasTeamUpdate || hasBranchUpdate) {
                const afterProfile = await query(
                    'SELECT team_id, branch_id FROM profiles WHERE id = $1',
                    [id]
                );
                const nextTeamId = afterProfile.rows[0]?.team_id ?? null;
                const nextBranchId = afterProfile.rows[0]?.branch_id ?? null;
                const teamChanged = prevTeamId !== nextTeamId;
                const branchChanged = prevBranchId !== nextBranchId;

                if (teamChanged || branchChanged) {
                    await query(
                        `UPDATE deal_table_rows
                         SET team_id = $1, branch_id = $2, updated_at = CURRENT_TIMESTAMP
                         WHERE (created_by = $3 OR agent_id = $3)
                           AND (team_id IS DISTINCT FROM $1 OR branch_id IS DISTINCT FROM $2)`,
                        [nextTeamId, nextBranchId, id]
                    );
                }
            }

            // Sync email to auth_users if email was updated
            if (updates.email) {
                await query('UPDATE auth_users SET email = $1 WHERE id = $2', [updates.email, id]);
            }

            // Invalidate KPI cache for this user
            try {
                // Use new cache service (supports in-memory fallback)
                await cacheService.invalidate(`kpi:*:${id}:*`);
                await cacheService.invalidate(`leaderboard:*`);
                // Also invalidate HTTP middleware cache for KPI endpoints
                await cacheService.invalidate(`http-cache:/api/kpi/*`);
                console.log(`[PATCH /api/employees/${id}] Cache invalidated (KPI & Leaderboard & HTTP)`);
            } catch (cacheErr: any) {
                console.warn(`[PATCH /api/employees/${id}] Failed to invalidate cache:`, cacheErr.message);
            }

            // Emit realtime event for cross-user KPI updates
            if (updates.personal_kpi_current !== undefined || updates.management_kpi_current !== undefined) {
                // Broadcast to all users (not just the affected user) so managers see updates
                emitKpiEvent('updated', {
                    employeeId: id,
                    personal_kpi_current: updates.personal_kpi_current,
                    management_kpi_current: updates.management_kpi_current
                });
                console.log(`[PATCH /api/employees/${id}] KPI realtime event emitted (broadcast)`);
            }

            const result = await query(
                `SELECT p.*, pos.name as position_name FROM profiles p
                 LEFT JOIN positions pos ON p.position_id = pos.id
                 WHERE p.id = $1`,
                [id]
            );

            const updatedRow = result.rows[0];
            // Notify all clients about profile changes so permissions/UI update in real-time.
            emitProfileEvent('updated', {
                id: updatedRow.id,
                position_id: updatedRow.position_id,
                branch_id: updatedRow.branch_id,
                team_id: updatedRow.team_id,
                updated_at: updatedRow.updated_at
            });

            const contactChangedForAvito =
                ['full_name', 'phone', 'email'].some((k) => Object.prototype.hasOwnProperty.call(updates, k));
            if (contactChangedForAvito && user.company_id) {
                const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
                const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '127.0.0.1:5000';
                const baseUrl = `${proto}://${host}`;
                void pushAvitoFeedAfterOwnerContactChange(String(user.company_id), String(id), baseUrl);
            }

            await logAudit(req, 'UPDATE', 'employee', id, { name: updatedRow.full_name || '', ...updates });
            res.json({
                ...updatedRow,
                emergency_contacts: parseEmergencyContactsFromDb(updatedRow.emergency_contacts),
                position: updatedRow.position_id ? { id: updatedRow.position_id, name: updatedRow.position_name } : null
            });
        } catch (error: any) {
            console.error('Update employee error:', error);
            console.error('Failed Query:', updateQuery);
            console.error('Failed Values:', JSON.stringify(values));
            res.status(500).json({
                error: {
                    message: error.message || 'Server error',
                    detail: error.detail,
                    constraint: error.constraint
                }
            });
        }
    }
);

// Delete employee
router.delete('/:id', authenticateToken, requirePermission('can_manage_users'), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const checkResult = await query('SELECT id, full_name FROM profiles WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Employee not found' } });
            return;
        }
        await query('DELETE FROM auth_users WHERE id = $1', [id]);
        await logAudit(req, 'DELETE', 'employee', id, { name: checkResult.rows[0]?.full_name || '' });
        res.json({ message: 'Employee deleted successfully' });
    } catch (error: any) {
        console.error('Delete employee error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Reset employee password
router.post('/:id/reset-password', authenticateToken, requirePermission('can_manage_users'), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const crypto = require('crypto');

        // Check if employee exists
        const checkResult = await query('SELECT id, email, full_name FROM profiles WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Employee not found' } });
            return;
        }

        // Generate cryptographically secure password (16 characters)
        const newPassword = crypto.randomBytes(12).toString('base64').slice(0, 16);

        // Hash the password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in auth_users
        await query('UPDATE auth_users SET encrypted_password = $1 WHERE id = $2', [hashedPassword, id]);

        // Log the action for security audit (without password)
        console.log(`Password reset for user ${id} by admin ${(req as any).user.id}`);

        // SECURITY: Password is returned in response for admin to communicate to user
        // Never log passwords, even in development
        res.json({
            message: 'Пароль успешно сброшен',
            newPassword: newPassword  // Admin needs this to communicate to user
        });
    } catch (error: any) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
