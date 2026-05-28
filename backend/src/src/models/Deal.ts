import { query } from '../db';
import type { Deal, DealFilters, PaginationParams, DealListResult } from '../types/models';

class DealModel {
  static async create(dealData: Partial<Deal>): Promise<Deal> {
    const {
      property_object, document_type, document_date,
      seller_name, seller_phone, buyer_name, buyer_phone,
      deposit_date, deal_date, receipt_date,
      service_type, has_mortgage, mortgage_amount,
      status, period_month, period_year, created_by
    } = dealData;

    const queryText = `
      INSERT INTO deals (
        property_object, document_type, document_date,
        seller_name, seller_phone, buyer_name, buyer_phone,
        deposit_date, deal_date, receipt_date,
        service_type, has_mortgage, mortgage_amount,
        status, period_month, period_year, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      property_object, document_type, document_date,
      seller_name, seller_phone, buyer_name, buyer_phone,
      deposit_date, deal_date, receipt_date,
      service_type, has_mortgage, mortgage_amount,
      status || 'draft', period_month, period_year, created_by
    ];

    const result = await query<Deal>(queryText, values);
    return result.rows[0];
  }

  static async getById(dealId: string): Promise<Deal | undefined> {
    const queryText = 'SELECT * FROM deals WHERE id = $1';
    const result = await query<Deal>(queryText, [dealId]);
    return result.rows[0];
  }

  static async getWithRelations(dealId: string): Promise<any> {
    const queryText = `
      SELECT d.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', dp.id, 'employee_id', dp.employee_id,
          'role', dp.role, 'side', dp.side,
          'employee_name', u.full_name
        )) FILTER (WHERE dp.id IS NOT NULL) as participants,
        row_to_json(dc.*) as commissions,
        dfc.* as calculated_finances
      FROM deals d
      LEFT JOIN deal_participants dp ON d.id = dp.deal_id
      LEFT JOIN auth_users u ON dp.employee_id = u.id
      LEFT JOIN deal_commissions dc ON d.id = dc.deal_id
      LEFT JOIN deal_finances_calculated dfc ON d.id = dfc.deal_id
      WHERE d.id = $1
      GROUP BY d.id, dc.id, dfc.deal_id, dfc.period_month, dfc.period_year,
               dfc.commission_seller_plan, dfc.commission_buyer_plan,
               dfc.commission_seller_fact, dfc.commission_buyer_fact,
               dfc.total_commission_fact, dfc.total_commission_plan,
               dfc.agent_income_seller, dfc.agent_income_buyer,
               dfc.agent_income_total, dfc.rop_income,
               dfc.company_revenue, dfc.plan_completion_percent
    `;
    const result = await query(queryText, [dealId]);
    return result.rows[0];
  }

  static async list(filters: DealFilters = {}, pagination: PaginationParams = {}): Promise<DealListResult> {
    const { status, period_month, period_year, employee_id, team_id, created_by } = filters;
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const whereConditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (status) {
      whereConditions.push(`d.status = $${paramCount++}`);
      values.push(status);
    }
    if (period_month) {
      whereConditions.push(`d.period_month = $${paramCount++}`);
      values.push(period_month);
    }
    if (period_year) {
      whereConditions.push(`d.period_year = $${paramCount++}`);
      values.push(period_year);
    }
    if (team_id) {
      // Team filter - show deals for team members
      whereConditions.push(`EXISTS (
        SELECT 1 FROM deal_participants dp
        INNER JOIN profiles p ON dp.employee_id = p.id
        WHERE dp.deal_id = d.id AND p.team_id = $${paramCount++}
      )`);
      values.push(team_id);
    }
    if (employee_id) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM deal_participants dp
        WHERE dp.deal_id = d.id AND dp.employee_id = $${paramCount++}
      )`);
      values.push(employee_id);
    }
    if (created_by) {
      whereConditions.push(`d.created_by = $${paramCount++}`);
      values.push(created_by);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) FROM deals d ${whereClause}`;
    const countResult = await query<{ count: string }>(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    const queryText = `
      SELECT d.*,
        json_agg(DISTINCT jsonb_build_object(
          'employee_id', dp.employee_id, 'role', dp.role,
          'side', dp.side, 'employee_name', p.full_name
        )) FILTER (WHERE dp.id IS NOT NULL) as participants
      FROM deals d
      LEFT JOIN deal_participants dp ON d.id = dp.deal_id
      LEFT JOIN profiles p ON dp.employee_id = p.id
      ${whereClause}
      GROUP BY d.id
      ORDER BY d.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount}
    `;

    values.push(limit, offset);
    const result = await query<Deal>(queryText, values);

    return {
      deals: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  static async update(dealId: string, updates: Partial<Deal>): Promise<Deal> {
    const allowedFields = [
      'property_object', 'document_type', 'document_date',
      'seller_name', 'seller_phone', 'buyer_name', 'buyer_phone',
      'deposit_date', 'deal_date', 'receipt_date',
      'service_type', 'has_mortgage', 'mortgage_amount',
      'status', 'period_month', 'period_year'
    ];

    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount++}`);
        values.push(updates[key as keyof Deal]);
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(dealId);

    const queryText = `
      UPDATE deals SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query<Deal>(queryText, values);
    return result.rows[0];
  }

  static async delete(dealId: string): Promise<Deal> {
    const queryText = `
      UPDATE deals SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `;
    const result = await query<Deal>(queryText, [dealId]);
    return result.rows[0];
  }
}

export default DealModel;
