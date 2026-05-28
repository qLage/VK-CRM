import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../utils/audit';

const router = express.Router();

// ─── Lead Statuses ────────────────────────────────────────────────────
const LEAD_STATUSES = [
  { value: 'new', label: 'Новый' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'no_answer', label: 'Не дозвонился' },
  { value: 'callback', label: 'Перезвонить' },
  { value: 'thinking', label: 'Думает' },
  { value: 'deal', label: 'Сделка' },
  { value: 'completed', label: 'Завершён' },
  { value: 'rejected', label: 'Отказ' },
];

// ─── GET /statuses ────────────────────────────────────────────────────
router.get('/statuses', authenticateToken, (_req: Request, res: Response) => {
  res.json(LEAD_STATUSES);
});

// ─── GET / — list leads ───────────────────────────────────────────────
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { category, status, search, page, branch_id, team_id, created_by, scope } = req.query;
    const limit = 50;
    const offset = ((Number(page) || 1) - 1) * limit;

    const clauses: string[] = ['l.company_id = $1'];
    const params: any[] = [user.company_id];

    if (category && category !== 'all') {
      clauses.push(`l.category = $${params.length + 1}`);
      params.push(category);
    }
    if (status && status !== 'all') {
      clauses.push(`l.status = $${params.length + 1}`);
      params.push(status);
    }
    const scopeStr = typeof scope === 'string' ? scope : '';

    if (scopeStr === 'personal') {
      clauses.push(`l.created_by = $${params.length + 1}`);
      params.push(user.id);
    }

    if (scopeStr === 'branch') {
      const effBranch =
        branch_id && branch_id !== 'all' ? String(branch_id) : user.branch_id ? String(user.branch_id) : '';
      if (effBranch) {
        clauses.push(`l.branch_id = $${params.length + 1}`);
        params.push(effBranch);
      }
    } else if (branch_id && branch_id !== 'all') {
      clauses.push(`l.branch_id = $${params.length + 1}`);
      params.push(branch_id);
    }
    if (team_id && team_id !== 'all') {
      clauses.push(`l.team_id = $${params.length + 1}`);
      params.push(team_id);
    }
    if (scopeStr !== 'personal' && created_by && created_by !== 'all') {
      clauses.push(`l.created_by = $${params.length + 1}`);
      params.push(created_by);
    }
    if (search) {
      clauses.push(`(l.full_name ILIKE $${params.length + 1} OR l.phone ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const where = 'WHERE ' + clauses.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) as total FROM leads l ${where}`, params);
    const total = parseInt(countResult.rows[0].total);

    const sql = `
      SELECT l.*, pr.full_name as created_by_name,
             (SELECT COUNT(*) FROM lead_touches lt WHERE lt.lead_id = l.id) as touches_count
      FROM leads l
      LEFT JOIN profiles pr ON l.created_by = pr.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const result = await query(sql, params);
    res.json({ leads: result.rows, total, page: Number(page) || 1, limit });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// ─── GET /:id — single lead with touches ─────────────────────────────
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await query(
      `SELECT l.*, pr.full_name as created_by_name FROM leads l LEFT JOIN profiles pr ON l.created_by = pr.id WHERE l.id = $1 AND l.company_id = $2`,
      [req.params.id, user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const touches = await query(
      `SELECT lt.*, pr.full_name as created_by_name FROM lead_touches lt LEFT JOIN profiles pr ON lt.created_by = pr.id WHERE lt.lead_id = $1 ORDER BY lt.created_at DESC`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], touches: touches.rows });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// ─── POST / — create lead (all users) ────────────────────────────────
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { category, full_name, phone, birthday, mortgage, mortgage_type, mortgage_approved, residential_complex, result: resultField, comment, status } = req.body;

    if (!full_name || !category) {
      return res.status(400).json({ error: 'full_name and category are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO leads (id, company_id, category, full_name, phone, birthday, mortgage, mortgage_type, mortgage_approved, residential_complex, result, comment, status, created_by, branch_id, team_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)`,
      [id, user.company_id, category, full_name, phone || null, birthday || null, mortgage || false, mortgage_type || null, mortgage_approved || false, residential_complex || null, resultField || null, comment || null, status || 'new', user.id, user.branch_id || null, user.team_id || null, now]
    );

    const created = await query(`SELECT * FROM leads WHERE id = $1`, [id]);
    await logAudit(req, 'CREATE', 'lead', id, { name: full_name || '' });
    res.status(201).json(created.rows[0]);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// ─── PUT /:id — update lead (director only) ──────────────────────────
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (Number(user.access_level || 0) < 100) {
      return res.status(403).json({ error: 'Только директор может редактировать лиды' });
    }

    const { full_name, phone, birthday, mortgage, mortgage_type, mortgage_approved, residential_complex, result: resultField, comment, status, category } = req.body;
    const now = new Date().toISOString();

    const result = await query(
      `UPDATE leads SET full_name = COALESCE($1, full_name), phone = $2, birthday = $3, mortgage = $4, mortgage_type = $5, mortgage_approved = $6, residential_complex = $7, result = $8, comment = $9, status = COALESCE($10, status), category = COALESCE($11, category), updated_at = $12
       WHERE id = $13 AND company_id = $14 RETURNING *`,
      [full_name, phone || null, birthday || null, mortgage || false, mortgage_type || null, mortgage_approved || false, residential_complex || null, resultField || null, comment || null, status, category, now, req.params.id, user.company_id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const changed: Record<string, any> = {};
    if (full_name !== undefined) changed.full_name = full_name;
    if (phone !== undefined) changed.phone = phone;
    if (birthday !== undefined) changed.birthday = birthday;
    if (mortgage !== undefined) changed.mortgage = mortgage;
    if (mortgage_type !== undefined) changed.mortgage_type = mortgage_type;
    if (mortgage_approved !== undefined) changed.mortgage_approved = mortgage_approved;
    if (residential_complex !== undefined) changed.residential_complex = residential_complex;
    if (resultField !== undefined) changed.result = resultField;
    if (comment !== undefined) changed.comment = comment;
    if (status !== undefined) changed.status = status;
    if (category !== undefined) changed.category = category;

    await logAudit(req, 'UPDATE', 'lead', req.params.id, { name: result.rows[0]?.full_name || '', ...changed });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// ─── DELETE /:id — delete lead (director only) ────────────────────────
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (Number(user.access_level || 0) < 100) {
      return res.status(403).json({ error: 'Только директор может удалять лиды' });
    }

    const result = await query(
      `DELETE FROM leads WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, user.company_id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });
    await logAudit(req, 'DELETE', 'lead', req.params.id, { name: result.rows[0]?.full_name || '' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// ─── POST /:id/touches — add touch ───────────────────────────────────
router.post('/:id/touches', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    // Verify lead belongs to company
    const lead = await query(`SELECT id FROM leads WHERE id = $1 AND company_id = $2`, [req.params.id, user.company_id]);
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const id = uuidv4();
    await query(
      `INSERT INTO lead_touches (id, lead_id, text, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [id, req.params.id, text, user.id]
    );

    const created = await query(
      `SELECT lt.*, pr.full_name as created_by_name FROM lead_touches lt LEFT JOIN profiles pr ON lt.created_by = pr.id WHERE lt.id = $1`,
      [id]
    );
    res.status(201).json(created.rows[0]);
  } catch (error) {
    console.error('Error adding touch:', error);
    res.status(500).json({ error: 'Failed to add touch' });
  }
});

// ─── DELETE /:id/touches/:touchId — delete touch ──────────────────────
router.delete('/:id/touches/:touchId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await query(
      `DELETE FROM lead_touches WHERE id = $1 AND lead_id = $2 AND lead_id IN (SELECT id FROM leads WHERE company_id = $3) RETURNING id`,
      [req.params.touchId, req.params.id, user.company_id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Touch not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting touch:', error);
    res.status(500).json({ error: 'Failed to delete touch' });
  }
});

export default router;
