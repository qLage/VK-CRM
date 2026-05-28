import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { SettingsService } from '../services/settings.service';

const router = express.Router();

// Get all settings
router.get('/', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
    try {
        const queryText = 'SELECT key, value FROM system_settings';
        const result = await query(queryText);

        const settings: Record<string, any> = {};
        result.rows.forEach((row: any) => {
            try {
                settings[row.key] = JSON.parse(row.value);
            } catch (e) {
                settings[row.key] = row.value;
            }
        });

        res.json(settings);
    } catch (error) {
        // If table doesn't exist, return empty object (handled by migration check usually)
        console.error('Error fetching settings:', error);
        res.json({});
    }
});

// Get performance benchmarks for rating calculation settings
router.get('/benchmarks', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
    try {
        const benchmarks = await SettingsService.getRatingBenchmarks();
        res.json(benchmarks);
    } catch (error) {
        console.error('Error fetching benchmarks:', error);
        res.status(500).json({ error: { message: 'Failed to calculate benchmarks' } });
    }
});

// Update individual setting (or create)
router.post('/', authenticateToken, [
    body('key').trim().notEmpty().withMessage('Setting key is required'),
    body('value').exists().withMessage('Setting value is required')
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const { key, value } = req.body;
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const now = new Date().toISOString();

        await query(
            `INSERT INTO system_settings (key, value, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
            [key, stringValue, now]
        );

        res.json({ success: true, key, value });
    } catch (error) {
        console.error('Error saving setting:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Delete a setting
router.delete('/:key', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
    try {
        const { key } = req.params;
        await query('DELETE FROM system_settings WHERE key = $1', [key]);
        res.json({ success: true, key });
    } catch (error) {
        console.error('Error deleting setting:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

export default router;
