import express, { Request, Response } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import Payment from '../models/Payment';
import DealActivity from '../models/DealActivity';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Record new payment
router.post('/', authenticateToken, requireAccessLevel(50), [
  body('deal_id').isUUID().withMessage('Valid deal_id is required'),
  body('payment_type').trim().notEmpty().withMessage('Payment type is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('payment_method').optional().trim().isString(),
  body('payment_date').optional().isISO8601()
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const payment = await Payment.create(req.body);

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: payment.deal_id,
        activity_type: 'payment_recorded',
        description: `Payment recorded: ${payment.payment_type} - $${payment.amount}`,
        performed_by: req.user.id,
        metadata: { payment_id: payment.id }
      });
    }

    await logAudit(req, 'CREATE', 'payment', payment.id, { name: payment.payment_type || '' });
    res.status(201).json(payment);
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: { message: 'Failed to record payment' } });
  }
});

// Get payments by deal ID
router.get('/deal/:dealId', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const payments = await Payment.findByDealId(req.params.dealId as string);
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: { message: 'Failed to fetch payments' } });
  }
});

// Get payment by ID
router.get('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await Payment.findById(req.params.id as string);

    if (!payment) {
      res.status(404).json({ error: { message: 'Payment not found' } });
      return;
    }

    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: { message: 'Failed to fetch payment' } });
  }
});

// Update payment
router.put('/:id', authenticateToken, requireAccessLevel(50), [
  body('payment_type').optional().trim().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('payment_method').optional().trim().isString(),
  body('payment_date').optional().isISO8601()
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const payment = await Payment.update(req.params.id as string, req.body);

    if (!payment) {
      res.status(404).json({ error: { message: 'Payment not found' } });
      return;
    }

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: payment.deal_id,
        activity_type: 'payment_updated',
        description: `Payment updated: ${payment.payment_type} - $${payment.amount}`,
        performed_by: req.user.id,
        metadata: { payment_id: payment.id }
      });
    }

    await logAudit(req, 'UPDATE', 'payment', payment.id, { name: payment.payment_type || '', ...req.body });
    res.json(payment);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: { message: 'Failed to update payment' } });
  }
});

// Delete payment
router.delete('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await Payment.delete(req.params.id as string);

    if (!payment) {
      res.status(404).json({ error: { message: 'Payment not found' } });
      return;
    }

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: payment.deal_id,
        activity_type: 'payment_deleted',
        description: `Payment deleted: ${payment.payment_type} - $${payment.amount}`,
        performed_by: req.user.id,
        metadata: { payment_id: payment.id }
      });
    }

    await logAudit(req, 'DELETE', 'payment', payment.id, { name: payment.payment_type || '' });
    res.json({ message: 'Payment deleted successfully', payment });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: { message: 'Failed to delete payment' } });
  }
});

// Get payment totals by deal
router.get('/deal/:dealId/totals', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const totals = await Payment.getTotalByDeal(req.params.dealId as string);
    res.json(totals);
  } catch (error) {
    console.error('Error fetching payment totals:', error);
    res.status(500).json({ error: { message: 'Failed to fetch payment totals' } });
  }
});

// Get payments by date range
router.get('/reports/date-range', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, payment_type, payment_method } = req.query;

    if (!start_date || !end_date) {
      res.status(400).json({ error: { message: 'start_date and end_date are required' } });
      return;
    }

    const filters = {
      payment_type: payment_type as string | undefined,
      payment_method: payment_method as string | undefined
    };

    const payments = await Payment.findByDateRange(start_date as string, end_date as string, filters);
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments by date range:', error);
    res.status(500).json({ error: { message: 'Failed to fetch payments' } });
  }
});

export default router;
