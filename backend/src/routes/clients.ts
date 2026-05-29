import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { sendToUser } from '../services/notificationService';
import { logAudit } from '../utils/audit';

const router = express.Router();

// ─── Client Statuses ──────────────────────────────────────────────────
const CLIENT_STATUSES = [
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
  res.json(CLIENT_STATUSES);
});

// ─── GET / — list clients ─────────────────────────────────────────────
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { search, status, branch_id, team_id, created_by, page = '1', limit = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const params: any[] = [user.company_id];
    let where = 'c.company_id = $1::uuid';

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }

    if (branch_id && branch_id !== 'all') {
      params.push(branch_id);
      where += ` AND c.branch_id = $${params.length}`;
    }

    if (team_id && team_id !== 'all') {
      params.push(team_id);
      where += ` AND c.team_id = $${params.length}`;
    }

    if (created_by && created_by !== 'all') {
      params.push(created_by);
      where += ` AND c.created_by = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
    }

    const countResult = await query(`SELECT COUNT(*) FROM clients c WHERE ${where}`, params);
    
    params.push(Number(limit), offset);
    const result = await query(
      `SELECT c.*, p.full_name as created_by_name
       FROM clients c
       LEFT JOIN profiles p ON p.id = c.created_by
       WHERE ${where}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      clients: result.rows,
      total: Number(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// ─── GET /search — autocomplete search ────────────────────────────────
router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { q } = req.query;
    if (!q || String(q).length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;
    const result = await query(
      `SELECT id, full_name, phone, status
       FROM clients
       WHERE company_id = $1::uuid
         AND (full_name ILIKE $2 OR phone ILIKE $2)
       ORDER BY full_name
       LIMIT 10`,
      [user.company_id, searchTerm]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({ error: 'Failed to search clients' });
  }
});

// ─── Client Access Restrictions (before /:id to avoid route conflict) ──

// GET /access/check — check if current user is restricted
router.get('/access/check', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await query(
      `SELECT id FROM client_access_restrictions WHERE user_id = $1 AND company_id = $2::uuid`,
      [user.id, user.company_id]
    );

    res.json({ restricted: result.rows.length > 0 });
  } catch (error) {
    console.error('Error checking access:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

// GET /access/restrictions — list restrictions (for managers)
router.get('/access/restrictions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const accessLevel = Number(user.access_level || 0);

    console.log('[restrictions] user:', { id: user.id, access_level: accessLevel, company_id: user.company_id, branch_id: user.branch_id, team_id: user.team_id });

    if (accessLevel < 50) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    let result;
    if (accessLevel >= 100) {
      // Director sees all restrictions in company
      result = await query(
        `SELECT r.*, p.full_name as user_name, p.branch_id, p.team_id,
                rb.full_name as restricted_by_name
         FROM client_access_restrictions r
         JOIN profiles p ON p.id = r.user_id
         JOIN profiles rb ON rb.id = r.restricted_by
         WHERE r.company_id = $1::uuid`,
        [user.company_id]
      );
    } else if (accessLevel >= 90) {
      // Commercial director sees restrictions for their branch
      result = await query(
        `SELECT r.*, p.full_name as user_name, p.branch_id, p.team_id,
                rb.full_name as restricted_by_name
         FROM client_access_restrictions r
         JOIN profiles p ON p.id = r.user_id
         JOIN profiles rb ON rb.id = r.restricted_by
         WHERE r.company_id = $1::uuid
           AND p.branch_id = $2`,
        [user.company_id, user.branch_id]
      );
    } else {
      // МОП/РОП sees only their team
      result = await query(
        `SELECT r.*, p.full_name as user_name, p.branch_id, p.team_id,
                rb.full_name as restricted_by_name
         FROM client_access_restrictions r
         JOIN profiles p ON p.id = r.user_id
         JOIN profiles rb ON rb.id = r.restricted_by
         WHERE r.company_id = $1::uuid
           AND p.team_id = $2`,
        [user.company_id, user.team_id]
      );
    }

    console.log('[restrictions] result rows:', result.rows.length, result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching restrictions:', error);
    res.status(500).json({ error: 'Failed to fetch restrictions' });
  }
});

// POST /access/restrict/:userId — restrict user
router.post('/access/restrict/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const accessLevel = Number(user.access_level || 0);
    const targetUserId = req.params.userId;

    if (accessLevel < 50) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    // Verify target user is in scope
    const target = await query(
      `SELECT id, team_id, branch_id FROM profiles WHERE id = $1 AND company_id = $2`,
      [targetUserId, user.company_id]
    );
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });

    const t = target.rows[0];

    // МОП/РОП can only restrict their own team members
    if (accessLevel < 90 && t.team_id !== user.team_id) {
      return res.status(403).json({ error: 'Можно ограничить только сотрудников своей команды' });
    }

    // Commercial director can restrict within their branch
    if (accessLevel >= 90 && accessLevel < 100 && t.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Можно ограничить только сотрудников своего филиала' });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO client_access_restrictions (id, user_id, restricted_by, company_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [id, targetUserId, user.id, user.company_id]
    );

    // Notify the target user in real-time
    sendToUser(targetUserId, { type: 'client-access-changed', restricted: true });

    res.json({ success: true });
  } catch (error) {
    console.error('Error restricting access:', error);
    res.status(500).json({ error: 'Failed to restrict access' });
  }
});

// DELETE /access/restrict/:userId — remove restriction
router.delete('/access/restrict/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const accessLevel = Number(user.access_level || 0);

    if (accessLevel < 50) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    await query(
      `DELETE FROM client_access_restrictions WHERE user_id = $1 AND company_id = $2`,
      [req.params.userId, user.company_id]
    );

    // Notify the target user in real-time
    sendToUser(req.params.userId, { type: 'client-access-changed', restricted: false });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing restriction:', error);
    res.status(500).json({ error: 'Failed to remove restriction' });
  }
});

// ─── GET /:id — single client ─────────────────────────────────────────
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await query(
      `SELECT c.*, p.full_name as created_by_name
       FROM clients c
       LEFT JOIN profiles p ON p.id = c.created_by
       WHERE c.id = $1 AND c.company_id = $2`,
      [req.params.id, user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    
    // Get linked properties
    const properties = await query(
      `SELECT id, category, city, address, price, status FROM properties WHERE client_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], properties: properties.rows });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// ─── POST / — create client ───────────────────────────────────────────
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { full_name, phone, birthday, comment, status } = req.body;

    if (!full_name?.trim()) {
      return res.status(400).json({ error: 'ФИО обязательно' });
    }
    if (!phone?.trim()) {
      return res.status(400).json({ error: 'Телефон обязателен' });
    }

    const id = uuidv4();
    const result = await query(
      `INSERT INTO clients (id, company_id, full_name, phone, birthday, comment, status, created_by, branch_id, team_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, user.company_id, full_name.trim(), phone || null, birthday || null, comment || null, status || 'new', user.id, user.branch_id || null, user.team_id || null]
    );

    await logAudit(req, 'CREATE', 'client', result.rows[0].id, { name: result.rows[0].full_name || '' });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// ─── PUT /:id — update client ─────────────────────────────────────────
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { full_name, phone, birthday, comment, status } = req.body;

    const result = await query(
      `UPDATE clients
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           birthday = COALESCE($3, birthday),
           comment = COALESCE($4, comment),
           status = COALESCE($5, status),
           updated_at = NOW()
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [full_name, phone, birthday, comment, status, req.params.id, user.company_id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    await logAudit(req, 'UPDATE', 'client', req.params.id, { name: result.rows[0].full_name || '', ...req.body });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    // Only managers+ can delete
    if (Number(user.access_level) < 50) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    // Unlink properties first
    await query(`UPDATE properties SET client_id = NULL WHERE client_id = $1`, [req.params.id]);
    
    const result = await query(
      `DELETE FROM clients WHERE id = $1 AND company_id = $2 RETURNING id, full_name`,
      [req.params.id, user.company_id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    await logAudit(req, 'DELETE', 'client', req.params.id, { name: result.rows[0]?.full_name || '' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
