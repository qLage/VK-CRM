import dbConnection from '../config/database';
import type { Pool } from 'pg';
import type { DealActivity } from '../types/models';

const pool = dbConnection as Pool;

class DealActivityModel {
  static async create(activityData: Partial<DealActivity>): Promise<DealActivity> {
    const {
      deal_id,
      activity_type,
      description,
      performed_by,
      metadata
    } = activityData;

    const queryText = `
      INSERT INTO deal_activities (
        deal_id, activity_type, description,
        performed_by, metadata
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      deal_id,
      activity_type,
      description || null,
      performed_by,
      metadata || null
    ];

    const result = await pool.query(queryText, values);
    return result.rows[0];
  }

  static async findByDealId(dealId: string, options: { limit?: number; offset?: number } = {}): Promise<any[]> {
    const { limit = 50, offset = 0 } = options;

    const queryText = `
      SELECT
        da.*,
        u.name as performed_by_name
      FROM deal_activities da
      LEFT JOIN users u ON da.performed_by = u.id
      WHERE da.deal_id = $1
      ORDER BY da.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(queryText, [dealId, limit, offset]);
    return result.rows;
  }

  static async findById(activityId: string): Promise<any> {
    const queryText = `
      SELECT
        da.*,
        u.name as performed_by_name,
        d.property_address
      FROM deal_activities da
      LEFT JOIN users u ON da.performed_by = u.id
      LEFT JOIN deals d ON da.deal_id = d.id
      WHERE da.id = $1
    `;

    const result = await pool.query(queryText, [activityId]);
    return result.rows[0];
  }

  static async findByType(dealId: string, activityType: string): Promise<any[]> {
    const queryText = `
      SELECT
        da.*,
        u.name as performed_by_name
      FROM deal_activities da
      LEFT JOIN users u ON da.performed_by = u.id
      WHERE da.deal_id = $1 AND da.activity_type = $2
      ORDER BY da.created_at DESC
    `;

    const result = await pool.query(queryText, [dealId, activityType]);
    return result.rows;
  }

  static async findByDateRange(startDate: string, endDate: string, filters: any = {}): Promise<any[]> {
    const { activity_type, performed_by } = filters;

    const conditions = ['created_at >= $1', 'created_at <= $2'];
    const values: any[] = [startDate, endDate];
    let paramCount = 3;

    if (activity_type) {
      conditions.push(`activity_type = $${paramCount++}`);
      values.push(activity_type);
    }

    if (performed_by) {
      conditions.push(`performed_by = $${paramCount++}`);
      values.push(performed_by);
    }

    const queryText = `
      SELECT
        da.*,
        u.name as performed_by_name,
        d.property_address
      FROM deal_activities da
      LEFT JOIN users u ON da.performed_by = u.id
      LEFT JOIN deals d ON da.deal_id = d.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY da.created_at DESC
    `;

    const result = await pool.query(queryText, values);
    return result.rows;
  }

  static async getActivitySummary(dealId: string): Promise<any[]> {
    const queryText = `
      SELECT
        activity_type,
        COUNT(*) as activity_count,
        MAX(created_at) as last_activity
      FROM deal_activities
      WHERE deal_id = $1
      GROUP BY activity_type
      ORDER BY activity_count DESC
    `;

    const result = await pool.query(queryText, [dealId]);
    return result.rows;
  }

  static async delete(activityId: string): Promise<DealActivity> {
    const queryText = 'DELETE FROM deal_activities WHERE id = $1 RETURNING *';
    const result = await pool.query(queryText, [activityId]);
    return result.rows[0];
  }
}

export default DealActivityModel;
