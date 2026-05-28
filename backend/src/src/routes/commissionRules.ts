import express, { Request, Response } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import CommissionRule from '../models/CommissionRule';

const router = express.Router();

// Create commission rule
router.post('/', authenticateToken, requireAccessLevel(90), [
  body('document_type').optional().trim(),
  body('property_type').optional().trim(),
  body('agent_percent_default').optional().isFloat({ min: 0, max: 100 }).withMessage('agent_percent_default must be between 0 and 100'),
  body('rop_percent_default').optional().isFloat({ min: 0, max: 100 }).withMessage('rop_percent_default must be between 0 and 100')
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const rule = await CommissionRule.create(req.body);
    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating commission rule:', error);
    res.status(500).json({ error: { message: 'Failed to create commission rule' } });
  }
});

// Get all commission rules
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;
    const filters = {
      is_active: req.query.is_active !== undefined
        ? req.query.is_active === 'true'
        : undefined
    };

    const result = await CommissionRule.list(filters, { limit, cursor });
    res.json(result);
  } catch (error) {
    console.error('Error fetching commission rules:', error);
    res.status(500).json({ error: { message: 'Failed to fetch commission rules' } });
  }
});

// Update commission rule
router.put('/:id', authenticateToken, requireAccessLevel(90), [
  body('document_type').optional().trim(),
  body('property_type').optional().trim(),
  body('agent_percent_default').optional().isFloat({ min: 0, max: 100 }).withMessage('agent_percent_default must be between 0 and 100'),
  body('rop_percent_default').optional().isFloat({ min: 0, max: 100 }).withMessage('rop_percent_default must be between 0 and 100'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean')
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const rule = await CommissionRule.update(req.params.id as string, req.body);

    if (!rule) {
      res.status(404).json({ error: { message: 'Commission rule not found' } });
      return;
    }

    res.json(rule);
  } catch (error) {
    console.error('Error updating commission rule:', error);
    res.status(500).json({ error: { message: 'Failed to update commission rule' } });
  }
});

// Delete commission rule
router.delete('/:id', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
  try {
    const rule = await CommissionRule.delete(req.params.id as string);

    if (!rule) {
      res.status(404).json({ error: { message: 'Commission rule not found' } });
      return;
    }

    res.json({ message: 'Commission rule deleted successfully', rule });
  } catch (error) {
    console.error('Error deleting commission rule:', error);
    res.status(500).json({ error: { message: 'Failed to delete commission rule' } });
  }
});

// Match commission rule
router.post('/match', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { document_type, property_type } = req.body;

    const rule = await CommissionRule.matchRule(document_type, property_type);
    res.json(rule);
  } catch (error) {
    console.error('Error matching commission rule:', error);
    res.status(500).json({ error: { message: 'Failed to match commission rule' } });
  }
});

export default router;
