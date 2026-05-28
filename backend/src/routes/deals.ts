import express, { Request, Response } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import Deal from '../models/Deal';
import DealParticipant from '../models/DealParticipant';
import DealActivity from '../models/DealActivity';
import { query } from '../db';

const router = express.Router();

// Create new deal
router.post('/', authenticateToken, [
  body('property_address').trim().notEmpty().withMessage('Property address is required'),
  body('status').optional().isIn(['pending', 'active', 'closed', 'cancelled']),
  body('document_type').optional().isString(),
  body('agent_id').optional().isUUID()
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const deal = await Deal.create(req.body);

  // Log activity
  if (req.user) {
    await DealActivity.create({
      deal_id: deal.id,
      activity_type: 'deal_created',
      description: `Deal created for ${deal.property_object || 'property'}`,
      performed_by: req.user.id
    });
  }

  res.status(201).json(deal);
}));

// Get all deals with filters
router.get('/', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const limit = parseInt(req.query.limit as string) || 50;
  const cursor = req.query.cursor as string | undefined;
  const teamId = req.query.teamId as string | undefined;
  const filters: any = {
    status: req.query.status as string | undefined,
    document_type: req.query.document_type as string | undefined,
    agent_id: req.query.agent_id as string | undefined
  };

  const userAccessLevel = Number(req.user!.access_level || 0);
  const userId = req.user!.id;
  const userTeamId = req.user!.team_id;

  // Team filter takes priority for non-management users
  if (teamId === 'true' && userTeamId) {
    // Team filter active - show team deals
    filters.team_id = userTeamId;
  } else if (userAccessLevel < 50) {
    // Employee without team filter - show own deals only
    filters.employee_id = userId;
  }

  // Use cursor-based pagination if cursor provided
  if (cursor) {
    const { query: dbQuery } = require('../db');

    let sql = `SELECT d.* FROM deals d`;
    const params: any[] = [cursor];
    let paramIndex = 2;

    // Add team filter with JOIN
    if (filters.team_id) {
      sql += ` INNER JOIN deal_participants dp ON d.id = dp.deal_id
               INNER JOIN profiles p ON dp.employee_id = p.id`;
    }

    sql += ` WHERE d.created_at < $1`;

    if (filters.status) {
      sql += ` AND d.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    if (filters.document_type) {
      sql += ` AND d.document_type = $${paramIndex}`;
      params.push(filters.document_type);
      paramIndex++;
    }
    if (filters.team_id) {
      sql += ` AND p.team_id = $${paramIndex}`;
      params.push(filters.team_id);
      paramIndex++;
    }

    sql += ` ORDER BY d.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await dbQuery(sql, params);

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
    return;
  }

  // Fall back to page-based pagination
  const page = parseInt(req.query.page as string) || 1;
  const deals = await Deal.list(filters, { page, limit });
  res.json(deals);
}));

// Get deal by ID
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const deal = await Deal.getById(req.params.id as string);

    if (!deal) {
      res.status(404).json({ error: { message: 'Deal not found' } });
      return;
    }

    res.json(deal);
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: { message: 'Failed to fetch deal' } });
  }
});

// Update deal
router.put('/:id', authenticateToken, [
  body('property_address').optional().trim().notEmpty(),
  body('status').optional().isIn(['pending', 'active', 'closed', 'cancelled']),
  body('document_type').optional().isString()
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const dealId = req.params.id as string;
  const userId = req.user!.id;
  const userAccessLevel = Number(req.user!.access_level || 0);

  // Check permission: Directors can edit all, team leads can edit team deals, employees only own deals
  if (userAccessLevel < 90) {
    // Not a director - check if user has permission to edit this deal
    const deal = await Deal.getById(dealId);
    if (!deal) {
      throw new AppError('Deal not found', 404, 'DEAL_NOT_FOUND');
    }

    // Team leads (50-89): Can edit if they are a participant in the deal
    if (userAccessLevel >= 50) {
      const participants = await DealParticipant.getByDeal(dealId);
      const isParticipant = participants.some(p => p.employee_id === userId);
      if (!isParticipant) {
        throw new AppError('Нет прав для редактирования этой сделки', 403, 'FORBIDDEN');
      }
    }
    // Employees (< 50): Can only edit their own deals (agent_id or created_by matches)
    else {
      const isOwner = deal.created_by === userId;
      if (!isOwner) {
        throw new AppError('Нет прав для редактирования этой сделки', 403, 'FORBIDDEN');
      }
    }
  }

  const updatedDeal = await Deal.update(dealId, req.body);

  if (!updatedDeal) {
    throw new AppError('Deal not found', 404, 'DEAL_NOT_FOUND');
  }

  // Log activity
  if (req.user) {
    await DealActivity.create({
      deal_id: updatedDeal.id,
      activity_type: 'deal_updated',
      description: 'Deal information updated',
      performed_by: req.user.id,
      metadata: req.body
    });
  }

  res.json(updatedDeal);
}));

// Delete deal
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const dealId = req.params.id as string;
    const userId = req.user!.id;
    const userAccessLevel = Number(req.user!.access_level || 0);

    // Check permission: Directors can delete all, team leads can delete team deals, employees only own deals
    if (userAccessLevel < 90) {
      // Not a director - check if user has permission to delete this deal
      const deal = await Deal.getById(dealId);
      if (!deal) {
        res.status(404).json({ error: { message: 'Deal not found' } });
        return;
      }

      // Team leads (50-89): Can delete if they are a participant in the deal
      if (userAccessLevel >= 50) {
        const participants = await DealParticipant.getByDeal(dealId);
        const isParticipant = participants.some(p => p.employee_id === userId);
        if (!isParticipant) {
          res.status(403).json({ error: { message: 'Нет прав для удаления этой сделки' } });
          return;
        }
      }
      // Employees (< 50): Can only delete their own deals (created_by matches)
      else {
        const isOwner = deal.created_by === userId;
        if (!isOwner) {
          res.status(403).json({ error: { message: 'Нет прав для удаления этой сделки' } });
          return;
        }
      }
    }

    await query(
      `DELETE FROM notifications
       WHERE entity_type = 'deal'
         AND entity_id = $1
         AND (company_id = $2 OR company_id IS NULL)`,
      [dealId, req.user!.company_id]
    );

    const deletedDeal = await Deal.delete(dealId);

    res.json({ message: 'Deal deleted successfully', deal: deletedDeal });
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(500).json({ error: { message: 'Failed to delete deal' } });
  }
});

// Get deal participants
router.get('/:id/participants', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const participants = await DealParticipant.getByDeal(req.params.id as string);
    res.json(participants);
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ error: { message: 'Failed to fetch participants' } });
  }
});

// Get deal activities
router.get('/:id/activities', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const options = {
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0
    };

    const activities = await DealActivity.findByDealId(req.params.id as string, options);
    res.json(activities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: { message: 'Failed to fetch activities' } });
  }
});

// Get deal financial summary
router.get('/:id/financial-summary', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const dealWithRelations = await Deal.getWithRelations(req.params.id as string);

    if (!dealWithRelations) {
      res.status(404).json({ error: { message: 'Deal not found' } });
      return;
    }

    res.json(dealWithRelations);
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: { message: 'Failed to fetch financial summary' } });
  }
});

export default router;
