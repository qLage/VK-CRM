import dbConnection from '../config/database';
import type { Pool } from 'pg';
import type { DealParticipant } from '../types/models';

const pool = dbConnection as Pool;

class DealParticipantModel {
  static async create(participantData: Partial<DealParticipant>): Promise<DealParticipant> {
    const { deal_id, employee_id, role, side } = participantData;

    const queryText = `
      INSERT INTO deal_participants (deal_id, employee_id, role, side)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(queryText, [deal_id, employee_id, role, side]);
    return result.rows[0];
  }

  static async createBatch(dealId: string, participants: Partial<DealParticipant>[]): Promise<DealParticipant[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created: DealParticipant[] = [];
      for (const participant of participants) {
        const queryText = `
          INSERT INTO deal_participants (deal_id, employee_id, role, side)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `;
        const result = await client.query(queryText, [
          dealId,
          participant.employee_id,
          participant.role,
          participant.side
        ]);
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getByDeal(dealId: string): Promise<DealParticipant[]> {
    const queryText = `
      SELECT dp.*, u.full_name as employee_name, u.email as employee_email
      FROM deal_participants dp
      JOIN auth_users u ON dp.employee_id = u.id
      WHERE dp.deal_id = $1
      ORDER BY dp.role, dp.side
    `;
    const result = await pool.query(queryText, [dealId]);
    return result.rows;
  }

  static async getByEmployee(employeeId: string): Promise<any[]> {
    const queryText = `
      SELECT dp.*, d.property_object, d.status, d.deal_date
      FROM deal_participants dp
      JOIN deals d ON dp.deal_id = d.id
      WHERE dp.employee_id = $1
      ORDER BY d.created_at DESC
    `;
    const result = await pool.query(queryText, [employeeId]);
    return result.rows;
  }

  static async deleteByDeal(dealId: string): Promise<void> {
    const queryText = 'DELETE FROM deal_participants WHERE deal_id = $1';
    await pool.query(queryText, [dealId]);
  }

  static async findByDealId(dealId: string): Promise<DealParticipant[]> {
    return this.getByDeal(dealId);
  }

  static async findById(id: string): Promise<DealParticipant | null> {
    const queryText = `
      SELECT dp.*, u.full_name as employee_name, u.email as employee_email
      FROM deal_participants dp
      LEFT JOIN auth_users u ON dp.employee_id = u.id
      WHERE dp.id = $1
    `;
    const result = await pool.query(queryText, [id]);
    return result.rows[0] || null;
  }

  static async update(id: string, updates: Partial<DealParticipant>): Promise<DealParticipant | null> {
    const allowedFields = ['employee_id', 'role', 'side'];
    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount++}`);
        values.push(updates[key as keyof DealParticipant]);
      }
    });

    if (setClause.length === 0) {
      return null;
    }

    setClause.push(`updated_at = NOW()`);
    values.push(id);

    const queryText = `
      UPDATE deal_participants
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(queryText, values);
    return result.rows[0] || null;
  }

  static async delete(id: string): Promise<DealParticipant | null> {
    const queryText = 'DELETE FROM deal_participants WHERE id = $1 RETURNING *';
    const result = await pool.query(queryText, [id]);
    return result.rows[0] || null;
  }

  static async findByType(dealId: string, type: string): Promise<DealParticipant[]> {
    const queryText = `
      SELECT dp.*, u.full_name as employee_name, u.email as employee_email
      FROM deal_participants dp
      LEFT JOIN auth_users u ON dp.employee_id = u.id
      WHERE dp.deal_id = $1 AND dp.role = $2
      ORDER BY dp.created_at
    `;
    const result = await pool.query(queryText, [dealId, type]);
    return result.rows;
  }
}

export default DealParticipantModel;
