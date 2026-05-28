import { query } from './index';

async function applyStatusFix() {
    console.log('--- APPLYING DEAL STATUS AND VIEW FIX ---');

    try {
        // 1. Change default status for new deals
        console.log('Step 1: Changing default status to "pending"...');
        await query(`ALTER TABLE deal_table_rows ALTER COLUMN status SET DEFAULT 'pending'`);

        // 2. Update existing 'active' deals that might be pending? 
        // No, let's keep 'active' as a valid "approved" status for now to avoid breaking history.

        // 3. Re-create Materialized Views with the new filter (approved OR active)
        console.log('Step 2: Re-creating Materialized Views...');
        
        // Drop existing views (must be in correct order if there are dependencies, but here they are independent)
        const views = [
            'mv_employee_monthly_stats',
            'mv_team_monthly_stats',
            'mv_branch_monthly_stats',
            'mv_company_monthly_stats'
        ];

        for (const view of views) {
            await query(`DROP MATERIALIZED VIEW IF EXISTS ${view} CASCADE`);
        }

        // Re-create views
        // Employee
        await query(`
            CREATE MATERIALIZED VIEW mv_employee_monthly_stats AS
            SELECT
                LOWER(TRIM(d.agent_name)) AS employee_id,
                d.year,
                d.month,
                COUNT(d.id) AS deal_count,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.agent_income), 0)::NUMERIC(12,2) AS total_agent_income,
                COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_mop_revenue,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            WHERE d.status IN ('approved', 'active')
                AND d.agent_name IS NOT NULL
                AND d.agent_name != ''
            GROUP BY LOWER(TRIM(d.agent_name)), d.year, d.month
        `);

        // Team
        await query(`
            CREATE MATERIALIZED VIEW mv_team_monthly_stats AS
            SELECT
                d.team_id,
                d.year,
                d.month,
                COUNT(d.id) AS deal_count,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.mop_revenue), 0)::NUMERIC(12,2) AS total_team_revenue,
                COUNT(DISTINCT LOWER(TRIM(d.agent_name))) AS member_count,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            WHERE d.status IN ('approved', 'active')
                AND d.team_id IS NOT NULL
            GROUP BY d.team_id, d.year, d.month
        `);

        // Branch
        await query(`
            CREATE MATERIALIZED VIEW mv_branch_monthly_stats AS
            SELECT
                d.branch_id,
                d.year,
                d.month,
                COUNT(d.id) AS deal_count,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.rop_payout), 0)::NUMERIC(12,2) AS total_rop_payout,
                COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
                COUNT(DISTINCT d.team_id) AS team_count,
                COUNT(DISTINCT LOWER(TRIM(d.agent_name))) AS agent_count,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            WHERE d.status IN ('approved', 'active')
                AND d.branch_id IS NOT NULL
            GROUP BY d.branch_id, d.year, d.month
        `);

        // Company
        await query(`
            CREATE MATERIALIZED VIEW mv_company_monthly_stats AS
            SELECT
                d.year,
                d.month,
                COUNT(d.id) AS total_deals,
                COALESCE(SUM(d.commission_total_fact), 0)::NUMERIC(12,2) AS total_commission,
                COALESCE(SUM(d.company_revenue), 0)::NUMERIC(12,2) AS total_company_revenue,
                COUNT(DISTINCT d.branch_id) AS branch_count,
                COUNT(DISTINCT LOWER(TRIM(d.agent_name))) AS agent_count,
                COALESCE(AVG(d.commission_total_fact), 0)::NUMERIC(12,2) AS avg_check,
                MAX(d.updated_at) AS last_updated
            FROM deal_table_rows d
            WHERE d.status IN ('approved', 'active')
            GROUP BY d.year, d.month
        `);

        // 4. Re-create indexes for views
        console.log('Step 3: Creating indexes for views...');
        await query(`CREATE UNIQUE INDEX idx_mv_employee_monthly_stats_unique ON mv_employee_monthly_stats(employee_id, year, month)`);
        await query(`CREATE UNIQUE INDEX idx_mv_team_monthly_stats_unique ON mv_team_monthly_stats(team_id, year, month)`);
        await query(`CREATE UNIQUE INDEX idx_mv_branch_monthly_stats_unique ON mv_branch_monthly_stats(branch_id, year, month)`);
        await query(`CREATE UNIQUE INDEX idx_mv_company_monthly_stats_unique ON mv_company_monthly_stats(year, month)`);

        console.log('✅ Status fix and Materialized Views update completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to apply status fix:', error.message);
        process.exit(1);
    }
}

applyStatusFix();
