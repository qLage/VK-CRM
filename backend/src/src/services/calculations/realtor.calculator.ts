import Decimal from 'decimal.js';
import { sum } from '../../lib/formatting.utils';

/**
 * Realtor KPI Calculator - Pure calculation functions
 * Phase 02-02: Unified KPI Calculation Engine
 *
 * This module contains pure calculation logic for realtor KPIs.
 * No database access - only mathematical operations with Decimal precision.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface DealData {
  agent_income: Decimal; // Actual payout to the agent
  payout: Decimal;       // Same as agent_income — realized income
  commission_total_fact: Decimal;
  commission_seller_fact: Decimal; // Gross revenue for tier calculation
  commission_buyer_fact: Decimal;  // Gross revenue for tier calculation
  [key: string]: any;
}

export interface ActionData {
  deposits: number;
  takes: number;
  objects: number;
  meetings: number;
  showings: number;
}

export interface PlanData {
  revenue: Decimal;
  deposits: number;
  objects: number;
}

export interface RealtorKpiData {
  deals: DealData[];
  actions: ActionData;
  plan: PlanData;
}

export interface RealtorKpiResult {
  totalRevenue: Decimal;
  totalDeposits: number;
  totalObjects: number;
  planCompletion: Decimal;
  depositsPercent: Decimal;
  objectsPercent: Decimal;
  estimatedIncome: Decimal;
  currentPercent: Decimal;
  mortgageBonus?: Decimal;
}

export interface TierResult {
  currentPercent: Decimal;
  currentThreshold: Decimal;
  nextThreshold: Decimal | null;
  nextPercent: Decimal | null;
}

// ============================================================================
// Tier Configuration
// ============================================================================

interface TierThreshold {
  threshold: Decimal;
  percent: Decimal;
}

const MONTHLY_TIERS: TierThreshold[] = [
  { threshold: new Decimal(0), percent: new Decimal(40) },
  { threshold: new Decimal(700000), percent: new Decimal(45) },
  { threshold: new Decimal(900000), percent: new Decimal(50) },
  { threshold: new Decimal(1200000), percent: new Decimal(55) },
  { threshold: new Decimal(1550000), percent: new Decimal(60) },
];

const QUARTERLY_TIERS: TierThreshold[] = [...MONTHLY_TIERS];

// ============================================================================
// Main Calculation Functions
// ============================================================================

/**
 * Calculate realtor KPI metrics from deal and action data.
 *
 * @param data - Input data containing deals, actions, and plan
 * @returns Calculated KPI metrics with Decimal precision
 */
export function calculateRealtorKPI(data: RealtorKpiData, period: 'month' | 'quarter' = 'month'): RealtorKpiResult {
  const { deals, actions, plan } = data;

  // Gross revenue for tier: commission_seller_fact + commission_buyer_fact (no deductions)
  const totalRevenue = sum(deals.map(deal =>
    (deal.commission_seller_fact || new Decimal(0)).plus(deal.commission_buyer_fact || new Decimal(0))
  ));

  // Actual payout from deals (the realized income)
  const totalPayout = sum(deals.map(deal => deal.payout || new Decimal(0)));

  // Calculate action metrics
  const totalDeposits = actions?.deposits || 0;
  const totalTakes = actions?.takes || 0;
  const totalObjects = actions?.objects || 0;
  const combinedObjects = totalTakes + totalObjects;

  // Calculate plan completion percentages
  const planRevenue = plan?.revenue || new Decimal(0);
  const planDeposits = plan?.deposits || 0;
  const planObjects = plan?.objects || 0;

  const planCompletion = planRevenue.isZero()
    ? new Decimal(0)
    : totalRevenue.dividedBy(planRevenue).times(100);

  const depositsPercent = planDeposits === 0
    ? new Decimal(0)
    : new Decimal(totalDeposits).dividedBy(planDeposits).times(100);

  const objectsPercent = planObjects === 0
    ? new Decimal(0)
    : new Decimal(combinedObjects).dividedBy(planObjects).times(100);

    // Determine current tier
    const tier = calculateRealtorTier(totalRevenue, period);
    // Income is now a literal sum of deal payouts, not calculated from percentage
    const estimatedIncome = totalPayout;

  return {
    totalRevenue,
    totalDeposits,
    totalObjects,
    planCompletion,
    depositsPercent,
    objectsPercent,
    estimatedIncome,
    currentPercent: tier.currentPercent,
  };
}

/**
 * Determine the current tier based on revenue and period.
 *
 * @param revenue - Total revenue as Decimal
 * @param period - 'month' or 'quarter'
 * @returns Tier information including current and next thresholds
 */
export function calculateRealtorTier(revenue: Decimal, period: 'month' | 'quarter'): TierResult {
  const tiers = period === 'month' ? MONTHLY_TIERS : QUARTERLY_TIERS;

  // Find the highest tier that the revenue has reached
  let currentTier = tiers[0];
  let nextTier: TierThreshold | null = null;

  for (let i = 0; i < tiers.length; i++) {
    if (revenue.greaterThanOrEqualTo(tiers[i].threshold)) {
      currentTier = tiers[i];
      nextTier = i < tiers.length - 1 ? tiers[i + 1] : null;
    } else {
      break;
    }
  }

  return {
    currentPercent: currentTier.percent,
    currentThreshold: currentTier.threshold,
    nextThreshold: nextTier?.threshold || null,
    nextPercent: nextTier?.percent || null,
  };
}

/**
 * Calculate estimated income based on revenue and percentage.
 *
 * @param revenue - Total revenue as Decimal
 * @param percent - Commission percentage as Decimal
 * @returns Estimated income rounded to 2 decimal places
 */
export function calculateEstimatedIncome(revenue: Decimal, percent: Decimal): Decimal {
  return revenue.times(percent).dividedBy(100).toDecimalPlaces(2);
}

/**
 * Calculate average deal size from deals array.
 *
 * @param deals - Array of deal data
 * @returns Average commission per deal
 */
export function calculateAverageDealSize(deals: DealData[]): Decimal {
  if (deals.length === 0) {
    return new Decimal(0);
  }

  const totalRevenue = sum(deals.map(deal => deal.agent_income));
  return totalRevenue.dividedBy(deals.length).toDecimalPlaces(2);
}

/**
 * Calculate progress to next tier.
 *
 * @param revenue - Current revenue
 * @param period - 'month' or 'quarter'
 * @returns Progress percentage to next tier (0-100)
 */
export function calculateTierProgress(revenue: Decimal, period: 'month' | 'quarter'): Decimal {
  const tier = calculateRealtorTier(revenue, period);

  if (!tier.nextThreshold) {
    // Already at max tier OR if we have 0 revenue but just couldn't find next tier
    return revenue.isZero() ? new Decimal(0) : new Decimal(100);
  }

  const rangeSize = tier.nextThreshold.minus(tier.currentThreshold);
  const progress = revenue.minus(tier.currentThreshold);

  if (rangeSize.isZero()) {
    return new Decimal(0);
  }

  return progress.dividedBy(rangeSize).times(100).toDecimalPlaces(1);
}
