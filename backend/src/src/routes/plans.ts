import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, transaction } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { getWorkingDaysInMonth } from '../utils/workingDays';
import { getLatestPeriodWithData } from '../utils/periodHelper';
import { emitPlanEvent } from '../services/realtime-broadcaster.service';
import cacheService from '../lib/cache.service';

const router = express.Router();

// POST /distribute - Create/Update Quarterly Plan and Distribute
router.post('/distribute',
    authenticateToken,
    requireAccessLevel(50),
    [
        body('year').isInt({ min: 2024 }),
        body('quarter').isInt({ min: 1, max: 4 }),
        body('branch_id').notEmpty().withMessage('branch_id is required'),
        body('target_revenue').isFloat({ min: 0 }),
        body('target_deals').isInt({ min: 0 }),
        body('target_deposits').isInt({ min: 0 }),
        body('target_objects').isInt({ min: 0 }),
        body('target_newbuildings').isInt({ min: 0 }),
        body('target_mortgage').optional().isInt({ min: 0 }),
        body('target_attendance').optional().isInt({ min: 0 }),
        body('target_calls').optional().isInt({ min: 0 }),
        body('target_meetings').optional().isInt({ min: 0 }),
        body('target_showings').optional().isInt({ min: 0 })
    ],
    async (req: Request, res: Response): Promise<void> => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
            return;
        }

        const year = Number(req.body.year);
        const quarter = Number(req.body.quarter);
        const branch_id = req.body.branch_id;
        const target_revenue = Number(req.body.target_revenue);
        const target_deals = Number(req.body.target_deals);
        const target_deposits = Number(req.body.target_deposits || 0);
        const target_objects = Number(req.body.target_objects || 0);
        const target_newbuildings = Number(req.body.target_newbuildings || 0);
        const target_mortgage = Number(req.body.target_mortgage || 0);
        const target_attendance = Number(req.body.target_attendance || 0);
        const target_calls = Number(req.body.target_calls || 0);
        const target_meetings = Number(req.body.target_meetings || 0);
        const target_showings = Number(req.body.target_showings || 0);

        if (isNaN(year) || isNaN(quarter) || isNaN(target_revenue) || isNaN(target_deals)) {
            res.status(400).json({ error: { message: 'Invalid numeric values provided' } });
            return;
        }
        if (year < 2024 || quarter < 1 || quarter > 4) {
            res.status(400).json({ error: { message: 'Invalid year or quarter' } });
            return;
        }
        if (target_revenue < 0 || target_deals < 0) {
            res.status(400).json({ error: { message: 'Target values cannot be negative' } });
            return;
        }
        if (!branch_id) {
            res.status(400).json({ error: { message: 'branch_id is required' } });
            return;
        }

        try {
            let distributedRealtorsCount = 0;

            await transaction(async (tx: any) => {
                const existingPlanResult = await tx.query(
                    'SELECT id FROM quarterly_plans WHERE period_year = $1 AND period_quarter = $2 AND branch_id = $3',
                    [year, quarter, branch_id]
                );
                const existingPlan = existingPlanResult.rows[0];

                if (existingPlan) {
                    await tx.query(`
            UPDATE quarterly_plans
            SET target_revenue = $1, target_deals = $2,
                target_deposits = $3, target_objects = $4,
                target_newbuildings = $5, target_mortgage = $6,
                target_attendance = $7, target_calls = $8,
                target_meetings = $9, target_showings = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
          `, [target_revenue, target_deals, target_deposits, target_objects, target_newbuildings, target_mortgage, target_attendance, target_calls, target_meetings, target_showings, existingPlan.id]);
                } else {
                    const newId = uuidv4();
                    await tx.query(`
            INSERT INTO quarterly_plans (
                id, period_year, period_quarter, branch_id,
                target_revenue, target_deals,
                target_deposits, target_objects,
                target_newbuildings, target_mortgage,
                target_attendance, target_calls,
                target_meetings, target_showings,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `, [newId, year, quarter, branch_id, target_revenue, target_deals, target_deposits, target_objects, target_newbuildings, target_mortgage, target_attendance, target_calls, target_meetings, target_showings, req.user!.id]);
                }

                const allRealtorsResult = await tx.query(`
                    SELECT u.id, pr.is_new_building
                    FROM auth_users u
                    JOIN profiles pr ON u.id = pr.id
                    LEFT JOIN positions pos ON pr.position_id = pos.id
                    LEFT JOIN teams t ON pr.team_id = t.id
                    LEFT JOIN user_roles ur ON u.id = ur.user_id
                    WHERE pr.is_active = 1
                      AND COALESCE(pos.participates_in_rating, 1) = 1
                      AND (ur.role IS NULL OR ur.role NOT IN ('director', 'commercial'))
                      AND (pr.branch_id = $1 OR t.branch_id = $1)
                `, [branch_id]);
                const allRealtors = allRealtorsResult.rows;

                const realtors = Array.from(new Map(allRealtors.map((r: any) => [r.id, r])).values());
                distributedRealtorsCount = realtors.length;

                if (realtors.length === 0) {
                    console.warn('[PLANS] No active realtors found. Skipping individual distribution.');
                    return;
                }

                const months = [
                    `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`,
                    `${year}-${String((quarter - 1) * 3 + 2).padStart(2, '0')}`,
                    `${year}-${String((quarter - 1) * 3 + 3).padStart(2, '0')}`
                ];

                const userCount = realtors.length;
                const monthlyRevenuePerUser = (target_revenue / 3) / userCount;
                const monthlyDealsPerUser = Math.ceil((target_deals / 3) / userCount);
                const monthlyDepositsPerUser = Math.ceil((target_deposits / 3) / userCount);
                const monthlyObjectsPerUser = Math.ceil((target_objects / 3) / userCount);
                const monthlyNewBuildingsPerUser = Math.ceil((target_newbuildings / 3) / userCount);
                const monthlyMortgagePerUser = Math.ceil((target_mortgage / 3) / userCount);
                const monthlyAttendancePerUser = Math.ceil((target_attendance / 3) / userCount);
                const monthlyCallsPerUser = Math.ceil((target_calls / 3) / userCount);
                const monthlyMeetingsPerUser = Math.ceil((target_meetings / 3) / userCount);
                const monthlyShowingsPerUser = Math.ceil((target_showings / 3) / userCount);

                const insertUserPlan = `
          INSERT INTO user_plans (
            id, user_id, period_month,
            target_revenue, target_deals,
            target_deposits, target_objects,
            target_newbuildings, target_mortgage,
            target_attendance, target_calls,
            target_meetings, target_showings
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT(user_id, period_month) DO UPDATE SET
          target_revenue = excluded.target_revenue,
          target_deals = excluded.target_deals,
          target_deposits = excluded.target_deposits,
          target_objects = excluded.target_objects,
          target_newbuildings = excluded.target_newbuildings,
          target_mortgage = excluded.target_mortgage,
          target_attendance = excluded.target_attendance,
          target_calls = excluded.target_calls,
          target_meetings = excluded.target_meetings,
          target_showings = excluded.target_showings,
          updated_at = CURRENT_TIMESTAMP
        `;

                for (const realtor of realtors) {
                    for (const month of months) {
                        await tx.query(insertUserPlan, [
                            uuidv4(), (realtor as any).id, month,
                            monthlyRevenuePerUser, monthlyDealsPerUser,
                            monthlyDepositsPerUser, monthlyObjectsPerUser,
                            monthlyNewBuildingsPerUser, monthlyMortgagePerUser, monthlyAttendancePerUser,
                            monthlyCallsPerUser, monthlyMeetingsPerUser, monthlyShowingsPerUser
                        ]);

                        const [monthYear, monthNum] = month.split('-');
                        const workingDays = getWorkingDaysInMonth(parseInt(monthYear), parseInt(monthNum));
                        const workingDaysCount = workingDays.length;

                        try {
                            if (workingDaysCount > 0) {
                                const dailyDeposits = Math.ceil(monthlyDepositsPerUser / workingDaysCount);
                                const dailyObjects = Math.ceil(monthlyObjectsPerUser / workingDaysCount);
                                const dailyRevenue = monthlyRevenuePerUser / workingDaysCount;

                                const insertDailyPlan = `
                                    INSERT INTO user_daily_plans (
                                        id, user_id, period_date,
                                        target_deposits, target_objects, target_revenue
                                    )
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                    ON CONFLICT(user_id, period_date) DO UPDATE SET
                                    target_deposits = excluded.target_deposits,
                                    target_objects = excluded.target_objects,
                                    target_revenue = excluded.target_revenue,
                                    updated_at = CURRENT_TIMESTAMP
                                `;

                                for (const workingDay of workingDays) {
                                    const dateStr = workingDay.toISOString().split('T')[0];
                                    await tx.query(insertDailyPlan, [
                                        uuidv4(), (realtor as any).id, dateStr,
                                        dailyDeposits, dailyObjects, dailyRevenue
                                    ]);
                                }
                            }
                        } catch (dailyErr: any) {
                            console.log(`[plans/distribute] Skipping daily plans for user ${(realtor as any).id}: ${dailyErr.message}`);
                        }
                    }
                }
            });

            await cacheService.invalidate('kpi:*');
            await cacheService.invalidate('v9:dual:*');
            console.log('✓ KPI cache invalidated after plan distribution');

            // Emit realtime event for cross-user updates
            emitPlanEvent('distributed', { branch_id, quarter, year });

            const savedPlan = await query(
                'SELECT * FROM quarterly_plans WHERE period_year = $1 AND period_quarter = $2 AND branch_id = $3',
                [year, quarter, branch_id]
            );

            if (!savedPlan.rows[0]) {
                console.error('Plan created but not returned from database');
                res.status(500).json({
                    error: { message: 'Failed to retrieve created plan' }
                });
                return;
            }

            res.json({
                message: 'Plan distributed successfully',
                plan: savedPlan.rows[0],
                debug: {
                    year,
                    quarter,
                    found: savedPlan.rows.length,
                    realtorsCount: distributedRealtorsCount
                }
            });
        } catch (e: any) {
            console.error('DISTRIBUTE PLAN ERROR:', e);
            res.status(500).json({ error: { message: e.message, details: e.message, stack: e.stack } });
        }
    }
);

// GET / - Get Quarterly Plans (with filtering)
router.get('/', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
    try {
        const { year, quarter } = req.query;
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let sql = 'SELECT * FROM quarterly_plans';
        const params: any[] = [];
        let paramIndex = 1;

            const branch_id = req.query.branch_id as string | undefined;
            if (branch_id) {
                sql += ` WHERE period_year = $${paramIndex} AND period_quarter = $${paramIndex + 1} AND branch_id = $${paramIndex + 2}`;
                params.push(Number(year), Number(quarter), branch_id);
                paramIndex += 3;
            } else {
            sql += ` WHERE period_year = $${paramIndex} AND period_quarter = $${paramIndex + 1}`;
            params.push(Number(year), Number(quarter));
            paramIndex += 2;
        }

        if (cursor) {
            if (params.length > 0) {
                sql += ` AND created_at < $${paramIndex}`;
            } else {
                sql += ` WHERE created_at < $${paramIndex}`;
            }
            params.push(cursor);
            paramIndex++;
        }

        sql += ` ORDER BY period_year DESC, period_quarter DESC LIMIT $${paramIndex}`;
        params.push(limit + 1);

        const result = await query(sql, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({
            data: result.rows,
            nextCursor,
            hasNextPage,
            debug: {
                year,
                quarter,
                count: result.rows.length
            }
        });
    } catch (e: any) {
        console.error('GET PLANS ERROR:', e);
        res.status(500).json({ error: { message: e.message, details: e.message, stack: e.stack } });
    }
});

// GET /my-plan - Get Current User's Plan (Current Month)
router.get('/my-plan', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const currentMonth = await getLatestPeriodWithData();

        const userId = (['admin', 'director', 'head_sales', 'sales_manager'].includes(req.user!.role) && req.query.userId)
            ? req.query.userId as string
            : req.user!.id;

        const planResult = await query('SELECT * FROM user_plans WHERE user_id = $1 AND period_month = $2', [userId, currentMonth]);
        const planFromDb = planResult.rows[0] || {};

        const plan = {
            target_revenue: planFromDb.target_revenue || 0,
            target_deals: planFromDb.target_deals || 0,
            target_deposits: planFromDb.target_deposits || 0,
            target_objects: planFromDb.target_objects || 0,
            target_newbuildings: planFromDb.target_newbuildings || 0,
            target_attendance: planFromDb.target_attendance || 0,
            target_calls: planFromDb.target_calls || 0,
            target_meetings: planFromDb.target_meetings || 0,
            target_showings: planFromDb.target_showings || 0
        };

        const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;
        const dateFilter = isPostgres
            ? "to_char(created_at::TIMESTAMP, 'YYYY-MM') = $2"
            : "strftime('%Y-%m', created_at) = $2";

        const srSql = `
            SELECT type, COUNT(*) as count
            FROM service_requests
            WHERE user_id = $1
            AND ${dateFilter}
            AND status = 'approved'
            GROUP BY type
        `;
        const srResult = await query(srSql, [userId, currentMonth]);

        let fact_deposits = 0;
        let fact_objects = 0;

        srResult.rows.forEach((row: any) => {
            if (row.type === 'deposit' || row.type === 'prepayment') {
                fact_deposits += parseInt(row.count);
            } else if (row.type === 'listing' || row.type === 'take' || row.type === 'object') {
                fact_objects += parseInt(row.count);
            }
        });

        const reportsSql = `
            SELECT content
            FROM reports
            WHERE user_id = $1
            AND ${dateFilter}
            AND type = 'daily'
            AND status = 'approved'
        `;
        const reportsResult = await query(reportsSql, [userId, currentMonth]);

        reportsResult.rows.forEach((row: any) => {
            if (row.content) {
                const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
                if (content['Набор базы'] || content['Объекты'] || content['objects']) {
                    fact_objects += parseInt(content['Набор базы'] || content['Объекты'] || content['objects']) || 0;
                }
            }
        });

        const profileSql = `SELECT custom_total_objects FROM profiles WHERE id = $1`;
        const profileResult = await query(profileSql, [userId]);
        const customObjects = parseInt(profileResult.rows[0]?.custom_total_objects) || 0;

        fact_objects += customObjects;

        const revenueSql = `
            SELECT COALESCE(SUM(dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0)), 0) as revenue
            FROM deal_table_rows dtr
            JOIN profiles p ON dtr.agent_name = p.full_name
            WHERE p.id = $1
              AND CONCAT(dtr.year, '-', LPAD(dtr.month::text, 2, '0')) = $2
        `;
        const revenueResult = await query(revenueSql, [userId, currentMonth]);
        const fact_revenue = parseFloat(revenueResult.rows[0]?.revenue) || 0;

        res.json({
            ...plan,
            fact_deposits,
            fact_objects,
            fact_revenue
        });
    } catch (e: any) {
        console.error('GET MY-PLAN ERROR:', e);
        res.status(500).json({ error: { message: e.message, details: e.message, stack: e.stack } });
    }
});

// GET /users-plans - Get All User Plans for Period (for Rating)
router.get('/users-plans', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { year, quarter, month } = req.query;
        let sql = 'SELECT user_id, SUM(target_revenue) as target_revenue, SUM(target_deals) as target_deals, SUM(target_deposits) as target_deposits, SUM(target_objects) as target_objects, SUM(target_newbuildings) as target_newbuildings, SUM(target_attendance) as target_attendance FROM user_plans';
        const params: any[] = [];

        if (month) {
            sql += ' WHERE period_month = $1';
            params.push(month);
        } else if (year && quarter) {
            const months = [
                `${year}-${String((Number(quarter) - 1) * 3 + 1).padStart(2, '0')}`,
                `${year}-${String((Number(quarter) - 1) * 3 + 2).padStart(2, '0')}`,
                `${year}-${String((Number(quarter) - 1) * 3 + 3).padStart(2, '0')}`
            ];
            sql += ' WHERE period_month IN ($1, $2, $3)';
            params.push(...months);
        } else if (year) {
            sql += ' WHERE period_month LIKE $1';
            params.push(`${year}-%`);
        } else {
            const today = new Date();
            const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            sql += ' WHERE period_month = $1';
            params.push(currentMonth);
        }

        sql += ' GROUP BY user_id';
        const result = await query(sql, params);

        const plansMap: Record<string, any> = {};
        result.rows.forEach((p: any) => {
            plansMap[p.user_id] = {
                user_id: p.user_id,
                target_revenue: parseFloat(p.target_revenue) || 0,
                target_deals: parseInt(p.target_deals) || 0,
                target_deposits: parseInt(p.target_deposits) || 0,
                target_objects: parseInt(p.target_objects) || 0,
                target_newbuildings: parseInt(p.target_newbuildings) || 0,
                target_attendance: parseInt(p.target_attendance) || 0
            };
        });

        res.json(plansMap);
    } catch (e: any) {
        console.error('GET USERS-PLANS ERROR:', e);
        res.status(500).json({ error: { message: e.message, details: e.message, stack: e.stack } });
    }
});

// GET /employee-allocations - Get Employee-Level Plan Allocations with Hierarchy
router.get('/employee-allocations', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
    try {
        const { year, quarter, branch_id } = req.query;

        if (!year || !quarter) {
            res.status(400).json({ error: { message: 'year and quarter parameters are required' } });
            return;
        }

        const months = [
            `${year}-${String((Number(quarter) - 1) * 3 + 1).padStart(2, '0')}`,
            `${year}-${String((Number(quarter) - 1) * 3 + 2).padStart(2, '0')}`,
            `${year}-${String((Number(quarter) - 1) * 3 + 3).padStart(2, '0')}`
        ];

        const params: any[] = [...months];
        let branchFilter = '';
        
        if (branch_id && branch_id !== 'all') {
            branchFilter = ' AND (p.branch_id = $4 OR t.branch_id = $4)';
            params.push(branch_id);
        }

        const sql = `
            SELECT
                up.user_id,
                p.full_name,
                p.branch_id,
                p.team_id,
                b.name as branch_name,
                t.name as team_name,
                ur.role,
                pos.name as position_name,
                SUM(up.target_revenue) as target_revenue,
                SUM(up.target_deals) as target_deals,
                SUM(up.target_deposits) as target_deposits,
                SUM(up.target_objects) as target_objects,
                SUM(up.target_newbuildings) as target_newbuildings,
                SUM(up.target_mortgage) as target_mortgage
            FROM user_plans up
            JOIN profiles p ON up.user_id = p.id
            LEFT JOIN branches b ON p.branch_id = b.id
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN user_roles ur ON up.user_id = ur.user_id
            LEFT JOIN positions pos ON p.position_id = pos.id
            WHERE up.period_month IN ($1, $2, $3)
              AND p.is_active = 1
              AND COALESCE(pos.participates_in_rating, 1) = 1
              AND (ur.role IS NULL OR ur.role NOT IN ('director', 'commercial'))${branchFilter}
            GROUP BY up.user_id, p.full_name, p.branch_id, p.team_id, b.name, t.name, ur.role, pos.name
            ORDER BY b.name NULLS LAST, t.name NULLS LAST, p.full_name
        `;

        const result = await query(sql, params);

        console.log('[employee-allocations] Query result:', {
            rowCount: result.rows.length,
            sample: result.rows[0],
            params: { year, quarter, branch_id },
        });

        const employees = result.rows.map((row: any) => ({
            user_id: row.user_id,
            full_name: row.full_name,
            branch_id: row.branch_id,
            branch_name: row.branch_name || 'Без филиала',
            team_id: row.team_id,
            team_name: row.team_name || 'Без команды',
            role: row.role,
            position_name: row.position_name,
            target_revenue: parseFloat(row.target_revenue) || 0,
            target_deals: parseInt(row.target_deals) || 0,
            target_deposits: parseInt(row.target_deposits) || 0,
            target_objects: parseInt(row.target_objects) || 0,
            target_newbuildings: parseInt(row.target_newbuildings) || 0,
            target_mortgage: parseInt(row.target_mortgage) || 0
        }));

        // Aggregate by branch
        const branchMap = new Map<string, any>();
        employees.forEach((emp: any) => {
            const branchKey = emp.branch_id || 'no-branch';
            if (!branchMap.has(branchKey)) {
                branchMap.set(branchKey, {
                    branch_id: emp.branch_id,
                    branch_name: emp.branch_name,
                    employee_count: 0,
                    target_revenue: 0,
                    target_deals: 0,
                    target_deposits: 0,
                    target_objects: 0,
                    target_newbuildings: 0,
                    target_mortgage: 0
                });
            }
            const branch = branchMap.get(branchKey);
            branch.employee_count++;
            branch.target_revenue += emp.target_revenue;
            branch.target_deals += emp.target_deals;
            branch.target_deposits += emp.target_deposits;
            branch.target_objects += emp.target_objects;
            branch.target_newbuildings += emp.target_newbuildings;
            branch.target_mortgage += emp.target_mortgage;
        });

        // Aggregate by team
        const teamMap = new Map<string, any>();
        employees.forEach((emp: any) => {
            const teamKey = emp.team_id || 'no-team';
            if (!teamMap.has(teamKey)) {
                teamMap.set(teamKey, {
                    team_id: emp.team_id,
                    team_name: emp.team_name,
                    branch_id: emp.branch_id,
                    branch_name: emp.branch_name,
                    employee_count: 0,
                    target_revenue: 0,
                    target_deals: 0,
                    target_deposits: 0,
                    target_objects: 0,
                    target_newbuildings: 0,
                    target_mortgage: 0
                });
            }
            const team = teamMap.get(teamKey);
            team.employee_count++;
            team.target_revenue += emp.target_revenue;
            team.target_deals += emp.target_deals;
            team.target_deposits += emp.target_deposits;
            team.target_objects += emp.target_objects;
            team.target_newbuildings += emp.target_newbuildings;
            team.target_mortgage += emp.target_mortgage;
        });

        res.json({
            employees,
            branches: Array.from(branchMap.values()),
            teams: Array.from(teamMap.values()),
            total_employees: employees.length
        });
    } catch (e: any) {
        console.error('GET EMPLOYEE ALLOCATIONS ERROR:', e);
        res.status(500).json({ error: { message: e.message, details: e.message, stack: e.stack } });
    }
});

// PUT /employee/:userId - Update Individual Employee Plan
router.put('/employee/:userId',
    authenticateToken,
    requireAccessLevel(90),
    [
        body('year').isInt({ min: 2024 }),
        body('quarter').isInt({ min: 1, max: 4 }),
        body('target_revenue').isFloat({ min: 0 }),
        body('target_deals').isInt({ min: 0 }),
        body('target_deposits').isInt({ min: 0 }),
        body('target_objects').isInt({ min: 0 }),
        body('target_newbuildings').isInt({ min: 0 }),
        body('target_mortgage').isInt({ min: 0 })
    ],
    async (req: Request, res: Response): Promise<void> => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
            return;
        }

        const { userId } = req.params;
        const year = Number(req.body.year);
        const quarter = Number(req.body.quarter);
        const target_revenue = Number(req.body.target_revenue);
        const target_deals = Number(req.body.target_deals);
        const target_deposits = Number(req.body.target_deposits);
        const target_objects = Number(req.body.target_objects);
        const target_newbuildings = Number(req.body.target_newbuildings);
        const target_mortgage = Number(req.body.target_mortgage);

        try {
            const months = [
                `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`,
                `${year}-${String((quarter - 1) * 3 + 2).padStart(2, '0')}`,
                `${year}-${String((quarter - 1) * 3 + 3).padStart(2, '0')}`
            ];

            const monthlyRevenue = target_revenue / 3;
            const monthlyDeals = Math.ceil(target_deals / 3);
            const monthlyDeposits = Math.ceil(target_deposits / 3);
            const monthlyObjects = Math.ceil(target_objects / 3);
            const monthlyNewBuildings = Math.ceil(target_newbuildings / 3);
            const monthlyMortgage = Math.ceil(target_mortgage / 3);

            await transaction(async (tx: any) => {
                const updateSql = `
                    UPDATE user_plans
                    SET target_revenue = $1,
                        target_deals = $2,
                        target_deposits = $3,
                        target_objects = $4,
                        target_newbuildings = $5,
                        target_mortgage = $6,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $7 AND period_month = $8
                `;

                for (const month of months) {
                    await tx.query(updateSql, [
                        monthlyRevenue,
                        monthlyDeals,
                        monthlyDeposits,
                        monthlyObjects,
                        monthlyNewBuildings,
                        monthlyMortgage,
                        userId,
                        month
                    ]);
                }
            });

            await cacheService.invalidate('kpi:*');
            await cacheService.invalidate('v9:dual:*');
            console.log('✓ KPI cache invalidated after individual plan update');

            // Emit realtime event for cross-user updates
            emitPlanEvent('updated', { userId, year, quarter });

            res.json({
                message: 'Employee plan updated successfully',
                userId,
                year,
                quarter
            });
        } catch (e: any) {
            console.error('UPDATE EMPLOYEE PLAN ERROR:', e);
            res.status(500).json({ error: { message: e.message, details: e.message, stack: e.stack } });
        }
    }
);

export default router;
