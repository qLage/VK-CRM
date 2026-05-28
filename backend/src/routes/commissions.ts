import express, { Request, Response } from 'express';
import { authenticateToken, requireRole, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import DealCommission from '../models/DealCommission';
import CommissionRule from '../models/CommissionRule';
import DealActivity from '../models/DealActivity';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Create commission
router.post('/', authenticateToken, requireAccessLevel(50), [
  body('deal_id').isUUID().withMessage('Valid deal_id is required'),
  body('recipient_type').trim().notEmpty().withMessage('Recipient type is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('percentage').optional().isFloat({ min: 0, max: 100 })
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const commission = await DealCommission.create(req.body);

  // Log activity
  if (req.user) {
    await DealActivity.create({
      deal_id: commission.deal_id,
      activity_type: 'commission_created',
      description: `Commission created`,
      performed_by: req.user.id,
      metadata: { commission_id: commission.id }
    });
  }

  await logAudit(req, 'CREATE', 'commission', commission.id, { name: commission.recipient_type || '' });
  res.status(201).json(commission);
}));

// Get commissions by deal ID
router.get('/deal/:dealId', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const dealId = Array.isArray(req.params.dealId) ? req.params.dealId[0] : req.params.dealId;
  const commissions = await DealCommission.findByDealId(dealId);
  res.json(commissions);
}));

// Get commission by ID
router.get('/:id', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const commission = await DealCommission.findById(id);

  if (!commission) {
    throw new AppError('Commission not found', 404, 'COMMISSION_NOT_FOUND');
  }

  res.json(commission);
}));

// Update commission
router.put('/:id', authenticateToken, requireAccessLevel(50), [
  body('recipient_type').optional().trim().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('percentage').optional().isFloat({ min: 0, max: 100 })
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const commission = await DealCommission.update(id, req.body);

  if (!commission) {
    throw new AppError('Commission not found', 404, 'COMMISSION_NOT_FOUND');
  }

  // Log activity
  if (req.user) {
    await DealActivity.create({
      deal_id: commission.deal_id,
      activity_type: 'commission_updated',
      description: `Commission updated`,
      performed_by: req.user.id,
      metadata: { commission_id: commission.id }
    });
  }

  await logAudit(req, 'UPDATE', 'commission', commission.id, { name: commission.recipient_type || '', ...req.body });
  res.json(commission);
}));

// Delete commission
router.delete('/:id', authenticateToken, requireAccessLevel(50), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const commission = await DealCommission.delete(id);

  if (!commission) {
    throw new AppError('Commission not found', 404, 'COMMISSION_NOT_FOUND');
  }

  // Log activity
  if (req.user) {
    await DealActivity.create({
      deal_id: commission.deal_id,
      activity_type: 'commission_deleted',
      description: `Commission deleted`,
      performed_by: req.user.id,
      metadata: { commission_id: commission.id }
    });
  }

  await logAudit(req, 'DELETE', 'commission', commission.id, { name: commission.recipient_type || '' });
  res.json({ message: 'Commission deleted successfully', commission });
}));

// Calculate commissions for a deal
router.post('/calculate/:dealId', authenticateToken, requireRole(['admin', 'director', 'commercial', 'head_sales', 'sales_manager']), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { document_type, property_type, total_commission } = req.body;

  if (!total_commission) {
    throw new AppError('total_commission is required', 400, 'VALIDATION_ERROR');
  }

  // Match commission rule
  const rule = await CommissionRule.matchRule(document_type, property_type);

  const calculation = {
    total_commission: parseFloat(total_commission),
    agent_percent: rule.agent_percent_default,
    rop_percent: rule.rop_percent_default,
    agent_amount: (parseFloat(total_commission) * rule.agent_percent_default) / 100,
    rop_amount: (parseFloat(total_commission) * rule.rop_percent_default) / 100,
    rule_applied: rule.id || 'default'
  };

  res.json(calculation);
}));

// Get commission summary for deal
router.get('/deal/:dealId/summary', authenticateToken, requireRole(['admin', 'director', 'commercial', 'head_sales', 'sales_manager']), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const dealId = Array.isArray(req.params.dealId) ? req.params.dealId[0] : req.params.dealId;
  const summary = await DealCommission.getSummaryByDeal(dealId);
  res.json(summary);
}));

export default router;
