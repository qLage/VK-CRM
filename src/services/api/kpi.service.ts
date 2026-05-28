/**
 * Unified KPI API Service
 * Plan 02-05: Frontend Integration and Number Formatting Consistency
 *
 * All numbers formatted consistently with formatters.ts
 * No client-side calculations - backend is source of truth
 */

import { localAPI } from '@/integrations/localAPI';

// TypeScript interfaces for KPI data structures

export interface KpiStats {
  // Personal KPI metrics
  revenue: number;
  deals: number;
  objects: number;
  deposits: number;
  tier: number;
  tierPercent: number;
  estimatedIncome: number;
  averageDealSize: number;
  tierProgress?: number;
  nextTierThreshold?: number;

  // Additional dashboard metrics
  totalPoints?: number;
  totalReports?: number;
  showings?: number;
  rating?: number;
  totalUsers?: number;
  attendanceDays?: number;
  attendancePercentage?: number;
}

export interface DualKpiStats {
  // Personal KPI
  personal: {
    revenue: number;
    deals: number;
    tier: number;
    tierPercent: number;
    estimatedIncome: number;
  };

  // Management KPI
  management: {
    teamRevenue: number;
    teamDeals: number;
    managementBonus: number;
    managementPercent: number;
    teamSize: number;
    topPerformer?: string;
  };

  // Combined totals
  totalIncome: number;
  totalRevenue: number;
  totalDeals: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  position: string;
  revenue: number;
  deals: number;
  tier: number;
  rank: number;
  branchId?: string;
  teamId?: string;
}

export interface LeaderboardFilters {
  period?: 'month' | 'quarter';
  branchId?: string;
  teamId?: string;
  startDate?: string;
  endDate?: string;
}

export interface DashboardStats {
  // Company-wide or branch-specific stats
  totalRevenue: number;
  totalDeals: number;
  activeAgents: number;
  averageDealSize: number;
  topPerformers: Array<{
    name: string;
    revenue: number;
  }>;

  // Period comparison
  previousPeriodRevenue?: number;
  growthRate?: number;

  // Additional metrics
  totalPoints?: number;
  totalReports?: number;
  showings?: number;
  rating?: number;
  totalUsers?: number;
  attendanceDays?: number;
  attendancePercentage?: number;
}

export interface DashboardFilters {
  period?: 'month' | 'quarter';
  branchId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * KPI API Service Class
 * Provides typed methods for all KPI-related API calls
 */
export class KpiApiService {
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  /**
   * Get personal KPI statistics for current user
   */
  async getMyStats(period: 'month' | 'quarter' = 'month'): Promise<KpiStats> {
    return this.withRetry(async () => {
      const { data, error } = await localAPI.getKPIStats(period);
      if (error) {
        throw new Error(error.message || 'Failed to fetch KPI stats');
      }
      return data as KpiStats;
    });
  }

  /**
   * Get dual KPI statistics (personal + management) for current user
   * For MOP, ROP, Director roles
   */
  async getMyDualStats(period: 'month' | 'quarter' = 'month'): Promise<DualKpiStats> {
    return this.withRetry(async () => {
      const { data, error } = await localAPI.getDualKPIStats(period);
      if (error) {
        throw new Error(error.message || 'Failed to fetch dual KPI stats');
      }
      return data as DualKpiStats;
    });
  }

  /**
   * Get leaderboard with optional filters
   */
  async getLeaderboard(filters: LeaderboardFilters = {}): Promise<LeaderboardEntry[]> {
    return this.withRetry(async () => {
      const { period = 'month', branchId } = filters;
      const { data, error } = await localAPI.getLeaderboard(period, branchId);
      if (error) {
        throw new Error(error.message || 'Failed to fetch leaderboard');
      }
      return (data || []) as LeaderboardEntry[];
    });
  }

  /**
   * Get dashboard statistics with optional filters
   * Returns company-wide or branch-specific stats
   */
  async getDashboardStats(filters: DashboardFilters = {}): Promise<DashboardStats> {
    return this.withRetry(async () => {
      const { period = 'month', branchId } = filters;
      const { data, error } = await localAPI.getDashboardStats(period, branchId);
      if (error) {
        throw new Error(error.message || 'Failed to fetch dashboard stats');
      }
      return data as DashboardStats;
    });
  }

  /**
   * Get dual KPI statistics for a specific user
   * For managers viewing team member stats
   */
  async getUserDualStats(userId: string, period: 'month' | 'quarter' = 'month'): Promise<DualKpiStats> {
    return this.withRetry(async () => {
      const { data, error } = await localAPI.request(`/kpi/user/${userId}/dual-stats?period=${period}`);
      if (error) {
        throw new Error(error.message || 'Failed to fetch user KPI stats');
      }
      return data as DualKpiStats;
    });
  }

  /**
   * Trigger management KPI recalculation
   * Only for admin/director roles
   */
  async refreshManagementKpi(): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await localAPI.request('/kpi/refresh-management-kpi', {
        method: 'POST',
      });
      if (error) {
        throw new Error(error.message || 'Failed to refresh management KPI');
      }
    });
  }

  /**
   * Refresh materialized views (Plan 02-03)
   * Only for admin/director roles
   */
  async refreshViews(): Promise<{ duration_ms: number; last_refresh: string }> {
    return this.withRetry(async () => {
      const { data, error } = await localAPI.request('/kpi/refresh-views', {
        method: 'POST',
      });
      if (error) {
        throw new Error(error.message || 'Failed to refresh materialized views');
      }
      return data as { duration_ms: number; last_refresh: string };
    });
  }

  /**
   * Retry wrapper for API calls
   * Retries on 5xx errors up to maxRetries times
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Only retry on 5xx errors
        const is5xxError = error.status >= 500 && error.status < 600;
        const shouldRetry = is5xxError && attempt < this.maxRetries;

        if (!shouldRetry) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        await this.sleep(this.retryDelay * attempt);
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const kpiApiService = new KpiApiService();
export default kpiApiService;
