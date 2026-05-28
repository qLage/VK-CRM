import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all teams (with branch and leader info)
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        const companyId = (req as any).user?.company_id;

        let sql = `
            SELECT t.*,
                   b.name as branch_name,
                   p.full_name as leader_name
            FROM teams t
            LEFT JOIN branches b ON t.branch_id = b.id
            LEFT JOIN profiles p ON t.leader_id = p.id
            WHERE t.company_id = $1
        `;

        const params: any[] = [companyId];
        if (cursor) {
            sql += ` AND t.created_at < $2`;
            params.push(cursor);
        }

        sql += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit + 1);

        const result = await query(sql, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        res.json({
            data: result.rows,
            nextCursor,
            hasNextPage
        });
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Get single team by ID
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const companyId = (req as any).user?.company_id;
        const result = await query(`
            SELECT t.*,
                   b.name as branch_name,
                   p.full_name as leader_name
            FROM teams t
            LEFT JOIN branches b ON t.branch_id = b.id
            LEFT JOIN profiles p ON t.leader_id = p.id
            WHERE t.id = $1 AND t.company_id = $2
        `, [id, companyId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: { message: 'Team not found' } });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching team:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Helper: автоматически назначить team_id руководителю и сбросить старому
async function syncLeaderTeam(teamId: string, newLeaderId: string | null, oldLeaderId: string | null): Promise<void> {
    try {
        // Сбрасываем team_id старому руководителю (если он изменился)
        if (oldLeaderId && oldLeaderId !== newLeaderId) {
            await query(
                'UPDATE profiles SET team_id = NULL WHERE id = $1 AND team_id = $2',
                [oldLeaderId, teamId]
            );
        }
        // Назначаем team_id новому руководителю
        if (newLeaderId) {
            await query(
                'UPDATE profiles SET team_id = $1 WHERE id = $2',
                [teamId, newLeaderId]
            );
        }
    } catch (err) {
        console.error('syncLeaderTeam error:', err);
    }
}

// Create team (Admin/Director/Commercial/ROP only)
router.post('/', authenticateToken, requireAccessLevel(50), [
    body('name').trim().notEmpty().withMessage('Team name is required'),
    body('branch_id').isUUID().withMessage('Valid branch_id is required'),
    body('leader_id').optional().isUUID().withMessage('leader_id must be a valid UUID')
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const { name, branch_id, leader_id } = req.body;
        const companyId = (req as any).user?.company_id;

        const leader = leader_id || null;
        const id = uuidv4();
        const now = new Date().toISOString();

        await query(
            'INSERT INTO teams (id, name, branch_id, leader_id, company_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [id, name, branch_id, leader, companyId, now, now]
        );

        // Автоматически добавляем лидера в эту команду
        await syncLeaderTeam(id, leader, null);

        res.status(201).json({ id, name, branch_id, leader_id: leader, created_at: now, updated_at: now });
    } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Update team
router.put('/:id', authenticateToken, requireAccessLevel(50), [
    body('name').optional().trim().notEmpty().withMessage('Team name cannot be empty'),
    body('branch_id').optional().isUUID().withMessage('branch_id must be a valid UUID'),
    body('leader_id').optional().isUUID().withMessage('leader_id must be a valid UUID')
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const id = req.params.id as string;
        const { name, branch_id, leader_id } = req.body;
        const now = new Date().toISOString();

        // Получаем текущего руководителя перед изменением
        const companyId = (req as any).user?.company_id;
        const oldTeam = await query('SELECT leader_id FROM teams WHERE id = $1 AND company_id = $2', [id, companyId]);
        const oldLeaderId = oldTeam.rows[0]?.leader_id || null;

        const result = await query(
            'UPDATE teams SET name = $1, branch_id = $2, leader_id = $3, updated_at = $4 WHERE id = $5 AND company_id = $6',
            [name, branch_id, leader_id || null, now, id, companyId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ error: { message: 'Team not found' } });
            return;
        }

        // Синхронизируем team_id для руководителя
        await syncLeaderTeam(id, leader_id || null, oldLeaderId);

        res.json({ id, name, branch_id, leader_id: leader_id || null, updated_at: now });
    } catch (error) {
        console.error('Error updating team:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Delete team
router.delete('/:id', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const companyId = (req as any).user?.company_id;

        // Сбрасываем team_id у всех участников при удалении команды
        await query('UPDATE profiles SET team_id = NULL WHERE team_id = $1', [id]);
        await query('DELETE FROM teams WHERE id = $1 AND company_id = $2', [id, companyId]);

        res.json({ message: 'Team deleted' });
    } catch (error) {
        console.error('Error deleting team:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

export default router;
