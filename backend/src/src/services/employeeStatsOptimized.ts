import { query } from '../db';

interface EmployeeFilters {
  year?: number;
  month?: number;
  startDate?: Date;
  endDate?: Date;
  team_id?: string;
  branch_id?: string;
  is_active?: number;
}

interface EmployeeStats {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string;
  team_id: string;
  branch_id: string;
  position_id: string;
  personal_kpi_current: number;
  management_kpi_current: number;
  position_name: string;
  team_name: string;
  branch_name: string;
  deal_count: number;
  total_revenue: number;
  total_agent_income: number;
  total_mop_revenue: number;
  total_rop_payout: number;
  total_mortgage_deduction: number;
  total_other_expenses: number;
  total_company_revenue: number;
  avg_deal_size: number;
}

interface SingleEmployeeStats {
  id: string;
  full_name: string;
  custom_total_deals: number;
  custom_total_objects: number;
  custom_total_revenue: number;
  current_deal_count: number;
  current_revenue: number;
  current_agent_income: number;
  current_mop_revenue: number;
  current_rop_payout: number;
  current_mortgage_deduction: number;
  current_other_expenses: number;
}

interface ActivityFeedItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: Date;
  metadata: {
    commission: number;
    agent_income: number;
    comment: string | null;
  };
}

interface MonthlyTrend {
  year: number;
  month: number;
  deal_count: number;
  revenue: number;
  agent_income: number;
  avg_deal_size: number;
  cumulative_revenue: number;
}

/**
 * Get employee stats with deal aggregations
 * Optimized to avoid N+1 queries
 */
async function getEmployeeStatsOptimized(filters: EmployeeFilters = {}): Promise<EmployeeStats[]> {
  const { year, month, startDate, endDate, team_id, branch_id, is_active = 1 } = filters;

  let whereConditions = ['p.is_active = $1'];
  let params: any[] = [is_active];
  let paramIndex = 2;

  if (team_id) {
    whereConditions.push(`p.team_id = $${paramIndex++}`);
    params.push(team_id);
  }

  if (branch_id) {
    whereConditions.push(`p.branch_id = $${paramIndex++}`);
    params.push(branch_id);
  }

  // Add year/month or date range filters for deal aggregations
  let dealFilters = '';
  if (startDate && endDate) {
    const startPeriod = (startDate.getUTCFullYear() * 100) + (startDate.getUTCMonth() + 1);
    const endPeriod = (endDate.getUTCFullYear() * 100) + (endDate.getUTCMonth() + 1);
    dealFilters += ` AND (d.year * 100 + d.month) BETWEEN $${paramIndex++} AND $${paramIndex++}`;
    params.push(startPeriod, endPeriod);
  } else {
    if (year) {
      dealFilters += ` AND d.year = $${paramIndex++}`;
      params.push(year);
    }
    if (month) {
      dealFilters += ` AND d.month = $${paramIndex++}`;
      params.push(month);
    }
  }

  const sql = `
    SELECT
      p.id,
      p.full_name,
      p.email,
      p.phone,
      p.avatar_url,
      p.team_id,
      p.branch_id,
      p.position_id,
      p.personal_kpi_current,
      p.management_kpi_current,
      pos.name as position_name,
      t.name as team_name,
      b.name as branch_name,
      -- Deal aggregations
      COUNT(d.id) as deal_count,
      COALESCE(SUM(d.commission_total_fact), 0) as total_revenue,
      COALESCE(SUM(d.agent_income), 0) as total_agent_income,
      COALESCE(SUM(d.mop_revenue), 0) as total_mop_revenue,
      COALESCE(SUM(d.rop_payout), 0) as total_rop_payout,
      COALESCE(SUM(d.mortgage_deduction), 0) as total_mortgage_deduction,
      COALESCE(SUM(d.other_expenses), 0) as total_other_expenses,
      COALESCE(SUM(d.company_revenue), 0) as total_company_revenue,
      COALESCE(AVG(d.commission_total_fact), 0) as avg_deal_size
    FROM profiles p
    LEFT JOIN positions pos ON p.position_id = pos.id
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN branches b ON p.branch_id = b.id
    LEFT JOIN deal_table_rows d
      ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
      ${dealFilters}
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY
      p.id, p.full_name, p.email, p.phone, p.avatar_url,
      p.team_id, p.branch_id, p.position_id,
      p.personal_kpi_current, p.management_kpi_current,
      pos.name, t.name, b.name
    ORDER BY total_revenue DESC
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get single employee stats
 * Optimized version of the /:id/stats endpoint
 */
async function getSingleEmployeeStats(employeeId: string, year: number, month: number): Promise<SingleEmployeeStats | undefined> {
  const sql = `
    SELECT
      p.id,
      p.full_name,
      p.custom_total_deals,
      p.custom_total_objects,
      p.custom_total_revenue,
      -- Current period stats
      COUNT(d.id) as current_deal_count,
      COALESCE(SUM(d.commission_total_fact), 0) as current_revenue,
      COALESCE(SUM(d.agent_income), 0) as current_agent_income,
      COALESCE(SUM(d.mop_revenue), 0) as current_mop_revenue,
      COALESCE(SUM(d.rop_payout), 0) as current_rop_payout,
      COALESCE(SUM(d.mortgage_deduction), 0) as current_mortgage_deduction,
      COALESCE(SUM(d.other_expenses), 0) as current_other_expenses
    FROM profiles p
    LEFT JOIN deal_table_rows d
      ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
      AND d.year = $2
      AND d.month = $3
    WHERE p.id = $1
    GROUP BY
      p.id, p.full_name, p.custom_total_deals,
      p.custom_total_objects, p.custom_total_revenue
  `;

  const result = await query(sql, [employeeId, year, month]);
  return result.rows[0];
}

/**
 * Get employee stats for a specific period (range of months)
 * Supports cross-year periods (e.g., Q4 2025 - Q1 2026)
 */
async function getEmployeeStatsForPeriod(
  employeeId: string, 
  startYear: number, 
  startMonth: number, 
  endYear: number, 
  endMonth: number
): Promise<SingleEmployeeStats | undefined> {
  const startPeriod = startYear * 100 + startMonth;
  const endPeriod = endYear * 100 + endMonth;

  const sql = `
    SELECT
      p.id,
      p.full_name,
      p.custom_total_deals,
      p.custom_total_objects,
      p.custom_total_revenue,
      -- Period stats
      COUNT(d.id) as current_deal_count,
      COALESCE(SUM(d.commission_total_fact), 0) as current_revenue,
      COALESCE(SUM(d.agent_income), 0) as current_agent_income,
      COALESCE(SUM(d.mop_revenue), 0) as current_mop_revenue,
      COALESCE(SUM(d.rop_payout), 0) as current_rop_payout,
      COALESCE(SUM(d.mortgage_deduction), 0) as current_mortgage_deduction,
      COALESCE(SUM(d.other_expenses), 0) as current_other_expenses
    FROM profiles p
    LEFT JOIN deal_table_rows d
      ON LOWER(TRIM(d.agent_name)) = LOWER(TRIM(p.full_name))
      AND (d.year * 100 + d.month) BETWEEN $2 AND $3
    WHERE p.id = $1
    GROUP BY
      p.id, p.full_name, p.custom_total_deals,
      p.custom_total_objects, p.custom_total_revenue
  `;

  const result = await query(sql, [employeeId, startPeriod, endPeriod]);
  return result.rows[0];
}

/**
 * Get employee activity feed
 * Optimized with proper indexing and limit
 */
async function getEmployeeActivityFeed(employeeId: string, limit: number = 15): Promise<ActivityFeedItem[]> {
  // First get the employee's full name
  const profileResult = await query(
    'SELECT full_name FROM profiles WHERE id = $1',
    [employeeId]
  );

  if (!profileResult.rows.length) {
    return [];
  }

  const agentName = profileResult.rows[0].full_name;

  // Use indexed query with proper ordering
  const sql = `
    SELECT
      id,
      property_name,
      document_type,
      commission_total_fact,
      agent_income,
      mop_revenue,
      year,
      month,
      created_at,
      comment
    FROM deal_table_rows
    WHERE LOWER(TRIM(agent_name)) = LOWER(TRIM($1))
    ORDER BY created_at DESC, year DESC, month DESC
    LIMIT $2
  `;

  const result = await query(sql, [agentName, limit]);

  // Transform to activity format
  return result.rows.map(row => ({
    id: row.id,
    type: 'deal',
    title: row.property_name || 'Сделка',
    description: `${row.document_type} - ${row.year}/${row.month}`,
    timestamp: row.created_at,
    metadata: {
      commission: parseFloat(row.commission_total_fact || 0),
      agent_income: parseFloat(row.agent_income || 0),
      comment: row.comment
    }
  }));
}

/**
 * Get monthly trends for employee
 * Optimized with single query using window functions
 */
async function getEmployeeMonthlyTrends(employeeId: string, monthsBack: number = 12): Promise<MonthlyTrend[]> {
  // Get employee name
  const profileResult = await query(
    'SELECT full_name FROM profiles WHERE id = $1',
    [employeeId]
  );

  if (!profileResult.rows.length) {
    return [];
  }

  const agentName = profileResult.rows[0].full_name;

  // Generate month series and aggregate in single query
  const sql = `
    WITH month_series AS (
      SELECT
        EXTRACT(YEAR FROM date_month)::INTEGER as year,
        EXTRACT(MONTH FROM date_month)::INTEGER as month
      FROM generate_series(
        DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${monthsBack} months'),
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) as date_month
    )
    SELECT
      ms.year,
      ms.month,
      COALESCE(COUNT(d.id), 0) as deal_count,
      COALESCE(SUM(d.commission_total_fact), 0) as revenue,
      COALESCE(SUM(d.agent_income), 0) as agent_income,
      COALESCE(AVG(d.commission_total_fact), 0) as avg_deal_size,
      -- Running totals
      SUM(COALESCE(SUM(d.commission_total_fact), 0)) OVER (
        ORDER BY ms.year, ms.month
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) as cumulative_revenue
    FROM month_series ms
    LEFT JOIN deal_table_rows d
      ON d.year = ms.year
      AND d.month = ms.month
      AND LOWER(TRIM(d.agent_name)) = LOWER(TRIM($1))
    GROUP BY ms.year, ms.month
    ORDER BY ms.year, ms.month
  `;

  const result = await query(sql, [agentName]);
  return result.rows;
}

export {
  getEmployeeStatsOptimized,
  getSingleEmployeeStats,
  getEmployeeStatsForPeriod,
  getEmployeeActivityFeed,
  getEmployeeMonthlyTrends
};
