import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import * as avitoService from '../services/avito.service';
import { query } from '../db';

const router = express.Router();

function requireDirector(req: Request, res: Response, next: Function) {
    if (Number(req.user!.access_level || 0) < 100) {
        res.status(403).json({ error: { message: 'Only directors can manage Avito integration' } });
        return;
    }
    next();
}

// GET /api/avito/credentials - return current config (without secret)
router.get('/credentials', authenticateToken, requireDirector, async (req: Request, res: Response): Promise<void> => {
    try {
        const creds = await avitoService.getCredentials(req.user!.company_id);
        if (!creds) {
            res.json({ configured: false });
            return;
        }
        // Ensure feed token exists
        const feedToken = await avitoService.ensureFeedToken(req.user!.company_id);
        const feedStats = await avitoService.getFeedStats(req.user!.company_id);

        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '127.0.0.1:5000';
        const baseUrl = `${proto}://${host}`;

        res.json({
            configured: true,
            client_id: creds.client_id,
            client_secret_masked: creds.client_secret ? '••••••••' + creds.client_secret.slice(-4) : null,
            user_id: creds.user_id,
            enabled: creds.enabled,
            last_sync_at: creds.last_sync_at,
            last_error: creds.last_error,
            token_expires_at: creds.token_expires_at,
            feed_url: `${baseUrl}/api/avito/feed.xml?token=${feedToken}`,
            total_in_feed: feedStats.total_in_feed,
        });
    } catch (error) {
        console.error('Avito credentials get error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// PUT /api/avito/credentials - save credentials
router.put('/credentials', authenticateToken, requireDirector, [
    body('client_id').isString().notEmpty(),
    body('client_secret').isString().notEmpty(),
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const { client_id, client_secret, user_id } = req.body;
        await avitoService.saveCredentials(req.user!.company_id, client_id, client_secret, user_id);
        res.json({ success: true });
    } catch (error) {
        console.error('Avito credentials save error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// DELETE /api/avito/credentials
router.delete('/credentials', authenticateToken, requireDirector, async (req: Request, res: Response): Promise<void> => {
    try {
        await avitoService.deleteCredentials(req.user!.company_id);
        res.json({ success: true });
    } catch (error) {
        console.error('Avito credentials delete error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// POST /api/avito/test - test the connection
router.post('/test', authenticateToken, requireDirector, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await avitoService.testConnection(req.user!.company_id);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── XML Feed ─────────────────────────────────────────────────────────────

/**
 * GET /api/avito/feed.xml?token=<feed_token>
 * Public endpoint — no auth required, authenticated by feed_token.
 * This URL is given to Avito "Загрузка по ссылке".
 */
router.get('/feed.xml', async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.query.token as string;
        if (!token) {
            res.status(401).send('Missing token');
            return;
        }

        const creds = await avitoService.getCredentialsByFeedToken(token);
        if (!creds) {
            res.status(403).send('Invalid token');
            return;
        }

        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '127.0.0.1:5000';
        const baseUrl = `${proto}://${host}`;

        const xml = await avitoService.generateFeedXml(creds.company_id, baseUrl);

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(xml);
    } catch (error: any) {
        console.error('Avito feed.xml error:', error);
        res.status(500).send('Internal server error');
    }
});

// POST /api/avito/publish/:propertyId - add property to XML feed
router.post('/publish/:propertyId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { propertyId } = req.params;
        const accessLevel = Number(req.user!.access_level || 0);

        if (accessLevel < 90) {
            res.status(403).json({ error: { message: 'Only directors/commercial can publish to Avito' } });
            return;
        }

        // Verify property belongs to company
        const propResult = await query(
            'SELECT * FROM properties WHERE id = $1 AND company_id = $2',
            [propertyId, req.user!.company_id]
        );
        if (propResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Property not found' } });
            return;
        }
        const prop = propResult.rows[0];

        if (!['approved', 'avito_approved', 'avito_pending', 'in_feed'].includes(prop.status)) {
            res.status(400).json({ error: { message: 'Property must be approved before publishing' } });
            return;
        }

        await avitoService.addToFeed(req.user!.company_id, propertyId);

        // Get feed URL for response
        const feedStats = await avitoService.getFeedStats(req.user!.company_id);

        res.json({
            success: true,
            message: 'Объект добавлен в XML-фид Avito. Avito загрузит его при следующем обновлении по расписанию.',
            total_in_feed: feedStats.total_in_feed,
            feed_url: feedStats.feed_url,
        });
    } catch (error: any) {
        console.error('Avito publish error:', error);
        res.status(500).json({ error: { message: error.message || 'Publish failed' } });
    }
});

// POST /api/avito/unpublish/:propertyId - remove property from XML feed
router.post('/unpublish/:propertyId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { propertyId } = req.params;
        const accessLevel = Number(req.user!.access_level || 0);

        if (accessLevel < 90) {
            res.status(403).json({ error: { message: 'Insufficient permissions' } });
            return;
        }

        await avitoService.removeFromFeed(req.user!.company_id, propertyId);
        res.json({ success: true, message: 'Объект удалён из XML-фида.' });
    } catch (error: any) {
        console.error('Avito unpublish error:', error);
        res.status(500).json({ error: { message: error.message || 'Unpublish failed' } });
    }
});

// GET /api/avito/feed-stats - get feed statistics
router.get('/feed-stats', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const stats = await avitoService.getFeedStats(req.user!.company_id);
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// POST /api/avito/sync - push XML feed to Avito via Autoload API v2
router.post('/sync', authenticateToken, requireDirector, async (req: Request, res: Response): Promise<void> => {
    try {
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '127.0.0.1:5000';
        const baseUrl = `${proto}://${host}`;

        const result = await avitoService.syncFeedToAvito(req.user!.company_id, baseUrl);
        if (result.success) {
            res.json({
                success: true,
                message: `XML-фид отправлен в Avito. Объявлений: ${result.items_count}`,
                items_count: result.items_count,
            });
        } else {
            res.status(502).json({
                success: false,
                message: 'Ошибка отправки в Avito',
                error: result.error,
                items_count: result.items_count,
            });
        }
    } catch (error: any) {
        console.error('Avito sync error:', error);
        res.status(500).json({ error: { message: error.message || 'Sync failed' } });
    }
});

// GET /api/avito/report - get last completed autoload report
router.get('/report', authenticateToken, requireDirector, async (req: Request, res: Response): Promise<void> => {
    try {
        const report = await avitoService.getLastReport(req.user!.company_id);
        res.json(report);
    } catch (error: any) {
        console.error('Avito report error:', error);
        res.status(500).json({ error: { message: error.message || 'Report fetch failed' } });
    }
});

// GET /api/avito/item-status/:propertyId - get item status on Avito
router.get('/item-status/:propertyId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { propertyId } = req.params;
        const status = await avitoService.getItemStatus(req.user!.company_id, propertyId);
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: { message: error.message || 'Status check failed' } });
    }
});

export default router;
