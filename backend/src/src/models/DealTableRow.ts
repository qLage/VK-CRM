import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { DealTableRow } from '../types/models';
import { parseNumeric, formatMoney } from '../lib/formatting.utils';
import cacheService from '../lib/cache.service';

interface CalculatedFormulas {
  commission_total_fact: string;
  agent_income: string;
  rop_payout: string;
  mop_revenue: string;
  company_revenue: string;
}

interface DealTableRowFilters {
  year?: number;
  month?: number;
  agent_name?: string;
  agent_id?: string;
  rop_name?: string;
  rop_id?: string;
  mop_id?: string;
  document_type?: string;
  team_id?: string;
  branch_id?: string;
  status?: string;
  dealStatus?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: Date;
  endDate?: Date;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  compact?: boolean;
}

interface ListResult {
  rows: DealTableRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class DealTableRowModel {
  private static toNullableUuid(id: any): string | null {
    if (id === null || id === undefined || (typeof id === 'string' && (id.trim() === '' || id === 'null' || id === 'undefined'))) {
      return null;
    }
    const sId = String(id);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(sId) ? sId : null;
  }

  private static toNullableTimestamp(val: any): string | null {
    if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
      return null;
    }
    return String(val);
  }

  static calculateFormulas(row: Partial<DealTableRow>): CalculatedFormulas {
    const commission_seller_adjusted = parseNumeric(row.commission_seller_fact).minus(parseNumeric(row.mortgage_deduction));
    const commission_total_fact = commission_seller_adjusted.plus(parseNumeric(row.commission_buyer_fact));
    
    // Agent income calculation (based on adjusted seller commission)
    const agent_income = commission_seller_adjusted.times(parseNumeric(row.agent_percent_seller)).dividedBy(100)
      .plus(parseNumeric(row.commission_buyer_fact).times(parseNumeric(row.agent_percent_buyer)).dividedBy(100));
    
    // ROP payout calculation (based on total fact commission)
    const rop_payout = commission_total_fact.times(parseNumeric(row.rop_percent)).dividedBy(100);
    
    // MOP revenue: always commission_total_fact * mop_percent / 100
    const mop_revenue = commission_total_fact.times(parseNumeric(row.mop_percent)).dividedBy(100);

    // Company Revenue: total commission minus agent income and MOP revenue
    const company_revenue = commission_total_fact.minus(agent_income).minus(mop_revenue);

    return {
      commission_total_fact: formatMoney(commission_total_fact),
      agent_income: formatMoney(agent_income),
      rop_payout: formatMoney(rop_payout),
      mop_revenue: formatMoney(mop_revenue),
      company_revenue: formatMoney(company_revenue)
    };
  }

  static async create(data: Partial<DealTableRow>, userId: string): Promise<DealTableRow> {
    const id = uuidv4();
    
    // Auto-detect mortgage
    if (Number(data.mortgage_deduction) > 0) {
      data.mortgage = 1;
    }

    const calculated = this.calculateFormulas(data);
    
    // Fallback for document_type which is NOT NULL
    const documentType = data.document_type || 'ДДУ';
    const propertyName = data.property_name || 'Неизвестный объект';
    // Allow client to specify status; default = draft (черновик), unless explicitly 'pending'
    const allowedInitialStatus = ['draft', 'pending'];
    const initialStatus = allowedInitialStatus.includes(String(data.status))
      ? String(data.status)
      : 'draft';

    const result = await query<DealTableRow>(`
      INSERT INTO deal_table_rows (
        id, month, year, property_name, property_id, document_type,
        deposit_date, deal_date, payment_date,
        agent_name, agent_id, rop_name, rop_id, mop_name, mop_id, team_id, branch_id, company_id, mortgage_deduction, comment,
        commission_seller_plan, commission_buyer_plan, commission_seller_fact, commission_buyer_fact,
        agent_percent_seller, agent_percent_buyer, mop_percent, rop_percent, service, information, payout_date, payout_mop_note, payout_rop_note,
        commission_total_fact, agent_income, rop_payout, mop_revenue, company_revenue,
        status, created_by, created_at, updated_at, mortgage
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
        $34, $35, $36, $37, $38, $39, $40, $41, $42, $43
      ) RETURNING *
    `, [
        id, data.month, data.year, propertyName, this.toNullableUuid(data.property_id), documentType,
        this.toNullableTimestamp(data.deposit_date), this.toNullableTimestamp(data.deal_date), this.toNullableTimestamp(data.payment_date),
        data.agent_name || '', this.toNullableUuid(data.agent_id) || userId, data.rop_name || '', this.toNullableUuid(data.rop_id), data.mop_name || '', this.toNullableUuid(data.mop_id), this.toNullableUuid(data.team_id), this.toNullableUuid(data.branch_id), this.toNullableUuid(data.company_id) || '00000000-0000-0000-0000-000000000001', Number(data.mortgage_deduction) || 0, data.comment || '',
        data.commission_seller_plan || 0, data.commission_buyer_plan || 0, data.commission_seller_fact || 0, data.commission_buyer_fact || 0,
        data.agent_percent_seller || 0, data.agent_percent_buyer || 0, data.mop_percent || 0, data.rop_percent || 0, data.service || '', data.information || '', this.toNullableTimestamp(data.payout_date), data.payout_mop_note || '', data.payout_rop_note || '',
        calculated.commission_total_fact, calculated.agent_income, calculated.rop_payout, calculated.mop_revenue, calculated.company_revenue,
        initialStatus, userId, new Date().toISOString(), new Date().toISOString(), data.mortgage || 0
      ]);
    try { await cacheService.invalidate('kpi:*'); } catch (e) {}

    // Link the property to this deal & mark as sold (auto-archive)
    if (data.property_id) {
      try {
        await query(
          `UPDATE properties SET deal_id = $1, sold_in_deal_id = $1, sold_at = NOW(),
                                 status = 'archived', archived_at = NOW(),
                                 auto_delete_at = NOW() + INTERVAL '30 days', updated_at = NOW()
           WHERE id = $2 AND status NOT IN ('archived')`,
          [id, data.property_id]
        );
      } catch (e) { console.error('[DealTableRow] property auto-archive failed:', e); }
    }

    return result.rows[0];
  }

  private static ALLOWED_COLUMNS = [
    'month', 'year', 'deposit_date', 'deal_date', 'payment_date', 
    'property_name', 'property_id', 'document_type', 'document_link', 'seller', 'buyer', 
    'service', 'information', 'agent_name', 'mop_name', 'rop_name', 
    'team_id', 'branch_id', 'comment', 'commission_seller_plan', 
    'commission_buyer_plan', 'commission_seller_fact', 'commission_buyer_fact', 
    'agent_percent', 'rop_percent', 'agent_percent_seller', 'agent_percent_buyer', 
    'mop_percent', 'agent_manual_bonus', 'rop_manual_bonus', 'other_expenses', 
    'mortgage_deduction', 'payout_date', 'payout_mop_note', 'payout_rop_note', 
    'status', 'rejection_reason', 'deal_amount', 'mortgage', 'agent_id', 
    'mop_id', 'rop_id', 'company_id'
  ];

  static async update(id: string, data: Partial<DealTableRow>): Promise<DealTableRow> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Deal not found');

    const merged = { ...existing, ...data };
    
    // Auto-detect mortgage
    if (Number(merged.mortgage_deduction) > 0) {
      merged.mortgage = 1;
      data.mortgage = 1; // Ensure it's in the update data too
    }

    const calculated = this.calculateFormulas(merged);
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Filter incoming data to include only allowed columns
    // This prevents 500 errors when frontend sends joined objects or calculated fields
    for (const [key, val] of Object.entries(data)) {
      if (this.ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    // Add calculated fields
    fields.push(`commission_total_fact = $${idx++}`);
    values.push(calculated.commission_total_fact);
    fields.push(`agent_income = $${idx++}`);
    values.push(calculated.agent_income);
    fields.push(`rop_payout = $${idx++}`);
    values.push(calculated.rop_payout);
    fields.push(`mop_revenue = $${idx++}`);
    values.push(calculated.mop_revenue);
    fields.push(`company_revenue = $${idx++}`);
    values.push(calculated.company_revenue);

    fields.push(`updated_at = $${idx++}`);
    values.push(now);

    values.push(id);
    const sql = `UPDATE deal_table_rows SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    
    const result = await query<DealTableRow>(sql, values);
    try { await cacheService.invalidate('kpi:*'); } catch (e) { /* ignore cache error */ }
    return result.rows[0];
  }

  static async list(filters: DealTableRowFilters = {}, pagination: PaginationOptions = {}): Promise<ListResult> {
    const { page = 1, limit = 100 } = pagination;
    const offset = (page - 1) * limit;
    const whereConditions = [];
    const values = [];
    let paramCount = 1;
    if (filters.year) { whereConditions.push(`year = $${paramCount++}`); values.push(filters.year); }
    if (filters.month) { whereConditions.push(`month = $${paramCount++}`); values.push(filters.month); }
    if (filters.agent_id) { whereConditions.push(`agent_id = $${paramCount++}`); values.push(filters.agent_id); }
    if (filters.mop_id) { whereConditions.push(`mop_id = $${paramCount++}`); values.push(filters.mop_id); }
    if (filters.rop_id) { whereConditions.push(`rop_id = $${paramCount++}`); values.push(filters.rop_id); }
    if (filters.agent_name) { whereConditions.push(`agent_name ILIKE $${paramCount++}`); values.push(`%${filters.agent_name}%`); }
    if (filters.team_id) { whereConditions.push(`team_id = $${paramCount++}`); values.push(filters.team_id); }
    if (filters.branch_id) { whereConditions.push(`branch_id = $${paramCount++}`); values.push(filters.branch_id); }
    
    // Status filter
    const status = filters.status || filters.dealStatus;
    if (status && status !== 'all') {
      whereConditions.push(`status = $${paramCount++}`);
      values.push(status);
    }
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    const totalResult = await query<{ count: string }>(`SELECT COUNT(*) FROM deal_table_rows ${whereClause}`, values);
    const total = parseInt(totalResult.rows[0].count);
    const result = await query<DealTableRow>(`SELECT * FROM deal_table_rows ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`, [...values, limit, offset]);
    return { rows: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  static async getEmployeeStats(name: string, filters: DealTableRowFilters = {}): Promise<{ total_deals: number; total_commission: number; personal_income: number; avg_check: number }> {
    const whereConditions = [];
    const values = [];
    let paramCount = 1;

    if (filters.agent_id) {
      whereConditions.push(`agent_id = $${paramCount++}`);
      values.push(filters.agent_id);
    } else {
      whereConditions.push(`agent_name = $${paramCount++}`);
      values.push(name);
    }

    if (filters.startDate && filters.endDate) {
      const startPeriod = filters.startDate.getUTCFullYear() * 100 + filters.startDate.getUTCMonth() + 1;
      const endPeriod = filters.endDate.getUTCFullYear() * 100 + filters.endDate.getUTCMonth() + 1;
      whereConditions.push(`(year * 100 + month) BETWEEN $${paramCount++} AND $${paramCount++}`);
      values.push(startPeriod, endPeriod);
    } else {
      if (filters.year) {
        whereConditions.push(`year = $${paramCount++}`);
        values.push(filters.year);
      }
      if (filters.month) {
        whereConditions.push(`month = $${paramCount++}`);
        values.push(filters.month);
      }
    }

    if (whereConditions.length > 0) {
      whereConditions.push("status IN ('approved', 'active')");
    } else {
      whereConditions.push("status IN ('approved', 'active')");
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const result = await query(`
      SELECT 
        COUNT(*)::int as total_deals, 
        COALESCE(SUM(CAST(NULLIF(commission_total_fact, '') AS numeric)), 0) as total_commission,
        COALESCE(SUM(CAST(NULLIF(agent_income, '') AS numeric)), 0) as personal_income
      FROM deal_table_rows 
      ${whereClause}
    `, values);

    const row = result.rows[0];
    const totalDeals = parseInt(row.total_deals || 0);
    const totalCommission = parseFloat(row.total_commission || 0);
    const personalIncome = parseFloat(row.personal_income || 0);
    const avgCheck = totalDeals > 0 ? totalCommission / totalDeals : 0;

    return {
      total_deals: totalDeals,
      total_commission: totalCommission,
      personal_income: personalIncome,
      avg_check: avgCheck
    };
  }

  static async getTotals(filters: DealTableRowFilters = {}): Promise<any> {
    const whereConditions = [];
    const values = [];
    let paramCount = 1;
    if (filters.year) { whereConditions.push(`year = $${paramCount++}`); values.push(filters.year); }
    if (filters.month) { whereConditions.push(`month = $${paramCount++}`); values.push(filters.month); }
    if (filters.agent_id) { whereConditions.push(`agent_id = $${paramCount++}`); values.push(filters.agent_id); }
    if (filters.mop_id) { whereConditions.push(`mop_id = $${paramCount++}`); values.push(filters.mop_id); }
    if (filters.branch_id) { whereConditions.push(`branch_id = $${paramCount++}`); values.push(filters.branch_id); }
    if (filters.team_id) { whereConditions.push(`team_id = $${paramCount++}`); values.push(filters.team_id); }
    if (filters.agent_name) { whereConditions.push(`agent_name ILIKE $${paramCount++}`); values.push(`%${filters.agent_name}%`); }

    // Totals should only count approved/active deals unless explicitly filtered
    const status = filters.status || filters.dealStatus;
    if (status && status !== 'all') {
      whereConditions.push(`status = $${paramCount++}`);
      values.push(status);
    } else {
      whereConditions.push(`status IN ('approved', 'active')`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    const result = await query(`
      SELECT 
        COUNT(*)::int as deal_count,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending_count,
        COALESCE(SUM(commission_total_fact), 0)::float as total_commission_fact,
        COALESCE(SUM(commission_seller_plan), 0)::float as total_commission_seller_plan,
        COALESCE(SUM(commission_buyer_plan), 0)::float as total_commission_buyer_plan,
        COALESCE(SUM(commission_seller_fact), 0)::float as total_commission_seller_fact,
        COALESCE(SUM(commission_buyer_fact), 0)::float as total_commission_buyer_fact,
        COALESCE(SUM(agent_income), 0)::float as total_agent_income,
        COALESCE(SUM(mop_revenue), 0)::float as total_mop_revenue,
        COALESCE(SUM(rop_payout), 0)::float as total_rop_payout,
        COALESCE(SUM(mortgage_deduction), 0)::float as total_mortgage_deduction,
        COALESCE(SUM(company_revenue), 0)::float as total_company_revenue,
        CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(commission_total_fact), 0)::float / COUNT(*) ELSE 0 END as avg_check
      FROM deal_table_rows 
      ${whereClause}
    `, values);
    return result.rows[0];
  }

  static async getEmployeeDeals(name: string, filters: any, pagination: any) { return this.list({ ...filters, agent_name: name }, pagination); }
  static async getCompanyDeals(filters: any, pagination: any) { return this.list(filters, pagination); }
  static async getTeamDeals(teamId: string, filters: any, pagination: any) { return this.list({ ...filters, team_id: teamId }, pagination); }
  static async getBranchDeals(branchId: string, filters: any, pagination: any) { return this.list({ ...filters, branch_id: branchId }, pagination); }
  static async getTeamsSummary(filters: any) {
    const whereConditions = [];
    const values = [];
    let paramCount = 1;
    if (filters.year) { whereConditions.push(`year = $${paramCount++}`); values.push(filters.year); }
    if (filters.month) { whereConditions.push(`month = $${paramCount++}`); values.push(filters.month); }
    if (filters.branch_id) { whereConditions.push(`branch_id = $${paramCount++}`); values.push(filters.branch_id); }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // If team_id is present, it means we are at team level and want a summary per agent
    if (filters.team_id) {
        whereConditions.push(`team_id = $${paramCount++}`);
        values.push(filters.team_id);
        const finalWhere = 'WHERE ' + whereConditions.join(' AND ');
        const result = await query(`
          SELECT 
            agent_name,
            agent_id,
            COUNT(*) FILTER (WHERE status IN ('approved', 'active')) as deal_count,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
            COALESCE(SUM(commission_total_fact) FILTER (WHERE status IN ('approved', 'active')), 0)::float as total_commission_fact,
            COALESCE(SUM(company_revenue) FILTER (WHERE status IN ('approved', 'active')), 0)::float as total_company_revenue
          FROM deal_table_rows
          ${finalWhere}
          GROUP BY agent_name, agent_id
          ORDER BY total_commission_fact DESC
        `, values);
        return result.rows;
    }

    const result = await query(`
      SELECT 
        team_id,
        MAX(team_name) as team_name,
        COUNT(*) FILTER (WHERE status IN ('approved', 'active')) as deal_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COALESCE(SUM(commission_total_fact) FILTER (WHERE status IN ('approved', 'active')), 0)::float as total_commission_fact,
        COALESCE(SUM(company_revenue) FILTER (WHERE status IN ('approved', 'active')), 0)::float as total_company_revenue
      FROM deal_table_rows
      ${whereClause}
      GROUP BY team_id
      ORDER BY total_commission_fact DESC
    `, values);
    return result.rows;
  }

  static async getBranchesSummary(filters: any) {
    const whereConditions = [];
    const values = [];
    let paramCount = 1;
    if (filters.year) { whereConditions.push(`year = $${paramCount++}`); values.push(filters.year); }
    if (filters.month) { whereConditions.push(`month = $${paramCount++}`); values.push(filters.month); }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    const result = await query(`
      SELECT 
        branch_id,
        MAX(branch_name) as branch_name,
        COUNT(*) FILTER (WHERE status IN ('approved', 'active')) as deal_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COALESCE(SUM(commission_total_fact) FILTER (WHERE status IN ('approved', 'active')), 0)::float as total_commission_fact,
        COALESCE(SUM(company_revenue) FILTER (WHERE status IN ('approved', 'active')), 0)::float as total_company_revenue
      FROM deal_table_rows
      ${whereClause}
      GROUP BY branch_id
      ORDER BY total_commission_fact DESC
    `, values);
    return result.rows;
  }
  static async findById(id: string) { const res = await query<DealTableRow>('SELECT * FROM deal_table_rows WHERE id = $1', [id]); return res.rows[0]; }
  
  static async delete(id: string): Promise<void> {
    await query('DELETE FROM deal_table_rows WHERE id = $1', [id]);
    try { await cacheService.invalidate('kpi:*'); } catch (e) { /* ignore cache error */ }
  }

  static async updateStatus(id: string, status: string, reason?: string): Promise<DealTableRow> {
    const result = await query<DealTableRow>(
      'UPDATE deal_table_rows SET status = $2, rejection_reason = $3, updated_at = $4 WHERE id = $1 RETURNING *',
      [id, status, reason || null, new Date().toISOString()]
    );
    try { await cacheService.invalidate('kpi:*'); } catch (e) { /* ignore cache error */ }
    return result.rows[0];
  }
}

export default DealTableRowModel;