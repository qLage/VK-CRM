import { query, pool } from '../db';

/** Manual income lines that count toward валовая выручка / plan gross (employee-bound). */
export const EMPLOYEE_MANUAL_GROSS_INCOME_CATEGORIES = ['commission', 'mortgage_service_fee'] as const;

/** Manual income → личный доход only (not gross). */
export const EMPLOYEE_MANUAL_PERSONAL_INCOME_CATEGORIES = ['bonus', 'other_income'] as const;

/** Manual expense lines that reflect cash to employee (net) should count toward “личный доход” views. */
export const EMPLOYEE_MANUAL_PERSONAL_EXPENSE_CATEGORIES = ['premium', 'salary', 'salary_advance_net', 'salary_remainder_net'] as const;

function toNumber(v: unknown): number {
    const n = parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
}

/**
 * Sum manual gross (commission-type income) for an employee in [startIso, endIso] on created_at.
 */
export async function sumManualGross(userId: string, startIso: string, endIso: string): Promise<number> {
    if (!pool) return 0;

    const res = await query(
        `SELECT COALESCE(SUM(amount::double precision), 0)::float AS total
         FROM transactions
         WHERE user_id::text = $1
           AND type = 'income'
           AND category = ANY($2::text[])
           AND created_at >= $3::timestamptz
           AND created_at <= $4::timestamptz`,
        [userId, [...EMPLOYEE_MANUAL_GROSS_INCOME_CATEGORIES], startIso, endIso],
    );
    return toNumber(res.rows[0]?.total);
}

/**
 * Sum manual personal-only amounts: income bonus/other_income + expense premium/salary (payouts to employee).
 */
export async function sumManualPersonal(userId: string, startIso: string, endIso: string): Promise<number> {
    if (!pool) return 0;

    const res = await query(
        `SELECT COALESCE(SUM(
            CASE
              WHEN type = 'income' AND category = ANY($2::text[]) THEN amount::double precision
              WHEN type = 'expense' AND category = ANY($3::text[]) THEN amount::double precision
              ELSE 0
            END
          ), 0)::float AS total
         FROM transactions
         WHERE user_id::text = $1
           AND created_at >= $4::timestamptz
           AND created_at <= $5::timestamptz`,
        [
            userId,
            [...EMPLOYEE_MANUAL_PERSONAL_INCOME_CATEGORIES],
            [...EMPLOYEE_MANUAL_PERSONAL_EXPENSE_CATEGORIES],
            startIso,
            endIso,
        ],
    );
    return toNumber(res.rows[0]?.total);
}

/**
 * Gross from manual finance for calendar months (created_at year/month), same semantics as salary period filters.
 */
export async function sumManualGrossForCalendarMonths(userId: string, year: number, months: number[]): Promise<number> {
    if (!pool || months.length === 0) return 0;

    const res = await query(
        `SELECT COALESCE(SUM(amount::double precision), 0)::float AS total
         FROM transactions
         WHERE user_id::text = $1
           AND type = 'income'
           AND category = ANY($2::text[])
           AND EXTRACT(YEAR FROM created_at)::int = $3
           AND EXTRACT(MONTH FROM created_at)::int = ANY($4::int[])`,
        [userId, [...EMPLOYEE_MANUAL_GROSS_INCOME_CATEGORIES], year, months],
    );
    return toNumber(res.rows[0]?.total);
}

/**
 * Personal-only manual amounts for calendar months (created_at), scoped by company.
 */
export async function sumManualPersonalForCalendarMonths(
    userId: string,
    companyId: string,
    year: number,
    months: number[],
): Promise<number> {
    if (!pool || months.length === 0) return 0;

    const res = await query(
        `SELECT COALESCE(SUM(
            CASE
              WHEN type = 'income' AND category = ANY($5::text[]) THEN amount::double precision
              WHEN type = 'expense' AND category = ANY($6::text[]) THEN amount::double precision
              ELSE 0
            END
          ), 0)::float AS total
         FROM transactions
         WHERE user_id::text = $1
           AND company_id::text = $2
           AND EXTRACT(YEAR FROM created_at)::int = $3
           AND EXTRACT(MONTH FROM created_at)::int = ANY($4::int[])`,
        [
            userId,
            companyId,
            year,
            months,
            [...EMPLOYEE_MANUAL_PERSONAL_INCOME_CATEGORIES],
            [...EMPLOYEE_MANUAL_PERSONAL_EXPENSE_CATEGORIES],
        ],
    );
    return toNumber(res.rows[0]?.total);
}
