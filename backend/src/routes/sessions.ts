import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// GET /api/sessions — list all sessions for current user
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const currentSessionId = req.user!.session_id;

    const result = await query(
      `SELECT id, device_name, browser, os, ip_address, last_active, created_at
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY last_active DESC`,
      [userId]
    );

    const sessions = result.rows.map(s => ({
      ...s,
      is_current: s.id === currentSessionId
    }));

    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: { message: 'Server error' } });
  }
});

// DELETE /api/sessions/:id — terminate a specific session
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const sessionId = req.params.id;
    const currentSessionId = req.user!.session_id;

    if (sessionId === currentSessionId) {
      res.status(400).json({ error: { message: 'Нельзя завершить текущую сессию' } });
      return;
    }

    await query(
      'DELETE FROM user_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: { message: 'Server error' } });
  }
});

// DELETE /api/sessions — terminate all other sessions
router.delete('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const currentSessionId = req.user!.session_id;

    await query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND id != $2',
      [userId, currentSessionId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete all sessions error:', error);
    res.status(500).json({ error: { message: 'Server error' } });
  }
});

export default router;
