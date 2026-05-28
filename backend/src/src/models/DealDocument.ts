import dbConnection from '../config/database';
import type { Pool } from 'pg';
import type { DealDocument } from '../types/models';

const pool = dbConnection as Pool;

class DealDocumentModel {
  static async create(documentData: Partial<DealDocument>): Promise<DealDocument> {
    const {
      deal_id,
      document_type,
      file_name,
      file_path,
      file_size,
      mime_type,
      uploaded_by,
      notes
    } = documentData;

    const queryText = `
      INSERT INTO deal_documents (
        deal_id, document_type, file_name, file_path,
        file_size, mime_type, uploaded_by, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      deal_id,
      document_type,
      file_name,
      file_path,
      file_size || null,
      mime_type || null,
      uploaded_by,
      notes || null
    ];

    const result = await pool.query(queryText, values);
    return result.rows[0];
  }

  static async findByDealId(dealId: string): Promise<any[]> {
    const queryText = `
      SELECT
        dd.*,
        u.name as uploaded_by_name
      FROM deal_documents dd
      LEFT JOIN users u ON dd.uploaded_by = u.id
      WHERE dd.deal_id = $1
      ORDER BY dd.created_at DESC
    `;

    const result = await pool.query(queryText, [dealId]);
    return result.rows;
  }

  static async findById(documentId: string): Promise<any> {
    const queryText = `
      SELECT
        dd.*,
        u.name as uploaded_by_name
      FROM deal_documents dd
      LEFT JOIN users u ON dd.uploaded_by = u.id
      WHERE dd.id = $1
    `;

    const result = await pool.query(queryText, [documentId]);
    return result.rows[0];
  }

  static async update(documentId: string, updates: Partial<DealDocument>): Promise<DealDocument> {
    const allowedFields = [
      'document_type', 'file_name', 'notes'
    ];

    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount++}`);
        values.push(updates[key as keyof DealDocument]);
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(documentId);

    const queryText = `
      UPDATE deal_documents
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(queryText, values);
    return result.rows[0];
  }

  static async delete(documentId: string): Promise<DealDocument> {
    const queryText = 'DELETE FROM deal_documents WHERE id = $1 RETURNING *';
    const result = await pool.query(queryText, [documentId]);
    return result.rows[0];
  }

  static async findByType(dealId: string, documentType: string): Promise<any[]> {
    const queryText = `
      SELECT
        dd.*,
        u.name as uploaded_by_name
      FROM deal_documents dd
      LEFT JOIN users u ON dd.uploaded_by = u.id
      WHERE dd.deal_id = $1 AND dd.document_type = $2
      ORDER BY dd.created_at DESC
    `;

    const result = await pool.query(queryText, [dealId, documentType]);
    return result.rows;
  }
}

export default DealDocumentModel;
