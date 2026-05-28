import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;

// Helper: Auto checkout past/missed shifts
const autoCheckoutMissed = async (): Promise<void> => {
    try {
        const missed = await query('SELECT id, date FROM attendance WHERE check_out IS NULL');
        if (missed.rows.length === 0) return;

        const now = new Date();
        const moscowHour = now.getUTCHours() + 3;
        const currentDate = now.toISOString().split('T')[0];

        for (const row of missed.rows) {
            // Если дата смены в прошлом ИЛИ сегодня, но время уже больше/равно 18:00 МСК
            if (row.date < currentDate || (row.date === currentDate && moscowHour >= 18)) {
                const autoCheckOutTime = new Date(row.date + 'T18:00:00+03:00').toISOString();
                await query('UPDATE attendance SET check_out = $1 WHERE id = $2', [autoCheckOutTime, row.id]);
            }
        }
    } catch (e) {
        console.error('Auto-checkout error:', e);
    }
};

// Get attendance records
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        await autoCheckoutMissed(); // Run auto checkout on load

        const { user } = req;
        const { start_date, end_date, user_id } = req.query;
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;

        let queryText = `
      SELECT
        a.id, a.user_id, a.check_in, a.check_out, a.date, a.is_in_fields,
        a.created_at, a.updated_at,
        p.full_name as user_name,
        p.avatar_url,
        p.branch_id
      FROM attendance a
      LEFT JOIN profiles p ON a.user_id = p.id
    `;

        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        const isManagement = ['admin', 'director', 'manager'].includes(user!.role);
        const isBranchRestricted = ['head_sales', 'sales_manager'].includes(user!.role);

        // Find teams led by this user
        const ledTeamsResult = await query('SELECT id FROM teams WHERE leader_id = $1', [user!.id]);
        const ledTeamIds = ledTeamsResult.rows.map((t: any) => t.id);
        const isTeamLeader = ledTeamIds.length > 0;

        if (isManagement) {
            // Full access, filter by user_id if provided
            if (user_id) {
                conditions.push(`a.user_id = $${paramIndex}`);
                params.push(user_id);
                paramIndex++;
            }
        } else if (isBranchRestricted && user!.branch_id) {
            conditions.push(`p.branch_id = $${paramIndex}`);
            params.push(user!.branch_id);
            paramIndex++;
            if (user_id) {
                conditions.push(`a.user_id = $${paramIndex}`);
                params.push(user_id);
                paramIndex++;
            }
        } else if (isTeamLeader) {
            // Team leaders can see their team members or themselves
            if (user_id) {
                // If specific user_id requested, check if it's them or someone they lead
                const targetEmp = await query('SELECT team_id FROM profiles WHERE id = $1', [user_id]);
                const targetTeamId = targetEmp.rows[0]?.team_id;

                if (user_id === user!.id || ledTeamIds.includes(targetTeamId)) {
                    conditions.push(`a.user_id = $${paramIndex}`);
                    params.push(user_id);
                    paramIndex++;
                } else {
                    res.status(403).json({ error: { message: 'Access denied' } });
                    return;
                }
            } else {
                // Return all members of teams they lead + themselves
                const placeHolders = ledTeamIds.map((_: any, i: number) => `$${paramIndex + i}`).join(',');
                conditions.push(`(p.team_id IN (${placeHolders}) OR a.user_id = $${paramIndex + ledTeamIds.length})`);
                ledTeamIds.forEach((id: string) => {
                    params.push(id);
                    paramIndex++;
                });
                params.push(user!.id);
                paramIndex++;
            }
        } else if (user!.role === 'realtor') {
            conditions.push(`a.user_id = $${paramIndex}`);
            params.push(user!.id);
            paramIndex++;
        }

        if (start_date) {
            conditions.push(`a.date >= $${paramIndex}`);
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            conditions.push(`a.date <= $${paramIndex}`);
            params.push(end_date);
            paramIndex++;
        }

        if (cursor) {
            conditions.push(`a.created_at < $${paramIndex}`);
            params.push(cursor);
            paramIndex++;
        }

        if (conditions.length > 0) {
            queryText += ' WHERE ' + conditions.join(' AND ');
        }

        queryText += ` ORDER BY a.created_at DESC LIMIT $${paramIndex}`;
        params.push(limit + 1);

        const result = await query(queryText, params);

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
    } catch (error: any) {
        console.error('Get attendance error:', error);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

// Create attendance record manually (Manager+)
router.post('/',
    authenticateToken,
    requireAccessLevel(30),
    [
        body('user_id').notEmpty(),
        body('date').isISO8601(),
        body('check_in').optional().isISO8601(),
        body('check_out').optional().isISO8601(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { user_id, date, check_in, check_out } = req.body;
            const { role, branch_id: userBranchId, id: userId } = req.user!;

            // Security Check
            const isGlobal = ['admin', 'director'].includes(role);
            const isBranchManager = ['head_sales', 'sales_manager', 'manager'].includes(role);

            if (!isGlobal) {
                // Find target employee's branch and team
                const targetProfile = await query('SELECT branch_id, team_id FROM profiles WHERE id = $1', [user_id]);
                if (targetProfile.rows.length === 0) {
                    res.status(404).json({ error: { message: 'Employee not found' } });
                    return;
                }

                const emp = targetProfile.rows[0];

                if (isBranchManager) {
                    if (emp.branch_id !== userBranchId) {
                        res.status(403).json({ error: { message: 'Вы не можете создавать записи для другого филиала' } });
                        return;
                    }
                } else {
                    // Realtor role - must be team leader
                    const ledTeam = await query('SELECT id FROM teams WHERE leader_id = $1 AND id = $2', [userId, emp.team_id]);
                    if (ledTeam.rows.length === 0 && userId !== user_id) {
                        res.status(403).json({ error: { message: 'Недостаточно прав для создания записи' } });
                        return;
                    }
                }
            }

            const id = uuidv4();
            const now = new Date().toISOString();

            await query(
                'INSERT INTO attendance (id, user_id, date, check_in, check_out, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [id, user_id, date, check_in, check_out, now, now]
            );

            const result = await query(
                `SELECT
          a.*, p.full_name as user_name
        FROM attendance a
        LEFT JOIN profiles p ON a.user_id = p.id
        WHERE a.id = $1`,
                [id]
            );

            res.status(201).json(result.rows[0]);
        } catch (error: any) {
            console.error('Create attendance error:', error);
            res.status(500).json({ error: { message: 'Server error', details: error.message } });
        }
    }
);

// Update attendance record
router.patch('/:id',
    authenticateToken,
    [
        body('check_in').optional().isISO8601(),
        body('check_out').optional().custom((value) => {
            if (value && isNaN(Date.parse(value))) throw new Error('Invalid date');
            return true;
        }),
        body('is_in_fields').optional().isBoolean(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { id } = req.params;
            const { check_in, check_out, is_in_fields } = req.body;
            const { role, branch_id: userBranchId, id: userId, access_level: userAccessLevel } = req.user!;

            console.log('[ATTENDANCE PATCH] Debug:', {
                attendanceId: id,
                jwtUserId: userId,
                userRole: role,
                userAccessLevel,
                body: { check_in, check_out, is_in_fields }
            });

            // Security Check based on access level
            const isGlobal = ['admin', 'director'].includes(role);
            const isBranchManager = ['head_sales', 'sales_manager', 'manager'].includes(role) || (userAccessLevel >= 50 && userAccessLevel < 90);

            if (!isGlobal) {
                // Find target employee's branch and team
                const record = await query(`
                    SELECT p.branch_id, p.team_id, a.user_id
                    FROM attendance a
                    JOIN profiles p ON a.user_id = p.id
                    WHERE a.id = $1
                `, [id]);

                if (record.rows.length === 0) {
                    console.log('[ATTENDANCE PATCH] Record not found:', id);
                    res.status(404).json({ error: { message: 'Record not found' } });
                    return;
                }

                const emp = record.rows[0];

                console.log('[ATTENDANCE PATCH] Record found:', {
                    empUserId: emp.user_id,
                    empTeamId: emp.team_id,
                    empBranchId: emp.branch_id,
                    isBranchManager,
                    ledTeamCheck: userId === emp.user_id
                });

                if (isBranchManager) {
                    // MOP/ROP/head_sales can edit anyone in their branch
                    if (emp.branch_id !== userBranchId) {
                        res.status(403).json({ error: { message: 'Вы не можете редактировать посещаемость сотрудников другого филиала' } });
                        return;
                    }
                } else {
                    // Realtor role - must be team leader OR self
                    const ledTeam = await query('SELECT id FROM teams WHERE leader_id = $1 AND id = $2', [userId, emp.team_id]);
                    if (ledTeam.rows.length === 0 && userId !== emp.user_id) {
                        res.status(403).json({ error: { message: 'Недостаточно прав для редактирования' } });
                        return;
                    }
                }
            }

            // Build update query
            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (check_in !== undefined) {
                updates.push(`check_in = $${paramIndex}`);
                params.push(check_in);
                paramIndex++;
            }

            if (check_out !== undefined) {
                updates.push(`check_out = $${paramIndex}`);
                params.push(check_out);
                paramIndex++;
            }

            if (is_in_fields !== undefined) {
                updates.push(`is_in_fields = $${paramIndex}`);
                params.push(is_in_fields ? 1 : 0);
                paramIndex++;
            }

            if (updates.length > 0) {
                const now = new Date().toISOString();
                updates.push(`updated_at = $${paramIndex}`);
                params.push(now);
                paramIndex++;

                params.push(id);
                const queryText = `UPDATE attendance SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
                await query(queryText, params);
            }

            const result = await query(
                `SELECT
                  a.*, p.full_name as user_name
                FROM attendance a
                LEFT JOIN profiles p ON a.user_id = p.id
                WHERE a.id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                res.status(404).json({ error: { message: 'Record not found' } });
                return;
            }

            res.json(result.rows[0]);

        } catch (error: any) {
            console.error('Update attendance error:', error);
            res.status(500).json({ error: { message: 'Server error', details: error.message } });
        }
    }
);

// Check in
router.post('/check-in',
    authenticateToken,
    [
        body('date').optional().isISO8601(),
    ],
    async (req: Request, res: Response): Promise<void> => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
                return;
            }

            const { user } = req;
            const date = req.body.date || new Date().toISOString().split('T')[0];

            // Check if already checked in today
            const existing = await query(
                'SELECT id, check_out FROM attendance WHERE user_id = $1 AND date = $2',
                [user!.id, date]
            );

            if (existing.rows.length > 0 && !existing.rows[0].check_out) {
                res.status(400).json({ error: { message: 'Already checked in' } });
                return;
            }

            const id = uuidv4();
            const checkIn = new Date().toISOString();

            await query(
                'INSERT INTO attendance (id, user_id, check_in, date) VALUES ($1, $2, $3, $4)',
                [id, user!.id, checkIn, date]
            );

            const result = await query(
                `SELECT
          a.*, p.full_name as user_name
        FROM attendance a
        LEFT JOIN profiles p ON a.user_id = p.id
        WHERE a.id = $1`,
                [id]
            );

            res.status(201).json(result.rows[0]);
        } catch (error: any) {
            console.error('Check in error:', error);
            res.status(500).json({ error: { message: 'Server error', details: error.message } });
        }
    }
);

// Check out
router.post('/check-out',
    authenticateToken,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { user } = req;
            const date = new Date().toISOString().split('T')[0];

            // Find today's check-in
            const existing = await query(
                'SELECT id, check_in, check_out FROM attendance WHERE user_id = $1 AND date = $2 ORDER BY check_in DESC LIMIT 1',
                [user!.id, date]
            );

            if (existing.rows.length === 0) {
                res.status(400).json({ error: { message: 'No check-in found for today' } });
                return;
            }

            const record = existing.rows[0];

            if (record.check_out) {
                res.status(400).json({ error: { message: 'Already checked out' } });
                return;
            }

            const checkOut = new Date().toISOString();

            await query(
                `UPDATE attendance SET check_out = $1, updated_at = ${isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')"} WHERE id = $2`,
                [checkOut, record.id]
            );

            const result = await query(
                `SELECT
          a.*, p.full_name as user_name
        FROM attendance a
        LEFT JOIN profiles p ON a.user_id = p.id
        WHERE a.id = $1`,
                [record.id]
            );

            res.json(result.rows[0]);
        } catch (error: any) {
            console.error('Check out error:', error);
            res.status(500).json({ error: { message: 'Server error', details: error.message } });
        }
    }
);

// Get today's status
router.get('/today', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        await autoCheckoutMissed();

        const { user } = req;
        const date = new Date().toISOString().split('T')[0];

        const result = await query(
            `SELECT
        a.*, p.full_name as user_name
      FROM attendance a
      LEFT JOIN profiles p ON a.user_id = p.id
      WHERE a.user_id = $1 AND a.date = $2
      ORDER BY a.check_in DESC
      LIMIT 1`,
            [user!.id, date]
        );

        if (result.rows.length === 0) {
            res.json({ checked_in: false });
            return;
        }

        const record = result.rows[0];
        res.json({
            checked_in: !record.check_out,
            record: record,
        });
    } catch (error: any) {
        console.error('Get today status error:', error);
        res.status(500).json({ error: { message: 'Server error', details: error.message } });
    }
});

export default router;
