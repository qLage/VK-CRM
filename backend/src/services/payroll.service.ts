import { query, pool, db } from '../db';

/** Payroll persists on Postgres (`pool`) or local SQLite (`db`). */
function payrollPersistEnabled(): boolean {
    return !!(pool || db);
}

export type PayrollOrgSettingsRow = {
    ndfl_percent: number;
    advance_percent: number;
    insurance_percent: number;
    base_salary_sales_manager: number;
    base_salary_head_sales: number;
    base_salary_commercial: number;
};

/** Справочные оклады по ролям из `positions` (и при необходимости MAX по сотрудникам). */
export type RoleBaseCatalog = Pick<
    PayrollOrgSettingsRow,
    'base_salary_sales_manager' | 'base_salary_head_sales' | 'base_salary_commercial'
>;

export type PayrollOrgSettingsApiResponse = PayrollOrgSettingsRow & {
    role_base_display: RoleBaseCatalog;
};

const DEFAULT_PAYROLL: PayrollOrgSettingsRow = {
    ndfl_percent: 13,
    advance_percent: 40,
    insurance_percent: 30,
    base_salary_sales_manager: 0,
    base_salary_head_sales: 0,
    base_salary_commercial: 0,
};

export const DEFAULT_PAYROLL_ORG_SETTINGS: PayrollOrgSettingsRow = DEFAULT_PAYROLL;

export function rub(n: number): number {
    return Math.round(Number(n) || 0);
}

async function maxPositionBaseSalaryForUserRole(role: string): Promise<number> {
    if (!payrollPersistEnabled()) return 0;
    try {
        const r = await query(
            `SELECT COALESCE(MAX(COALESCE(pos.base_salary, 0)), 0) AS m
             FROM profiles p
             INNER JOIN user_roles ur ON ur.user_id = p.id
             INNER JOIN positions pos ON pos.id = p.position_id
             WHERE ur.role = $1`,
            [role],
        );
        return rub(Number(r.rows[0]?.m ?? 0));
    } catch {
        return 0;
    }
}

/** Оклады по умолчанию из канонических id должностей, с запасным MAX по сотрудникам с тем же role. */
export async function fetchRoleBaseCatalog(): Promise<RoleBaseCatalog> {
    const empty: RoleBaseCatalog = {
        base_salary_sales_manager: 0,
        base_salary_head_sales: 0,
        base_salary_commercial: 0,
    };
    if (!payrollPersistEnabled()) return empty;
    try {
        const r = await query(
            `SELECT id, COALESCE(base_salary, 0) AS bs FROM positions WHERE id IN ('pos-mop', 'pos-rop', 'pos-comm')`,
            [],
        );
        const byId: Record<string, number> = {};
        for (const row of r.rows) {
            byId[String(row.id)] = rub(Number(row.bs ?? 0));
        }
        let sm = byId['pos-mop'] ?? 0;
        let hs = byId['pos-rop'] ?? 0;
        let cm = byId['pos-comm'] ?? 0;
        if (sm <= 0) sm = await maxPositionBaseSalaryForUserRole('sales_manager');
        if (hs <= 0) hs = await maxPositionBaseSalaryForUserRole('head_sales');
        if (cm <= 0) cm = await maxPositionBaseSalaryForUserRole('commercial');
        return {
            base_salary_sales_manager: sm,
            base_salary_head_sales: hs,
            base_salary_commercial: cm,
        };
    } catch {
        return empty;
    }
}

function mergeDisplayedRoleBases(stored: PayrollOrgSettingsRow, cat: RoleBaseCatalog): PayrollOrgSettingsRow {
    const pick = (s: number, c: number) => (rub(s) > 0 ? rub(s) : rub(c));
    return {
        ...stored,
        base_salary_sales_manager: pick(stored.base_salary_sales_manager, cat.base_salary_sales_manager),
        base_salary_head_sales: pick(stored.base_salary_head_sales, cat.base_salary_head_sales),
        base_salary_commercial: pick(stored.base_salary_commercial, cat.base_salary_commercial),
    };
}

/** Ответ GET /payroll-org-settings: оклады для формы предзаполняются из справочника, если в company_payroll_settings 0. */
export async function getPayrollOrgSettingsApiResponse(
    companyId: string | undefined,
): Promise<PayrollOrgSettingsApiResponse> {
    const stored = companyId ? await getPayrollOrgSettings(companyId) : { ...DEFAULT_PAYROLL };
    const catalog = await fetchRoleBaseCatalog();
    const merged = mergeDisplayedRoleBases(stored, catalog);
    return {
        ndfl_percent: merged.ndfl_percent,
        advance_percent: merged.advance_percent,
        insurance_percent: merged.insurance_percent,
        base_salary_sales_manager: merged.base_salary_sales_manager,
        base_salary_head_sales: merged.base_salary_head_sales,
        base_salary_commercial: merged.base_salary_commercial,
        role_base_display: catalog,
    };
}

export async function getPayrollOrgSettings(companyId: string): Promise<PayrollOrgSettingsRow> {
    if (!payrollPersistEnabled()) return { ...DEFAULT_PAYROLL };

    const r = await query(
        `SELECT ndfl_percent, advance_percent, insurance_percent,
                base_salary_sales_manager, base_salary_head_sales, base_salary_commercial
         FROM company_payroll_settings WHERE company_id = $1`,
        [companyId],
    );
    const row = r.rows[0];
    if (!row) return { ...DEFAULT_PAYROLL };

    return {
        ndfl_percent: rub(row.ndfl_percent ?? DEFAULT_PAYROLL.ndfl_percent),
        advance_percent: rub(row.advance_percent ?? DEFAULT_PAYROLL.advance_percent),
        insurance_percent: rub(row.insurance_percent ?? DEFAULT_PAYROLL.insurance_percent),
        base_salary_sales_manager: rub(row.base_salary_sales_manager ?? 0),
        base_salary_head_sales: rub(row.base_salary_head_sales ?? 0),
        base_salary_commercial: rub(row.base_salary_commercial ?? 0),
    };
}

export async function upsertPayrollOrgSettings(
    companyId: string,
    patch: Partial<PayrollOrgSettingsRow>,
): Promise<PayrollOrgSettingsRow> {
    const cur = await getPayrollOrgSettings(companyId);
    const next = { ...cur, ...patch };
    await query(
        `INSERT INTO company_payroll_settings (
            company_id, ndfl_percent, advance_percent, insurance_percent,
            base_salary_sales_manager, base_salary_head_sales, base_salary_commercial, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (company_id) DO UPDATE SET
            ndfl_percent = EXCLUDED.ndfl_percent,
            advance_percent = EXCLUDED.advance_percent,
            insurance_percent = EXCLUDED.insurance_percent,
            base_salary_sales_manager = EXCLUDED.base_salary_sales_manager,
            base_salary_head_sales = EXCLUDED.base_salary_head_sales,
            base_salary_commercial = EXCLUDED.base_salary_commercial,
            updated_at = EXCLUDED.updated_at`,
        [
            companyId,
            next.ndfl_percent,
            next.advance_percent,
            next.insurance_percent,
            next.base_salary_sales_manager,
            next.base_salary_head_sales,
            next.base_salary_commercial,
            new Date().toISOString(),
        ],
    );
    return next;
}

/** Должность «Коммерческий директор» и т.п.: оклад берётся из той же ветки, что и role=commercial */
export function positionMatchesCommercialExecutive(positionName: string | null | undefined): boolean {
    return /коммерч/i.test(String(positionName || '').trim());
}

export function resolveEffectiveBaseSalary(
    role: string | null,
    positionName: string | null,
    baseFromPosition: number,
    payroll: PayrollOrgSettingsRow,
): number {
    if (role === 'director' && (positionName || '').trim() === 'Директор') return 0;

    const bp = rub(baseFromPosition);

    // Title wins over МОП/РОП user_roles so «Коммерческий директор» keeps org commercial оклад.
    if (positionMatchesCommercialExecutive(positionName)) {
        const cm = rub(payroll.base_salary_commercial);
        return cm > 0 ? cm : bp;
    }

    let ro = 0;
    if (role === 'sales_manager') ro = payroll.base_salary_sales_manager;
    else if (role === 'head_sales') ro = payroll.base_salary_head_sales;
    else if (role === 'commercial') ro = payroll.base_salary_commercial;

    ro = rub(ro);

    return ro > 0 ? ro : bp;
}

export type PayrollMonthlyStateRow = {
    advance_gross_paid: number;
    ndfl_from_advance: number;
    ndfl_from_remainder: number;
};

export async function loadPayrollMonthlyState(
    companyId: string,
    profileId: string,
    y: number,
    m: number,
): Promise<PayrollMonthlyStateRow> {
    if (!payrollPersistEnabled())
        return { advance_gross_paid: 0, ndfl_from_advance: 0, ndfl_from_remainder: 0 };

    const r = await query(
        `SELECT advance_gross_paid, ndfl_from_advance, ndfl_from_remainder
         FROM payroll_monthly_state
         WHERE company_id = $1 AND profile_id = $2 AND payroll_year = $3 AND payroll_month = $4`,
        [companyId, profileId, y, m],
    );
    const row = r.rows[0];
    return {
        advance_gross_paid: rub(row?.advance_gross_paid ?? 0),
        ndfl_from_advance: rub(row?.ndfl_from_advance ?? 0),
        ndfl_from_remainder: rub(row?.ndfl_from_remainder ?? 0),
    };
}

export async function upsertPayrollMonthlyState(
    companyId: string,
    profileId: string,
    y: number,
    m: number,
    patch: Partial<PayrollMonthlyStateRow>,
): Promise<void> {
    if (!payrollPersistEnabled()) return;

    const cur = await loadPayrollMonthlyState(companyId, profileId, y, m);
    const merged = { ...cur, ...patch };

    await query(
        `INSERT INTO payroll_monthly_state (
           company_id, profile_id, payroll_year, payroll_month,
           advance_gross_paid, ndfl_from_advance, ndfl_from_remainder, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (company_id, profile_id, payroll_year, payroll_month) DO UPDATE SET
           advance_gross_paid = EXCLUDED.advance_gross_paid,
           ndfl_from_advance = EXCLUDED.ndfl_from_advance,
           ndfl_from_remainder = EXCLUDED.ndfl_from_remainder,
           updated_at = EXCLUDED.updated_at`,
        [
            companyId,
            profileId,
            y,
            m,
            merged.advance_gross_paid,
            merged.ndfl_from_advance,
            merged.ndfl_from_remainder,
            new Date().toISOString(),
        ],
    );
}

export async function payoutActionExists(
    companyId: string,
    profileId: string,
    accYear: number,
    accMonth: number,
    kind: string,
): Promise<boolean> {
    if (!payrollPersistEnabled()) return false;
    const r = await query(
        `SELECT 1 FROM payroll_payout_actions WHERE company_id = $1 AND profile_id = $2
           AND accrual_year = $3 AND accrual_month = $4 AND action_kind = $5 LIMIT 1`,
        [companyId, profileId, accYear, accMonth, kind],
    );
    return r.rows.length > 0;
}

export async function insertPayoutAction(
    rowId: string,
    companyId: string,
    profileId: string,
    accYear: number,
    accMonth: number,
    kind: string,
    transactionId: string,
): Promise<void> {
    if (!payrollPersistEnabled()) return;
    await query(
        `INSERT INTO payroll_payout_actions (id, company_id, profile_id, accrual_year, accrual_month, action_kind, transaction_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (company_id, profile_id, accrual_year, accrual_month, action_kind) DO NOTHING`,
        [rowId, companyId, profileId, accYear, accMonth, kind, transactionId, new Date().toISOString()],
    );
}

export function prevCalendarMonth(year: number, month: number): { y: number; m: number } {
    let m = month - 1;
    let y = year;
    if (m <= 0) {
        m = 12;
        y -= 1;
    }
    return { y, m };
}

export type PayrollAmounts = {
    oklad_brutto: number;
    advance_brutto: number;
    ndfl_on_advance: number;
    net_advance_to_employee: number;
    remainder_brutto: number;
    total_ndfl_on_oklad: number;
    ndfl_on_remainder: number;
    net_remainder_to_employee: number;
    /** Бюджетный НДФЛ после аванса (шаг 2 последовательности за выбранный расчётный месяц). */
    ndfl_budget_1_from_advance: number;
    /** Бюджетный НДФЛ после остатка (шаг 4). Совпадает с ndfl_on_remainder для этого месяца. */
    ndfl_budget_2_from_remainder: number;
    insurance_company_cost: number;
};

/**
 * Строгий порядок проведений по одному расчётному месяцу (accrual_year/month в payroll_payout_actions).
 *
 * НДФЛ1 и НДФЛ2 относятся к **тому же** расчётному месяцу, что и UI/API (`payroll_year`/`month`):
 * НДФЛ1 — удержанный с выплаченного аванса, НДФЛ2 — с остатка оклада в этом месяце.
 */
export const PAYROLL_PAYOUT_SEQUENCE = [
    'advance',
    'ndfl_budget_1',
    'remainder',
    'ndfl_budget_2',
    'insurance_contributions',
] as const;

export type PayrollPayoutActionKind = (typeof PAYROLL_PAYOUT_SEQUENCE)[number];

const PAYROLL_STEP_LABEL_RU: Record<PayrollPayoutActionKind, string> = {
    advance: 'Аванс',
    ndfl_budget_1: 'НДФЛ 1 (с аванса)',
    remainder: 'Остаток зарплаты',
    ndfl_budget_2: 'НДФЛ 2 (с остатка)',
    insurance_contributions: 'Страховые взносы',
};

export function payrollPriorStepLabelRu(kind: PayrollPayoutActionKind): string {
    return PAYROLL_STEP_LABEL_RU[kind];
}

/** Первая незавершённая ступень перед `action`; иначе null. */
export function firstBlockedPriorStep(
    action: PayrollPayoutActionKind,
    stepDone: Partial<Record<PayrollPayoutActionKind, boolean>>,
): PayrollPayoutActionKind | null {
    const idx = PAYROLL_PAYOUT_SEQUENCE.indexOf(action);
    if (idx <= 0) return null;
    for (let i = 0; i < idx; i++) {
        const k = PAYROLL_PAYOUT_SEQUENCE[i];
        if (!stepDone[k]) return k;
    }
    return null;
}

export function payrollOutOfOrderMessageRu(blockingKind: PayrollPayoutActionKind): string {
    return `Неверный порядок выплат: сначала выполните «${payrollPriorStepLabelRu(blockingKind)}» за этот расчётный месяц.`;
}

/** НДФЛ — плоско от полного брутто-оклада; суммы округляются в рублях. */
export function computePayrollAmounts(
    grossOklad: number,
    ps: PayrollOrgSettingsRow,
    stateMonth: PayrollMonthlyStateRow,
    payoutRecorded?: Partial<Record<PayrollPayoutActionKind, boolean>>,
): PayrollAmounts {
    const brutto = rub(grossOklad);
    const pNdfl = (ps.ndfl_percent || 0) / 100;
    const pAdv = (ps.advance_percent || 0) / 100;
    const pIns = (ps.insurance_percent || 0) / 100;

    const advanceBruttoFresh = rub(brutto * pAdv);
    const ndflAdvFresh = rub(advanceBruttoFresh * pNdfl);
    const netAdvFresh = rub(advanceBruttoFresh - ndflAdvFresh);

    const recordedAdvBrutto = rub(stateMonth.advance_gross_paid || 0);

    /** Аванс уже выплачен (journal), но `payroll_monthly_state` может быть пустым после частичного сбоя. */
    const advancePayoutRecorded = !!(payoutRecorded && payoutRecorded.advance);
    const effectiveAdvanceGrossPaid =
        recordedAdvBrutto > 0
            ? recordedAdvBrutto
            : advancePayoutRecorded && brutto > 0
              ? advanceBruttoFresh
              : 0;

    const remainderBruttoCalc = rub(Math.max(0, brutto - effectiveAdvanceGrossPaid));

    const totalNdfl = rub(brutto * pNdfl);

    const derivedNdflOnEffectiveAdvanceGross =
        effectiveAdvanceGrossPaid > 0 ? rub(effectiveAdvanceGrossPaid * pNdfl) : 0;
    const storedNdflFromAdvance = rub(stateMonth.ndfl_from_advance || 0);

    /** Доля месяцевого НДФЛ, отнесённая к выплаченному авансу (для расчёта остатка к бюджету по шагу 4). */
    let attributedNdflOnAdvancePortionOfMonth = 0;
    if (effectiveAdvanceGrossPaid > 0) {
        attributedNdflOnAdvancePortionOfMonth =
            storedNdflFromAdvance > 0 ? storedNdflFromAdvance : derivedNdflOnEffectiveAdvanceGross;
    }

    const ndflRemainder = rub(Math.max(0, totalNdfl - attributedNdflOnAdvancePortionOfMonth));
    const netRem = rub(remainderBruttoCalc - ndflRemainder);

    /** Сумма к бюджету после аванса: до выплаты аванса — ожидаемый НДФЛ по доле аванса; после — по факт. брутто аванса или сохранённой сумме. */
    let ndflBudget1FromAdvance = ndflAdvFresh;
    if (effectiveAdvanceGrossPaid > 0) {
        ndflBudget1FromAdvance = attributedNdflOnAdvancePortionOfMonth;
    }

    return {
        oklad_brutto: brutto,
        advance_brutto: advanceBruttoFresh,
        ndfl_on_advance: ndflAdvFresh,
        net_advance_to_employee: netAdvFresh,
        remainder_brutto: remainderBruttoCalc,
        total_ndfl_on_oklad: totalNdfl,
        ndfl_on_remainder: ndflRemainder,
        net_remainder_to_employee: netRem,
        ndfl_budget_1_from_advance: rub(ndflBudget1FromAdvance),
        ndfl_budget_2_from_remainder: rub(ndflRemainder),
        insurance_company_cost: rub(brutto * pIns),
    };
}
