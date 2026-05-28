import BaseKpiCalculator, { KpiResult } from './BaseKpiCalculator';
import { query, pool } from '../../db';
import { calculateBranchKPI, calculateRopPayout } from '../calculations/branch.calculator';
import { parseNumeric, sum } from '../../lib/formatting.utils';
import dealService, { KPI_ACTIVE_STATUSES } from '../deal.service';
import Decimal from 'decimal.js';

interface EmployeeData {
  management_kpi_current?: number;
  base_salary?: number;
  default_management_kpi_min?: number;
  default_management_kpi_max?: number;
  branch_id?: string;
  team_id?: string;
}

/**
 * ROP (Head of Sales) KPI Calculator
 * Calculates agency/branch KPI for РОП role (3-6% plan)
 * Phase 02-02: Refactored to use decimal-based calculations
 */
class RopKpiCalculator extends BaseKpiCalculator {
  async calculate(userId: string, startDate: string, endDate: string, period: string = 'quarter', branchId: string | null = null): Promise<KpiResult> {
    // Get employee's base salary and KPI from database
    const sql = pool
      ? `SELECT p.management_kpi_current, p.branch_id, p.team_id, pos.name as position_name, pos.base_salary, pos.default_management_kpi_min, pos.default_management_kpi_max FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = $1`
      : `SELECT p.management_kpi_current, p.branch_id, p.team_id, pos.name as position_name, pos.base_salary, pos.default_management_kpi_min, pos.default_management_kpi_max FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = ?`;

    const employeeResult = await query(sql, [userId]);
    const employee: EmployeeData = employeeResult.rows[0] || {};
    const dbBaseSalary = employee.base_salary ? parseNumeric(employee.base_salary) : new Decimal(0);
    
    // Plan 02-06.1: Prioritize global role-based salary from settings over position data
    // Fetch user role first to decide on salary logic
    const userRoleResult = await query(
      pool ? 'SELECT role FROM user_roles WHERE user_id = $1' : 'SELECT role FROM user_roles WHERE user_id = ?',
      [userId]
    );
    let userRole = userRoleResult.rows[0]?.role;

    // Fallback: check positions.access_level for director-level users without user_roles entry
    if (!userRole) {
      const profileResult = await query(
        pool ? 'SELECT pos.access_level FROM profiles p JOIN positions pos ON p.position_id = pos.id WHERE p.id = $1' : 'SELECT pos.access_level FROM profiles p JOIN positions pos ON p.position_id = pos.id WHERE p.id = ?',
        [userId]
      );
      const accessLevel = profileResult.rows[0]?.access_level;
      if (accessLevel >= 90) userRole = 'director';
    }

    const globalSettings = await (this.kpiService as any).getGlobalKpiSettings();
    let roleSalary = null;
    
    // Apply global ROP salary (80k) for head_sales or commercial roles.
    // Also apply for "director" role IF it's actually the Commercial Director (not ordinary)
    const isCommercialDirector = (this as any).position_name === 'Коммерческий директор' || (employee as any).position_name === 'Коммерческий директор';

    if (userRole === 'head_sales' || userRole === 'commercial' || (userRole === 'director' && isCommercialDirector)) {
      const settingsSalary = globalSettings?.rop?.base_salary || globalSettings?.head_sales?.base_salary;
      if (settingsSalary) {
        roleSalary = new Decimal(settingsSalary);
      }
    }

    const baseSalaryToUse = (roleSalary && roleSalary.greaterThan(0)) ? roleSalary : dbBaseSalary;

    console.log(`[ROP Calculator] User: ${userId}, Role: ${userRole}, Global Role Salary: ${roleSalary || 'None'}, Final used: ${baseSalaryToUse}`);

    const isQuarter = period === 'quarter';
    const totalBaseSalaryForPeriod = isQuarter ? baseSalaryToUse.times(3) : baseSalaryToUse;

    // Parse dates to get year and month
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Adjust for UTC/Local offset to ensure 1st of month (e.g. 21:00 previous day UTC) 
    // is treated as the correct month. Adding 12 hours is safe for all Russian timezones.
    const adjustedStart = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    const adjustedEnd = new Date(end.getTime() - 12 * 60 * 60 * 1000);
    
    const year = adjustedStart.getUTCFullYear();
    const startMonth = adjustedStart.getUTCMonth() + 1;

    // Use provided branchId or employee's branch
    // Treat 'all', null, undefined, 'null', 'undefined' as "show all branches"
    const isGlobalScope = !branchId || branchId === 'all' || branchId === 'null' || branchId === 'undefined';
    const effectiveBranchId = isGlobalScope ? 'all' : branchId;
    const effectiveTeamId = employee.team_id;
    console.log(`[ROP Calculator] branchId param: "${branchId}", employee.branch_id: "${employee.branch_id}", effectiveBranchId: "${effectiveBranchId}", effectiveTeamId: "${effectiveTeamId}"`);

    // Fetch deals by team (preferred) or branch
    // Use raw SQL instead of Drizzle to avoid connection/schema issues
    let branchDeals: any[] = [];

    const startYear = adjustedStart.getUTCFullYear();
    const startMonthNum = adjustedStart.getUTCMonth() + 1;
    const endYear2 = adjustedEnd.getUTCFullYear();
    const endMonthNum = adjustedEnd.getUTCMonth() + 1;
    const startVal = startYear * 100 + startMonthNum;
    const endVal = endYear2 * 100 + endMonthNum;

    const statusList = KPI_ACTIVE_STATUSES;

    let dealSql: string;
    let dealParams: any[];

    // When branchId is 'all', show all deals regardless of team/branch
    if (effectiveBranchId === 'all') {
        const statusPlaceholders = statusList.map((_, i) => `$${i + 3}`).join(', ');
        dealSql = `SELECT * FROM deal_table_rows WHERE (year * 100 + month) BETWEEN $1 AND $2 AND status IN (${statusPlaceholders})`;
        dealParams = [startVal, endVal, ...statusList];
    } else if (effectiveTeamId) {
        const statusPlaceholders = statusList.map((_, i) => `$${i + 4}`).join(', ');
        dealSql = `SELECT * FROM deal_table_rows WHERE (year * 100 + month) BETWEEN $1 AND $2 AND team_id = $3 AND status IN (${statusPlaceholders})`;
        dealParams = [startVal, endVal, effectiveTeamId, ...statusList];
    } else if (effectiveBranchId) {
        const statusPlaceholders = statusList.map((_, i) => `$${i + 4}`).join(', ');
        dealSql = `SELECT * FROM deal_table_rows WHERE (year * 100 + month) BETWEEN $1 AND $2 AND branch_id = $3 AND status IN (${statusPlaceholders})`;
        dealParams = [startVal, endVal, effectiveBranchId, ...statusList];
    } else {
        const statusPlaceholders = statusList.map((_, i) => `$${i + 3}`).join(', ');
        dealSql = `SELECT * FROM deal_table_rows WHERE (year * 100 + month) BETWEEN $1 AND $2 AND status IN (${statusPlaceholders})`;
        dealParams = [startVal, endVal, ...statusList];
    }

    console.log(`[ROP Calculator] Fetching deals with SQL:`, dealSql.substring(0, 200));
    console.log(`[ROP Calculator] Params: startVal=${startVal}, endVal=${endVal}, statuses=${JSON.stringify(statusList)}`);

    try {
        const dealResult = await query(dealSql, dealParams);
        branchDeals = dealResult.rows;
        console.log(`[ROP Calculator] Found ${branchDeals.length} deals`);
    } catch (e) {
        console.error(`[ROP Calculator] Deal query error:`, (e as Error).message);
        branchDeals = [];
    }

    // Map to calculator DealData type
    // Raw SQL returns snake_case columns, map to the camelCase keys expected by calculator
    const branchDealsData = branchDeals.map(deal => ({
      agent_income: parseNumeric(deal.agent_income),
      rop_payout: parseNumeric(deal.rop_payout),
      company_revenue: parseNumeric(deal.company_revenue),
      commission_total_fact: parseNumeric(deal.commission_total_fact),
      commission_seller_fact: parseNumeric(deal.commission_seller_fact),
      commission_buyer_fact: parseNumeric(deal.commission_buyer_fact),
      mortgage_deduction: parseNumeric(deal.mortgage_deduction),
      team_id: deal.team_id,
      branch_id: deal.branch_id,
      agent_name: deal.agent_name,
    }));

    // Get plan data - directors use quarterly plans, regular users use personal monthly plans
    let planRow: any = {};

    // Check if user is a director/commercial - they use quarterly plans instead of personal plans
    // userRole already fetched above for salary calculation

    if (userRole === 'director' || userRole === 'commercial') {
      // Directors use quarterly plans from quarterly_plans table
      const quarter = Math.ceil(startMonth / 3);

      if (effectiveBranchId && effectiveBranchId !== 'all') {
        // Single branch: fetch plan for specific branch
        const quarterPlanSql = pool
          ? `SELECT target_revenue FROM quarterly_plans WHERE period_year = $1 AND period_quarter = $2 AND branch_id = $3`
          : `SELECT target_revenue FROM quarterly_plans WHERE period_year = ? AND period_quarter = ? AND branch_id = ?`;

        const quarterPlanResult = await query(quarterPlanSql, [year, quarter, effectiveBranchId]);
        const quarterPlan = quarterPlanResult.rows[0] || {};
        const quarterlyTarget = quarterPlan.target_revenue ? quarterPlan.target_revenue : 0;
        planRow = { target_revenue: period === 'month' ? quarterlyTarget / 3 : quarterlyTarget };
      } else {
        // 'all' branches: sum plans across all branches
        const quarterPlanSql = pool
          ? `SELECT SUM(target_revenue) as target_revenue FROM quarterly_plans WHERE period_year = $1 AND period_quarter = $2`
          : `SELECT SUM(target_revenue) as target_revenue FROM quarterly_plans WHERE period_year = ? AND period_quarter = ?`;

        const quarterPlanResult = await query(quarterPlanSql, [year, quarter]);
        const quarterPlan = quarterPlanResult.rows[0] || {};
        const quarterlyTarget = quarterPlan.target_revenue ? quarterPlan.target_revenue : 0;
        planRow = { target_revenue: period === 'month' ? quarterlyTarget / 3 : quarterlyTarget };
      }
    } else {
      // Regular users use branch-wide aggregated plans (Sum of all members in branch)
      if (effectiveBranchId && effectiveBranchId !== 'all') {
        if (period === 'quarter') {
          const months: string[] = [];
          const curr = new Date(start.getFullYear(), start.getMonth(), 1);
          const stop = new Date(end.getFullYear(), end.getMonth(), 1);
          
          while (curr <= stop) {
            months.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`);
            curr.setMonth(curr.getMonth() + 1);
          }
          
          // Ensure we have at least 3 months
          if (months.length < 3 && startMonth % 3 === 1) {
            const m2 = new Date(start.getFullYear(), start.getMonth() + 1, 1);
            const m3 = new Date(start.getFullYear(), start.getMonth() + 2, 1);
            const s2 = `${m2.getFullYear()}-${String(m2.getMonth() + 1).padStart(2, '0')}`;
            const s3 = `${m3.getFullYear()}-${String(m3.getMonth() + 1).padStart(2, '0')}`;
            if (!months.includes(s2)) months.push(s2);
            if (!months.includes(s3)) months.push(s3);
          }

          const planSql = pool
            ? `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE branch_id = $1::TEXT) AND period_month = ANY($2)`
            : `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE branch_id = ?) AND period_month IN (${months.map(() => '?').join(',')})`;
          
          const planParams = pool ? [effectiveBranchId, months] : [effectiveBranchId, ...months];
          const planResult = await query(planSql, planParams);
          planRow = planResult.rows[0] || {};
        } else {
          const periodMonth = `${year}-${String(startMonth).padStart(2, '0')}`;
          const planSql = pool
            ? `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE branch_id = $1::TEXT) AND period_month = $2`
            : `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE branch_id = ?) AND period_month = ?`;
          const planResult = await query(planSql, [effectiveBranchId, periodMonth]);
          planRow = planResult.rows[0] || {};
        }
      } else {
        // 'all' branches: aggregate plans across all branches
        if (period === 'quarter') {
          const months: string[] = [];
          const curr = new Date(start.getFullYear(), start.getMonth(), 1);
          const stop = new Date(end.getFullYear(), end.getMonth(), 1);

          while (curr <= stop) {
            months.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`);
            curr.setMonth(curr.getMonth() + 1);
          }

          if (months.length < 3 && startMonth % 3 === 1) {
            const m2 = new Date(start.getFullYear(), start.getMonth() + 1, 1);
            const m3 = new Date(start.getFullYear(), start.getMonth() + 2, 1);
            const s2 = `${m2.getFullYear()}-${String(m2.getMonth() + 1).padStart(2, '0')}`;
            const s3 = `${m3.getFullYear()}-${String(m3.getMonth() + 1).padStart(2, '0')}`;
            if (!months.includes(s2)) months.push(s2);
            if (!months.includes(s3)) months.push(s3);
          }

          const planSql = pool
            ? `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE period_month = ANY($1)`
            : `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE period_month IN (${months.map(() => '?').join(',')})`;

          const planParams = pool ? [months] : [...months];
          const planResult = await query(planSql, planParams);
          planRow = planResult.rows[0] || {};
        } else {
          const periodMonth = `${year}-${String(startMonth).padStart(2, '0')}`;
          const planSql = pool
            ? `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE period_month = $1`
            : `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE period_month = ?`;
          const planResult = await query(planSql, [periodMonth]);
          planRow = planResult.rows[0] || {};
        }
      }
    }

    // User actual management KPI percent from profile (0 if not set)
    const rawPercent = parseNumeric(employee.management_kpi_current);
    const overridePercent = rawPercent;

    const plan = {
      revenue: parseNumeric(planRow.target_revenue || 0),
      branchRevenue: parseNumeric(planRow.target_revenue || 0),
      overridePercent,
    };

    // Delegate calculation to pure function
    const metrics = calculateBranchKPI({
      branchDeals: branchDealsData,
      plan,
      role: 'rop',
      overridePercent,
    });

    // Calculate mortgage bonus - only if this ROP/Director is explicitly the MOP on these deals
    const myMopDeals = branchDeals.filter(d => d.mopId === userId);
    const mortgageBonus = sum(myMopDeals.map(d => parseNumeric(d.mopRevenue || 0)));
    metrics.mortgageBonus = mortgageBonus;

    // Calculate ROP payout
    const ropPayout = calculateRopPayout(branchDealsData);

    // Fetch KPI rules from database for head_sales
    const rulesResult = await query(
      pool ? 'SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC' : 'SELECT min_threshold, percent FROM kpi_rules WHERE role = ? ORDER BY min_threshold ASC',
      ['head_sales']
    );
    const rules = rulesResult.rows.map((r: any) => ({
      threshold: parseNumeric(r.min_threshold),
      percent: parseNumeric(r.percent)
    }));

    // Calculate management KPI tier based on plan completion from DB rules
    const planCompletion = metrics.planCompletion;
    let currentPercent = overridePercent;
    let currentThreshold = new Decimal(0);
    let nextThreshold: Decimal | null = null;

    let appliedRule = null;
    for (const rule of rules) {
      if (planCompletion.greaterThanOrEqualTo(rule.threshold)) {
        appliedRule = rule;
      }
    }

    if (appliedRule) {
      currentPercent = appliedRule.percent;
      currentThreshold = appliedRule.threshold;
      
      // Find next threshold
      const currentIndex = rules.findIndex(r => r.threshold.equals(appliedRule!.threshold));
      if (currentIndex !== -1 && currentIndex < rules.length - 1) {
        nextThreshold = rules[currentIndex + 1].threshold;
      }
    } else if (rules.length > 0) {
      // User is below the first threshold from DB rules
      currentThreshold = new Decimal(0);
      nextThreshold = rules[0].threshold;
    } else {
      // Fallback to legacy hardcoded logic if no rules in DB
      if (planCompletion.greaterThanOrEqualTo(120)) {
        currentPercent = new Decimal(6);
        currentThreshold = new Decimal(120);
        nextThreshold = null;
      } else if (planCompletion.greaterThanOrEqualTo(95)) {
        currentPercent = new Decimal(5);
        currentThreshold = new Decimal(95);
        nextThreshold = new Decimal(120);
      } else if (planCompletion.greaterThanOrEqualTo(75)) {
        currentPercent = new Decimal(4);
        currentThreshold = new Decimal(75);
        nextThreshold = new Decimal(95);
      } else if (planCompletion.greaterThanOrEqualTo(50)) {
        currentPercent = new Decimal(3);
        currentThreshold = new Decimal(50);
        nextThreshold = new Decimal(75);
      } else {
        currentPercent = new Decimal(3);
        currentThreshold = new Decimal(0);
        nextThreshold = new Decimal(50);
      }
    }

    // ROP income = base salary + literal sum of ROP payouts from deals + mortgage bonus
    const estimatedIncome = totalBaseSalaryForPeriod.plus(ropPayout).plus(mortgageBonus);

    // Convert to numbers for API
    return {
      type: this.getType(),
      displayName: this.getDisplayName(),
      metrics: {
        totalRevenue: Number(metrics.totalRevenue.toFixed(2)),
        planRevenue: Number(plan.revenue.toFixed(2)),
        ropPayout: Number(ropPayout.toFixed(2)),
        companyRevenue: Number(metrics.companyRevenue.toFixed(2)),
        overrideBonus: Number(metrics.overrideBonus.toFixed(2)),
        planCompletion: Number(metrics.planCompletion.toFixed(2)),
        dealCount: metrics.dealCount,
        avgDealSize: Number(metrics.avgDealSize.toFixed(2)),
        estimatedIncome: Number(estimatedIncome.toFixed(2)),
        currentPercent: Number((currentPercent || new Decimal(0)).toFixed(2)), 
        currentThreshold: Number((currentThreshold || new Decimal(0)).toFixed(2)),
        nextThreshold: nextThreshold ? Number(nextThreshold.toFixed(2)) : null,
        baseSalary: totalBaseSalaryForPeriod.toNumber(),
        mortgageBonus: Number((metrics.mortgageBonus || new Decimal(0)).toFixed(2)),
      },
      currentPercent: Number(currentPercent.toFixed(2)),
      planCompletion: Number(planCompletion.toFixed(2)),
      currentThreshold: Number(currentThreshold.toFixed(2)),
      nextThreshold: nextThreshold ? Number(nextThreshold.toFixed(2)) : null,
      estimatedIncome: Number(estimatedIncome.toFixed(2)),
      totalRevenue: Number(metrics.totalRevenue.toFixed(2)),
      baseSalary: totalBaseSalaryForPeriod.toNumber(),
      mortgageBonus: Number(metrics.mortgageBonus.toFixed(2)),
    };
  }

  getType(): string {
    return 'agency';
  }

  getDisplayName(): string {
    return 'KPI агентства';
  }
}

export default RopKpiCalculator;
