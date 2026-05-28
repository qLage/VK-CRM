import { query } from '../db';

/**
 * Settings Service - Analytics for Rating Benchmarks
 */
export const SettingsService = {
  /**
   * Calculate benchmarks based on top performers' real data from the last 6 months
   */
  async getRatingBenchmarks() {
    try {
      // Get data for the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const startDateStr = sixMonthsAgo.toISOString().split('T')[0];

      // SQL to get average monthly stats for each agent
      const statsSql = `
        WITH monthly_stats AS (
          SELECT
            agent_name,
            year,
            month,
            SUM(commission_total_fact) as revenue,
            COUNT(*) as deals,
            -- For objects and deposits, we might need a separate table if they aren't in deal_table_rows
            -- But usually they are tracked as activities. 
            -- For this calculation, let's assume we use deal-based metrics
            0 as objects, -- Placeholder if not in this table
            0 as deposits -- Placeholder if not in this table
          FROM deal_table_rows
          WHERE created_at >= $1 AND status IN ('approved', 'active')
          GROUP BY agent_name, year, month
        ),
        agent_averages AS (
          SELECT
            agent_name,
            AVG(revenue) as avg_revenue,
            AVG(deals) as avg_deals,
            COUNT(DISTINCT (year || '-' || month)) as months_active
          FROM monthly_stats
          GROUP BY agent_name
          HAVING COUNT(DISTINCT (year || '-' || month)) >= 2 -- At least 2 months of activity
        ),
        top_performers AS (
          SELECT * FROM agent_averages
          ORDER BY avg_revenue DESC
          LIMIT (SELECT GREATEST(1, CEIL(COUNT(*) * 0.2)) FROM agent_averages) -- Top 20%
        )
        SELECT
          AVG(avg_revenue) as benchmark_revenue,
          AVG(avg_deals) as benchmark_deals
        FROM top_performers
      `;

      const result = await query(statsSql, [startDateStr]);
      const benchmarks = result.rows[0];

      // Convert monthly averages to quarterly benchmarks
      // Ensure we don't return NaN by using Number.isFinite check or default constants
      const rawRevenue = parseFloat(benchmarks?.benchmark_revenue);
      const rawDeals = parseFloat(benchmarks?.benchmark_deals);

      return {
        revenue: Number.isFinite(rawRevenue) ? Math.round(rawRevenue * 3) : 1500000,
        deals: Number.isFinite(rawDeals) ? Math.round(rawDeals * 3) : 15,
        objects: 20, // Global standard
        deposits: 18, // Global standard
        lastAnalyzed: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error calculating benchmarks:', error);
      return {
        revenue: 1500000,
        deals: 5,
        objects: 20,
        deposits: 18,
        lastAnalyzed: new Date().toISOString(),
        error: 'Using fallback values due to calculation error'
      };
    }
  }
};
