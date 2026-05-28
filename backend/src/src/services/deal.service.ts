import Decimal from 'decimal.js';
import { db } from '../db/drizzle';
import { dealTableRows } from '../db/schema/deals';
import { eq, and, sql } from 'drizzle-orm';
import { parseNumeric, sum, average } from '../lib/formatting.utils';
import { profiles } from '../db/schema/auth';

/**
 * Filters for querying deals
 */
export interface DealFilters {
  userId?: string;
  teamId?: string;
  branchId?: string;
  startDate?: Date;
  endDate?: Date;
  year?: number;
  month?: number;
  status?: string | string[];
}

export const KPI_ACTIVE_STATUSES = ['approved', 'active', 'pending', 'new', 'finished', 'sale', 'deal'];

/**
 * Deal data with Decimal types for financial fields
 */
export interface DealData {
  id: string;
  month: number;
  year: number;
  propertyName: string;
  agentName: string | null;
  agentId: string | null;
  mopName: string | null;
  mopId: string | null;
  ropName: string | null;
  ropId: string | null;
  teamId: string | null;
  branchId: string | null;
  commissionSellerFact: Decimal;
  commissionBuyerFact: Decimal;
  commissionTotalFact: Decimal;
  agentIncome: Decimal;
  mopRevenue: Decimal;
  ropPayout: Decimal;
  companyRevenue: Decimal;
  dealAmount: Decimal;
  mortgageDeduction: Decimal;
  status: string | null;
}

/**
 * Aggregated deal totals with Decimal precision
 */
export interface DealTotals {
  totalCommission: Decimal;
  totalAgentIncome: Decimal;
  totalMopRevenue: Decimal;
  totalCompanyRevenue: Decimal;
  avgCheck: Decimal;
  dealCount: number;
}

/**
 * Service for deal data access with Decimal precision
 */
export class DealService {
  /**
   * Get deals for a specific period with filters
   */
  async getDealsForPeriod(filters: DealFilters): Promise<DealData[]> {
    const conditions = [];

    // Build WHERE conditions
    if (filters.year !== undefined) {
      conditions.push(eq(dealTableRows.year, filters.year));
    }
    if (filters.month !== undefined) {
      conditions.push(eq(dealTableRows.month, filters.month));
    }
    if (filters.userId) {
      // Get user's full name for fallback using typed select
      const userRows = await db
        .select({ fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.id, filters.userId));
      
      const fullName = userRows.length > 0 ? userRows[0].fullName : null;

      if (fullName) {
        // Fallback: match by ID OR (if ID is null) match by Name
        conditions.push(sql`(${dealTableRows.agentId} = ${filters.userId} OR (${dealTableRows.agentId} IS NULL AND LOWER(TRIM(${dealTableRows.agentName})) = LOWER(TRIM(${fullName}))))`);
      } else {
        // Strict match if user not found (shouldn't happen)
        conditions.push(eq(dealTableRows.agentId, filters.userId));
      }
    }
    if (filters.teamId) {
      conditions.push(eq(dealTableRows.teamId, filters.teamId));
    }
    if (filters.branchId) {
      conditions.push(eq(dealTableRows.branchId, filters.branchId));
    }
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(sql`${dealTableRows.status} IN (${filters.status.map(s => sql`${s}`).reduce((acc, curr) => sql`${acc}, ${curr}`)})`);
      } else {
        conditions.push(eq(dealTableRows.status, filters.status));
      }
    }

    // Execute query
    const rows = await db
      .select()
      .from(dealTableRows)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Convert NUMERIC strings to Decimal immediately
    return rows.map((row): DealData => ({
      id: row.id,
      month: row.month,
      year: row.year,
      propertyName: row.propertyName,
      agentName: row.agentName,
      agentId: row.agentId,
      mopName: row.mopName,
      mopId: row.mopId,
      ropName: row.ropName,
      ropId: row.ropId,
      teamId: row.teamId,
      branchId: row.branchId,
      commissionSellerFact: parseNumeric(row.commissionSellerFact),
      commissionBuyerFact: parseNumeric(row.commissionBuyerFact),
      commissionTotalFact: parseNumeric(row.commissionTotalFact),
      agentIncome: parseNumeric(row.agentIncome),
      mopRevenue: parseNumeric(row.mopRevenue),
      ropPayout: parseNumeric(row.ropPayout),
      companyRevenue: parseNumeric(row.companyRevenue),
      dealAmount: parseNumeric(row.dealAmount),
      mortgageDeduction: parseNumeric(row.mortgageDeduction),
      status: row.status,
    }));
  }

  /**
   * Calculate aggregated totals from deals array
   */
  async calculateDealTotals(deals: DealData[]): Promise<DealTotals> {
    if (deals.length === 0) {
      return {
        totalCommission: new Decimal(0),
        totalAgentIncome: new Decimal(0),
        totalMopRevenue: new Decimal(0),
        totalCompanyRevenue: new Decimal(0),
        avgCheck: new Decimal(0),
        dealCount: 0,
      };
    }

    const totalCommission = sum(deals.map(d => d.commissionTotalFact));
    const totalAgentIncome = sum(deals.map(d => d.agentIncome));
    const totalMopRevenue = sum(deals.map(d => d.mopRevenue));
    const totalCompanyRevenue = sum(deals.map(d => d.companyRevenue));
    const avgCheck = average(deals.map(d => d.dealAmount));

    return {
      totalCommission,
      totalAgentIncome,
      totalMopRevenue,
      totalCompanyRevenue,
      avgCheck,
      dealCount: deals.length,
    };
  }

  /**
   * Get deals for a specific employee by name
   */
  async getEmployeeDeals(
    employeeName: string,
    year: number,
    month: number
  ): Promise<DealData[]> {
    const rows = await db
      .select()
      .from(dealTableRows)
      .where(
        and(
          eq(dealTableRows.year, year),
          eq(dealTableRows.month, month),
          sql`(LOWER(TRIM(${dealTableRows.agentName})) = LOWER(TRIM(${employeeName})) 
              OR LOWER(TRIM(${dealTableRows.mopName})) = LOWER(TRIM(${employeeName})))`
        )
      );

    return rows.map((row): DealData => ({
      id: row.id,
      month: row.month,
      year: row.year,
      propertyName: row.propertyName,
      agentName: row.agentName,
      agentId: row.agentId,
      mopName: row.mopName,
      mopId: row.mopId,
      ropName: row.ropName,
      ropId: row.ropId,
      teamId: row.teamId,
      branchId: row.branchId,
      commissionSellerFact: parseNumeric(row.commissionSellerFact),
      commissionBuyerFact: parseNumeric(row.commissionBuyerFact),
      commissionTotalFact: parseNumeric(row.commissionTotalFact),
      agentIncome: parseNumeric(row.agentIncome),
      mopRevenue: parseNumeric(row.mopRevenue),
      ropPayout: parseNumeric(row.ropPayout),
      companyRevenue: parseNumeric(row.companyRevenue),
      dealAmount: parseNumeric(row.dealAmount),
      mortgageDeduction: parseNumeric(row.mortgageDeduction),
      status: row.status,
    }));
  }

  /**
   * Get all deals for a team
   */
  async getTeamDeals(
    teamId: string,
    year: number,
    month: number
  ): Promise<DealData[]> {
    const rows = await db
      .select()
      .from(dealTableRows)
      .where(
        and(
          eq(dealTableRows.teamId, teamId),
          eq(dealTableRows.year, year),
          eq(dealTableRows.month, month)
        )
      );

    return rows.map((row): DealData => ({
      id: row.id,
      month: row.month,
      year: row.year,
      propertyName: row.propertyName,
      agentName: row.agentName,
      agentId: row.agentId,
      mopName: row.mopName,
      mopId: row.mopId,
      ropName: row.ropName,
      ropId: row.ropId,
      teamId: row.teamId,
      branchId: row.branchId,
      commissionSellerFact: parseNumeric(row.commissionSellerFact),
      commissionBuyerFact: parseNumeric(row.commissionBuyerFact),
      commissionTotalFact: parseNumeric(row.commissionTotalFact),
      agentIncome: parseNumeric(row.agentIncome),
      mopRevenue: parseNumeric(row.mopRevenue),
      ropPayout: parseNumeric(row.ropPayout),
      companyRevenue: parseNumeric(row.companyRevenue),
      dealAmount: parseNumeric(row.dealAmount),
      mortgageDeduction: parseNumeric(row.mortgageDeduction),
      status: row.status,
    }));
  }

  /**
   * Get all deals for a branch
   */
  async getBranchDeals(
    branchId: string,
    year: number,
    month: number
  ): Promise<DealData[]> {
    const rows = await db
      .select()
      .from(dealTableRows)
      .where(
        and(
          eq(dealTableRows.branchId, branchId),
          eq(dealTableRows.year, year),
          eq(dealTableRows.month, month)
        )
      );

    return rows.map((row): DealData => ({
      id: row.id,
      month: row.month,
      year: row.year,
      propertyName: row.propertyName,
      agentName: row.agentName,
      agentId: row.agentId,
      mopName: row.mopName,
      mopId: row.mopId,
      ropName: row.ropName,
      ropId: row.ropId,
      teamId: row.teamId,
      branchId: row.branchId,
      commissionSellerFact: parseNumeric(row.commissionSellerFact),
      commissionBuyerFact: parseNumeric(row.commissionBuyerFact),
      commissionTotalFact: parseNumeric(row.commissionTotalFact),
      agentIncome: parseNumeric(row.agentIncome),
      mopRevenue: parseNumeric(row.mopRevenue),
      ropPayout: parseNumeric(row.ropPayout),
      companyRevenue: parseNumeric(row.companyRevenue),
      dealAmount: parseNumeric(row.dealAmount),
      mortgageDeduction: parseNumeric(row.mortgageDeduction),
      status: row.status,
    }));
  }

  /**
   * Get deals for a specific agent by ID (preferred) or Name within a date range
   */
  async getDealsByDateRange(
    agentIdentifier: string,
    startDate: Date,
    endDate: Date,
    isId: boolean = true,
    status?: string | string[]
  ): Promise<DealData[]> {
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;

    const startVal = startYear * 100 + startMonth;
    const endVal = endYear * 100 + endMonth;

    let nameFallback: string | null = null;
    if (isId) {
      const userRows = await db
        .select({ fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.id, agentIdentifier));
      
      if (userRows.length > 0) {
        nameFallback = userRows[0].fullName;
      }
    }

    const nameCondition = isId 
      ? nameFallback 
        ? sql`(${dealTableRows.agentId} = ${agentIdentifier} 
                OR ${dealTableRows.mopId} = ${agentIdentifier}
                OR (${dealTableRows.agentId} IS NULL AND LOWER(TRIM(${dealTableRows.agentName})) = LOWER(TRIM(${nameFallback})))
                OR (${dealTableRows.mopId} IS NULL AND LOWER(TRIM(${dealTableRows.mopName})) = LOWER(TRIM(${nameFallback})))
              )`
        : sql`(${dealTableRows.agentId} = ${agentIdentifier} OR ${dealTableRows.mopId} = ${agentIdentifier})`
      : sql`(LOWER(TRIM(${dealTableRows.agentName})) = LOWER(TRIM(${agentIdentifier})) 
            OR LOWER(TRIM(${dealTableRows.mopName})) = LOWER(TRIM(${agentIdentifier})))`;

    const conditions = [
      sql`(${dealTableRows.year} * 100 + ${dealTableRows.month}) BETWEEN ${startVal} AND ${endVal}`,
      nameCondition
    ];

    if (status) {
      if (Array.isArray(status)) {
        conditions.push(sql`${dealTableRows.status} IN (${status.map(s => sql`${s}`).reduce((acc, curr) => sql`${acc}, ${curr}`)})`);
      } else {
        conditions.push(eq(dealTableRows.status, status));
      }
    }

    const rows = await db
      .select()
      .from(dealTableRows)
      .where(and(...conditions));

    return rows.map((row): DealData => ({
      id: row.id,
      month: row.month,
      year: row.year,
      propertyName: row.propertyName,
      agentName: row.agentName,
      agentId: row.agentId,
      mopName: row.mopName,
      mopId: row.mopId,
      ropName: row.ropName,
      ropId: row.ropId,
      teamId: row.teamId,
      branchId: row.branchId,
      commissionSellerFact: parseNumeric(row.commissionSellerFact),
      commissionBuyerFact: parseNumeric(row.commissionBuyerFact),
      commissionTotalFact: parseNumeric(row.commissionTotalFact),
      agentIncome: parseNumeric(row.agentIncome),
      mopRevenue: parseNumeric(row.mopRevenue),
      ropPayout: parseNumeric(row.ropPayout),
      companyRevenue: parseNumeric(row.companyRevenue),
      dealAmount: parseNumeric(row.dealAmount),
      mortgageDeduction: parseNumeric(row.mortgageDeduction),
      status: row.status,
    }));
  }
}

// Export singleton instance
export default new DealService();
