import { query } from '../db';
import type { DealCommission } from '../types/models';

class DealCommissionModel {
  static async create(commissionData: Partial<DealCommission>): Promise<DealCommission> {
    const {
      deal_id,
      commission_seller_plan,
      commission_buyer_plan,
      commission_seller_fact,
      commission_buyer_fact,
      agent_percent_seller,
      agent_percent_buyer,
      rop_percent,
      mortgage_expense,
      other_expenses
    } = commissionData;

    const queryText = `
      INSERT INTO deal_commissions (
        deal_id, commission_seller_plan, commission_buyer_plan,
        commission_seller_fact, commission_buyer_fact,
        agent_percent_seller, agent_percent_buyer, rop_percent,
        mortgage_expense, other_expenses
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      deal_id,
      commission_seller_plan || 0,
      commission_buyer_plan || 0,
      commission_seller_fact || 0,
      commission_buyer_fact || 0,
      agent_percent_seller || 0,
      agent_percent_buyer || 0,
      rop_percent || 0,
      mortgage_expense || 0,
      other_expenses || 0
    ];

    const result = await query<DealCommission>(queryText, values);
    return result.rows[0];
  }

  static async getByDeal(dealId: string): Promise<DealCommission | undefined> {
    const queryText = 'SELECT * FROM deal_commissions WHERE deal_id = $1';
    const result = await query<DealCommission>(queryText, [dealId]);
    return result.rows[0];
  }

  static async update(id: string, updates: Partial<DealCommission>): Promise<DealCommission | null> {
    const allowedFields = [
      'commission_seller_plan', 'commission_buyer_plan',
      'commission_seller_fact', 'commission_buyer_fact',
      'agent_percent_seller', 'agent_percent_buyer', 'rop_percent',
      'mortgage_expense', 'other_expenses'
    ];

    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount++}`);
        values.push(updates[key as keyof DealCommission]);
      }
    });

    if (setClause.length === 0) {
      return null;
    }

    setClause.push(`updated_at = NOW()`);
    values.push(id);

    const queryText = `
      UPDATE deal_commissions
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query<DealCommission>(queryText, values);
    return result.rows[0] || null;
  }

  static async findByDealId(dealId: string): Promise<DealCommission[]> {
    const queryText = 'SELECT * FROM deal_commissions WHERE deal_id = $1';
    const result = await query<DealCommission>(queryText, [dealId]);
    return result.rows;
  }

  static async findById(id: string): Promise<DealCommission | null> {
    const queryText = 'SELECT * FROM deal_commissions WHERE id = $1';
    const result = await query<DealCommission>(queryText, [id]);
    return result.rows[0] || null;
  }

  static async delete(id: string): Promise<DealCommission | null> {
    const queryText = 'DELETE FROM deal_commissions WHERE id = $1 RETURNING *';
    const result = await query<DealCommission>(queryText, [id]);
    return result.rows[0] || null;
  }

  static async getSummaryByDeal(dealId: string): Promise<any> {
    const queryText = `
      SELECT
        deal_id,
        SUM(commission_seller_plan + commission_buyer_plan) as total_plan,
        SUM(commission_seller_fact + commission_buyer_fact) as total_fact,
        AVG(agent_percent_seller) as avg_agent_percent_seller,
        AVG(agent_percent_buyer) as avg_agent_percent_buyer,
        AVG(rop_percent) as avg_rop_percent,
        SUM(mortgage_expense) as total_mortgage_expense,
        SUM(other_expenses) as total_other_expenses
      FROM deal_commissions
      WHERE deal_id = $1
      GROUP BY deal_id
    `;
    const result = await query(queryText, [dealId]);
    return result.rows[0] || null;
  }
}

export default DealCommissionModel;
