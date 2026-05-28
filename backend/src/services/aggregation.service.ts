import Decimal from 'decimal.js';
import { db } from '../db/drizzle';
import { pool } from '../db/drizzle';
import { eq, and, sql } from 'drizzle-orm';
import { mvEmployeeMonthlyStats, mvTeamMonthlyStats, mvBranchMonthlyStats, mvCompanyMonthlyStats } from '../db/schema/views';
import { parseNumeric } from '../lib/formatting.utils';

/**
 * Aggregation Service
 * Phase 02-03: Queries materialized views for pre-aggregated statistics
 *
 * Provides fast access to KPI statistics by querying materialized views
 * instead of calculating on-the-fly. Falls back to live calculation if
 * views are not refreshed or data is missing.
 */

export interface EmployeeStats {
  employeeId: string;
  year: number;
  month: number;
  dealCount: number;
  totalCommission: Decimal;
  totalAgentIncome: Decimal;
  totalMopRevenue: Decimal;
  avgCheck: Decimal;
  lastUpdated: Date | null;
}

export interface TeamStats {
  teamId: string;
  year: number;
  month: number;
  dealCount: number;
  totalCommission: Decimal;
  totalTeamRevenue: Decimal;
  memberCount: number;
  avgCheck: Decimal;
  lastUpdated: Date | null;
}

export interface BranchStats {
  branchId: string;
  year: number;
  month: number;
  dealCount: number;
  totalCommission: Decimal;
  totalRopPayout: Decimal;
  totalCompanyRevenue: Decimal;
  teamCount: number;
  agentCount: number;
  avgCheck: Decimal;
  lastUpdated: Date | null;
}

export interface CompanyStats {
  year: number;
  month: number;
  totalDeals: number;
  totalCommission: Decimal;
  totalCompanyRevenue: Decimal;
  branchCount: number;
  agentCount: number;
  avgCheck: Decimal;
  lastUpdated: Date | null;
}

class AggregationService {
  /**
   * Get employee statistics from materialized view
   * Falls back to live calculation if view data not available
   */
  async getEmployeeStats(employeeId: string, year: number, month: number): Promise<EmployeeStats | null> {
    try {
      // Normalize employee ID (lowercase, trimmed)
      const normalizedId = employeeId.toLowerCase().trim();

      // Query materialized view
      const result = await db
        .select()
        .from(mvEmployeeMonthlyStats)
        .where(
          and(
            eq(mvEmployeeMonthlyStats.employeeId, normalizedId),
            eq(mvEmployeeMonthlyStats.year, year),
            eq(mvEmployeeMonthlyStats.month, month)
          )
        )
        .limit(1);

      if (result.length === 0) {
        console.warn('[Aggregation] Employee stats not found in view, using live calculation', {
          employeeId: normalizedId,
          year,
          month
        });
        return null;
      }

      const row = result[0];

      return {
        employeeId: row.employeeId,
        year: row.year,
        month: row.month,
        dealCount: row.dealCount,
        totalCommission: parseNumeric(row.totalCommission),
        totalAgentIncome: parseNumeric(row.totalAgentIncome),
        totalMopRevenue: parseNumeric(row.totalMopRevenue),
        avgCheck: parseNumeric(row.avgCheck),
        lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : null,
      };
    } catch (error) {
      console.error('[Aggregation] Error querying employee stats:', error);
      return null;
    }
  }

  /**
   * Get team statistics from materialized view
   * Falls back to live calculation if view data not available
   */
  async getTeamStats(teamId: string, year: number, month: number): Promise<TeamStats | null> {
    try {
      // Query materialized view
      const result = await db
        .select()
        .from(mvTeamMonthlyStats)
        .where(
          and(
            eq(mvTeamMonthlyStats.teamId, teamId),
            eq(mvTeamMonthlyStats.year, year),
            eq(mvTeamMonthlyStats.month, month)
          )
        )
        .limit(1);

      if (result.length === 0) {
        console.warn('[Aggregation] Team stats not found in view, using live calculation', {
          teamId,
          year,
          month
        });
        return null;
      }

      const row = result[0];

      return {
        teamId: row.teamId,
        year: row.year,
        month: row.month,
        dealCount: row.dealCount,
        totalCommission: parseNumeric(row.totalCommission),
        totalTeamRevenue: parseNumeric(row.totalTeamRevenue),
        memberCount: row.memberCount,
        avgCheck: parseNumeric(row.avgCheck),
        lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : null,
      };
    } catch (error) {
      console.error('[Aggregation] Error querying team stats:', error);
      return null;
    }
  }

  /**
   * Get branch statistics from materialized view
   * Falls back to live calculation if view data not available
   */
  async getBranchStats(branchId: string, year: number, month: number): Promise<BranchStats | null> {
    try {
      // Query materialized view
      const result = await db
        .select()
        .from(mvBranchMonthlyStats)
        .where(
          and(
            eq(mvBranchMonthlyStats.branchId, branchId),
            eq(mvBranchMonthlyStats.year, year),
            eq(mvBranchMonthlyStats.month, month)
          )
        )
        .limit(1);

      if (result.length === 0) {
        console.warn('[Aggregation] Branch stats not found in view, using live calculation', {
          branchId,
          year,
          month
        });
        return null;
      }

      const row = result[0];

      return {
        branchId: row.branchId,
        year: row.year,
        month: row.month,
        dealCount: row.dealCount,
        totalCommission: parseNumeric(row.totalCommission),
        totalRopPayout: parseNumeric(row.totalRopPayout),
        totalCompanyRevenue: parseNumeric(row.totalCompanyRevenue),
        teamCount: row.teamCount,
        agentCount: row.agentCount,
        avgCheck: parseNumeric(row.avgCheck),
        lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : null,
      };
    } catch (error) {
      console.error('[Aggregation] Error querying branch stats:', error);
      return null;
    }
  }

  /**
   * Get company-wide statistics from materialized view
   * Falls back to live calculation if view data not available
   */
  async getCompanyStats(year: number, month: number): Promise<CompanyStats | null> {
    try {
      // Query materialized view
      const result = await db
        .select()
        .from(mvCompanyMonthlyStats)
        .where(
          and(
            eq(mvCompanyMonthlyStats.year, year),
            eq(mvCompanyMonthlyStats.month, month)
          )
        )
        .limit(1);

      if (result.length === 0) {
        console.warn('[Aggregation] Company stats not found in view, using live calculation', {
          year,
          month
        });
        return null;
      }

      const row = result[0];

      return {
        year: row.year,
        month: row.month,
        totalDeals: row.totalDeals,
        totalCommission: parseNumeric(row.totalCommission),
        totalCompanyRevenue: parseNumeric(row.totalCompanyRevenue),
        branchCount: row.branchCount,
        agentCount: row.agentCount,
        avgCheck: parseNumeric(row.avgCheck),
        lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : null,
      };
    } catch (error) {
      console.error('[Aggregation] Error querying company stats:', error);
      return null;
    }
  }

  /**
   * Refresh all materialized views
   * Calls PostgreSQL function to refresh views concurrently
   */
  async refreshViews(): Promise<void> {
    const startTime = Date.now();
    console.log('[Aggregation] Starting materialized view refresh...');

    try {
      // Call PostgreSQL refresh function using raw SQL
      await db.execute(sql`SELECT refresh_all_materialized_views()`);

      const duration = Date.now() - startTime;
      console.log(`[Aggregation] Materialized views refreshed successfully in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Aggregation] Failed to refresh materialized views after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Get last refresh time for materialized views
   * Queries PostgreSQL system tables to find most recent refresh
   */
  async getLastRefreshTime(): Promise<Date | null> {
    try {
      // Query pg_stat_user_tables for last vacuum time (used as proxy for refresh time)
      const result = await pool.query(`
        SELECT MAX(last_vacuum) as last_refresh
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
          AND relname LIKE 'mv_%'
      `);

      if (result.rows && result.rows.length > 0 && result.rows[0].last_refresh) {
        return new Date(result.rows[0].last_refresh);
      }

      return null;
    } catch (error) {
      console.error('[Aggregation] Error getting last refresh time:', error);
      return null;
    }
  }
}

// Export singleton instance
const aggregationService = new AggregationService();
export default aggregationService;
