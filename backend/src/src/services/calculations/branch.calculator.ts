import Decimal from 'decimal.js';
import { sum } from '../../lib/formatting.utils';

/**
 * Branch KPI Calculator - Pure calculation functions
 * Phase 02-02: Unified KPI Calculation Engine
 *
 * This module contains pure calculation logic for branch/ROP/Director KPIs.
 * No database access - only mathematical operations with Decimal precision.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface DealData {
  agent_income: Decimal;
  rop_payout: Decimal;
  company_revenue: Decimal;
  commission_total_fact: Decimal;
  commission_seller_fact: Decimal;
  commission_buyer_fact: Decimal;
  team_id?: string;
  branch_id?: string;
  agent_name?: string;
  [key: string]: any;
}

export interface BranchData {
  id: string;
  name: string;
  teamCount: number;
  agentCount: number;
}

export interface PlanData {
  revenue: Decimal;
  branchRevenue?: Decimal;
  companyRevenue?: Decimal;
  overridePercent?: Decimal;
}

export interface BranchKpiData {
  branchDeals: DealData[];
  plan: PlanData;
  role: string;
  overridePercent?: Decimal;
}

export interface BranchKpiResult {
  totalRevenue: Decimal;
  ropPayout: Decimal;
  companyRevenue: Decimal;
  overrideBonus: Decimal;
  planCompletion: Decimal;
  dealCount: number;
  avgDealSize: Decimal;
  mortgageBonus: Decimal;
}

export interface BranchStats {
  dealCount: number;
  teamCount: number;
  agentCount: number;
  totalRevenue: Decimal;
  avgCheck: Decimal;
  topTeam: string | null;
  topTeamRevenue: Decimal;
}

export interface DirectorKpiData {
  allDeals: DealData[];
  branches: BranchData[];
  plan: PlanData;
}

export interface DirectorKpiResult {
  companyRevenue: Decimal;
  totalDeals: number;
  branchCount: number;
  agentCount: number;
  avgDealSize: Decimal;
  planCompletion: Decimal;
  topBranch: string | null;
  topBranchRevenue: Decimal;
}

// ============================================================================
// Main Calculation Functions
// ============================================================================

/**
 * Calculate branch KPI metrics for ROP (Regional Operations).
 *
 * @param data - Input data containing branch deals, plan, and role
 * @returns Calculated KPI metrics with Decimal precision
 */
export function calculateBranchKPI(data: BranchKpiData): BranchKpiResult {
  const { branchDeals, plan, overridePercent } = data;

  // Gross revenue for plan: commission_seller_fact + commission_buyer_fact (no deductions)
  const totalRevenue = sum(branchDeals.map(deal =>
    (deal.commission_seller_fact || new Decimal(0)).plus(deal.commission_buyer_fact || new Decimal(0))
  ));

  // Calculate ROP payout (sum of all rop_payout fields)
  const ropPayout = calculateRopPayout(branchDeals);

  // Calculate company revenue (sum of all company_revenue fields)
  const companyRevenue = sum(branchDeals.map(deal => deal.company_revenue));

  // Calculate override bonus if applicable
  const effectiveOverridePercent = overridePercent || plan.overridePercent || new Decimal(0);
  const overrideBonus = totalRevenue
    .times(effectiveOverridePercent)
    .dividedBy(100)
    .toDecimalPlaces(2);

  // Calculate plan completion
  const targetRevenue = plan.branchRevenue || plan.revenue;
  const planCompletion = targetRevenue.isZero()
    ? new Decimal(0)
    : totalRevenue.dividedBy(targetRevenue).times(100);

  // Calculate average deal size
  const dealCount = branchDeals.length;
  const avgDealSize = dealCount === 0
    ? new Decimal(0)
    : totalRevenue.dividedBy(dealCount).toDecimalPlaces(2);

  return {
    totalRevenue,
    ropPayout,
    companyRevenue,
    overrideBonus,
    planCompletion,
    dealCount,
    avgDealSize,
    mortgageBonus: new Decimal(0), // Will be populated by specific calculator if needed or from deals
  };
}

/**
 * Calculate total ROP payout from deals.
 *
 * @param deals - Array of deal data
 * @returns Total ROP payout
 */
export function calculateRopPayout(deals: DealData[]): Decimal {
  return sum(deals.map(deal => deal.rop_payout));
}

/**
 * Calculate branch statistics from deals array.
 *
 * @param deals - Array of deal data
 * @returns Branch statistics with Decimal financial fields
 */
export function calculateBranchStats(deals: DealData[]): BranchStats {
  const dealCount = deals.length;

  if (dealCount === 0) {
    return {
      dealCount: 0,
      teamCount: 0,
      agentCount: 0,
      totalRevenue: new Decimal(0),
      avgCheck: new Decimal(0),
      topTeam: null,
      topTeamRevenue: new Decimal(0),
    };
  }

  // Calculate total revenue
  const totalRevenue = sum(deals.map(deal => deal.commission_total_fact));

  // Calculate average check
  const avgCheck = totalRevenue.dividedBy(dealCount).toDecimalPlaces(2);

  // Count unique teams and agents
  const uniqueTeams = new Set(deals.map(deal => deal.team_id).filter(Boolean));
  const uniqueAgents = new Set(deals.map(deal => deal.agent_name).filter(Boolean));

  // Find top performing team
  const teamMap = new Map<string, Decimal>();

  for (const deal of deals) {
    if (!deal.team_id) continue;
    const teamId = deal.team_id;
    const currentRevenue = teamMap.get(teamId) || new Decimal(0);
    teamMap.set(teamId, currentRevenue.plus(deal.commission_total_fact));
  }

  let topTeam: string | null = null;
  let topTeamRevenue = new Decimal(0);

  for (const [teamId, revenue] of teamMap.entries()) {
    if (revenue.greaterThan(topTeamRevenue)) {
      topTeam = teamId;
      topTeamRevenue = revenue;
    }
  }

  return {
    dealCount,
    teamCount: uniqueTeams.size,
    agentCount: uniqueAgents.size,
    totalRevenue,
    avgCheck,
    topTeam,
    topTeamRevenue,
  };
}

/**
 * Calculate director-level KPI metrics for company-wide view.
 *
 * @param data - Input data containing all deals, branches, and plan
 * @returns Calculated director KPI metrics with Decimal precision
 */
export function calculateDirectorKPI(data: DirectorKpiData): DirectorKpiResult {
  const { allDeals, branches, plan } = data;

  // Calculate company-wide revenue
  const companyRevenue = sum(allDeals.map(deal => deal.company_revenue));

  // Calculate total deals
  const totalDeals = allDeals.length;

  // Count branches and agents
  const branchCount = branches.length;
  const agentCount = new Set(allDeals.map(deal => deal.agent_name).filter(Boolean)).size;

  // Calculate average deal size
  const avgDealSize = totalDeals === 0
    ? new Decimal(0)
    : companyRevenue.dividedBy(totalDeals).toDecimalPlaces(2);

  // Calculate plan completion
  const targetRevenue = plan.companyRevenue || plan.revenue;
  const planCompletion = targetRevenue.isZero()
    ? new Decimal(0)
    : companyRevenue.dividedBy(targetRevenue).times(100);

  // Find top performing branch
  const branchMap = new Map<string, Decimal>();

  for (const deal of allDeals) {
    if (!deal.branch_id) continue;
    const branchId = deal.branch_id;
    const currentRevenue = branchMap.get(branchId) || new Decimal(0);
    branchMap.set(branchId, currentRevenue.plus(deal.company_revenue));
  }

  let topBranch: string | null = null;
  let topBranchRevenue = new Decimal(0);

  for (const [branchId, revenue] of branchMap.entries()) {
    if (revenue.greaterThan(topBranchRevenue)) {
      topBranch = branchId;
      topBranchRevenue = revenue;
    }
  }

  return {
    companyRevenue,
    totalDeals,
    branchCount,
    agentCount,
    avgDealSize,
    planCompletion,
    topBranch,
    topBranchRevenue,
  };
}

/**
 * Calculate branch performance ranking.
 *
 * @param deals - Array of deal data
 * @returns Array of branches sorted by revenue (descending)
 */
export function calculateBranchRanking(deals: DealData[]): Array<{ branchId: string; revenue: Decimal; dealCount: number }> {
  const branchMap = new Map<string, { revenue: Decimal; dealCount: number }>();

  for (const deal of deals) {
    if (!deal.branch_id) continue;
    const branchId = deal.branch_id;
    const current = branchMap.get(branchId) || { revenue: new Decimal(0), dealCount: 0 };
    branchMap.set(branchId, {
      revenue: current.revenue.plus(deal.company_revenue),
      dealCount: current.dealCount + 1,
    });
  }

  const ranking = Array.from(branchMap.entries()).map(([branchId, data]) => ({
    branchId,
    revenue: data.revenue,
    dealCount: data.dealCount,
  }));

  // Sort by revenue descending
  ranking.sort((a, b) => {
    if (a.revenue.greaterThan(b.revenue)) return -1;
    if (a.revenue.lessThan(b.revenue)) return 1;
    return 0;
  });

  return ranking;
}

/**
 * Calculate company growth rate compared to previous period.
 *
 * @param currentRevenue - Current period revenue
 * @param previousRevenue - Previous period revenue
 * @returns Growth rate as percentage
 */
export function calculateCompanyGrowth(currentRevenue: Decimal, previousRevenue: Decimal): Decimal {
  if (previousRevenue.isZero()) {
    return currentRevenue.isZero() ? new Decimal(0) : new Decimal(100);
  }

  return currentRevenue
    .minus(previousRevenue)
    .dividedBy(previousRevenue)
    .times(100)
    .toDecimalPlaces(1);
}

/**
 * Calculate market share by branch.
 *
 * @param deals - Array of deal data
 * @returns Map of branch IDs to their market share percentage
 */
export function calculateBranchMarketShare(deals: DealData[]): Map<string, Decimal> {
  const totalRevenue = sum(deals.map(deal => deal.company_revenue));

  if (totalRevenue.isZero()) {
    return new Map();
  }

  const branchMap = new Map<string, Decimal>();

  for (const deal of deals) {
    if (!deal.branch_id) continue;
    const branchId = deal.branch_id;
    const currentRevenue = branchMap.get(branchId) || new Decimal(0);
    branchMap.set(branchId, currentRevenue.plus(deal.company_revenue));
  }

  const marketShareMap = new Map<string, Decimal>();

  for (const [branchId, revenue] of branchMap.entries()) {
    const percentage = revenue.dividedBy(totalRevenue).times(100).toDecimalPlaces(1);
    marketShareMap.set(branchId, percentage);
  }

  return marketShareMap;
}
