import { query, transaction } from '../db';
import { v4 as uuidv4 } from 'uuid';
import cacheService from '../lib/cache.service';

interface DealRow {
  id: string;
  agent_name?: string;
  agent_id?: string;
  rop_name?: string;
  rop_id?: string;
  mop_name?: string;
  mop_id?: string;
  property_name?: string;
  commission_total_fact?: number;
  agent_income?: number;
  rop_payout?: number;
  agent_percent?: number;
  rop_percent?: number;
  service?: string;
  year: number;
  month: number;
  status?: string;
  mortgage?: number;
  company_id?: string;
  deposit_date?: string;
}

interface Transaction {
  id: string;
  type: string;
  created?: boolean;
  updated?: boolean;
}

interface IntegrationResult {
  transactions: Transaction[];
  agentId: string | null;
  ropId: string | null;
}

/**
 * Service for integrating deal_table_rows with finances, payouts, and KPI
 */
class DealFinanceIntegration {
  /**
   * Find employee ID by full name
   */
  static async findEmployeeByName(fullName: string | null | undefined): Promise<string | null> {
    if (!fullName || fullName.trim() === '') return null;

    const result = await query(`
      SELECT u.id, p.full_name
      FROM auth_users u
      LEFT JOIN profiles p ON u.id = p.id
      WHERE TRIM(p.full_name) = $1
      LIMIT 1
    `, [fullName.trim()]);

    return result.rows[0]?.id || null;
  }

  /**
   * Create financial transactions when deal is created/updated
   */
  static async syncDealToFinances(dealRow: DealRow): Promise<IntegrationResult> {
    const agentId = dealRow.agent_id || await this.findEmployeeByName(dealRow.agent_name);
    const ropId = dealRow.rop_id || await this.findEmployeeByName(dealRow.rop_name);
    const mopId = dealRow.mop_id || (dealRow.mop_name ? await this.findEmployeeByName(dealRow.mop_name) : null);

    // Sync back to deal_table_rows table to ensure finances/salaries see these IDs and mortgage flag
    const isMortgage = typeof dealRow.mortgage === 'number' ? dealRow.mortgage : ((dealRow.service && dealRow.service.toLowerCase().includes('ипотек')) ? 1 : 0);
    
    await query(`
      UPDATE deal_table_rows 
      SET agent_id = $1,
          rop_id = $2,
          mop_id = $3,
          mortgage = $4,
          updated_at = $5
      WHERE id = $6
    `, [agentId, ropId, mopId, isMortgage, new Date().toISOString(), dealRow.id]);

    const transactions: Transaction[] = [];

    // Create / update income transaction for commission received (idempotent by deal_id)
    if (parseFloat(String(dealRow.commission_total_fact || 0)) > 0) {
      const now = new Date().toISOString();
      const amount = parseFloat(String(dealRow.commission_total_fact));
      const service = (dealRow.service || '').toLowerCase();
      const accountType = (service.includes('ипотека') || service.includes('новостро')) ? 'account' : 'cash';

      // If transaction already exists for this deal, update it instead of inserting a duplicate
      const existingTx = await query(
        `SELECT id FROM transactions WHERE deal_id = $1 AND type = 'income' AND category = 'deal_commission' LIMIT 1`,
        [dealRow.id]
      );

      if (existingTx.rows.length > 0) {
        const existingId = existingTx.rows[0].id;
        await query(
          `UPDATE transactions
           SET amount = $1,
               description = $2,
               agent_commission_percent = $3,
               rop_commission_percent = $4,
               account_type = $5,
               updated_at = $6
           WHERE id = $7`,
          [
            amount,
            `Комиссия по сделке: ${dealRow.property_name}`,
            parseFloat(String(dealRow.agent_percent || 0)),
            parseFloat(String(dealRow.rop_percent || 0)),
            accountType,
            now,
            existingId
          ]
        );

        transactions.push({ id: existingId, type: 'income', updated: true });
      } else {
        const incomeId = uuidv4();
        const companyId = dealRow.company_id || '00000000-0000-0000-0000-000000000001';
        await query(`
          INSERT INTO transactions (
            id, type, category, amount, description,
            agent_commission_percent, rop_commission_percent,
            deal_id, account_type, company_id,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          incomeId,
          'income',
          'deal_commission',
          amount,
          `Комиссия по сделке: ${dealRow.property_name}`,
          parseFloat(String(dealRow.agent_percent || 0)),
          parseFloat(String(dealRow.rop_percent || 0)),
          dealRow.id,
          accountType,
          companyId,
          now,
          now
        ]);

        transactions.push({ id: incomeId, type: 'income', created: true });
      }
    }

    // Create payout records for agent
    if (agentId && parseFloat(String(dealRow.agent_income || 0)) > 0) {
      await this.createOrUpdatePayout(
        dealRow.id,
        agentId,
        'agent_commission',
        parseFloat(String(dealRow.agent_income))
      );
    }

    // Create payout records for ROP
    if (ropId && parseFloat(String(dealRow.rop_payout || 0)) > 0) {
      await this.createOrUpdatePayout(
        dealRow.id,
        ropId,
        'rop_commission',
        parseFloat(String(dealRow.rop_payout))
      );
    }

    return { transactions, agentId, ropId };
  }

  /**
   * Create or update payout record
   */
  static async createOrUpdatePayout(dealRowId: string, employeeId: string, payoutType: string, amount: number): Promise<void> {
    try {
      const existing = await query(`
        SELECT id FROM deal_payouts
        WHERE deal_id = $1 AND employee_id = $2 AND payout_type = $3
      `, [dealRowId, employeeId, payoutType]);

      if (existing.rows.length > 0) {
        await query(`
          UPDATE deal_payouts
          SET amount_calculated = $1, updated_at = $2
          WHERE id = $3
        `, [amount, new Date().toISOString(), existing.rows[0].id]);
      } else {
        await query(`
          INSERT INTO deal_payouts (
            id, deal_id, employee_id, payout_type,
            amount_calculated, amount_paid, status,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          uuidv4(), dealRowId, employeeId, payoutType,
          amount, 0, 'pending',
          new Date().toISOString(), new Date().toISOString()
        ]);
      }
    } catch (error: any) {
      // 42P01 — table doesn't exist (legacy DB without deal_payouts). Don't fail the whole flow.
      if (error?.code === '42P01') return;
      throw error;
    }
  }

  /**
   * Update employee KPI based on deal performance
   */
  static async updateEmployeeKPI(employeeId: string, dealRow: DealRow): Promise<void> {
    if (!employeeId) return;

    const year = dealRow.year;
    const month = dealRow.month;

    // Get employee's total revenue for the period using IDs
    const revenueResult = await query(`
      SELECT
        SUM(CASE WHEN agent_id = $1 THEN agent_income ELSE 0 END) +
        SUM(CASE WHEN rop_id = $1 THEN rop_payout ELSE 0 END) as total_income,
        SUM(CASE WHEN agent_id = $1 OR rop_id = $1 THEN commission_total_fact ELSE 0 END) as total_commission
      FROM deal_table_rows
      WHERE year = $2 AND month = $3 AND status IN ('approved', 'active')
    `, [employeeId, year, month]);

    if (!revenueResult.rows[0]) {
      console.warn(`No revenue data found for employee ${employeeId} in ${year}-${month}`);
      return;
    }
    const { total_income, total_commission } = revenueResult.rows[0];

    // Update or create KPI record
    await query(`
      INSERT INTO analytics_kpis (
        id, user_id, period_month, period_year,
        total_revenue, personal_income,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, period_month, period_year)
      DO UPDATE SET
        total_revenue = $5,
        personal_income = $6,
        updated_at = $8
    `, [
      uuidv4(),
      employeeId,
      month,
      year,
      parseFloat(String(total_commission || 0)),
      parseFloat(String(total_income || 0)),
      new Date().toISOString(),
      new Date().toISOString()
    ]);
  }

  /**
   * Update plan completion for employee
   */
  static async updatePlanCompletion(employeeId: string, year: number, month: number): Promise<void> {
    // Раньше здесь обновлялись колонки period_year / actual_revenue, которых нет в актуальной схеме user_plans.
    // Выполнение плана и KPI считаются в kpi.service; интеграция сделки не должна ломать UPDATE сделки.
    void employeeId;
    void year;
    void month;
  }

  /**
   * Full integration: sync deal to finances, update KPI, update plan
   * Uses transaction to prevent race conditions on concurrent deal processing
   */
  static async integrateDeal(dealRow: DealRow): Promise<{ success: boolean; agentId: string | null; ropId: string | null }> {
    try {
      // ONLY integrate if status is 'approved' or 'active' (legacy)
      if (dealRow.status !== 'approved' && dealRow.status !== 'active') {
        console.log(`[FinanceIntegration] Skipping integration for deal ${dealRow.id} (status: ${dealRow.status}). Removing existing records if any.`);
        await this.deleteDealIntegration(dealRow.id);
        
        // We MUST find agent/rop and recalculate their KPI/Plans minus this deal
        const agentId = dealRow.agent_id || await this.findEmployeeByName(dealRow.agent_name);
        const ropId = dealRow.rop_id || await this.findEmployeeByName(dealRow.rop_name);
        
        if (agentId) {
            await this.updateEmployeeKPI(agentId, dealRow);
            await this.updatePlanCompletion(agentId, dealRow.year, dealRow.month);
            await cacheService.invalidate(`kpi:*:${agentId}:*`);
        }
        if (ropId) {
            await this.updateEmployeeKPI(ropId, dealRow);
            await this.updatePlanCompletion(ropId, dealRow.year, dealRow.month);
            await cacheService.invalidate(`kpi:*:${ropId}:*`);
        }
        
        return { success: true, agentId, ropId };
      }

        // 1. Sync to finances
      const { agentId, ropId } = await this.syncDealToFinances(dealRow);

      // 2. Update KPI and plan in transaction to prevent race conditions

      await transaction(async (_tx) => {
        // Update KPI for agent
        if (agentId) {
          await this.updateEmployeeKPI(agentId, dealRow);
          await this.updatePlanCompletion(agentId, dealRow.year, dealRow.month);
        }

        // Update KPI for ROP
        if (ropId) {
          await this.updateEmployeeKPI(ropId, dealRow);
          await this.updatePlanCompletion(ropId, dealRow.year, dealRow.month);
        }
      });

      if (agentId) {
        await cacheService.invalidate(`kpi:*:${agentId}:*`);
        console.log(`✓ Personal KPI cache invalidated for agent ${agentId}`);
      }
      if (ropId) {
        await cacheService.invalidate(`kpi:*:${ropId}:*`);
        console.log(`✓ Personal KPI cache invalidated for ROP ${ropId}`);
      }

      return { success: true, agentId, ropId };
    } catch (error) {
      console.error('Error integrating deal with finances:', error);
      throw error;
    }
  }

  /**
   * Delete all financial records associated with a deal
   */
  static async deleteDealIntegration(dealId: string): Promise<{ success: boolean }> {
    // Each step isolated — missing table (e.g. deal_payouts on legacy DB) shouldn't block deletion
    try {
      await query('DELETE FROM transactions WHERE deal_id = $1', [dealId]);
    } catch (error: any) {
      if (error?.code !== '42P01') console.error('Error deleting transactions:', error);
    }
    try {
      await query('DELETE FROM deal_payouts WHERE deal_id = $1', [dealId]);
    } catch (error: any) {
      if (error?.code !== '42P01') console.error('Error deleting deal_payouts:', error);
    }
    return { success: true };
  }
}

export default DealFinanceIntegration;
