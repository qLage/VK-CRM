import dbConnection from '../config/database';
import type { Pool } from 'pg';
import type { Payment } from '../types/models';

const pool = dbConnection as Pool;

class PaymentModel {
  static async create(paymentData: Partial<Payment>): Promise<Payment> {
    const {
      deal_id,
      payment_type,
      amount,
      payment_date,
      payment_method,
      reference_number,
      payer_name,
      notes,
      recorded_by
    } = paymentData;

    const queryText = `
      INSERT INTO payments (
        deal_id, payment_type, amount, payment_date,
        payment_method, reference_number, payer_name,
        notes, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      deal_id,
      payment_type,
      amount,
      payment_date || new Date(),
      payment_method || null,
      reference_number || null,
      payer_name || null,
      notes || null,
      recorded_by
    ];

    const result = await pool.query(queryText, values);
    return result.rows[0];
  }

  static async findByDealId(dealId: string): Promise<any[]> {
    const queryText = `
      SELECT
        p.*,
        u.name as recorded_by_name
      FROM payments p
      LEFT JOIN users u ON p.recorded_by = u.id
      WHERE p.deal_id = $1
      ORDER BY p.payment_date DESC, p.created_at DESC
    `;

    const result = await pool.query(queryText, [dealId]);
    return result.rows;
  }

  static async findById(paymentId: string): Promise<any> {
    const queryText = `
      SELECT
        p.*,
        u.name as recorded_by_name,
        d.property_address
      FROM payments p
      LEFT JOIN users u ON p.recorded_by = u.id
      LEFT JOIN deals d ON p.deal_id = d.id
      WHERE p.id = $1
    `;

    const result = await pool.query(queryText, [paymentId]);
    return result.rows[0];
  }

  static async update(paymentId: string, updates: Partial<Payment>): Promise<Payment> {
    const allowedFields = [
      'payment_type', 'amount', 'payment_date',
      'payment_method', 'reference_number', 'payer_name', 'notes'
    ];

    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount++}`);
        values.push(updates[key as keyof Payment]);
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(paymentId);

    const queryText = `
      UPDATE payments
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(queryText, values);
    return result.rows[0];
  }

  static async delete(paymentId: string): Promise<Payment> {
    const queryText = 'DELETE FROM payments WHERE id = $1 RETURNING *';
    const result = await pool.query(queryText, [paymentId]);
    return result.rows[0];
  }

  static async getTotalByDeal(dealId: string): Promise<any[]> {
    const queryText = `
      SELECT
        payment_type,
        SUM(amount) as total_amount,
        COUNT(*) as payment_count
      FROM payments
      WHERE deal_id = $1
      GROUP BY payment_type
    `;

    const result = await pool.query(queryText, [dealId]);
    return result.rows;
  }

  static async findByDateRange(startDate: string, endDate: string, filters: any = {}): Promise<any[]> {
    const { payment_type, payment_method } = filters;

    const conditions = ['payment_date >= $1', 'payment_date <= $2'];
    const values: any[] = [startDate, endDate];
    let paramCount = 3;

    if (payment_type) {
      conditions.push(`payment_type = $${paramCount++}`);
      values.push(payment_type);
    }

    if (payment_method) {
      conditions.push(`payment_method = $${paramCount++}`);
      values.push(payment_method);
    }

    const queryText = `
      SELECT
        p.*,
        u.name as recorded_by_name,
        d.property_address
      FROM payments p
      LEFT JOIN users u ON p.recorded_by = u.id
      LEFT JOIN deals d ON p.deal_id = d.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.payment_date DESC
    `;

    const result = await pool.query(queryText, values);
    return result.rows;
  }
}

export default PaymentModel;
