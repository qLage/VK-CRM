import express, { Request, Response } from 'express';
import AuditLogModel from '../models/AuditLog';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/logs',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const accessLevel = Number((req.user as any).access_level || 0);
      if (accessLevel < 90) {
        res.status(403).json({ error: { message: 'Доступ запрещен' } });
        return;
      }

      const filters = {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        user_id: req.query.user_id as string | undefined,
        action: req.query.action as string | undefined,
        entity_type: req.query.entity_type as string | undefined,
        entity_id: req.query.entity_id as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };

      const result = await AuditLogModel.list(filters);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: { message: 'Internal server error' } });
    }
  }
);

router.get('/actions',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const accessLevel = Number((req.user as any).access_level || 0);
      if (accessLevel < 90) {
        res.status(403).json({ error: { message: 'Доступ запрещен' } });
        return;
      }
      const actions = await AuditLogModel.getActions();
      res.json(actions);
    } catch (error: any) {
      console.error('Error fetching audit actions:', error);
      res.status(500).json({ error: { message: 'Internal server error' } });
    }
  }
);

router.get('/entity-types',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const accessLevel = Number((req.user as any).access_level || 0);
      if (accessLevel < 90) {
        res.status(403).json({ error: { message: 'Доступ запрещен' } });
        return;
      }
      const types = await AuditLogModel.getEntityTypes();
      res.json(types);
    } catch (error: any) {
      console.error('Error fetching audit entity types:', error);
      res.status(500).json({ error: { message: 'Internal server error' } });
    }
  }
);

export default router;
