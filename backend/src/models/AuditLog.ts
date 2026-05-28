import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id?: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, any>;
  ip_address?: string | null;
}

export interface AuditLogFilters {
  from?: string;
  to?: string;
  user_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogListResult {
  rows: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class AuditLogModel {
  static async create(data: AuditLogEntry): Promise<AuditLogEntry> {
    const id = data.id || uuidv4();
    const result = await query(
      `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        id,
        data.user_id,
        data.user_name,
        data.action,
        data.entity_type,
        data.entity_id || null,
        JSON.stringify(data.details || {}),
        data.ip_address || null,
      ]
    );
    return result.rows[0];
  }

  static async list(filters: AuditLogFilters = {}): Promise<AuditLogListResult> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 500); // Max 500 per request
    const offset = (page - 1) * limit;

    const whereConditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.from) {
      whereConditions.push(`created_at >= $${paramCount++}`);
      values.push(filters.from);
    }
    if (filters.to) {
      whereConditions.push(`created_at <= $${paramCount++}`);
      values.push(filters.to);
    }
    if (filters.user_id) {
      whereConditions.push(`user_id = $${paramCount++}`);
      values.push(filters.user_id);
    }
    if (filters.action) {
      whereConditions.push(`action = $${paramCount++}`);
      values.push(filters.action);
    }
    if (filters.entity_type) {
      whereConditions.push(`entity_type = $${paramCount++}`);
      values.push(filters.entity_type);
    }
    if (filters.entity_id) {
      whereConditions.push(`entity_id = $${paramCount++}`);
      values.push(filters.entity_id);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query<AuditLogEntry>(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`,
      [...values, limit, offset]
    );

    return {
      rows: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getActions(): Promise<string[]> {
    const result = await query<{ action: string }>(
      `SELECT DISTINCT action FROM audit_logs ORDER BY action`
    );
    return result.rows.map((r) => r.action);
  }

  static async getEntityTypes(): Promise<string[]> {
    const result = await query<{ entity_type: string }>(
      `SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type`
    );
    return result.rows.map((r) => r.entity_type);
  }
}

export default AuditLogModel;
