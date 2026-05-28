import { query } from '../db';
import type { CommissionRule } from '../types/models';

class CommissionRuleModel {
  static async create(ruleData: Partial<CommissionRule>): Promise<CommissionRule> {
    const {
      document_type,
      property_type,
      agent_percent_default,
      rop_percent_default,
      priority,
      is_active
    } = ruleData;

    const queryText = `
      INSERT INTO commission_rules (
        document_type, property_type,
        agent_percent_default, rop_percent_default,
        priority, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      document_type || null,
      property_type || null,
      agent_percent_default,
      rop_percent_default,
      priority || 0,
      is_active !== false
    ];

    const result = await query<CommissionRule>(queryText, values);
    return result.rows[0];
  }

  static async list(filters: any = {}, pagination: any = {}): Promise<any> {
    const { is_active } = filters;
    const { limit = 50, cursor } = pagination;

    let whereClause = '';
    const values: any[] = [];
    let paramCount = 1;

    if (is_active !== undefined) {
      whereClause = 'WHERE is_active = $1';
      values.push(is_active);
      paramCount++;
    }

    if (cursor) {
      if (whereClause) {
        whereClause += ` AND created_at < $${paramCount}`;
      } else {
        whereClause = `WHERE created_at < $${paramCount}`;
      }
      values.push(cursor);
      paramCount++;
    }

    const queryText = `
      SELECT * FROM commission_rules
      ${whereClause}
      ORDER BY priority DESC, created_at DESC
      LIMIT $${paramCount}
    `;

    values.push(limit + 1);
    const result = await query<CommissionRule>(queryText, values);

    let hasNextPage = false;
    if (result.rows.length > limit) {
      hasNextPage = true;
      result.rows.pop();
    }

    const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

    return {
      data: result.rows,
      nextCursor,
      hasNextPage
    };
  }

  static async update(ruleId: string, updates: Partial<CommissionRule>): Promise<CommissionRule> {
    const allowedFields = [
      'document_type', 'property_type',
      'agent_percent_default', 'rop_percent_default',
      'priority', 'is_active'
    ];

    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount++}`);
        values.push(updates[key as keyof CommissionRule]);
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(ruleId);

    const queryText = `
      UPDATE commission_rules
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query<CommissionRule>(queryText, values);
    return result.rows[0];
  }

  static async delete(ruleId: string): Promise<CommissionRule> {
    const queryText = 'DELETE FROM commission_rules WHERE id = $1 RETURNING *';
    const result = await query<CommissionRule>(queryText, [ruleId]);
    return result.rows[0];
  }

  static async matchRule(documentType: string, propertyType: string): Promise<any> {
    const queryText = `
      SELECT * FROM commission_rules
      WHERE is_active = true
        AND (document_type IS NULL OR document_type = $1)
        AND (property_type IS NULL OR property_type = $2)
      ORDER BY priority DESC
      LIMIT 1
    `;

    const result = await query<CommissionRule>(queryText, [documentType, propertyType]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Return default fallback
    return {
      agent_percent_default: 50.00,
      rop_percent_default: 10.00
    };
  }
}

export default CommissionRuleModel;
