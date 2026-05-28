import express, { Request, Response } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import DealActivity from '../models/DealActivity';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Create activity (manual logging)
router.post('/', authenticateToken, requireAccessLevel(50), [
  body('deal_id').isUUID().withMessage('Valid deal_id is required'),
  body('activity_type').trim().notEmpty().withMessage('Activity type is required'),
  body('description').optional().trim().isString(),
  body('performed_by').optional().isUUID(),
  body('metadata').optional().isObject()
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const activity = await DealActivity.create(req.body);
  await logAudit(req, 'CREATE', 'activity', activity.id, { name: activity.activity_type || activity.description || '' });
  res.status(201).json(activity);
}));

// Get activities by deal ID
router.get('/deal/:dealId', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const options = {
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0
  };

  const activities = await DealActivity.findByDealId(req.params.dealId as string, options);
  res.json(activities);
}));

// Get activity by ID
router.get('/:id', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const activity = await DealActivity.findById(req.params.id as string);

  if (!activity) {
    throw new AppError('Activity not found', 404, 'ACTIVITY_NOT_FOUND');
  }

  res.json(activity);
}));

// Get activities by type
router.get('/deal/:dealId/type/:type', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const activities = await DealActivity.findByType(
    req.params.dealId as string,
    req.params.type as string
  );
  res.json(activities);
}));

// Get activity summary for deal
router.get('/deal/:dealId/summary', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const summary = await DealActivity.getActivitySummary(req.params.dealId as string);
  res.json(summary);
}));

// Get activities by date range
router.get('/reports/date-range', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date, activity_type, performed_by } = req.query;

  if (!start_date || !end_date) {
    throw new AppError('start_date and end_date are required', 400, 'VALIDATION_ERROR');
  }

  const filters = {
    activity_type: activity_type as string | undefined,
    performed_by: performed_by ? parseInt(performed_by as string) : undefined
  };

  const activities = await DealActivity.findByDateRange(start_date as string, end_date as string, filters);
  res.json(activities);
}));

// Delete activity
router.delete('/:id', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const activity = await DealActivity.delete(req.params.id as string);

  if (!activity) {
    throw new AppError('Activity not found', 404, 'ACTIVITY_NOT_FOUND');
  }

  await logAudit(req, 'DELETE', 'activity', activity.id, { name: activity.activity_type || activity.description || '' });
  res.json({ message: 'Activity deleted successfully', activity });
}));

export default router;
