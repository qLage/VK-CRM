import KpiService from '../kpi.service';

export interface KpiMetrics {
  totalDeposits?: number;
  totalObjects?: number;
  totalRevenue?: number;
  mopRevenue?: number;
  ropPayout?: number;
  mortgageDeduction?: number;
  otherExpenses?: number;
  planDeposits?: number;
  planObjects?: number;
  planRevenue?: number;
  planCompletion?: number;
  depositsPercent?: number;
  objectsPercent?: number;
  revenuePercent?: number;
  rating?: number;
  meetings?: number;
  showings?: number;
  dealsCount?: number;
  currentPercent?: number;
  estimatedIncome?: number;
  teamSize?: number;
  [key: string]: any;
}

export interface KpiResult {
  type: string;
  displayName: string;
  role?: string;
  metrics: KpiMetrics;
  currentPercent?: number;
  planCompletion?: number;
  estimatedIncome?: number;
  totalRevenue?: number;
  currentThreshold?: number;
  nextThreshold?: number | null;
  teamSize?: number;
  monthly?: any[];
  [key: string]: any;
}

/**
 * Base KPI Calculator
 * Defines interface for all KPI calculation strategies
 */
abstract class BaseKpiCalculator {
  protected kpiService: typeof KpiService;

  constructor(kpiService: typeof KpiService) {
    this.kpiService = kpiService;
  }

  /**
   * Calculate KPI metrics for a user
   * @param userId - User ID
   * @param startDate - ISO date string
   * @param endDate - ISO date string
   * @param period - 'month' or 'quarter'
   * @param branchId - Optional branch ID
   * @returns KPI metrics
   */
  abstract calculate(
    userId: string,
    startDate: string,
    endDate: string,
    period?: string,
    branchId?: string | null
  ): Promise<KpiResult>;

  /**
   * Get KPI type identifier
   * @returns KPI type (e.g., 'personal', 'team', 'agency')
   */
  abstract getType(): string;

  /**
   * Get display name for this KPI type
   * @returns Display name
   */
  abstract getDisplayName(): string;
}

export default BaseKpiCalculator;
