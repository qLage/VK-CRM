import { pgView } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Materialized Views for Pre-Aggregated Statistics
 * Phase 02-03: Performance optimization for dashboard queries
 *
 * These views store pre-calculated statistics to avoid expensive
 * aggregation queries on every page load. Refreshed hourly by background job.
 *
 * Note: The actual view definitions are in migrations/0003_materialized_views.sql
 * These schemas map to the existing database materialized views for type-safe queries.
 */

// Employee Monthly Statistics
export const mvEmployeeMonthlyStats = pgView('mv_employee_monthly_stats').as((qb) => {
  return qb.select({
    employeeId: sql<string>`employee_id`.as('employee_id'),
    year: sql<number>`year`.as('year'),
    month: sql<number>`month`.as('month'),
    dealCount: sql<number>`deal_count`.as('deal_count'),
    totalCommission: sql<string>`total_commission`.as('total_commission'),
    totalAgentIncome: sql<string>`total_agent_income`.as('total_agent_income'),
    totalMopRevenue: sql<string>`total_mop_revenue`.as('total_mop_revenue'),
    avgCheck: sql<string>`avg_check`.as('avg_check'),
    lastUpdated: sql<string | null>`last_updated`.as('last_updated'),
  }).from(sql`mv_employee_monthly_stats`);
});

// Team Monthly Statistics
export const mvTeamMonthlyStats = pgView('mv_team_monthly_stats').as((qb) => {
  return qb.select({
    teamId: sql<string>`team_id`.as('team_id'),
    year: sql<number>`year`.as('year'),
    month: sql<number>`month`.as('month'),
    dealCount: sql<number>`deal_count`.as('deal_count'),
    totalCommission: sql<string>`total_commission`.as('total_commission'),
    totalTeamRevenue: sql<string>`total_team_revenue`.as('total_team_revenue'),
    memberCount: sql<number>`member_count`.as('member_count'),
    avgCheck: sql<string>`avg_check`.as('avg_check'),
    lastUpdated: sql<string | null>`last_updated`.as('last_updated'),
  }).from(sql`mv_team_monthly_stats`);
});

// Branch Monthly Statistics
export const mvBranchMonthlyStats = pgView('mv_branch_monthly_stats').as((qb) => {
  return qb.select({
    branchId: sql<string>`branch_id`.as('branch_id'),
    year: sql<number>`year`.as('year'),
    month: sql<number>`month`.as('month'),
    dealCount: sql<number>`deal_count`.as('deal_count'),
    totalCommission: sql<string>`total_commission`.as('total_commission'),
    totalRopPayout: sql<string>`total_rop_payout`.as('total_rop_payout'),
    totalCompanyRevenue: sql<string>`total_company_revenue`.as('total_company_revenue'),
    teamCount: sql<number>`team_count`.as('team_count'),
    agentCount: sql<number>`agent_count`.as('agent_count'),
    avgCheck: sql<string>`avg_check`.as('avg_check'),
    lastUpdated: sql<string | null>`last_updated`.as('last_updated'),
  }).from(sql`mv_branch_monthly_stats`);
});

// Company Monthly Statistics
export const mvCompanyMonthlyStats = pgView('mv_company_monthly_stats').as((qb) => {
  return qb.select({
    year: sql<number>`year`.as('year'),
    month: sql<number>`month`.as('month'),
    totalDeals: sql<number>`total_deals`.as('total_deals'),
    totalCommission: sql<string>`total_commission`.as('total_commission'),
    totalCompanyRevenue: sql<string>`total_company_revenue`.as('total_company_revenue'),
    branchCount: sql<number>`branch_count`.as('branch_count'),
    agentCount: sql<number>`agent_count`.as('agent_count'),
    avgCheck: sql<string>`avg_check`.as('avg_check'),
    lastUpdated: sql<string | null>`last_updated`.as('last_updated'),
  }).from(sql`mv_company_monthly_stats`);
});
