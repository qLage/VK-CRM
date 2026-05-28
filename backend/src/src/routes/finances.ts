import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getLatestPeriodWithData } from '../utils/periodHelper';
import { computeLimiter } from '../middleware/rateLimiter';

import cacheService from '../lib/cache.service';

const router = express.Router();

// Get all transactions

// Get all transactions (UNION of deal commissions and manual transactions)
router.get('/transactions', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        const params: any[] = [];
        let cursorCondition = '';
        if (cursor) {
            cursorCondition = `AND created_at < $1`;
            params.push(cursor);
        }

        const companyId = req.user!.company_id;
        const companyIdParamIndex = params.length + 1;
        params.push(companyId);

        const sql = `
            SELECT * FROM (
                -- Deal commissions from deal_table_rows
                SELECT
                    id::text,
                    'income'::text as type,
                    'deal_commission'::text as category,
                    commission_total_fact as amount,
                    ('Комиссия по сделке: ' || property_name) as description,
                    NULL::text as user_id,
                    NULL::text as component_type,
                    CASE
                        WHEN service IS NOT NULL AND (LOWER(service) LIKE '%ипотек%' OR LOWER(service) LIKE '%новостро%') THEN 'account'
                        ELSE 'cash'
                    END as account_type,
                    updated_at::timestamp as created_at,
                    updated_at::timestamp
                FROM deal_table_rows
                WHERE COALESCE(commission_total_fact, 0) > 0
                  AND company_id = $${companyIdParamIndex}
                  AND status IN ('approved', 'active')

                UNION ALL

                -- Manual transactions from transactions table
                SELECT
                    id::text,
                    type,
                    category,
                    amount,
                    description,
                    user_id,
                    NULL::text as component_type,
                    account_type,
                    created_at::timestamp,
                    updated_at::timestamp
                FROM transactions
                WHERE company_id = $${companyIdParamIndex}
            ) combined
            WHERE 1=1 ${cursorCondition}
            ORDER BY created_at DESC
            LIMIT $${params.length + 1}`;

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
        console.error('Get transactions error:', error);
        const pgError = error as { code?: string; message?: string; detail?: string; hint?: string };
        console.error('  PG code:', pgError.code);
        console.error('  PG detail:', pgError.detail);
        res.status(500).json({ error: { message: 'Server error', detail: process.env.NODE_ENV === 'development' ? pgError.message : undefined } });
    }
});

// Create transaction
router.post('/transactions',
    authenticateToken,
    requirePermission('can_manage_finances'),
    [
        body('type').isIn(['income', 'expense']),
        body('category').trim().notEmpty(),
        body('amount').isFloat({ min: 0 }),
        body('description').optional().trim(),
        body('account_type').optional().isIn(['cash', 'account']),
        body('related_user_id').optional().isUUID(),
        body('component_type').optional().trim(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { type, category, amount, description, related_user_id, account_type, component_type } = req.body;
            const id = uuidv4();
            const now = new Date().toISOString();

            await query(
                `INSERT INTO transactions (id, type, category, amount, description, user_id, account_type, company_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [id, type, category, amount, description, related_user_id || null, account_type || 'cash', req.user!.company_id, now, now]
            );

            const result = await query(
                `SELECT
          t.*, p.full_name as user_name
        FROM transactions t
        LEFT JOIN profiles p ON t.user_id = p.id
        WHERE t.id = $1`,
                [id]
            );

            try {
                const admins = await query("SELECT user_id FROM user_roles WHERE role IN ('admin', 'director')");
                const title = type === 'expense' ? 'Новый расход' : 'Новый доход';
                const message = `Создана транзакция (${category}): ${amount} руб. ${description || ''}`;
                const notifType = type === 'expense' ? (category.toLowerCase().includes('зарплата') ? 'info' : 'warning') : 'success';

                for (const admin of admins.rows) {
                    await query(
                        `INSERT INTO notifications (id, user_id, title, message, type, created_by, company_id, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [uuidv4(), admin.user_id, title, message, notifType, 'system', req.user!.company_id, now]
                    );
                }
            } catch (err) {
                console.error('Failed to create financial notification:', err);
            }

            if (!result.rows[0]) {
                console.error('Transaction created but not returned from database');
                res.status(500).json({ error: { message: 'Failed to retrieve created transaction' } });
                return;
            }
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Create transaction error:', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    }
);
// Update (PATCH) transaction
router.patch('/transactions/:id', authenticateToken, requirePermission('can_manage_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { type, category, amount, description, account_type } = req.body;

        const checkResult = await query('SELECT id FROM transactions WHERE id = $1', [id]);

        // If not in transactions table, check if it's a deal commission from deal_table_rows
        if (checkResult.rows.length === 0) {
            const dealResult = await query('SELECT id, service FROM deal_table_rows WHERE id = $1', [id]);
            if (dealResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Transaction not found' } });
                return;
            }

            // Update deal_table_rows directly
            const dealFields: string[] = [];
            const dealValues: any[] = [];
            let dIdx = 1;
            if (amount !== undefined) { dealFields.push(`commission_total_fact = $${dIdx++}`); dealValues.push(amount); }
            if (account_type !== undefined) {
                // Map account_type to service field for deals
                if (account_type === 'account') {
                    dealFields.push(`service = $${dIdx++}`);
                    dealValues.push('Новостройка');
                } else {
                    dealFields.push(`service = $${dIdx++}`);
                    dealValues.push('Вторичка');
                }
            }
            dealFields.push(`updated_at = $${dIdx++}`);
            dealValues.push(new Date().toISOString());
            dealValues.push(id);

            if (dealFields.length > 2) {
                await query(`UPDATE deal_table_rows SET ${dealFields.join(', ')} WHERE id = $${dIdx}`, dealValues);
            }

            const result = await query(
                `SELECT id, 'income' as type, 'deal_commission' as category,
                        commission_total_fact as amount,
                        property_name as description,
                        CASE WHEN service IS NOT NULL AND (LOWER(service) LIKE '%ипотек%' OR LOWER(service) LIKE '%новостро%')
                             THEN 'account' ELSE 'cash' END as account_type,
                        updated_at as created_at, updated_at
                 FROM deal_table_rows WHERE id = $1`,
                [id]
            );
            if (!result.rows[0]) {
                res.status(404).json({ error: { message: 'Transaction not found after update' } });
                return;
            }
            res.json(result.rows[0]);
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;
        if (type !== undefined) { fields.push(`type = $${idx++}`); values.push(type); }
        if (category !== undefined) { fields.push(`category = $${idx++}`); values.push(category); }
        if (amount !== undefined) { fields.push(`amount = $${idx++}`); values.push(amount); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
        if (account_type !== undefined) { fields.push(`account_type = $${idx++}`); values.push(account_type); }
        fields.push(`updated_at = $${idx++}`);
        values.push(new Date().toISOString());
        values.push(id);

        await query(`UPDATE transactions SET ${fields.join(', ')} WHERE id = $${idx}`, values);

        const result = await query('SELECT * FROM transactions WHERE id = $1', [id]);
        if (!result.rows[0]) {
            res.status(404).json({ error: { message: 'Transaction not found after update' } });
            return;
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update transaction error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Delete transaction
router.delete('/transactions/:id', authenticateToken, requirePermission('can_manage_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const checkResult = await query('SELECT id FROM transactions WHERE id = $1', [id]);

        if (checkResult.rows.length === 0) {
            // Check if it's a deal commission from deal_table_rows
            const dealResult = await query('SELECT id FROM deal_table_rows WHERE id = $1', [id]);
            if (dealResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Transaction not found' } });
                return;
            }
            // For deal-originated incomes, reset commission to 0 instead of deleting the row
            await query('UPDATE deal_table_rows SET commission_total_fact = 0, updated_at = $1 WHERE id = $2', [new Date().toISOString(), id]);
            res.json({ message: 'Transaction deleted successfully' });
            return;
        }

        await query('DELETE FROM transactions WHERE id = $1', [id]);

        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Delete transaction error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Get finance stats (totals + cash/account split)
router.get('/stats', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = req.user!.company_id;

        // 1. Get deal commission income (split by service type)
        const dealResult = await query(
            `SELECT
                SUM(COALESCE(commission_total_fact, 0)) as income_total,
                SUM(CASE WHEN service IS NOT NULL AND (LOWER(service) LIKE '%ипотек%' OR LOWER(service) LIKE '%новостро%') THEN COALESCE(commission_total_fact, 0) ELSE 0 END) as income_account,
                SUM(CASE WHEN service IS NULL OR LOWER(service) NOT LIKE '%ипотек%' AND LOWER(service) NOT LIKE '%новостро%' THEN COALESCE(commission_total_fact, 0) ELSE 0 END) as income_cash
             FROM deal_table_rows
             WHERE COALESCE(commission_total_fact, 0) > 0
               AND company_id = $1
               AND status IN ('approved', 'active')`,
            [companyId]
        );

        const dealIncome = parseFloat(dealResult.rows[0]?.income_total) || 0;
        const dealIncomeAccount = parseFloat(dealResult.rows[0]?.income_account) || 0;
        const dealIncomeCash = parseFloat(dealResult.rows[0]?.income_cash) || 0;

        // 2. Get manual transaction income (split by account_type)
        const txIncomeResult = await query(
            `SELECT
                SUM(COALESCE(amount, 0)) as total,
                SUM(CASE WHEN account_type = 'account' THEN COALESCE(amount, 0) ELSE 0 END) as account_total,
                SUM(CASE WHEN COALESCE(account_type, 'cash') = 'cash' THEN COALESCE(amount, 0) ELSE 0 END) as cash_total
             FROM transactions
             WHERE type = 'income'
               AND category != 'deal_commission'
               AND company_id = $1`,
            [companyId]
        );

        const txIncome = parseFloat(txIncomeResult.rows[0]?.total) || 0;
        const txIncomeAccount = parseFloat(txIncomeResult.rows[0]?.account_total) || 0;
        const txIncomeCash = parseFloat(txIncomeResult.rows[0]?.cash_total) || 0;

        // 3. Get expenses (split by account_type)
        const expenseResult = await query(
            `SELECT
                SUM(COALESCE(amount, 0)) as total,
                SUM(CASE WHEN account_type = 'account' THEN COALESCE(amount, 0) ELSE 0 END) as account_total,
                SUM(CASE WHEN COALESCE(account_type, 'cash') = 'cash' THEN COALESCE(amount, 0) ELSE 0 END) as cash_total
             FROM transactions
             WHERE type = 'expense'
               AND company_id = $1`,
            [companyId]
        );

        const expense = parseFloat(expenseResult.rows[0]?.total) || 0;
        const expenseAccount = parseFloat(expenseResult.rows[0]?.account_total) || 0;
        const expenseCash = parseFloat(expenseResult.rows[0]?.cash_total) || 0;

        // 4. Calculate totals
        const totalIncome = dealIncome + txIncome;
        const totalIncomeAccount = dealIncomeAccount + txIncomeAccount;
        const totalIncomeCash = dealIncomeCash + txIncomeCash;

        const balanceAccount = totalIncomeAccount - expenseAccount;
        const balanceCash = totalIncomeCash - expenseCash;
        const balance = balanceAccount + balanceCash;
        const profit = totalIncome - expense;

        const stats = {
            income: totalIncome,
            expense: expense,
            profit: profit,
            balance: balance,
            balanceCash: balanceCash,
            balanceAccount: balanceAccount,
        };

        res.json(stats);
    } catch (error) {
        console.error('Get finance stats error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Maintenance: deduplicate deal_commission incomes (keep newest per deal_id)
router.post('/maintenance/deduplicate-deal-commissions', authenticateToken, requirePermission('can_manage_finances'), async (_req: Request, res: Response): Promise<void> => {
    try {
        const dupes = await query(
            `SELECT deal_id, COUNT(*) as cnt
             FROM transactions
             WHERE type = 'income' AND category = 'deal_commission' AND deal_id IS NOT NULL
             GROUP BY deal_id
             HAVING COUNT(*) > 1`
        );

        let deleted = 0;

        for (const row of dupes.rows) {
            const dealId = row.deal_id;
            const keep = await query(
                `SELECT id
                 FROM transactions
                 WHERE type = 'income' AND category = 'deal_commission' AND deal_id = $1
                 ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
                 LIMIT 1`,
                [dealId]
            );

            const keepId = keep.rows[0]?.id;
            if (!keepId) continue;

            const delRes = await query(
                `DELETE FROM transactions
                 WHERE type = 'income' AND category = 'deal_commission' AND deal_id = $1 AND id <> $2`,
                [dealId, keepId]
            );

            deleted += delRes.rowCount || 0;
        }

        res.json({ duplicatedDeals: dupes.rows.length, deleted });
    } catch (error) {
        console.error('Deduplicate deal commissions error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Maintenance: deduplicate report-generated "Оплата по сделке" transactions
router.post('/maintenance/deduplicate-report-deal-payments', authenticateToken, requirePermission('can_manage_finances'), async (_req: Request, res: Response): Promise<void> => {
    try {
        const candidates = await query(
            `SELECT id, description
             FROM transactions
             WHERE type = 'income'
               AND category = 'deal_commission'
               AND description LIKE '%(Отчет:%'
            `
        );

        const map = new Map<string, { ids: string[] }>();
        const rx = /\(Отчет:\s*([0-9a-fA-F-]{36})\)/;

        for (const tx of candidates.rows) {
            const m = String(tx.description || '').match(rx);
            if (!m) continue;
            const reportId = m[1];
            const entry = map.get(reportId) || { ids: [] };
            entry.ids.push(tx.id);
            map.set(reportId, entry);
        }

        let deleted = 0;
        let duplicatedReports = 0;

        for (const [_reportId, entry] of map.entries()) {
            if (entry.ids.length <= 1) continue;
            duplicatedReports++;

            const keep = await query(
                `SELECT id
                 FROM transactions
                 WHERE id = ANY($1)
                 ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
                 LIMIT 1`,
                [entry.ids]
            );
            const keepId = keep.rows[0]?.id;
            if (!keepId) continue;

            const delRes = await query(
                `DELETE FROM transactions WHERE id = ANY($1) AND id <> $2`,
                [entry.ids, keepId]
            );
            deleted += delRes.rowCount || 0;
        }

        res.json({ duplicatedReports, deleted });
    } catch (error) {
        console.error('Deduplicate report deal payments error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Maintenance: show distribution of account_type values
router.get('/maintenance/account-types', authenticateToken, requirePermission('can_view_finances'), async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT COALESCE(account_type, 'NULL') as account_type, COUNT(*) as cnt
             FROM transactions
             GROUP BY COALESCE(account_type, 'NULL')
             ORDER BY cnt DESC`
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Account types maintenance error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Maintenance: show top deal_ids by duplicated income transactions
router.get('/maintenance/top-duplicated-deals', authenticateToken, requirePermission('can_view_finances'), async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT deal_id, COUNT(*) as cnt, SUM(amount) as total
             FROM transactions
             WHERE type = 'income' AND category = 'deal_commission' AND deal_id IS NOT NULL
             GROUP BY deal_id
             HAVING COUNT(*) > 1
             ORDER BY cnt DESC
             LIMIT 50`
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Top duplicated deals maintenance error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Get financial summary
router.get('/summary', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { start_date, end_date } = req.query;

        let dateFilter = '';
        const params: any[] = [];

        if (start_date && end_date) {
            dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
            params.push(start_date, end_date);
        }

        const result = await query(
            `SELECT
        type,
        SUM(amount) as total,
        COUNT(*) as count
      FROM transactions
      ${dateFilter}
      GROUP BY type`,
            params
        );

        const summary = {
            income: 0,
            expense: 0,
            balance: 0,
            profit: 0,
        };

        result.rows.forEach((row: any) => {
            if (row.type === 'income') {
                summary.income = parseFloat(row.total) || 0;
            } else if (row.type === 'expense') {
                summary.expense = parseFloat(row.total) || 0;
            }
        });

        summary.balance = summary.income - summary.expense;
        summary.profit = summary.income - summary.expense;

        res.json(summary);
    } catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Get salary calculations - AUTOMATIC CALCULATION FROM DEALS
router.get('/salaries', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { month, year } = req.query;

        let periodYear: number, periodMonth: number;

        if (year && month) {
            periodYear = parseInt(year as string);
            periodMonth = parseInt(month as string);
        } else {
            const latestPeriod = await getLatestPeriodWithData();
            const [yearStr, monthStr] = latestPeriod.split('-');
            periodYear = parseInt(yearStr);
            periodMonth = parseInt(monthStr);
        }

        const employeesResult = await query(`
            SELECT p.id, p.full_name, p.team_id, p.branch_id, ur.role, pos.name as position_name, pos.base_salary
            FROM profiles p
            LEFT JOIN user_roles ur ON p.id = ur.user_id
            LEFT JOIN positions pos ON p.position_id = pos.id
            WHERE p.is_active = 1
        `);

        const salaries: any[] = [];

        for (const emp of employeesResult.rows) {
            // 1. Personal income (from deals where this person is the agent)
            const personalRes = await query(`
                SELECT 
                    COALESCE(SUM(agent_income), 0) as income,
                    COALESCE(SUM(commission_total_fact), 0) as revenue
                FROM deal_table_rows
                WHERE (agent_id = $1 OR agent_name = $2) AND year = $3 AND month = $4
                  AND status IN ('approved', 'active')
            `, [emp.id, emp.full_name, periodYear, periodMonth]);

            const personalIncomeSalary = Math.round(parseFloat(personalRes.rows[0]?.income) || 0);
            const personalRevenueRaw = parseFloat(personalRes.rows[0]?.revenue) || 0;

            // 2. Manager Bonuses (MOP/ROP/Mortgage Broker)
            // MOP/Broker revenue is in mop_revenue column
            const mopBonusRes = await query(`
                SELECT COALESCE(SUM(mop_revenue), 0) as total
                FROM deal_table_rows
                WHERE (mop_id = $1 OR mop_name = $2) AND year = $3 AND month = $4
                  AND status IN ('approved', 'active')
            `, [emp.id, emp.full_name, periodYear, periodMonth]);
            const teamBonus = Math.round(parseFloat(mopBonusRes.rows[0]?.total) || 0);

            // ROP revenue is in rop_payout column
            const ropBonusRes = await query(`
                SELECT COALESCE(SUM(rop_payout), 0) as total
                FROM deal_table_rows
                WHERE (rop_id = $1 OR rop_name = $2) AND year = $3 AND month = $4
                  AND status IN ('approved', 'active')
            `, [emp.id, emp.full_name, periodYear, periodMonth]);
            const departmentBonus = Math.round(parseFloat(ropBonusRes.rows[0]?.total) || 0);

            // 3. Base Salary
            // Fix: Ordinary Directors (position name exact "Директор") don't have a base salary, 
            // but might pick it up from positions table if confused with Commercial Director/ROP.
            const baseSalaryAmount = (emp.role === 'director' && emp.position_name?.trim() === 'Директор') 
                ? 0 
                : (emp.base_salary || 0);

            // 4. Total Calculation
            // Realtors usually don't have base salary in this logic, but managers do.
            const totalSalary = personalIncomeSalary + teamBonus + departmentBonus + baseSalaryAmount;

            if (totalSalary > 0) {
                salaries.push({
                    user_id: emp.id,
                    full_name: emp.full_name,
                    role: emp.role,
                    position_name: emp.position_name,
                    branch_id: emp.branch_id,
                    team_id: emp.team_id,
                    // Components
                    base_salary: baseSalaryAmount,
                    personal_income: personalIncomeSalary,
                    team_revenue: teamBonus,
                    department_revenue: departmentBonus,
                    // Backward compatibility / display
                    personal_income_raw: personalRevenueRaw,
                    total_salary: totalSalary,
                    commission: personalIncomeSalary + teamBonus + departmentBonus
                });
            }
        }
        res.json(salaries);
    } catch (error) {
        console.error('Get salaries error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Get personal salary for the current user (no permission required — users can always see their own salary)
router.get('/salaries/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { month, year, quarter } = req.query;

        let periodYear: number;
        let periodMonths: number[];

        if (quarter) {
            // Quarter mode: sum 3 months of the specified quarter
            periodYear = parseInt(year as string) || new Date().getFullYear();
            const q = parseInt(quarter as string);
            periodMonths = [
                (q - 1) * 3 + 1,
                (q - 1) * 3 + 2,
                (q - 1) * 3 + 3,
            ];
        } else if (year && month) {
            // Single month mode
            periodYear = parseInt(year as string);
            periodMonths = [parseInt(month as string)];
        } else {
            // Default to latest period with data
            const latestPeriod = await getLatestPeriodWithData();
            const [yearStr, monthStr] = latestPeriod.split('-');
            periodYear = parseInt(yearStr);
            periodMonths = [parseInt(monthStr)];
        }

        const userId = req.user!.id;

        // Personal income (from deals where this person is the agent)
        const personalRes = await query(`
            SELECT
                COALESCE(SUM(agent_income), 0) as income,
                COALESCE(SUM(commission_total_fact), 0) as revenue
            FROM deal_table_rows
            WHERE (agent_id = $1) AND year = $2 AND month = ANY($3)
              AND status IN ('approved', 'active')
        `, [userId, periodYear, periodMonths]);

        const personalIncomeSalary = Math.round(parseFloat(personalRes.rows[0]?.income) || 0);
        const personalRevenueRaw = parseFloat(personalRes.rows[0]?.revenue) || 0;

        // Manager Bonuses (MOP/ROP/Mortgage Broker)
        const mopBonusRes = await query(`
            SELECT COALESCE(SUM(mop_revenue), 0) as total
            FROM deal_table_rows
            WHERE (mop_id = $1) AND year = $2 AND month = ANY($3)
              AND status IN ('approved', 'active')
        `, [userId, periodYear, periodMonths]);
        const teamBonus = Math.round(parseFloat(mopBonusRes.rows[0]?.total) || 0);

        const ropBonusRes = await query(`
            SELECT COALESCE(SUM(rop_payout), 0) as total
            FROM deal_table_rows
            WHERE (rop_id = $1) AND year = $2 AND month = ANY($3)
              AND status IN ('approved', 'active')
        `, [userId, periodYear, periodMonths]);
        const departmentBonus = Math.round(parseFloat(ropBonusRes.rows[0]?.total) || 0);

        // Base Salary - multiply by number of months for quarter view
        const salaryRes = await query(`
            SELECT pos.base_salary, pos.name as position_name, ur.role
            FROM profiles p
            LEFT JOIN positions pos ON p.position_id = pos.id
            LEFT JOIN user_roles ur ON p.id = ur.user_id
            WHERE p.id = $1
        `, [userId]);
        const emp = salaryRes.rows[0] || {};
        const baseSalaryPerMonth = (emp.role === 'director' && emp.position_name?.trim() === 'Директор')
            ? 0
            : (emp.base_salary || 0);
        const baseSalaryAmount = baseSalaryPerMonth * periodMonths.length;

        const totalSalary = personalIncomeSalary + teamBonus + departmentBonus + baseSalaryAmount;

        res.json({
            period_year: periodYear,
            period_months: periodMonths,
            period_quarter: quarter ? parseInt(quarter as string) : null,
            base_salary: baseSalaryAmount,
            personal_income: personalIncomeSalary,
            team_revenue: teamBonus,
            department_revenue: departmentBonus,
            personal_revenue_raw: personalRevenueRaw,
            total_salary: totalSalary,
            commission: personalIncomeSalary + teamBonus + departmentBonus,
        });
    } catch (error) {
        console.error('Get personal salary error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Get paid salary components for an employee in a specific period
router.get('/salaries/paid-components', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { user_id, month, year } = req.query;

        if (!user_id || !month || !year) {
            res.status(400).json({ error: { message: 'user_id, month, and year are required' } });
            return;
        }

        const periodYear = parseInt(year as string);
        const periodMonth = parseInt(month as string);

        // Get start and end dates for the period
        const startDate = new Date(periodYear, periodMonth - 1, 1);
        const endDate = new Date(periodYear, periodMonth, 0, 23, 59, 59);

        const result = await query(
            `SELECT category, SUM(amount) as total_paid
             FROM transactions
             WHERE user_id = $1
               AND type = 'expense'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY category`,
            [user_id, startDate.toISOString(), endDate.toISOString()]
        );

        const paidComponents: Record<string, number> = {};
        result.rows.forEach((row: any) => {
            paidComponents[row.category] = parseFloat(row.total_paid) || 0;
        });

        res.json(paidComponents);
    } catch (error) {
        console.error('Get paid components error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Recalculate all finances - triggers recalculation from deals
router.post('/recalculate', authenticateToken, requirePermission('can_manage_finances'), computeLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { month, year, all } = req.body;

        const periods: Array<{ year: number; month: number }> = [];

        if (year && month) {
            periods.push({ year: parseInt(year), month: parseInt(month) });
        } else if (all) {
            const rows = await query(`
                SELECT DISTINCT year, month
                FROM deal_table_rows
                ORDER BY year DESC, month DESC
            `);
            for (const r of rows.rows) {
                periods.push({ year: parseInt(r.year), month: parseInt(r.month) });
            }
        } else {
            const latestPeriod = await getLatestPeriodWithData();
            const [y, m] = latestPeriod.split('-');
            periods.push({ year: parseInt(y), month: parseInt(m) });
        }

        const updatedByPeriod: Array<{ period: string; deals_updated: number }> = [];
        let updatedCount = 0;

        for (const p of periods) {
            try {
                await query(`
                    UPDATE deal_table_rows dtr
                    SET
                        commission_seller_fact = COALESCE(NULLIF(dc.commission_seller_fact, 0), dtr.commission_seller_fact),
                        commission_buyer_fact = COALESCE(NULLIF(dc.commission_buyer_fact, 0), dtr.commission_buyer_fact),
                        agent_percent_seller = CASE
                            WHEN COALESCE(dtr.agent_percent_seller, 0) = 0 THEN COALESCE(NULLIF(dc.agent_percent_seller, 0), 50)
                            ELSE dtr.agent_percent_seller
                        END,
                        agent_percent_buyer = CASE
                            WHEN COALESCE(dtr.agent_percent_buyer, 0) = 0 THEN COALESCE(NULLIF(dc.agent_percent_buyer, 0), 50)
                            ELSE dtr.agent_percent_buyer
                        END,
                        updated_at = $3
                    FROM deals d
                    JOIN deal_commissions dc ON dc.deal_id = d.id
                    LEFT JOIN deal_participants dp ON dp.deal_id = d.id AND dp.role IN ('realtor', 'agent')
                    LEFT JOIN profiles p ON p.id = dp.employee_id
                    WHERE dtr.year = $1
                      AND dtr.month = $2
                      AND d.period_year = dtr.year
                      AND d.period_month = dtr.month
                      AND LOWER(TRIM(d.property_object)) = LOWER(TRIM(dtr.property_name))
                      AND (
                        p.full_name IS NULL
                        OR LOWER(TRIM(p.full_name)) = LOWER(TRIM(dtr.agent_name))
                      )
                      AND COALESCE(dtr.commission_seller_fact, 0) = 0
                      AND COALESCE(dtr.commission_buyer_fact, 0) = 0
                      AND COALESCE(dtr.commission_total_fact, 0) = 0
                `, [p.year, p.month, new Date().toISOString()]);
            } catch (e) {
                // Optional backfill
            }

            const dealsResult = await query(`
                SELECT id,
                       commission_seller_fact,
                       commission_buyer_fact,
                       commission_total_fact,
                       mortgage_deduction,
                       agent_percent_seller,
                       agent_percent_buyer,
                       mop_percent,
                       rop_percent
                FROM deal_table_rows
                WHERE year = $1 AND month = $2
            `, [p.year, p.month]);

            let periodUpdated = 0;

            for (const deal of dealsResult.rows) {
                const existingTotal = parseFloat(deal.commission_total_fact || 0);

                const sellerFact = parseFloat(deal.commission_seller_fact || 0);
                const buyerFact = parseFloat(deal.commission_buyer_fact || 0);
                const mortgageDeduction = parseFloat(deal.mortgage_deduction || 0);

                if (existingTotal > 0 && sellerFact === 0 && buyerFact === 0 && mortgageDeduction === 0) {
                    continue;
                }

                const commission_seller_adjusted = sellerFact - mortgageDeduction;
                const computedTotal = commission_seller_adjusted + buyerFact;

                const commission_total_fact = existingTotal > 0 ? existingTotal : computedTotal;

                if (existingTotal > 0 && sellerFact === 0 && buyerFact === 0 && mortgageDeduction === 0) {
                    continue;
                }

                const agent_income =
                    (commission_seller_adjusted * parseFloat(deal.agent_percent_seller || 0) / 100) +
                    (buyerFact * parseFloat(deal.agent_percent_buyer || 0) / 100);

                if (existingTotal > 0 && computedTotal === 0) {
                    continue;
                }

                const mop_revenue =
                    commission_total_fact * parseFloat(deal.mop_percent || 0) / 100;

                const rop_payout =
                    commission_total_fact * parseFloat(deal.rop_percent || 0) / 100;

                const company_revenue =
                    commission_total_fact - agent_income - mop_revenue - rop_payout;

                await query(`
                    UPDATE deal_table_rows
                    SET commission_total_fact = $1,
                        agent_income = $2,
                        mop_revenue = $3,
                        rop_payout = $4,
                        company_revenue = $5,
                        updated_at = $6
                    WHERE id = $7
                `, [
                    commission_total_fact.toFixed(2),
                    agent_income.toFixed(2),
                    mop_revenue.toFixed(2),
                    rop_payout.toFixed(2),
                    company_revenue.toFixed(2),
                    new Date().toISOString(),
                    deal.id
                ]);

                periodUpdated++;
            }

            updatedCount += periodUpdated;
            updatedByPeriod.push({
                period: `${p.year}-${String(p.month).padStart(2, '0')}`,
                deals_updated: periodUpdated
            });
        }

        const rebuildTransactions = req.body?.rebuild_transactions === true;
        if (rebuildTransactions) {
            try {
                const nowIso = new Date().toISOString();

                await query(
                    `DELETE FROM transactions
                     WHERE type = 'income'
                       AND category = 'deal_commission'
                       AND (
                         description LIKE 'Комиссия по сделке:%'
                         OR description LIKE 'Сделка:%'
                       )
                       AND description NOT LIKE '%(Отчет:%'`
                );

                const dealRows = await query(
                     `SELECT id, property_name, commission_total_fact, service, agent_percent
                      FROM deal_table_rows
                      WHERE COALESCE(commission_total_fact, 0) > 0
                        AND status IN ('approved', 'active')`
                );

                for (const d of dealRows.rows) {
                    const txId = uuidv4();
                    const service = (d.service || '').toLowerCase();
                    const accountType = (service.includes('ипотека') || service.includes('новостро')) ? 'account' : 'cash';

                    const existing = await query(
                        `SELECT id FROM transactions
                         WHERE type = 'income'
                           AND category = 'deal_commission'
                           AND deal_id = $1
                           AND (
                             description IS NULL
                             OR description LIKE 'Комиссия по сделке:%'
                             OR description LIKE 'Сделка:%'
                           )
                         LIMIT 1`,
                        [String(d.id)]
                    );

                    if (existing.rows.length > 0) {
                        await query(
                            `UPDATE transactions
                             SET amount = $1,
                                 description = $2,
                                 agent_commission_percent = $3,
                                 rop_commission_percent = $4,
                                 account_type = $5,
                                 updated_at = $6
                             WHERE id = $7`,
                            [
                                parseFloat(d.commission_total_fact),
                                `Комиссия по сделке: ${d.property_name}`,
                                parseFloat(d.agent_percent || 0),
                                0,
                                accountType,
                                nowIso,
                                existing.rows[0].id
                            ]
                        );
                    } else {
                        await query(
                            `INSERT INTO transactions (
                               id, type, category, amount, description,
                               agent_commission_percent, rop_commission_percent,
                               deal_id, account_type,
                               created_at, updated_at
                             ) VALUES ($1, 'income', 'deal_commission', $2, $3, $4, $5, $6, $7, $8, $9)`,
                            [
                                txId,
                                parseFloat(d.commission_total_fact),
                                `Комиссия по сделке: ${d.property_name}`,
                                parseFloat(d.agent_percent || 0),
                                0,
                                String(d.id),
                                accountType,
                                nowIso,
                                nowIso
                            ]
                        );
                    }
                }
            } catch (e) {
                console.error('Rebuild deal_commission transactions skipped/failed:', (e as any)?.message || e);
            }
        }

        try {
            if (cacheService) {
                await cacheService.invalidate('kpi:*');
                await cacheService.invalidate('leaderboard:*');
            }
        } catch (e) {
            // cache is optional
        }

        res.json({
            message: 'Finances recalculated successfully',
            all: !!all,
            updated_total: updatedCount,
            periods: updatedByPeriod
        });
    } catch (error) {
        console.error('Recalculate finances error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
