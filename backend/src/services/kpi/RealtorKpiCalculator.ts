import BaseKpiCalculator, { KpiResult } from './BaseKpiCalculator';
import { query, pool } from '../../db';
import { calculateRealtorKPI, calculateRealtorTier, calculateEstimatedIncome, setRealtorTiers, TierThreshold } from '../calculations/realtor.calculator';
import { parseNumeric, sum } from '../../lib/formatting.utils';
import dealService, { DealData, KPI_ACTIVE_STATUSES } from '../deal.service';
import Decimal from 'decimal.js';
import { sumManualGrossForCalendarMonths } from '../../lib/employeeManualFinance';

interface EmployeeData {
  personal_kpi_current?: number;
  base_salary?: number;
  default_personal_kpi_min?: number;
  default_personal_kpi_max?: number;
}

/**
 * Realtor KPI Calculator
 * Calculates personal KPI for realtors (40-60% plan)
 * Phase 02-02: Refactored to use decimal-based calculations
 */
class RealtorKpiCalculator extends BaseKpiCalculator {
  async calculate(userId: string, startDate: string, endDate: string, period: string = 'quarter'): Promise<KpiResult> {
    // Load KPI tiers from database for realtors
    const tiersResult = await query(
      pool ? 'SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC' : 'SELECT min_threshold, percent FROM kpi_rules WHERE role = ? ORDER BY min_threshold ASC',
      ['realtor']
    );
    const dbTiers = tiersResult.rows.map((r: any) => ({
      threshold: Number(r.min_threshold),
      percent: Number(r.percent),
    }));
    if (dbTiers.length > 0) {
      setRealtorTiers(dbTiers);
    }

    // Get employee's base salary and KPI from database
    const sql = pool
      ? `SELECT p.personal_kpi_current, pos.base_salary, pos.default_personal_kpi_min, pos.default_personal_kpi_max FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = $1`
      : `SELECT p.personal_kpi_current, pos.base_salary, pos.default_personal_kpi_min, pos.default_personal_kpi_max FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = ?`;

    const employeeResult = await query(sql, [userId]);
    const employee: EmployeeData = employeeResult.rows[0] || {};
    const dbBaseSalary = employee.base_salary ? parseNumeric(employee.base_salary) : new Decimal(0);

    // Plan 02-06.3: management salary is handled in MOP/ROP calculator to avoid double counting.
    // (Avoid unused fetch of global KPI settings on every request.)

    // Check if user has management role (to avoid double salary)
    const userRoleRes = await query('SELECT pos.name FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = $1', [userId]);
    const posName = (userRoleRes.rows[0]?.name || '').toLowerCase();
    const isManagement = posName.includes('моп') || posName.includes('роп') || posName.includes('директор');

    // For realtors, use global/profile salary. For managers, use 0 here (they get it from the other calculator)
    const baseSalaryToUse = isManagement ? new Decimal(0) : dbBaseSalary;

    const totalBaseSalaryForPeriod = period === 'quarter' ? baseSalaryToUse.times(3) : baseSalaryToUse;

    // Parse dates to get year and month
    const start = new Date(startDate);
    const end = new Date(endDate);

    console.log(`[RealtorKPI] User ID: ${userId}, period: ${startDate} to ${endDate}`);

    // Fetch deals using deal service by ID (isId: true is default now in my updated service, but I'll be explicit)
    const deals: DealData[] = await dealService.getDealsByDateRange(userId, start, end, true, KPI_ACTIVE_STATUSES);
    console.log(`[RealtorKPI] Found ${deals.length} deals for matching ID ${userId}`);

    // Map to calculator DealData type (compatible structure)
    // IMPORTANT: Only count payouts if the userId matches the specific role ID in the deal!
    const dealsWithDecimal = deals.map(deal => ({
      agent_income: (deal.agentId === userId) ? deal.agentIncome : new Decimal(0),
      payout: (deal.agentId === userId) ? deal.agentIncome : new Decimal(0),
      commission_total_fact: (deal.agentId === userId) ? deal.commissionTotalFact : new Decimal(0),
      commission_seller_fact: (deal.agentId === userId) ? deal.commissionSellerFact : new Decimal(0),
      commission_buyer_fact: (deal.agentId === userId) ? deal.commissionBuyerFact : new Decimal(0),
      mortgage_deduction: (deal.agentId === userId) ? deal.mortgageDeduction : new Decimal(0),
      mop_revenue: (deal.mopId === userId) ? deal.mopRevenue : new Decimal(0),
    }));

    // Get actions data (deposits, takes, objects)
    const actionsSql = pool
      ? `SELECT
          COUNT(CASE WHEN type IN ('deposit', 'prepayment') THEN 1 END) as deposits,
          COUNT(CASE WHEN type IN ('take', 'listing', 'object') THEN 1 END) as objects,
          COUNT(CASE WHEN type IN ('deal', 'sale') THEN 1 END) as deals,
          COUNT(CASE WHEN type IN ('meeting', 'meeting_office') THEN 1 END) as meetings,
          COUNT(CASE WHEN type = 'showing' THEN 1 END) as showings
        FROM service_requests
        WHERE user_id = $1 AND created_at BETWEEN $2 AND $3`
      : `SELECT
          COUNT(CASE WHEN type IN ('deposit', 'prepayment') THEN 1 END) as deposits,
          COUNT(CASE WHEN type IN ('take', 'listing', 'object') THEN 1 END) as objects,
          COUNT(CASE WHEN type IN ('deal', 'sale') THEN 1 END) as deals,
          COUNT(CASE WHEN type IN ('meeting', 'meeting_office') THEN 1 END) as meetings,
          COUNT(CASE WHEN type = 'showing' THEN 1 END) as showings
        FROM service_requests
        WHERE user_id = ? AND created_at BETWEEN ? AND ?`;

    const actionsResult = await query(actionsSql, [userId, startDate, endDate]);
    const actions = actionsResult.rows[0] || { deposits: 0, takes: 0, objects: 0, deals: 0, meetings: 0, showings: 0 };

    const revenueData = await (this.kpiService as any).getRevenueForUser(userId, startDate, endDate, 'realtor');
    const legacyTotalRevenue = Number(revenueData?.revenue) || 0;

    const planAnchor = new Date(startDate);
    const anchorYear = planAnchor.getFullYear();
    const anchorMonthIndex = planAnchor.getMonth() + 1; // 1..12 (same as legacy calculateRealtorKPI for user_plans)

    // Get plan data (must match legacy /kpi/my-stats + Planning → user_plans after distribute)
    let planRow: {
      target_revenue?: string | number;
      target_deposits?: number | string;
      target_objects?: number | string;
      target_deals?: number | string;
    } = {};
    if (period === 'quarter') {
      const quarterNum = Math.floor((anchorMonthIndex - 1) / 3) + 1;
      const m1 = `${anchorYear}-${String((quarterNum - 1) * 3 + 1).padStart(2, '0')}`;
      const m2 = `${anchorYear}-${String((quarterNum - 1) * 3 + 2).padStart(2, '0')}`;
      const m3 = `${anchorYear}-${String((quarterNum - 1) * 3 + 3).padStart(2, '0')}`;

      const planSql = pool
        ? `SELECT SUM(target_revenue) as target_revenue, SUM(target_deposits) as target_deposits, SUM(target_objects) as target_objects, COALESCE(SUM(target_deals), 0) as target_deals FROM user_plans WHERE user_id = $1 AND period_month IN ($2, $3, $4)`
        : `SELECT SUM(target_revenue) as target_revenue, SUM(target_deposits) as target_deposits, SUM(target_objects) as target_objects, COALESCE(SUM(target_deals), 0) as target_deals FROM user_plans WHERE user_id = ? AND period_month IN (?, ?, ?)`;

      const planResult = pool
        ? await query(planSql, [userId, m1, m2, m3])
        : await query(planSql, [userId, m1, m2, m3]);
      planRow = planResult.rows[0] || {};
    } else {
      const periodMonth = `${anchorYear}-${String(anchorMonthIndex).padStart(2, '0')}`;
      const planSql = pool
        ? `SELECT target_revenue, target_deposits, target_objects, COALESCE(target_deals, 0) as target_deals FROM user_plans WHERE user_id = $1 AND period_month = $2`
        : `SELECT target_revenue, target_deposits, target_objects, COALESCE(target_deals, 0) as target_deals FROM user_plans WHERE user_id = ? AND period_month = ?`;

      const planResult = await query(planSql, [userId, periodMonth]);
      planRow = planResult.rows[0] || {};
    }

    const plan = {
      revenue: parseNumeric(planRow?.target_revenue || 0),
      deposits: Number(planRow?.target_deposits || 0),
      objects: Number(planRow?.target_objects || 0),
    };

    const planDeals = Number(planRow?.target_deals || 0);
    const dealsCount = deals.length;

    // Delegate calculation to pure function (deal rows still drive tier curve shape where needed)
    const metrics = calculateRealtorKPI({
      deals: dealsWithDecimal,
      actions,
      plan,
    }, period === 'quarter' ? 'quarter' : 'month');

    const legacyRevenueDecimal = new Decimal(legacyTotalRevenue);

    const revenuePercent =
      plan.revenue.isZero() || plan.revenue.lte(0)
        ? new Decimal(0)
        : legacyRevenueDecimal.dividedBy(plan.revenue).times(100);

    const depositsPercent = plan.deposits === 0
      ? new Decimal(0)
      : new Decimal(metrics.totalDeposits).dividedBy(plan.deposits).times(100);

    const objectsPercent = plan.objects === 0
      ? new Decimal(0)
      : new Decimal(metrics.totalObjects).dividedBy(plan.objects).times(100);

    const dealsPercent = planDeals === 0 ? 0 : (dealsCount / planDeals) * 100;

    const metricsWithTargets: number[] = [];
    if (plan.deposits > 0) metricsWithTargets.push(Number(depositsPercent.toFixed(4)));
    if (plan.objects > 0) metricsWithTargets.push(Number(objectsPercent.toFixed(4)));
    if (!plan.revenue.isZero()) metricsWithTargets.push(Number(revenuePercent.toFixed(4)));
    const planCompletionAvg =
      metricsWithTargets.length > 0
        ? metricsWithTargets.reduce((a, b) => a + b, 0) / metricsWithTargets.length
        : 0;

    // Load tiers from calculator (set from DB at start of calculate)
    const KPI_TIERS = getRealtorTiers().map(t => ({
      percent: Number(t.percent.toFixed(0)),
      threshold: Number(t.threshold.toFixed(0)),
    }));

    // For quarterly view: KPI % is determined by PREVIOUS quarter's gross revenue
    // Max drop is 1 tier (can't fall more than one step down)
    const isQuarter = period === 'quarter';
    let tier: { currentPercent: Decimal; currentThreshold: Decimal; nextThreshold: Decimal | null; nextPercent: Decimal | null };

    if (isQuarter) {
      const currentQuarter = Math.ceil(anchorMonthIndex / 3);
      let prevQuarter = currentQuarter - 1;
      let prevYear = anchorYear;
      if (prevQuarter < 1) {
        prevQuarter = 4;
        prevYear = anchorYear - 1;
      }
      const prevQuarterMonths = [
        `${prevYear}-${String((prevQuarter - 1) * 3 + 1).padStart(2, '0')}`,
        `${prevYear}-${String((prevQuarter - 1) * 3 + 2).padStart(2, '0')}`,
        `${prevYear}-${String((prevQuarter - 1) * 3 + 3).padStart(2, '0')}`,
      ];

      // Fetch previous quarter's gross revenue (commission_seller_fact + commission_buyer_fact)
      const prevMonths = prevQuarterMonths.map(m => {
        const [y, mo] = m.split('-');
        return `${parseInt(y)}${parseInt(mo).toString().padStart(2, '0')}`;
      });
      const prevRevenueSql = pool
        ? `SELECT COALESCE(SUM(commission_seller_fact + commission_buyer_fact), 0) as gross_revenue FROM deal_table_rows WHERE agent_id = $1 AND status IN ('approved', 'active') AND (year * 100 + month) = ANY($2)`
        : `SELECT COALESCE(SUM(commission_seller_fact + commission_buyer_fact), 0) as gross_revenue FROM deal_table_rows WHERE agent_id = ? AND status IN ('approved', 'active') AND (year * 100 + month) IN (${prevMonths.map(() => '?').join(',')})`;

      const prevRevenueParams = pool ? [userId, prevMonths.map(m => parseInt(m))] : [userId, ...prevMonths.map(m => parseInt(m))];
      const prevRevenueResult = await query(prevRevenueSql, prevRevenueParams);
      const prevDealGrossRevenue = parseNumeric(prevRevenueResult.rows[0]?.gross_revenue || 0);
      const prevQuarterMonthInts = [(prevQuarter - 1) * 3 + 1, (prevQuarter - 1) * 3 + 2, (prevQuarter - 1) * 3 + 3];
      const prevManualGrossDec = parseNumeric(await sumManualGrossForCalendarMonths(userId, prevYear, prevQuarterMonthInts));
      const prevGrossRevenue = prevDealGrossRevenue.plus(prevManualGrossDec);

      // Determine tier from previous quarter
      const prevTier = calculateRealtorTier(prevGrossRevenue, 'quarter');

      // Align tier with legacy KPI: same revenue basis as /kpi/my-stats (getRevenueForUser)
      const currentTier = calculateRealtorTier(legacyRevenueDecimal, 'quarter');

      // Max 1 tier drop: if current tier is more than 1 step below previous, cap it
      const prevTierIndex = KPI_TIERS.findIndex(t => t.percent === Number(prevTier.currentPercent.toFixed(0)));
      const currentTierIndex = KPI_TIERS.findIndex(t => t.percent === Number(currentTier.currentPercent.toFixed(0)));

      if (currentTierIndex < prevTierIndex - 1) {
        // Cap at 1 tier below previous
        const cappedIndex = Math.max(0, prevTierIndex - 1);
        const cappedTier = KPI_TIERS[cappedIndex];
        tier = {
          currentPercent: new Decimal(cappedTier.percent),
          currentThreshold: new Decimal(cappedTier.threshold),
          nextThreshold: cappedIndex < KPI_TIERS.length - 1 ? new Decimal(KPI_TIERS[cappedIndex + 1].threshold) : null,
          nextPercent: cappedIndex < KPI_TIERS.length - 1 ? new Decimal(KPI_TIERS[cappedIndex + 1].percent) : null,
        };
      } else {
        tier = currentTier;
      }
    } else {
      tier = calculateRealtorTier(legacyRevenueDecimal, 'month');
    }

    // Consider manual KPI setting (if higher than calculated tier)
    const manualPercent = parseNumeric(employee.personal_kpi_current || 40);
    const effectivePercent = Decimal.max(tier.currentPercent, Decimal.min(manualPercent, new Decimal(60)));

    // Calculate estimated income with effective percent
    const commissionIncome = calculateEstimatedIncome(legacyRevenueDecimal, effectivePercent);

    // Calculate mortgage bonus (mortgage_deduction) AND broker revenue (mop_revenue)
    const mortgageBonus = sum(dealsWithDecimal.map(d => parseNumeric(d.mortgage_deduction as any || 0)));
    const mopRevenue = sum(dealsWithDecimal.map(d => parseNumeric((d as any).mop_revenue || 0)));

    const estimatedIncome = commissionIncome.plus(mortgageBonus).plus(mopRevenue).plus(totalBaseSalaryForPeriod);

    // Find next threshold for display
    let nextThreshold: Decimal | null = null;
    const currentEffectivePercentNum = Number(effectivePercent.toFixed(0));
    const currentTierIndex = KPI_TIERS.findIndex(t => t.percent === currentEffectivePercentNum);

    if (currentTierIndex >= 0 && currentTierIndex < KPI_TIERS.length - 1) {
      const nextTier = KPI_TIERS[currentTierIndex + 1];
      if (nextTier && typeof nextTier.threshold === 'number') {
        nextThreshold = new Decimal(nextTier.threshold);
      }
    }

    const mopRevNum = Number(revenueData?.mop_revenue) || 0;
    const ropPayNum = Number(revenueData?.rop_payout) || 0;
    const mortDedNum = Number(revenueData?.mortgage_deduction) || 0;
    const otherExpNum = Number(revenueData?.other_expenses) || 0;

    // Convert to numbers for API (KpiResult interface expects numbers)
    return {
      type: this.getType(),
      displayName: this.getDisplayName(),
      role: 'realtor',
      metrics: {
        totalRevenue: legacyTotalRevenue,
        totalDeposits: metrics.totalDeposits,
        totalObjects: metrics.totalObjects,
        planCompletion: Number(planCompletionAvg.toFixed(2)),
        depositsPercent: Number(depositsPercent.toFixed(2)),
        objectsPercent: Number(objectsPercent.toFixed(2)),
        revenuePercent: Number(revenuePercent.toFixed(2)),
        dealsPercent: Number(dealsPercent.toFixed(2)),
        planRevenue: Number(plan.revenue.toFixed(2)),
        planDeposits: plan.deposits,
        planObjects: plan.objects,
        planDeals,
        dealsCount,
        mopRevenue: mopRevNum,
        ropPayout: ropPayNum,
        mortgageDeduction: mortDedNum,
        otherExpenses: otherExpNum,
        estimatedIncome: Number(estimatedIncome.toFixed(2)),
        currentPercent: Number(effectivePercent.toFixed(2)),
        currentThreshold: Number(tier.currentThreshold.toFixed(2)),
        nextThreshold: nextThreshold ? Number(nextThreshold.toFixed(2)) : null,
        baseSalary: Number(totalBaseSalaryForPeriod.toFixed(2)), // Scaled for frontend deduction
        mortgageBonus: Number(mortgageBonus.toFixed(2)),
        meetings: Number(actions.meetings || 0),
        showings: Number(actions.showings || 0),
        rating: Number(Math.min((planCompletionAvg / 100) * 5, 5).toFixed(2)),
      },
      currentPercent: Number(effectivePercent.toFixed(2)),
      currentThreshold: Number(tier.currentThreshold.toFixed(2)),
      nextThreshold: nextThreshold ? Number(nextThreshold.toFixed(2)) : null,
      estimatedIncome: Number(estimatedIncome.toFixed(2)),
      totalRevenue: legacyTotalRevenue,
      baseSalary: Number(totalBaseSalaryForPeriod.toFixed(2)), // Scaled for frontend
      mortgageBonus: Number(mortgageBonus.toFixed(0)),
    };
  }

  getType(): string {
    return 'personal';
  }

  getDisplayName(): string {
    return 'Личный KPI';
  }
}

export default RealtorKpiCalculator;
