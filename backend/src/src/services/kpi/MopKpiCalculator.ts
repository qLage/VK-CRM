import BaseKpiCalculator, { KpiResult } from './BaseKpiCalculator';
import { query, pool } from '../../db';
import { calculateTeamKPI, calculateMopRevenue } from '../calculations/team.calculator';
import { parseNumeric, sum } from '../../lib/formatting.utils';
import dealService, { KPI_ACTIVE_STATUSES } from '../deal.service';
import teamService from '../team.service';
import Decimal from 'decimal.js';

interface EmployeeData {
  management_kpi_current?: number;
  base_salary?: number;
  default_management_kpi_min?: number;
  default_management_kpi_max?: number;
  full_name?: string;
  team_id?: string;
}

/**
 * MOP (Sales Manager) KPI Calculator
 * Calculates team KPI for МОП role (3-5% plan)
 * Phase 02-02: Refactored to use decimal-based calculations
 */
class MopKpiCalculator extends BaseKpiCalculator {
  async calculate(userId: string, startDate: string, endDate: string, period: string = 'quarter'): Promise<KpiResult> {
    // Get employee's base salary and KPI from database
    const sql = pool
      ? `SELECT p.management_kpi_current, p.full_name, p.team_id, pos.base_salary, pos.default_management_kpi_min, pos.default_management_kpi_max FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = $1`
      : `SELECT p.management_kpi_current, p.full_name, p.team_id, pos.base_salary, pos.default_management_kpi_min, pos.default_management_kpi_max FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.id = ?`;

    const employeeResult = await query(sql, [userId]);
    const employee: EmployeeData = employeeResult.rows[0] || {};
    
    // Fetch base salary from position data
    const dbBaseSalary = employee.base_salary ? parseNumeric(employee.base_salary) : new Decimal(0);

    // Plan 02-06.2: Prioritize global role-based salary from settings over position data
    const globalSettings = await (this.kpiService as any).getGlobalKpiSettings();
    const roleSalary = globalSettings?.mop?.base_salary ? new Decimal(globalSettings.mop.base_salary) : null;
    
    const baseSalaryToUse = (roleSalary && roleSalary.greaterThan(0)) ? roleSalary : dbBaseSalary;

    const isQuarter = period === 'quarter';
    const totalBaseSalaryForPeriod = isQuarter ? baseSalaryToUse.times(3) : baseSalaryToUse;
    
    console.log(`[MopKpiCalculator] Period: ${period}, Base: ${baseSalaryToUse}, Total: ${totalBaseSalaryForPeriod}, User: ${userId}`);

    // For quarterly view, we should show the scaled salary in the label too to avoid confusion
    const displayBaseSalary = totalBaseSalaryForPeriod;

    // Parse dates to get year and month
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Adjust for UTC/Local offset to ensure 1st of month (e.g. 21:00 previous day UTC) 
    // is treated as the correct month. Adding 12 hours is safe for all Russian timezones.
    const adjustedStart = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    const adjustedEnd = new Date(end.getTime() - 12 * 60 * 60 * 1000);
    
    const year = adjustedStart.getUTCFullYear();
    const startMonth = adjustedStart.getUTCMonth() + 1;
    const endMonth = adjustedEnd.getUTCMonth() + 1;

    // Fetch personal deals (own deals) and team deals by date range
    const personalDeals = await dealService.getDealsByDateRange(userId, start, end, true, KPI_ACTIVE_STATUSES);
    let teamDeals: any[] = [];
    
    if (employee.team_id) {
      // We need a method to get team deals by date range, but for now we can use getDealsForPeriod with filters
      teamDeals = await dealService.getDealsForPeriod({
        teamId: employee.team_id,
        year: undefined, // ensure we don't filter by single year/month
        month: undefined,
        status: KPI_ACTIVE_STATUSES,
      });
      // Filter the team deals by date range (client-side for now to avoid adding more service methods)
      const startVal = adjustedStart.getUTCFullYear() * 100 + (adjustedStart.getUTCMonth() + 1);
      const endVal = adjustedEnd.getUTCMonth() + 1 + (adjustedEnd.getUTCFullYear() * 100); // Fixed arithmetic ordering
      
      // Filter team deals by date range
      teamDeals = teamDeals.filter(deal => {
        const dealVal = deal.year * 100 + deal.month;
        return dealVal >= startVal && dealVal <= endVal;
      });

      // Exclude own deals from team deals by ID
      teamDeals = teamDeals.filter(deal => deal.agentId !== userId);
    }

    // Map to calculator DealData type
    const personalDealsData = personalDeals.map(deal => ({
      agent_income: deal.agentIncome,
      mop_revenue: deal.mopRevenue,
      commission_total_fact: deal.commissionTotalFact,
      commission_seller_fact: deal.commissionSellerFact,
      commission_buyer_fact: deal.commissionBuyerFact,
      mortgage_deduction: deal.mortgageDeduction,
      agent_name: deal.agentName,
    }));

    const teamDealsData = teamDeals.map(deal => ({
      agent_income: deal.agentIncome,
      mop_revenue: deal.mopRevenue,
      commission_total_fact: deal.commissionTotalFact,
      commission_seller_fact: deal.commissionSellerFact,
      commission_buyer_fact: deal.commissionBuyerFact,
      mortgage_deduction: deal.mortgageDeduction,
      agent_name: deal.agentName,
    }));

    // Get plan data: Sum of plans for all team members
    let planRow: any = {};
    if (employee.team_id) {
      if (period === 'quarter') {
        const monthsList: string[] = [];
        const c = new Date(start.getFullYear(), start.getMonth(), 1);
        const s = new Date(end.getFullYear(), end.getMonth(), 1);
        
        while (c <= s) {
          monthsList.push(`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`);
          c.setMonth(c.getMonth() + 1);
        }

        if (monthsList.length < 3 && startMonth % 3 === 1) {
          const m2 = new Date(start.getFullYear(), start.getMonth() + 1, 1);
          const m3 = new Date(start.getFullYear(), start.getMonth() + 2, 1);
          const s2 = `${m2.getFullYear()}-${String(m2.getMonth() + 1).padStart(2, '0')}`;
          const s3 = `${m3.getFullYear()}-${String(m3.getMonth() + 1).padStart(2, '0')}`;
          if (!monthsList.includes(s2)) monthsList.push(s2);
          if (!monthsList.includes(s3)) monthsList.push(s3);
        }

        const planSql = pool
          ? `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE team_id = $1::TEXT) AND period_month = ANY($2)`
          : `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE team_id = ?) AND period_month IN (${monthsList.map(() => '?').join(',')})`;
        
        const planParams = pool ? [employee.team_id, monthsList] : [employee.team_id, ...monthsList];
        const planResult = await query(planSql, planParams);
        planRow = planResult.rows[0] || {};
      } else {
        const periodMonth = `${year}-${String(startMonth).padStart(2, '0')}`;
        const planSql = pool
          ? `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE team_id = $1::TEXT) AND period_month = $2`
          : `SELECT SUM(target_revenue) as target_revenue FROM user_plans WHERE user_id IN (SELECT id FROM profiles WHERE team_id = ?) AND period_month = ?`;
        const planResult = await query(planSql, [employee.team_id, periodMonth]);
        planRow = planResult.rows[0] || {};
      }
    }

    // Ensure minimum 3% for management roles (MOP)
    const rawPercent = parseNumeric(employee.management_kpi_current);
    const managementPercent = rawPercent.isZero() || rawPercent.lessThan(3) ? new Decimal(3) : rawPercent;

    const planData = {
      personalRevenue: parseNumeric(planRow.target_revenue as any || 0),
      teamRevenue: parseNumeric(planRow.target_revenue || 0),
      totalIncome: parseNumeric(planRow.target_revenue || 0),
      managementPercent,
    };

    // Delegate calculation to pure function
    const metricsResult = calculateTeamKPI({
      personalDeals: personalDealsData,
      teamDeals: teamDealsData,
      plan: planData,
      managementPercent,
    });

    // Calculate mortgage bonus from all deals
    const teamMortgage = sum(teamDealsData.map(d => d.mortgage_deduction || new Decimal(0)));
    const personalMortgage = sum(personalDealsData.map(d => d.mortgage_deduction || new Decimal(0)));
    const mortgageBonus = teamMortgage.plus(personalMortgage);

    // Calculate MOP revenue
    const mopRevenue = calculateMopRevenue(teamDealsData);

    // Fetch KPI rules from database for sales_manager
    const rulesResult = await query(
      pool ? 'SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC' : 'SELECT min_threshold, percent FROM kpi_rules WHERE role = ? ORDER BY min_threshold ASC',
      ['sales_manager']
    );
    const rules = rulesResult.rows.map((r: any) => ({
      threshold: parseNumeric(r.min_threshold),
      percent: parseNumeric(r.percent)
    }));

    // Calculate management KPI tier based on plan completion from DB rules
    const planCompletion = metricsResult.planCompletion;
    let currentPercent = managementPercent;
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
        currentPercent = new Decimal(5);
        currentThreshold = new Decimal(120);
        nextThreshold = null;
      } else if (planCompletion.greaterThanOrEqualTo(95)) {
        currentPercent = new Decimal(4);
        currentThreshold = new Decimal(95);
        nextThreshold = new Decimal(120);
      } else if (planCompletion.greaterThanOrEqualTo(50)) {
        currentPercent = new Decimal(3);
        currentThreshold = new Decimal(50);
        nextThreshold = new Decimal(95);
      } else {
        currentPercent = new Decimal(3);
        currentThreshold = new Decimal(0);
        nextThreshold = new Decimal(50);
      }
    }

    // MOP income = base salary + literal sum of management payouts from deals + personal deals income + mortgage bonus
    const managementBonus = metricsResult.managementBonus;
    const personalDealsIncome = metricsResult.personalRevenue;
    const estimatedIncome = totalBaseSalaryForPeriod.plus(managementBonus).plus(personalDealsIncome).plus(mortgageBonus);

    // Get team size
    const teamSize = employee.team_id ? (await teamService.getTeamMembers(employee.team_id)).length : 0;

    // Convert to numbers for API
    return {
      type: this.getType(),
      displayName: this.getDisplayName(),
      metrics: {
        personalRevenue: Number(metricsResult.personalRevenue.toFixed(2)),
        teamRevenue: Number(metricsResult.teamRevenue.toFixed(2)),
        managementBonus: Number(metricsResult.managementBonus.toFixed(2)),
        totalRevenue: Number(metricsResult.totalIncome.toFixed(2)),
        planCompletion: Number(metricsResult.planCompletion.toFixed(2)),
        personalPlanCompletion: Number(metricsResult.personalPlanCompletion.toFixed(2)),
        teamPlanCompletion: Number(metricsResult.teamPlanCompletion.toFixed(2)),
        estimatedIncome: Number(estimatedIncome.toFixed(2)),
        mopRevenue: Number(mopRevenue.toFixed(2)),
        currentPercent: Number((currentPercent || new Decimal(0)).toFixed(2)), 
        currentThreshold: Number((currentThreshold || new Decimal(0)).toFixed(2)),
        nextThreshold: nextThreshold ? Number(nextThreshold.toFixed(2)) : null,
        teamSize,
        baseSalary: Number((displayBaseSalary || new Decimal(0)).toFixed(2)),
        mortgageBonus: Number((mortgageBonus || new Decimal(0)).toFixed(2)),
      },
      currentPercent: Number(currentPercent.toFixed(2)),
      planCompletion: Number(planCompletion.toFixed(2)),
      currentThreshold: Number(currentThreshold.toFixed(2)),
      nextThreshold: nextThreshold ? Number(nextThreshold.toFixed(2)) : null,
      estimatedIncome: Number(estimatedIncome.toFixed(2)),
      totalRevenue: Number(metricsResult.totalIncome.toFixed(2)),
      teamSize,
      baseSalary: Number(displayBaseSalary.toFixed(0)),
      mortgageBonus: Number(mortgageBonus.toFixed(0)),
    };
  }

  getType(): string {
    return 'team';
  }

  getDisplayName(): string {
    return 'KPI команды';
  }
}

export default MopKpiCalculator;
