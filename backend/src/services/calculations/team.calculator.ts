import Decimal from 'decimal.js';
import { sum } from '../../lib/formatting.utils';

/**
 * Team KPI Calculator - Pure calculation functions
 * Phase 02-02: Unified KPI Calculation Engine
 *
 * This module contains pure calculation logic for team/MOP KPIs.
 * No database access - only mathematical operations with Decimal precision.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface DealData {
  agent_income: Decimal;
  mop_revenue: Decimal;   // Fixed payout for MOP
  commission_total_fact: Decimal;
  commission_seller_fact: Decimal;
  commission_buyer_fact: Decimal;
  agent_name?: string | null;
  [key: string]: any;
}

export interface PlanData {
  personalRevenue: Decimal;
  teamRevenue: Decimal;
  totalIncome: Decimal;
  managementPercent: Decimal;
}

export interface TeamKpiData {
  personalDeals: DealData[];
  teamDeals: DealData[];
  plan: PlanData;
  managementPercent: Decimal;
}

export interface TeamKpiResult {
  personalRevenue: Decimal;
  teamRevenue: Decimal;
  managementBonus: Decimal;
  totalIncome: Decimal;
  planCompletion: Decimal;
  personalPlanCompletion: Decimal;
  teamPlanCompletion: Decimal;
  mortgageBonus: Decimal;
}

export interface TeamStats {
  dealCount: number;
  totalRevenue: Decimal;
  avgCheck: Decimal;
  topPerformer: string | null;
  topPerformerRevenue: Decimal;
}

// ============================================================================
// Main Calculation Functions
// ============================================================================

/**
 * Calculate team KPI metrics for MOP (Manager of Personal Sales).
 *
 * @param data - Input data containing personal deals, team deals, and plan
 * @returns Calculated KPI metrics with Decimal precision
 */
export function calculateTeamKPI(data: TeamKpiData): TeamKpiResult {
  const { personalDeals, teamDeals, plan, managementPercent } = data;

  // Calculate personal revenue (own deals)
  const personalRevenue = sum(personalDeals.map(deal => deal.agent_income));

  // Calculate team revenue (team members' deals) — gross revenue for plan
  const teamRevenue = sum(teamDeals.map(deal =>
    (deal.commission_seller_fact || new Decimal(0)).plus(deal.commission_buyer_fact || new Decimal(0))
  ));

  // Calculate management bonus (sum of MOP payouts from deals)
  const managementBonus = sum(teamDeals.map(deal => deal.mop_revenue || new Decimal(0)));

  // Total income for plan completion: personal + management bonus
  const totalIncome = personalRevenue.plus(managementBonus);

  // Calculate plan completion percentages
  const planCompletion = plan.totalIncome.isZero()
    ? new Decimal(0)
    : totalIncome.dividedBy(plan.totalIncome).times(100);

  const personalPlanCompletion = plan.personalRevenue.isZero()
    ? new Decimal(0)
    : personalRevenue.dividedBy(plan.personalRevenue).times(100);

  const teamPlanCompletion = plan.teamRevenue.isZero()
    ? new Decimal(0)
    : teamRevenue.dividedBy(plan.teamRevenue).times(100);

  return {
    personalRevenue,
    teamRevenue,
    managementBonus,
    totalIncome,
    planCompletion,
    personalPlanCompletion,
    teamPlanCompletion,
    mortgageBonus: new Decimal(0), // Will be populated by specific calculator if needed or from deals
  };
}

/**
 * Calculate total MOP revenue from deals.
 *
 * @param deals - Array of deal data
 * @returns Total MOP revenue
 */
export function calculateMopRevenue(deals: DealData[]): Decimal {
  return sum(deals.map(deal => deal.mop_revenue));
}

/**
 * Calculate team statistics from deals array.
 *
 * @param deals - Array of deal data
 * @returns Team statistics with Decimal financial fields
 */
export function calculateTeamStats(deals: DealData[]): TeamStats {
  const dealCount = deals.length;

  if (dealCount === 0) {
    return {
      dealCount: 0,
      totalRevenue: new Decimal(0),
      avgCheck: new Decimal(0),
      topPerformer: null,
      topPerformerRevenue: new Decimal(0),
    };
  }

  // Calculate total revenue
  const totalRevenue = sum(deals.map(deal => deal.agent_income));

  // Calculate average check
  const avgCheck = totalRevenue.dividedBy(dealCount).toDecimalPlaces(2);

  // Find top performer
  const performerMap = new Map<string, Decimal>();

  for (const deal of deals) {
    const agentName = deal.agent_name || 'Unknown';
    const currentRevenue = performerMap.get(agentName) || new Decimal(0);
    performerMap.set(agentName, currentRevenue.plus(deal.agent_income));
  }

  let topPerformer: string | null = null;
  let topPerformerRevenue = new Decimal(0);

  for (const [name, revenue] of performerMap.entries()) {
    if (revenue.greaterThan(topPerformerRevenue)) {
      topPerformer = name;
      topPerformerRevenue = revenue;
    }
  }

  return {
    dealCount,
    totalRevenue,
    avgCheck,
    topPerformer,
    topPerformerRevenue,
  };
}

/**
 * Calculate team member contribution percentages.
 *
 * @param deals - Array of deal data
 * @returns Map of agent names to their contribution percentage
 */
export function calculateTeamContributions(deals: DealData[]): Map<string, Decimal> {
  const totalRevenue = sum(deals.map(deal => deal.agent_income));

  if (totalRevenue.isZero()) {
    return new Map();
  }

  const performerMap = new Map<string, Decimal>();

  for (const deal of deals) {
    const agentName = deal.agent_name || 'Unknown';
    const currentRevenue = performerMap.get(agentName) || new Decimal(0);
    performerMap.set(agentName, currentRevenue.plus(deal.agent_income));
  }

  const contributionMap = new Map<string, Decimal>();

  for (const [name, revenue] of performerMap.entries()) {
    const percentage = revenue.dividedBy(totalRevenue).times(100).toDecimalPlaces(1);
    contributionMap.set(name, percentage);
  }

  return contributionMap;
}

/**
 * Calculate team growth rate compared to previous period.
 *
 * @param currentRevenue - Current period revenue
 * @param previousRevenue - Previous period revenue
 * @returns Growth rate as percentage
 */
export function calculateTeamGrowth(currentRevenue: Decimal, previousRevenue: Decimal): Decimal {
  if (previousRevenue.isZero()) {
    return currentRevenue.isZero() ? new Decimal(0) : new Decimal(100);
  }

  return currentRevenue
    .minus(previousRevenue)
    .dividedBy(previousRevenue)
    .times(100)
    .toDecimalPlaces(1);
}
