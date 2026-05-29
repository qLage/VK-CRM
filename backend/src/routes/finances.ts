import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getLatestPeriodWithData } from '../utils/periodHelper';
import { computeLimiter } from '../middleware/rateLimiter';

import cacheService from '../lib/cache.service';
import { sumManualPersonalForCalendarMonths } from '../lib/employeeManualFinance';
import DealTableRow from '../models/DealTableRow';
import {
    getPayrollOrgSettings,
    getPayrollOrgSettingsApiResponse,
    upsertPayrollOrgSettings,
    resolveEffectiveBaseSalary,
    positionMatchesCommercialExecutive,
    payoutActionExists,
    insertPayoutAction,
    loadPayrollMonthlyState,
    upsertPayrollMonthlyState,
    computePayrollAmounts,
    PAYROLL_PAYOUT_SEQUENCE,
    firstBlockedPriorStep,
    payrollOutOfOrderMessageRu,
    rub,
    DEFAULT_PAYROLL_ORG_SETTINGS,
    type PayrollPayoutActionKind,
} from '../services/payroll.service';
import { logAudit } from '../utils/audit';

function payrollPreviewSequenceFields(stepDone: Partial<Record<PayrollPayoutActionKind, boolean>>): {
    sequence_locked: Partial<Record<PayrollPayoutActionKind, string>>;
    next_allowed_action: PayrollPayoutActionKind | null;
} {
    const sequence_locked: Partial<Record<PayrollPayoutActionKind, string>> = {};
    for (const k of PAYROLL_PAYOUT_SEQUENCE) {
        const block = firstBlockedPriorStep(k, stepDone);
        if (block !== null) sequence_locked[k] = payrollOutOfOrderMessageRu(block);
    }
    let next_allowed_action: PayrollPayoutActionKind | null = null;
    for (const k of PAYROLL_PAYOUT_SEQUENCE) {
        if (stepDone[k]) continue;
        if (firstBlockedPriorStep(k, stepDone) !== null) continue;
        next_allowed_action = k;
        break;
    }
    return { sequence_locked, next_allowed_action };
}

const router = express.Router();

/** Названия месяца после «за …» («за май 2026»), без родительного падежа. */
const MONTH_ACCUSATIVE_FOR_PAYROLL_PERIOD = ['', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function payrollPeriodLabelRu(year: number, month: number): string {
    const name = MONTH_ACCUSATIVE_FOR_PAYROLL_PERIOD[month] || `мес.${month}`;
    return `${name} ${year}`;
}

function parseRowBool(v: unknown): boolean {
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    if (v == null) return false;
    if (typeof v === 'string') {
        const s = v.toLowerCase();
        return s === 'true' || s === 't' || s === '1';
    }
    return Boolean(v);
}

/** Build [start, end) ISO date strings for a given year/month to filter deal_date / payment_date columns (TEXT/TIMESTAMP). */
function periodBounds(year: number, month: number): { start: string; end: string } {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { start, end };
}

/** Build [start, end) for a contiguous range of months (e.g. quarter). */
function multiMonthBounds(year: number, months: number[]): { start: string; end: string } {
    const minMonth = Math.min(...months);
    const maxMonth = Math.max(...months);
    const start = `${year}-${String(minMonth).padStart(2, '0')}-01`;
    const endMonth = maxMonth + 1;
    const end = endMonth > 12 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, '0')}-01`;
    return { start, end };
}

async function resolveUsesOfficialPayroll(profileId: string): Promise<boolean> {
    try {
        const r = await query(`SELECT uses_official_payroll AS u FROM profiles WHERE id = $1`, [profileId]);
        return parseRowBool(r.rows[0]?.u);
    } catch {
        return false;
    }
}

function payrollRolePickPriority(role: string | null | undefined): number {
    const r = String(role ?? '').toLowerCase();
    if (r === 'commercial') return 0;
    if (r === 'head_sales') return 1;
    if (r === 'sales_manager') return 2;
    if (r === 'mortgage_broker') return 3;
    if (r === 'director') return 4;
    if (r === 'realtor') return 5;
    return 50;
}

function pickPreferredPayrollRoleRow(rows: Array<{ role?: string | null; position_name?: string | null; base_salary?: unknown }>): Record<string, unknown> {
    if (!rows?.length) return {};
    let best = rows[0];
    let bestP = payrollRolePickPriority(best?.role ?? null);
    for (let i = 1; i < rows.length; i++) {
        const cur = rows[i];
        const p = payrollRolePickPriority(cur?.role ?? null);
        if (p < bestP) {
            best = cur;
            bestP = p;
        }
    }
    return (best ?? {}) as Record<string, unknown>;
}

/** GET /payroll-role-assignments: match canonical `user_roles` plus legacy branch `manager` and titles on `positions` (same heuristic as KPI + auth JWT refresh). Alias `pos` = positions joined on `p.position_id`. */
function sqlPayrollAssignmentTierPredicate(roleSlug: 'sales_manager' | 'head_sales' | 'commercial'): string {
    const posLc = `LOWER(COALESCE(pos.name, ''))`;
    switch (roleSlug) {
        case 'sales_manager':
            return `(
                EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('sales_manager', 'manager'))
                OR ${posLc} LIKE '%моп%'
            )`;
        case 'head_sales':
            return `(
                EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('head_sales'))
                OR (${posLc} LIKE '%роп%' AND ${posLc} NOT LIKE '%коммерч%')
            )`;
        case 'commercial':
            return `(
                EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('commercial'))
                OR ${posLc} LIKE '%коммерч%'
            )`;
    }
}

/** PATCH eligibility: frontend uses one endpoint for all tiers; profile must qualify for at least one payroll-management tier */
function sqlPayrollAssignmentPatchEligiblePredicate(): string {
    return (
        '(' +
        [
            sqlPayrollAssignmentTierPredicate('sales_manager'),
            sqlPayrollAssignmentTierPredicate('head_sales'),
            sqlPayrollAssignmentTierPredicate('commercial'),
        ].join('\n OR ') +
        ')'
    );
}

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
                    COALESCE(deal_date::timestamp, payment_date::timestamp, created_at) as created_at,
                    COALESCE(deal_date::timestamp, payment_date::timestamp, created_at) as updated_at,
                    year::int as year,
                    month::int as month
                FROM deal_table_rows
                WHERE COALESCE(commission_total_fact, 0) > 0
                  AND company_id = $${companyIdParamIndex}
                  AND status IN ('approved', 'active')
                  AND payment_date IS NOT NULL
                  AND payment_date <> ''
                  AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date

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
                    updated_at::timestamp,
                    EXTRACT(YEAR FROM created_at)::int as year,
                    EXTRACT(MONTH FROM created_at)::int as month
                FROM transactions
                WHERE company_id = $${companyIdParamIndex}
                  -- Avoid duplicated "Комиссия по сделке" rows:
                  -- these are already projected from deal_table_rows above.
                  AND NOT (
                    category = 'deal_commission'
                    AND (
                      deal_id IS NOT NULL
                      OR description LIKE 'Комиссия по сделке:%'
                    )
                  )
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
        body('booked_at').optional().isISO8601(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { type, category, amount, description, related_user_id, account_type, component_type, booked_at } = req.body;
            const id = uuidv4();
            const now = new Date().toISOString();
            let createdTs = now;
            if (booked_at && typeof booked_at === 'string') {
                const parsed = new Date(booked_at);
                if (!Number.isNaN(parsed.getTime())) {
                    createdTs = parsed.toISOString();
                }
            }

            await query(
                `INSERT INTO transactions (id, type, category, amount, description, user_id, account_type, company_id, created_at, updated_at, component_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [id, type, category, amount, description, related_user_id || null, account_type || 'cash', req.user!.company_id, createdTs, createdTs, component_type || null]
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
            await logAudit(req, 'CREATE', 'finance', id, { name: description || '' });
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
        const { type, category, amount, description, account_type, related_user_id, booked_at } = req.body;

        const checkResult = await query('SELECT id FROM transactions WHERE id = $1', [id]);

        // If not in transactions table, check if it's a deal commission from deal_table_rows
        if (checkResult.rows.length === 0) {
            const dealResult = await query('SELECT id, service FROM deal_table_rows WHERE id = $1', [id]);
            if (dealResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Transaction not found' } });
                return;
            }

            const dealPatch: Record<string, unknown> = {};
            if (amount !== undefined) {
                const n = Number(amount);
                if (Number.isFinite(n) && n >= 0) {
                    const cur = await query(
                        'SELECT commission_seller_fact, commission_buyer_fact FROM deal_table_rows WHERE id = $1',
                        [id],
                    );
                    const row0 = cur.rows[0] || {};
                    const cs = parseFloat(String(row0.commission_seller_fact ?? 0)) || 0;
                    const cb = parseFloat(String(row0.commission_buyer_fact ?? 0)) || 0;
                    const prev = cs + cb;
                    if (prev > 0) {
                        const ratio = n / prev;
                        dealPatch.commission_seller_fact = cs * ratio;
                        dealPatch.commission_buyer_fact = cb * ratio;
                    } else {
                        dealPatch.commission_seller_fact = n;
                        dealPatch.commission_buyer_fact = 0;
                    }
                }
            }
            if (account_type !== undefined) {
                if (account_type === 'account') {
                    dealPatch.service = 'Новостройка';
                } else {
                    dealPatch.service = 'Вторичка';
                }
            }

            if (req.body.year !== undefined || req.body.month !== undefined) {
                const y = Number(req.body.year);
                const m = Number(req.body.month);
                if (Number.isFinite(y) && y >= 2000 && y <= 2100) dealPatch.year = y;
                if (Number.isFinite(m) && m >= 1 && m <= 12) dealPatch.month = m;
            }

            if (Object.keys(dealPatch).length > 0) {
                await DealTableRow.update(id, dealPatch as any);
            }

            const result = await query(
                `SELECT id, 'income' as type, 'deal_commission' as category,
                        commission_total_fact as amount,
                        ('Комиссия по сделке: ' || COALESCE(property_name, '')) as description,
                        CASE WHEN service IS NOT NULL AND (LOWER(service) LIKE '%ипотек%' OR LOWER(service) LIKE '%новостро%')
                             THEN 'account' ELSE 'cash' END as account_type,
                        COALESCE(deal_date::timestamp, payment_date::timestamp, created_at) as created_at,
                        COALESCE(deal_date::timestamp, payment_date::timestamp, created_at) as updated_at,
                        year::int as year, month::int as month
                 FROM deal_table_rows WHERE id = $1`,
                [id]
            );
            if (!result.rows[0]) {
                res.status(404).json({ error: { message: 'Transaction not found after update' } });
                return;
            }
            await logAudit(req, 'UPDATE', 'finance', id, { name: result.rows[0]?.description || '', ...dealPatch });
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
        if (related_user_id !== undefined) {
            fields.push(`user_id = $${idx++}`);
            values.push(related_user_id === '' || related_user_id === null ? null : related_user_id);
        }
        if (booked_at !== undefined && typeof booked_at === 'string') {
            const parsed = new Date(booked_at);
            if (!Number.isNaN(parsed.getTime())) {
                fields.push(`created_at = $${idx++}`);
                values.push(parsed.toISOString());
            }
        }
        fields.push(`updated_at = $${idx++}`);
        values.push(new Date().toISOString());
        values.push(id);

        await query(`UPDATE transactions SET ${fields.join(', ')} WHERE id = $${idx}`, values);

        const result = await query('SELECT * FROM transactions WHERE id = $1', [id]);
        if (!result.rows[0]) {
            res.status(404).json({ error: { message: 'Transaction not found after update' } });
            return;
        }
        const changes: Record<string, any> = {};
        if (type !== undefined) changes.type = type;
        if (category !== undefined) changes.category = category;
        if (amount !== undefined) changes.amount = amount;
        if (description !== undefined) changes.description = description;
        if (account_type !== undefined) changes.account_type = account_type;
        if (related_user_id !== undefined) changes.related_user_id = related_user_id;
        if (booked_at !== undefined) changes.booked_at = booked_at;
        await logAudit(req, 'UPDATE', 'finance', id, { name: result.rows[0]?.description || '', ...changes });
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

        const checkResult = await query('SELECT id, description FROM transactions WHERE id = $1', [id]);

        if (checkResult.rows.length === 0) {
            // Check if it's a deal commission from deal_table_rows
            const dealResult = await query('SELECT id, property_name FROM deal_table_rows WHERE id = $1', [id]);
            if (dealResult.rows.length === 0) {
                res.status(404).json({ error: { message: 'Transaction not found' } });
                return;
            }
            // For deal-originated incomes, reset commission to 0 instead of deleting the row
            await query('UPDATE deal_table_rows SET commission_total_fact = 0, updated_at = $1 WHERE id = $2', [new Date().toISOString(), id]);
            await logAudit(req, 'DELETE', 'finance', id, { name: dealResult.rows[0]?.property_name || '' });
            res.json({ message: 'Transaction deleted successfully' });
            return;
        }

        await query('DELETE FROM transactions WHERE id = $1', [id]);
        await logAudit(req, 'DELETE', 'finance', id, { name: checkResult.rows[0]?.description || '' });

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
               AND status IN ('approved', 'active')
               AND payment_date IS NOT NULL
               AND payment_date <> ''
               AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date`,
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
        const companyId = (req.user as any)?.company_id as string | undefined;
        const userId = (req.user as any)?.id as string | undefined;
        console.log(`[SALARIES] Request from user=${userId}, company=${companyId}, year=${year}, month=${month}`);

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
        console.log(`[SALARIES] Period: ${periodYear}-${periodMonth}`);

        let payrollOrg;
        try {
            payrollOrg = companyId ? await getPayrollOrgSettings(companyId) : DEFAULT_PAYROLL_ORG_SETTINGS;
            console.log(`[SALARIES] Payroll org loaded: ${JSON.stringify(payrollOrg)}`);
        } catch (payrollErr) {
            console.error(`[SALARIES] Payroll org error:`, payrollErr);
            payrollOrg = DEFAULT_PAYROLL_ORG_SETTINGS;
        }

        let employeesResult;
        try {
            employeesResult = await query(`
                SELECT p.id, p.full_name, p.team_id, p.branch_id, ur.role, pos.name as position_name, pos.base_salary,
                       p.uses_official_payroll AS uses_official_payroll
                FROM profiles p
                LEFT JOIN user_roles ur ON p.id = ur.user_id
                LEFT JOIN positions pos ON p.position_id = pos.id
                WHERE p.is_active = 1
            `);
            console.log(`[SALARIES] Employees loaded: ${employeesResult.rows.length} rows`);
        } catch (empErr) {
            console.error(`[SALARIES] Employees query error:`, empErr);
            throw empErr;
        }

        const empRowsByProfile = new Map<string, typeof employeesResult.rows>();
        for (const row of employeesResult.rows as any[]) {
            const pid = String(row.id);
            const bucket = empRowsByProfile.get(pid);
            if (bucket) bucket.push(row);
            else empRowsByProfile.set(pid, [row]);
        }

        // Multiple `user_roles` rows collapse to one row per profile; pickPreferredPayrollRoleRow ranks roles so `commercial` wins over МОП/РОП.

        const salaries: any[] = [];

        const { start: pStart, end: pEnd } = periodBounds(periodYear, periodMonth);

        const DEAL_DATE_SQL = `COALESCE(NULLIF(deal_date, ''), NULLIF(payment_date, ''), NULLIF(deposit_date, ''))`;

        for (const emp of Array.from(empRowsByProfile.values()).map((rows) => pickPreferredPayrollRoleRow(rows)) as any[]) {
            // 1. Personal income (from deals where this person is the agent)
            // Fallback: if agent_id is NULL, credit to created_by (the person who created the deal)
            const personalRes = await query(`
                SELECT 
                    COALESCE(SUM(agent_income), 0) as income,
                    COALESCE(SUM(commission_total_fact), 0) as revenue
                FROM deal_table_rows
                WHERE (
                    agent_id = $1 
                    OR agent_name = $2
                    OR (agent_id IS NULL AND created_by = $1)
                )
                  AND ${DEAL_DATE_SQL} >= $3 AND ${DEAL_DATE_SQL} < $4
                  AND status IN ('approved', 'active')
            `, [emp.id, emp.full_name, pStart, pEnd]);
            console.log(`[SALARIES] ${emp.full_name} (id=${emp.id}) personal:`, personalRes.rows[0]);

            let financePersonalBonus = 0;
            if (companyId) {
                const rawPersonal = await sumManualPersonalForCalendarMonths(emp.id, companyId, periodYear, [periodMonth]);
                financePersonalBonus = Math.round(rawPersonal || 0);
            }

            const personalIncomeSalary = Math.round((parseFloat(personalRes.rows[0]?.income) || 0) + financePersonalBonus);
            const personalRevenueRaw = parseFloat(personalRes.rows[0]?.revenue) || 0;

            // 2. Manager Bonuses (MOP/ROP/Mortgage Broker)
            // MOP/Broker revenue is in mop_revenue column
            const mopBonusRes = await query(`
                SELECT COALESCE(SUM(mop_revenue), 0) as total
                FROM deal_table_rows
                WHERE (mop_id = $1 OR mop_name = $2)
                  AND ${DEAL_DATE_SQL} >= $3 AND ${DEAL_DATE_SQL} < $4
                  AND status IN ('approved', 'active')
                  AND payment_date IS NOT NULL
                  AND payment_date <> ''
                  AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date
            `, [emp.id, emp.full_name, pStart, pEnd]);
            const teamBonus = Math.round(parseFloat(mopBonusRes.rows[0]?.total) || 0);

            // ROP revenue is in rop_payout column
            const ropBonusRes = await query(`
                SELECT COALESCE(SUM(rop_payout), 0) as total
                FROM deal_table_rows
                WHERE (rop_id = $1 OR rop_name = $2)
                  AND ${DEAL_DATE_SQL} >= $3 AND ${DEAL_DATE_SQL} < $4
                  AND status IN ('approved', 'active')
                  AND payment_date IS NOT NULL
                  AND payment_date <> ''
                  AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date
            `, [emp.id, emp.full_name, pStart, pEnd]);
            const departmentBonus = Math.round(parseFloat(ropBonusRes.rows[0]?.total) || 0);

            let mortgageAgentIncome = 0;
            let mortgageBrokerIncome = 0;
            if (companyId) {
                const mortgageAgentRes = await query(
                    `SELECT COALESCE(SUM(agent_fee), 0) as total
                     FROM mortgage_service_rows
                     WHERE company_id = $5
                       AND deal_date >= $3 AND deal_date < $4 AND status = 'approved'
                       AND (
                         agent_id = $1
                         OR (COALESCE(TRIM(agent_name), '') <> '' AND LOWER(TRIM(agent_name)) = LOWER(TRIM($2)))
                       )`,
                    [emp.id, emp.full_name || '', pStart, pEnd, companyId]
                );
                const mortgageBrokerRes = await query(
                    `SELECT COALESCE(SUM(broker_share), 0) as total
                     FROM mortgage_service_rows
                     WHERE company_id = $5
                       AND deal_date >= $3 AND deal_date < $4 AND status = 'approved'
                       AND (
                         broker_id = $1
                         OR (COALESCE(TRIM(broker_name), '') <> '' AND LOWER(TRIM(broker_name)) = LOWER(TRIM($2)))
                       )`,
                    [emp.id, emp.full_name || '', pStart, pEnd, companyId]
                );
                mortgageAgentIncome = Math.round(parseFloat(mortgageAgentRes.rows[0]?.total) || 0);
                mortgageBrokerIncome = Math.round(parseFloat(mortgageBrokerRes.rows[0]?.total) || 0);
            }

            // 3. Base Salary (positions + org overrides for МОП/РОП/коммерческий)
            const rawPosBase =
                emp.role === 'director' && emp.position_name?.trim() === 'Директор'
                    ? 0
                    : emp.base_salary || 0;
            const baseSalaryAmount = resolveEffectiveBaseSalary(
                emp.role,
                emp.position_name,
                rawPosBase,
                payrollOrg,
            );

            // 4. Total Calculation
            // Realtors usually don't have base salary in this logic, but managers do.
            const totalSalary =
                personalIncomeSalary +
                teamBonus +
                departmentBonus +
                baseSalaryAmount +
                mortgageAgentIncome +
                mortgageBrokerIncome;

            // Show commercial executives even when variable pay + оклад resolve to 0 (same period / settings).
            const isCommercialExecRow =
                emp.role === 'commercial' || positionMatchesCommercialExecutive(emp.position_name);

            if (totalSalary > 0 || isCommercialExecRow) {
                salaries.push({
                    user_id: emp.id,
                    full_name: emp.full_name,
                    role: emp.role,
                    position_name: emp.position_name,
                    branch_id: emp.branch_id,
                    team_id: emp.team_id,
                    uses_official_payroll: parseRowBool((emp as { uses_official_payroll?: unknown }).uses_official_payroll),
                    payroll_scheme: parseRowBool((emp as { uses_official_payroll?: unknown }).uses_official_payroll)
                        ? 'official'
                        : 'flat',
                    // Components
                    base_salary: baseSalaryAmount,
                    personal_income: personalIncomeSalary,
                    team_revenue: teamBonus,
                    department_revenue: departmentBonus,
                    mortgage_agent_income: mortgageAgentIncome,
                    mortgage_broker_income: mortgageBrokerIncome,
                    finance_personal_bonus: financePersonalBonus,
                    // Backward compatibility / display
                    personal_income_raw: personalRevenueRaw,
                    total_salary: totalSalary,
                    commission:
                        personalIncomeSalary +
                        teamBonus +
                        departmentBonus +
                        mortgageAgentIncome +
                        mortgageBrokerIncome,
                    // DEBUG
                    _debug_personal_sql_income: personalRes.rows[0]?.income,
                    _debug_personal_sql_revenue: personalRes.rows[0]?.revenue,
                    _debug_period_start: pStart,
                    _debug_period_end: pEnd,
                });
            }
        }
        console.log(`[SALARIES] Response: ${salaries.length} salary records`);
        res.json(salaries);
    } catch (error) {
        console.error('[SALARIES] FATAL ERROR:', error);
        console.error('[SALARIES] Stack:', (error as Error).stack);
        res.status(500).json({ error: { message: 'Server error', detail: (error as Error).message } });
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
        const companyId = (req.user as any)?.company_id as string | undefined;
        const payrollOrg = companyId ? await getPayrollOrgSettings(companyId) : DEFAULT_PAYROLL_ORG_SETTINGS;
        const { start: meStart, end: meEnd } = multiMonthBounds(periodYear, periodMonths);

        // Personal income (from paid transactions to this employee)
        const personalRes = await query(`
            SELECT
                COALESCE(SUM(amount), 0) as income,
                COALESCE(SUM(amount), 0) as revenue
            FROM transactions
            WHERE user_id = $1
              AND type = 'expense'
              AND EXTRACT(YEAR FROM created_at) = $2
              AND EXTRACT(MONTH FROM created_at) = ANY($3)
        `, [userId, periodYear, periodMonths]);

        const personalIncomeSalary = Math.round(parseFloat(personalRes.rows[0]?.income) || 0);
        const personalRevenueRaw = parseFloat(personalRes.rows[0]?.revenue) || 0;

        const DEAL_DATE_SQL_ME = `COALESCE(NULLIF(deal_date, ''), NULLIF(payment_date, ''), NULLIF(deposit_date, ''))`;

        // Manager Bonuses (MOP/ROP/Mortgage Broker)
        const mopBonusRes = await query(`
            SELECT COALESCE(SUM(mop_revenue), 0) as total
            FROM deal_table_rows
            WHERE (mop_id = $1)
              AND ${DEAL_DATE_SQL_ME} >= $2 AND ${DEAL_DATE_SQL_ME} < $3
              AND status IN ('approved', 'active')
              AND payment_date IS NOT NULL
              AND payment_date <> ''
              AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date
        `, [userId, meStart, meEnd]);
        const teamBonus = Math.round(parseFloat(mopBonusRes.rows[0]?.total) || 0);

        const ropBonusRes = await query(`
            SELECT COALESCE(SUM(rop_payout), 0) as total
            FROM deal_table_rows
            WHERE (rop_id = $1)
              AND ${DEAL_DATE_SQL_ME} >= $2 AND ${DEAL_DATE_SQL_ME} < $3
              AND status IN ('approved', 'active')
              AND payment_date IS NOT NULL
              AND payment_date <> ''
              AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date
        `, [userId, meStart, meEnd]);
        const departmentBonus = Math.round(parseFloat(ropBonusRes.rows[0]?.total) || 0);

        // Base Salary - multiply by number of months for quarter view
        const salaryRes = await query(`
            SELECT pos.base_salary, pos.name as position_name, ur.role, p.full_name, p.uses_official_payroll
            FROM profiles p
            LEFT JOIN positions pos ON p.position_id = pos.id
            LEFT JOIN user_roles ur ON p.id = ur.user_id
            WHERE p.id = $1
        `, [userId]);
        const emp = pickPreferredPayrollRoleRow(salaryRes.rows as Array<{ role?: string | null; position_name?: string | null; base_salary?: unknown; full_name?: string }>) as Record<string, any>;
        const usesOfficialPayrollSelf = parseRowBool(emp.uses_official_payroll);
        const rawPosMonthly =
            emp.role === 'director' && emp.position_name?.trim() === 'Директор'
                ? 0
                : emp.base_salary || 0;
        const baseSalaryPerMonth = resolveEffectiveBaseSalary(
            emp.role,
            emp.position_name,
            rawPosMonthly,
            payrollOrg,
        );
        const baseSalaryAmount = baseSalaryPerMonth * periodMonths.length;

        const employeeFullName = String(emp.full_name || '');
        let mortgageAgentIncome = 0;
        let mortgageBrokerIncome = 0;
        if (companyId) {
            const mortgageAgentRes = await query(
                `SELECT COALESCE(SUM(agent_fee), 0) as total
                 FROM mortgage_service_rows
                 WHERE company_id = $4
                   AND deal_date >= $2 AND deal_date < $3 AND status = 'approved'
                   AND (
                     agent_id = $1 OR (COALESCE(TRIM(agent_name), '') <> '' AND LOWER(TRIM(agent_name)) = LOWER(TRIM($5)))
                   )`,
                [userId, meStart, meEnd, companyId, employeeFullName]
            );
            const mortgageBrokerRes = await query(
                `SELECT COALESCE(SUM(broker_share), 0) as total
                 FROM mortgage_service_rows
                 WHERE company_id = $4
                   AND deal_date >= $2 AND deal_date < $3 AND status = 'approved'
                   AND (
                     broker_id = $1 OR (COALESCE(TRIM(broker_name), '') <> '' AND LOWER(TRIM(broker_name)) = LOWER(TRIM($5)))
                   )`,
                [userId, meStart, meEnd, companyId, employeeFullName]
            );
            mortgageAgentIncome = Math.round(parseFloat(mortgageAgentRes.rows[0]?.total) || 0);
            mortgageBrokerIncome = Math.round(parseFloat(mortgageBrokerRes.rows[0]?.total) || 0);
        }

        let financePersonalBonus = 0;
        if (companyId) {
            const rawPersonal = await sumManualPersonalForCalendarMonths(userId, companyId, periodYear, periodMonths);
            financePersonalBonus = Math.round(rawPersonal || 0);
        }

        const totalSalary =
            personalIncomeSalary +
            teamBonus +
            departmentBonus +
            baseSalaryAmount +
            mortgageAgentIncome +
            mortgageBrokerIncome +
            financePersonalBonus;

        res.json({
            period_year: periodYear,
            period_months: periodMonths,
            period_quarter: quarter ? parseInt(quarter as string) : null,
            base_salary: baseSalaryAmount,
            personal_income: personalIncomeSalary,
            team_revenue: teamBonus,
            department_revenue: departmentBonus,
            mortgage_agent_income: mortgageAgentIncome,
            mortgage_broker_income: mortgageBrokerIncome,
            personal_revenue_raw: personalRevenueRaw,
            finance_personal_bonus: financePersonalBonus,
            total_salary: totalSalary,
            uses_official_payroll: usesOfficialPayrollSelf,
            payroll_scheme: usesOfficialPayrollSelf ? 'official' : 'flat',
            commission:
                personalIncomeSalary +
                teamBonus +
                departmentBonus +
                mortgageAgentIncome +
                mortgageBrokerIncome +
                financePersonalBonus,
        });
    } catch (error) {
        console.error('Get personal salary error:', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

// Debug endpoint to diagnose salary calculation for a specific user
router.get('/salaries/debug-calc', async (req: Request, res: Response): Promise<void> => {
    try {
        const { user_id, month, year } = req.query;
        const companyId = (req.user as any)?.company_id as string | undefined;

        if (!user_id || !month || !year) {
            res.status(400).json({ error: { message: 'user_id, month, and year are required' } });
            return;
        }

        const periodYear = parseInt(year as string);
        const periodMonth = parseInt(month as string);
        const { start, end } = periodBounds(periodYear, periodMonth);

        // Employee info
        const empRes = await query(`
            SELECT p.id, p.full_name, ur.role, pos.name as position_name
            FROM profiles p
            LEFT JOIN user_roles ur ON p.id = ur.user_id
            LEFT JOIN positions pos ON p.position_id = pos.id
            WHERE p.id = $1
        `, [user_id]);
        const emp = empRes.rows[0];

        // All deals for this period with non-zero agent_income
        const allDealsRes = await query(`
            SELECT id, property_name, agent_id, agent_name, agent_income, commission_total_fact, status,
                   deal_date, payment_date, deposit_date, created_by
            FROM deal_table_rows
            WHERE deal_date >= $1 AND deal_date < $2
              AND status IN ('approved', 'active')
            ORDER BY agent_income DESC
            LIMIT 50
        `, [start, end]);

        // Filtered by this employee
        const filteredRes = await query(`
            SELECT COALESCE(SUM(agent_income), 0) as income, COUNT(*) as cnt
            FROM deal_table_rows
            WHERE (agent_id = $1 OR agent_name = $2)
              AND deal_date >= $3 AND deal_date < $4
              AND status IN ('approved', 'active')
        `, [user_id, emp?.full_name || '', start, end]);

        // Unfiltered
        const unfilteredRes = await query(`
            SELECT COALESCE(SUM(agent_income), 0) as income, COUNT(*) as cnt
            FROM deal_table_rows
            WHERE deal_date >= $1 AND deal_date < $2
              AND status IN ('approved', 'active')
        `, [start, end]);

        // agent_id is NULL count
        const nullAgentRes = await query(`
            SELECT COALESCE(SUM(agent_income), 0) as income, COUNT(*) as cnt
            FROM deal_table_rows
            WHERE agent_id IS NULL
              AND deal_date >= $1 AND deal_date < $2
              AND status IN ('approved', 'active')
        `, [start, end]);

        res.json({
            user_id,
            emp,
            period: { start, end },
            all_deals_sample: allDealsRes.rows,
            filtered: filteredRes.rows[0],
            unfiltered: unfilteredRes.rows[0],
            null_agent: nullAgentRes.rows[0],
        });
    } catch (error) {
        console.error('Debug salary calc error:', error);
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

router.get('/payroll-role-assignments', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = (req.user as any)?.company_id as string | undefined;
        if (!companyId) {
            res.status(400).json({ error: { message: 'company_context_required' } });
            return;
        }
        const role = String(req.query.role || '').trim();
        if (!['sales_manager', 'head_sales', 'commercial'].includes(role)) {
            res.status(400).json({ error: { message: 'invalid_role' } });
            return;
        }

        const predicate = sqlPayrollAssignmentTierPredicate(role as 'sales_manager' | 'head_sales' | 'commercial');
        const result = await query(
            `SELECT DISTINCT
                p.id AS user_id,
                p.full_name AS name,
                b.name AS branch_name,
                p.uses_official_payroll AS applies_official_payroll
             FROM profiles p
             LEFT JOIN branches b ON b.id = p.branch_id
             LEFT JOIN positions pos ON pos.id = p.position_id
             WHERE p.company_id = $1 AND COALESCE(p.is_active, 1) = 1 AND (${predicate})
             ORDER BY b.name NULLS LAST, p.full_name NULLS LAST`,
            [companyId],
        );

        res.json(
            result.rows.map((row: Record<string, unknown>) => ({
                user_id: row.user_id,
                name: row.name,
                branch_name: row.branch_name || '—',
                applies_official_payroll: parseRowBool(row.applies_official_payroll),
            })),
        );
    } catch (error) {
        console.error('payroll-role-assignments GET', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

router.patch(
    '/payroll-role-assignments',
    authenticateToken,
    requirePermission('can_manage_finances'),
    [body('user_id').isString().trim().notEmpty(), body('uses_official_payroll').isBoolean()],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errs = validationResult(req);
            if (!errs.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errs.array() } });
                return;
            }
            const companyId = (req.user as any)?.company_id as string | undefined;
            if (!companyId) {
                res.status(400).json({ error: { message: 'company_context_required' } });
                return;
            }
            const userId = String(req.body.user_id);
            const flag = Boolean(req.body.uses_official_payroll);

            const patchEligible = sqlPayrollAssignmentPatchEligiblePredicate();
            const ok = await query(
                `SELECT p.id
                 FROM profiles p
                 LEFT JOIN positions pos ON pos.id = p.position_id
                 WHERE p.id = $1 AND p.company_id = $2 AND ${patchEligible}
                 LIMIT 1`,
                [userId, companyId],
            );
            if (!ok.rows[0]) {
                res.status(404).json({ error: { message: 'profile_not_found_or_not_payroll_role' } });
                return;
            }

            await query(
                `UPDATE profiles SET uses_official_payroll = $1, updated_at = $2 WHERE id = $3 AND company_id = $4`,
                [flag, new Date().toISOString(), userId, companyId],
            );

            res.json({ user_id: userId, uses_official_payroll: flag, applies_official_payroll: flag });
        } catch (error) {
            console.error('payroll-role-assignments PATCH', error);
            res.status(500).json({ error: { message: 'Server error' } });
        }
    },
);

async function resolveEmployeeMonthlyOklad(companyId: string | undefined, userId: string): Promise<number> {
    const r = await query(
        `SELECT ur.role, pos.name AS position_name, pos.base_salary AS base_salary
         FROM profiles p
         LEFT JOIN user_roles ur ON p.id = ur.user_id
         LEFT JOIN positions pos ON p.position_id = pos.id
         WHERE p.id = $1`,
        [userId],
    );
    const emp = pickPreferredPayrollRoleRow(r.rows as Array<{ role?: string | null; position_name?: string | null; base_salary?: unknown }>) as any;
    const rawPos =
        emp.role === 'director' && String(emp.position_name || '').trim() === 'Директор'
            ? 0
            : Number(emp.base_salary || 0);
    const org = companyId ? await getPayrollOrgSettings(companyId) : DEFAULT_PAYROLL_ORG_SETTINGS;
    return resolveEffectiveBaseSalary(emp.role, emp.position_name, rawPos, org);
}

router.get('/payroll-org-settings', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = (req.user as any)?.company_id as string | undefined;
        res.json(await getPayrollOrgSettingsApiResponse(companyId));
    } catch (error) {
        console.error('payroll-org-settings GET', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

router.patch('/payroll-org-settings', authenticateToken, requirePermission('can_manage_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = (req.user as any)?.company_id as string | undefined;
        if (!companyId) {
            res.status(400).json({ error: { message: 'company_context_required' } });
            return;
        }
        const b = req.body || {};
        const patch: Record<string, number> = {};
        if (b.ndfl_percent !== undefined && b.ndfl_percent !== null)
            patch.ndfl_percent = rub(parseFloat(String(b.ndfl_percent)));
        if (b.advance_percent !== undefined && b.advance_percent !== null)
            patch.advance_percent = rub(parseFloat(String(b.advance_percent)));
        if (b.insurance_percent !== undefined && b.insurance_percent !== null)
            patch.insurance_percent = rub(parseFloat(String(b.insurance_percent)));
        if (b.self_employed_tax_percent !== undefined && b.self_employed_tax_percent !== null)
            patch.self_employed_tax_percent = rub(parseFloat(String(b.self_employed_tax_percent)));
        if (b.base_salary_sales_manager !== undefined && b.base_salary_sales_manager !== null)
            patch.base_salary_sales_manager = rub(parseFloat(String(b.base_salary_sales_manager)));
        if (b.base_salary_head_sales !== undefined && b.base_salary_head_sales !== null)
            patch.base_salary_head_sales = rub(parseFloat(String(b.base_salary_head_sales)));
        if (b.base_salary_commercial !== undefined && b.base_salary_commercial !== null)
            patch.base_salary_commercial = rub(parseFloat(String(b.base_salary_commercial)));

        const updated = await upsertPayrollOrgSettings(
            companyId,
            patch as Partial<typeof DEFAULT_PAYROLL_ORG_SETTINGS>,
        );
        res.json(updated);
    } catch (error) {
        console.error('payroll-org-settings PATCH', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

router.get('/payroll-preview', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = (req.user as any)?.company_id as string | undefined;
        const uid = req.query.user_id as string | undefined;
        const y = parseInt(String(req.query.year || ''), 10);
        const m = parseInt(String(req.query.month || ''), 10);
        if (!companyId || !uid || !Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
            res.status(400).json({ error: { message: 'user_id, year, month обязательны' } });
            return;
        }
        const usesOfficial = await resolveUsesOfficialPayroll(uid);
        if (!usesOfficial) {
            res.status(400).json({
                error: {
                    message: 'payroll_scheme_flat',
                    detail: 'Официальная пошаговая схема отключена для сотрудника — используйте единую выплату оклада (категория «зарплата»).',
                },
            });
            return;
        }
        const org = await getPayrollOrgSettings(companyId);
        const oklad = await resolveEmployeeMonthlyOklad(companyId, uid);
        const st = await loadPayrollMonthlyState(companyId, uid, y, m);

        const [paidAdvance, paidNdfl1, paidRemainder, paidNdfl2, paidIns, paidSelfEmployedTax] = await Promise.all([
            payoutActionExists(companyId, uid, y, m, 'advance'),
            payoutActionExists(companyId, uid, y, m, 'ndfl_budget_1'),
            payoutActionExists(companyId, uid, y, m, 'remainder'),
            payoutActionExists(companyId, uid, y, m, 'ndfl_budget_2'),
            payoutActionExists(companyId, uid, y, m, 'insurance_contributions'),
            payoutActionExists(companyId, uid, y, m, 'self_employed_tax'),
        ]);

        const paid = {
            advance: paidAdvance,
            remainder: paidRemainder,
            ndfl_budget_1: paidNdfl1,
            ndfl_budget_2: paidNdfl2,
            insurance_contributions: paidIns,
            self_employed_tax: paidSelfEmployedTax,
        };

        const applySelfEmployedTax = req.query.apply_self_employed_tax !== 'false';
        const amounts = computePayrollAmounts(oklad, org, st, paid, applySelfEmployedTax);

        const step_done = { ...paid };

        const { sequence_locked, next_allowed_action } = payrollPreviewSequenceFields(step_done);

        res.json({
            period_label: payrollPeriodLabelRu(y, m),
            payroll_year: y,
            payroll_month: m,
            oklad_effective: oklad,
            payroll_org: org,
            amounts,
            paid,
            step_done,
            next_allowed_action,
            sequence_locked,
            hints: {
                ndfl_budget_1_subtitle:
                    'Бюджетный платёж в этом расчётном месяце: НДФЛ, удержанный с уже выплаченного аванса (шаг выполняют после выплаты аванса на руки).',
                ndfl_budget_2_subtitle:
                    'Бюджетный платёж в этом расчётном месяце: НДФЛ с остатка оклада после выплаты остатка сотруднику.',
            },
            /** Все проводки идемпотентности для этих шагов используют этот расчётный месяц как accrual_year/month. */
            accrual_period: { year: y, month: m },
        });
    } catch (error) {
        console.error('payroll-preview', error);
        const err = error as { code?: string; message?: string; detail?: string; constraint?: string };
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            error: {
                message: isDev && err.message ? err.message : 'Server error',
                ...(isDev && (err.code || err.detail)
                    ? { code: err.code, detail: err.detail, constraint: err.constraint }
                    : {}),
            },
        });
    }
});

router.post(
    '/payroll-payout',
    authenticateToken,
    requirePermission('can_manage_finances'),
    [
        body('user_id').isString().trim().notEmpty(),
        body('payroll_year').isInt({ min: 2000, max: 2100 }),
        body('payroll_month').isInt({ min: 1, max: 12 }),
        body('account_type').optional().isIn(['cash', 'account']),
        body('action').isIn(['advance', 'remainder', 'ndfl_budget_1', 'ndfl_budget_2', 'insurance_contributions', 'self_employed_tax']),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errs = validationResult(req);
            if (!errs.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errs.array() } });
                return;
            }
            const companyId = (req.user as any)?.company_id as string | undefined;
            if (!companyId) {
                res.status(400).json({ error: { message: 'company_context_required' } });
                return;
            }
            const userId = String(req.body.user_id);
            const y = parseInt(String(req.body.payroll_year), 10);
            const m = parseInt(String(req.body.payroll_month), 10);
            const action = req.body.action as string;
            const accountType = (req.body.account_type as string) || 'cash';

            const usesOfficial = await resolveUsesOfficialPayroll(userId);
            if (!usesOfficial) {
                res.status(400).json({
                    error: {
                        message: 'payroll_scheme_flat',
                        detail: 'Пошаговые выплаты недоступны: у сотрудника схема «оклад суммой». Оформите расход с категорией «зарплата».',
                    },
                });
                return;
            }

            const org = await getPayrollOrgSettings(companyId);
            const oklad = await resolveEmployeeMonthlyOklad(companyId, userId);
            if (oklad <= 0) {
                res.status(400).json({ error: { message: 'no_oklad_for_user' } });
                return;
            }

            const st = await loadPayrollMonthlyState(companyId, userId, y, m);

            const [paidAdvance, paidNdfl1, paidRemainder, paidNdfl2, paidIns, paidSelfEmployedTax] = await Promise.all([
                payoutActionExists(companyId, userId, y, m, 'advance'),
                payoutActionExists(companyId, userId, y, m, 'ndfl_budget_1'),
                payoutActionExists(companyId, userId, y, m, 'remainder'),
                payoutActionExists(companyId, userId, y, m, 'ndfl_budget_2'),
                payoutActionExists(companyId, userId, y, m, 'insurance_contributions'),
                payoutActionExists(companyId, userId, y, m, 'self_employed_tax'),
            ]);

            const paidLookup = {
                advance: paidAdvance,
                remainder: paidRemainder,
                ndfl_budget_1: paidNdfl1,
                ndfl_budget_2: paidNdfl2,
                insurance_contributions: paidIns,
                self_employed_tax: paidSelfEmployedTax,
            };

            const applySelfEmployedTax = req.body.apply_self_employed_tax !== false;
            const amounts = computePayrollAmounts(oklad, org, st, paidLookup, applySelfEmployedTax);

            const stepDone: Partial<Record<PayrollPayoutActionKind, boolean>> = {
                advance: paidAdvance,
                ndfl_budget_1: paidNdfl1,
                remainder: paidRemainder,
                ndfl_budget_2: paidNdfl2,
                insurance_contributions: paidIns,
                self_employed_tax: paidSelfEmployedTax,
            };

            const actionKind = action as PayrollPayoutActionKind;
            const sequenceBlock = firstBlockedPriorStep(actionKind, stepDone);
            if (sequenceBlock !== null) {
                res.status(400).json({ error: { message: payrollOutOfOrderMessageRu(sequenceBlock) } });
                return;
            }

            const nowIso = new Date().toISOString();
            const nameRes = await query(`SELECT full_name FROM profiles WHERE id = $1`, [userId]);
            const empName = nameRes.rows[0]?.full_name || userId;

            /** Сохраняем в описании справа для поиска и сопоставления периода; в начале — текст для пользователя. */
            const tag = `[payroll:${y}-${String(m).padStart(2, '0')}|${action}]`;
            const periodRu = payrollPeriodLabelRu(y, m);
            const tagSuffix = ` ${tag}`;

            const insertTx = async (
                payload: {
                    type: 'expense';
                    category: string;
                    amount: number;
                    description: string;
                    component_type: string;
                },
                accrualYear: number,
                accrualMonth: number,
                kind: string,
            ): Promise<{ id: string } | null> => {
                const exists = await payoutActionExists(companyId, userId, accrualYear, accrualMonth, kind);
                if (exists) return null;

                const id = uuidv4();
                await query(
                    `INSERT INTO transactions (
                      id, type, category, amount, description, user_id, account_type, company_id, created_at, updated_at, component_type
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                    [
                        id,
                        payload.type,
                        payload.category,
                        payload.amount,
                        payload.description,
                        userId,
                        accountType,
                        companyId,
                        nowIso,
                        nowIso,
                        payload.component_type,
                    ],
                );
                await insertPayoutAction(uuidv4(), companyId, userId, accrualYear, accrualMonth, kind, id);
                return { id };
            };

            let result: unknown;
            let txDescription = '';

            if (action === 'advance') {
                if (await payoutActionExists(companyId, userId, y, m, action)) {
                    res.status(409).json({ error: { message: 'already_recorded', action } });
                    return;
                }
                const net = amounts.net_advance_to_employee;
                if (net <= 0) {
                    res.status(400).json({ error: { message: 'advance_net_nonpositive' } });
                    return;
                }
                const desc = `Аванс за ${periodRu} (на руки) — ${empName}${tagSuffix}`;
                txDescription = desc;
                result = await insertTx(
                    {
                        type: 'expense',
                        category: 'salary_advance_net',
                        amount: net,
                        description: desc,
                        component_type: 'payroll_advance_net',
                    },
                    y,
                    m,
                    'advance',
                );
            } else if (action === 'remainder') {
                if (await payoutActionExists(companyId, userId, y, m, action)) {
                    res.status(409).json({ error: { message: 'already_recorded', action } });
                    return;
                }
                const net = amounts.net_remainder_to_employee;
                if (net <= 0) {
                    res.status(400).json({ error: { message: 'remainder_net_nonpositive' } });
                    return;
                }
                const desc = `Остаток зарплаты за ${periodRu} (на руки) — ${empName}${tagSuffix}`;
                txDescription = desc;
                result = await insertTx(
                    {
                        type: 'expense',
                        category: 'salary_remainder_net',
                        amount: net,
                        description: desc,
                        component_type: 'payroll_remainder_net',
                    },
                    y,
                    m,
                    'remainder',
                );
            } else if (action === 'ndfl_budget_1') {
                const amt = amounts.ndfl_budget_1_from_advance;
                if (amt <= 0) {
                    res.status(400).json({
                        error: { message: 'Сумма НДФЛ 1 (с аванса) не положительна — проверьте оклад и ставку НДФЛ.' },
                    });
                    return;
                }
                const desc = `НДФЛ 1 (с аванса) за ${periodRu} — ${empName}${tagSuffix}`;
                txDescription = desc;
                result = await insertTx(
                    {
                        type: 'expense',
                        category: 'payroll_ndfl_budget_1',
                        amount: amt,
                        description: desc,
                        component_type: 'payroll_ndfl_budget_1',
                    },
                    y,
                    m,
                    'ndfl_budget_1',
                );
            } else if (action === 'ndfl_budget_2') {
                const amt = rub(st.ndfl_from_remainder > 0 ? st.ndfl_from_remainder : amounts.ndfl_budget_2_from_remainder);
                if (amt <= 0) {
                    res.status(400).json({
                        error: { message: 'Сумма НДФЛ 2 (с остатка) не положительна.' },
                    });
                    return;
                }
                const desc = `НДФЛ 2 (с остатка) за ${periodRu} — ${empName}${tagSuffix}`;
                txDescription = desc;
                result = await insertTx(
                    {
                        type: 'expense',
                        category: 'payroll_ndfl_budget_2',
                        amount: amt,
                        description: desc,
                        component_type: 'payroll_ndfl_budget_2',
                    },
                    y,
                    m,
                    'ndfl_budget_2',
                );
            } else if (action === 'self_employed_tax') {
                const amt = amounts.self_employed_tax_amount;
                if (amt <= 0) {
                    res.status(400).json({ error: { message: 'Сумма налога самозанятого не положительна.' } });
                    return;
                }
                const desc = `Налог самозанятого за ${periodRu} — ${empName}${tagSuffix}`;
                txDescription = desc;
                result = await insertTx(
                    {
                        type: 'expense',
                        category: 'payroll_self_employed_tax',
                        amount: amt,
                        description: desc,
                        component_type: 'payroll_self_employed_tax',
                    },
                    y,
                    m,
                    'self_employed_tax',
                );
            } else if (action === 'insurance_contributions') {
                const amt = amounts.insurance_company_cost;
                if (amt <= 0) {
                    res.status(400).json({ error: { message: 'insurance_nonpositive_check_percent_setting' } });
                    return;
                }
                const desc = `Страховые взносы (от оклада) за ${periodRu} — ${empName}${tagSuffix}`;
                txDescription = desc;
                result = await insertTx(
                    {
                        type: 'expense',
                        category: 'payroll_insurance_contributions',
                        amount: amt,
                        description: desc,
                        component_type: 'payroll_insurance_contributions',
                    },
                    y,
                    m,
                    'insurance_contributions',
                );
            } else {
                res.status(400).json({ error: { message: 'unknown_action' } });
                return;
            }

            if (result === null) {
                res.status(409).json({ error: { message: 'already_recorded', action } });
                return;
            }

            await logAudit(req, 'CREATE', 'finance', (result as any).id, { name: txDescription });

            if (action === 'advance') {
                await upsertPayrollMonthlyState(companyId, userId, y, m, {
                    advance_gross_paid: amounts.advance_brutto,
                    ndfl_from_advance: amounts.ndfl_on_advance,
                    ndfl_from_remainder: st.ndfl_from_remainder,
                    self_employed_tax_paid: st.self_employed_tax_paid,
                });
            } else if (action === 'remainder') {
                await upsertPayrollMonthlyState(companyId, userId, y, m, {
                    advance_gross_paid: st.advance_gross_paid,
                    ndfl_from_advance: st.ndfl_from_advance,
                    ndfl_from_remainder: amounts.ndfl_on_remainder,
                    self_employed_tax_paid: st.self_employed_tax_paid,
                });
            } else if (action === 'self_employed_tax') {
                await upsertPayrollMonthlyState(companyId, userId, y, m, {
                    advance_gross_paid: st.advance_gross_paid,
                    ndfl_from_advance: st.ndfl_from_advance,
                    ndfl_from_remainder: st.ndfl_from_remainder,
                    self_employed_tax_paid: amounts.self_employed_tax_amount,
                });
            }

            try {
                const admins = await query("SELECT user_id FROM user_roles WHERE role IN ('admin', 'director')");
                for (const admin of admins.rows) {
                    await query(
                        `INSERT INTO notifications (id, user_id, title, message, type, created_by, company_id, created_at)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [
                            uuidv4(),
                            admin.user_id,
                            'Выплата по окладной схеме',
                            `${action}: ${periodRu}`,
                            'info',
                            'system',
                            companyId,
                            nowIso,
                        ],
                    );
                }
            } catch {
                // optional
            }

            res.status(201).json({ success: true, action, transaction: result });
        } catch (error) {
            console.error('payroll-payout', error);
            const err = error as { code?: string; message?: string; detail?: string; constraint?: string };
            const isDev = process.env.NODE_ENV === 'development';
            res.status(500).json({
                error: {
                    message: isDev && err.message ? err.message : 'Server error',
                    ...(isDev && (err.code || err.detail || err.constraint)
                        ? { code: err.code, detail: err.detail, constraint: err.constraint }
                        : {}),
                },
            });
        }
    },
);


router.post('/recalculate', authenticateToken, requirePermission('can_manage_finances'), computeLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { month, year, all } = req.body;

        const periods: Array<{ year: number; month: number }> = [];

        if (year && month) {
            periods.push({ year: parseInt(year), month: parseInt(month) });
        } else if (all) {
            const rows = await query(`
                SELECT DISTINCT EXTRACT(YEAR FROM deal_date::date)::int as year, EXTRACT(MONTH FROM deal_date::date)::int as month
                FROM deal_table_rows
                WHERE deal_date IS NOT NULL AND deal_date <> ''
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
            const { start: rStart, end: rEnd } = periodBounds(p.year, p.month);
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
                    WHERE dtr.deal_date >= $1 AND dtr.deal_date < $2
                      AND d.period_year = ${p.year}
                      AND d.period_month = ${p.month}
                      AND LOWER(TRIM(d.property_object)) = LOWER(TRIM(dtr.property_name))
                      AND (
                        p.full_name IS NULL
                        OR LOWER(TRIM(p.full_name)) = LOWER(TRIM(dtr.agent_name))
                      )
                      AND COALESCE(dtr.commission_seller_fact, 0) = 0
                      AND COALESCE(dtr.commission_buyer_fact, 0) = 0
                      AND COALESCE(dtr.commission_total_fact, 0) = 0
                `, [rStart, rEnd, new Date().toISOString()]);
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
                WHERE deal_date >= $1 AND deal_date < $2
            `, [rStart, rEnd]);

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

// GET /salaries/deals/:userId — deals breakdown for payroll detail view
router.get('/salaries/deals/:userId', authenticateToken, requirePermission('can_view_finances'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        const { month, year, role } = req.query;
        const companyId = (req.user as any)?.company_id as string | undefined;

        const periodYear = year ? parseInt(year as string) : new Date().getFullYear();
        const periodMonth = month ? parseInt(month as string) : (new Date().getMonth() + 1);
        const roleFilter = role ? String(role) : 'agent';
        const { start: dStart, end: dEnd } = periodBounds(periodYear, periodMonth);
        const DEAL_DATE_SQL_DEALS = `COALESCE(NULLIF(deal_date, ''), NULLIF(payment_date, ''), NULLIF(deposit_date, ''))`;

        const profileNameRes = await query(`SELECT full_name FROM profiles WHERE id = $1`, [userId]);
        const profileName = profileNameRes.rows[0]?.full_name || '';

        if (roleFilter === 'mop') {
            const mopDealsRes = await query(`
                SELECT
                    id,
                    property_name,
                    commission_seller_fact,
                    commission_buyer_fact,
                    mortgage_deduction,
                    mop_revenue as amount,
                    agent_percent_seller,
                    agent_percent_buyer,
                    deal_date,
                    payment_date,
                    created_at,
                    'mop'::text as role_type,
                    subcontractor_id,
                    subcontractor_amount
                FROM deal_table_rows
                WHERE (mop_id = $1 OR mop_name = $2)
                  AND ${DEAL_DATE_SQL_DEALS} >= $3 AND ${DEAL_DATE_SQL_DEALS} < $4
                  AND status IN ('approved', 'active')
                  AND company_id = $5
                ORDER BY payment_date DESC NULLS LAST
            `, [userId, profileName, dStart, dEnd, companyId]);
            res.json({ data: mopDealsRes.rows.map((r: any) => ({
                ...r,
                role_label: 'МОП',
                amount: Math.round(parseFloat(r.amount) || 0),
            })) });
            return;
        }

        if (roleFilter === 'rop') {
            const ropDealsRes = await query(`
                SELECT
                    id,
                    property_name,
                    commission_seller_fact,
                    commission_buyer_fact,
                    mortgage_deduction,
                    rop_payout as amount,
                    agent_percent_seller,
                    agent_percent_buyer,
                    deal_date,
                    payment_date,
                    created_at,
                    'rop'::text as role_type,
                    subcontractor_id,
                    subcontractor_amount
                FROM deal_table_rows
                WHERE (rop_id = $1 OR rop_name = $2)
                  AND ${DEAL_DATE_SQL_DEALS} >= $3 AND ${DEAL_DATE_SQL_DEALS} < $4
                  AND status IN ('approved', 'active')
                  AND company_id = $5
                ORDER BY payment_date DESC NULLS LAST
            `, [userId, profileName, dStart, dEnd, companyId]);
            res.json({ data: ropDealsRes.rows.map((r: any) => ({
                ...r,
                role_label: 'РОП',
                amount: Math.round(parseFloat(r.amount) || 0),
            })) });
            return;
        }

        // Default: agent + subcontractor + mortgage
        const agentDealsRes = await query(`
            SELECT
                id,
                property_name,
                commission_seller_fact,
                commission_buyer_fact,
                mortgage_deduction,
                agent_income as amount,
                agent_percent_seller,
                agent_percent_buyer,
                deal_date,
                payment_date,
                created_at,
                $6::text as role_type,
                subcontractor_id,
                subcontractor_amount
            FROM deal_table_rows
            WHERE (agent_id = $1 OR agent_name = $2)
              AND ${DEAL_DATE_SQL_DEALS} >= $3 AND ${DEAL_DATE_SQL_DEALS} < $4
              AND status IN ('approved', 'active')
              AND company_id = $5
            ORDER BY payment_date DESC NULLS LAST
        `, [userId, profileName, dStart, dEnd, companyId, 'agent']);

        // 2. Deals where user is subcontractor
        const subDealsRes = await query(`
            SELECT
                id,
                property_name,
                commission_seller_fact,
                commission_buyer_fact,
                mortgage_deduction,
                subcontractor_amount as amount,
                agent_percent_seller,
                agent_percent_buyer,
                deal_date,
                payment_date,
                created_at,
                $5::text as role_type,
                subcontractor_id,
                subcontractor_amount
            FROM deal_table_rows
            WHERE subcontractor_id = $1
              AND ${DEAL_DATE_SQL_DEALS} >= $2 AND ${DEAL_DATE_SQL_DEALS} < $3
              AND status IN ('approved', 'active')
              AND company_id = $4
              AND subcontractor_amount > 0
              AND payment_date IS NOT NULL
              AND payment_date <> ''
              AND payment_date::date <= (NOW() AT TIME ZONE 'Europe/Moscow')::date
            ORDER BY payment_date DESC
        `, [userId, dStart, dEnd, companyId, 'subcontractor']);

        // 3. Mortgage service rows where user is agent
        const mortgageAgentRes = await query(`
            SELECT
                id,
                client_name as property_name,
                0 as commission_seller_fact,
                0 as commission_buyer_fact,
                0 as mortgage_deduction,
                agent_fee as amount,
                0 as agent_percent_seller,
                0 as agent_percent_buyer,
                deal_date,
                $5::text as role_type,
                NULL::uuid as subcontractor_id,
                0 as subcontractor_amount
            FROM mortgage_service_rows
            WHERE agent_id = $1
              AND deal_date >= $2 AND deal_date < $3
              AND status = 'approved'
              AND company_id = $4
            ORDER BY deal_date DESC
        `, [userId, dStart, dEnd, companyId, 'mortgage_agent']);

        // 4. Mortgage service rows where user is broker
        const mortgageBrokerRes = await query(`
            SELECT
                id,
                client_name as property_name,
                0 as commission_seller_fact,
                0 as commission_buyer_fact,
                0 as mortgage_deduction,
                broker_share as amount,
                0 as agent_percent_seller,
                0 as agent_percent_buyer,
                deal_date,
                $5::text as role_type,
                NULL::uuid as subcontractor_id,
                0 as subcontractor_amount
            FROM mortgage_service_rows
            WHERE broker_id = $1
              AND deal_date >= $2 AND deal_date < $3
              AND status = 'approved'
              AND company_id = $4
            ORDER BY deal_date DESC
        `, [userId, dStart, dEnd, companyId, 'mortgage_broker']);

        const allDeals = [
            ...agentDealsRes.rows.map((r: any) => ({
                ...r,
                role_label: 'Агент',
                amount: Math.round(parseFloat(r.amount) || 0),
            })),
            ...subDealsRes.rows.map((r: any) => ({
                ...r,
                role_label: 'Сдельщик',
                amount: Math.round(parseFloat(r.subcontractor_amount) || 0),
            })),
            ...mortgageAgentRes.rows.map((r: any) => ({
                ...r,
                role_label: 'Ипотека (агент)',
                amount: Math.round(parseFloat(r.amount) || 0),
            })),
            ...mortgageBrokerRes.rows.map((r: any) => ({
                ...r,
                role_label: 'Ипотека (брокер)',
                amount: Math.round(parseFloat(r.amount) || 0),
            })),
        ];

        res.json({ data: allDeals });
    } catch (error) {
        console.error('Get salary deals error:', error);
        const msg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        console.error('Stack:', stack);
        res.status(500).json({ error: { message: 'Server error', detail: msg } });
    }
});

router.get('/daily-finance', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const companyId = (req.user as any)?.company_id as string | undefined;
        if (!companyId) {
            res.status(400).json({ error: { message: 'company_context_required' } });
            return;
        }
        const rangeStart = String(req.query.start || req.query.week_start || '');
        const rangeEnd = String(req.query.end || req.query.week_end || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd)) {
            res.status(400).json({ error: { message: 'start и end обязательны (YYYY-MM-DD)' } });
            return;
        }
        // Calculate number of days in range (max 31 to prevent abuse)
        const dayMs = 24 * 60 * 60 * 1000;
        const startDate = new Date(rangeStart + 'T00:00:00');
        const endDate = new Date(rangeEnd + 'T00:00:00');
        const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
        if (dayCount < 1 || dayCount > 31) {
            res.status(400).json({ error: { message: 'Диапазон должен быть от 1 до 31 дня' } });
            return;
        }

        const todayStr = new Date().toISOString().slice(0, 10);

        // 1. Transactions income/expense by created_at date
        const txRes = await query(
            `SELECT
                DATE(created_at)::text AS dt,
                type,
                COALESCE(SUM(amount), 0)::real AS total
            FROM transactions
            WHERE company_id = $1 AND DATE(created_at) BETWEEN $2 AND $3
            GROUP BY DATE(created_at), type`,
            [companyId, rangeStart, rangeEnd],
        );

        // 2. Deal table rows — fact commissions + expenses by payment_date
        const dealFactRes = await query(
            `SELECT
                payment_date AS dt,
                COALESCE(SUM(commission_seller_fact + commission_buyer_fact), 0)::real AS income,
                COALESCE(SUM(other_expenses + mortgage_deduction), 0)::real AS expense
            FROM deal_table_rows
            WHERE company_id = $1 AND payment_date BETWEEN $2 AND $3
            GROUP BY payment_date`,
            [companyId, rangeStart, rangeEnd],
        );

        // 3. Deal table rows — plan commissions + expenses by payment_date (for future days)
        const dealPlanRes = await query(
            `SELECT
                payment_date AS dt,
                COALESCE(SUM(commission_seller_plan + commission_buyer_plan), 0)::real AS income,
                COALESCE(SUM(other_expenses + mortgage_deduction), 0)::real AS expense
            FROM deal_table_rows
            WHERE company_id = $1 AND payment_date BETWEEN $2 AND $3
            GROUP BY payment_date`,
            [companyId, rangeStart, rangeEnd],
        );

        // 4. Recurring expenses by day of month
        const recurringRes = await query(
            `SELECT amount::real, payment_days
            FROM recurring_expenses
            WHERE company_id = $1 AND is_active = 1`,
            [companyId],
        );

        // Build daily map
        const result: Array<{
            date: string;
            income: number;
            expense: number;
            balance: number;
            is_projected: boolean;
        }> = [];

        // Helper to add days
        const addDay = (base: string, days: number) => {
            const d = new Date(base + 'T00:00:00');
            d.setUTCDate(d.getUTCDate() + days);
            return d.toISOString().slice(0, 10);
        };

        // Pre-index results
        const txMap = new Map<string, { income: number; expense: number }>();
        for (const row of txRes.rows) {
            const dt = row.dt;
            if (!txMap.has(dt)) txMap.set(dt, { income: 0, expense: 0 });
            const cur = txMap.get(dt)!;
            const amt = parseFloat(row.total) || 0;
            if (row.type === 'income') cur.income += amt;
            else if (row.type === 'expense') cur.expense += amt;
        }

        const dealFactMap = new Map<string, { income: number; expense: number }>();
        for (const row of dealFactRes.rows) {
            dealFactMap.set(row.dt, {
                income: parseFloat(row.income) || 0,
                expense: parseFloat(row.expense) || 0,
            });
        }

        const dealPlanMap = new Map<string, { income: number; expense: number }>();
        for (const row of dealPlanRes.rows) {
            dealPlanMap.set(row.dt, {
                income: parseFloat(row.income) || 0,
                expense: parseFloat(row.expense) || 0,
            });
        }

        for (let i = 0; i < dayCount; i++) {
            const date = addDay(rangeStart, i);
            const isProjected = date > todayStr;

            if (isProjected) {
                let income = 0;
                let expense = 0;
                const plan = dealPlanMap.get(date);
                if (plan) {
                    income += plan.income;
                    expense += plan.expense;
                }
                // Recurring expenses
                const dayOfMonth = parseInt(date.slice(8, 10), 10);
                for (const row of recurringRes.rows) {
                    try {
                        const days: number[] = JSON.parse(row.payment_days || '[]');
                        if (days.includes(dayOfMonth)) {
                            expense += parseFloat(row.amount) || 0;
                        }
                    } catch {
                        // ignore bad json
                    }
                }
                result.push({
                    date,
                    income: Math.round(income),
                    expense: Math.round(expense),
                    balance: Math.round(income - expense),
                    is_projected: true,
                });
            } else {
                let income = 0;
                let expense = 0;
                const tx = txMap.get(date);
                if (tx) {
                    income += tx.income;
                    expense += tx.expense;
                }
                const fact = dealFactMap.get(date);
                if (fact) {
                    income += fact.income;
                    expense += fact.expense;
                }
                result.push({
                    date,
                    income: Math.round(income),
                    expense: Math.round(expense),
                    balance: Math.round(income - expense),
                    is_projected: false,
                });
            }
        }

        res.json({ days: result });
    } catch (error) {
        console.error('dashboard-daily-finance', error);
        res.status(500).json({ error: { message: 'Server error' } });
    }
});

export default router;
// TEST MARKER
