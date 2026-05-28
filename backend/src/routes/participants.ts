import express, { Request, Response } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import DealParticipant from '../models/DealParticipant';
import DealActivity from '../models/DealActivity';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Add participant to deal
router.post('/', authenticateToken, requireAccessLevel(50), [
  body('deal_id').isUUID().withMessage('Valid deal_id is required'),
  body('participant_type').trim().notEmpty().withMessage('Participant type is required'),
  body('participant_name').optional().trim().isString(),
  body('participant_email').optional().isEmail(),
  body('participant_phone').optional().trim().isString()
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const participant = await DealParticipant.create(req.body);

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: participant.deal_id,
        activity_type: 'participant_added',
        description: `Participant added: ${participant.role}`,
        performed_by: req.user.id,
        metadata: { participant_id: participant.id }
      });
    }

    await logAudit(req, 'CREATE', 'participant', participant.id, { name: participant.participant_name || participant.role || '' });
    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ error: { message: 'Failed to add participant' } });
  }
});

// Get participants by deal ID
router.get('/deal/:dealId', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const dealId = Array.isArray(req.params.dealId) ? req.params.dealId[0] : req.params.dealId;
    const participants = await DealParticipant.findByDealId(dealId);
    res.json(participants);
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ error: { message: 'Failed to fetch participants' } });
  }
});

// Get participant by ID
router.get('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const participant = await DealParticipant.findById(id);

    if (!participant) {
      res.status(404).json({ error: { message: 'Participant not found' } });
      return;
    }

    res.json(participant);
  } catch (error) {
    console.error('Error fetching participant:', error);
    res.status(500).json({ error: { message: 'Failed to fetch participant' } });
  }
});

// Update participant
router.put('/:id', authenticateToken, requireAccessLevel(50), [
  body('participant_type').optional().trim().notEmpty(),
  body('participant_name').optional().trim().isString(),
  body('participant_email').optional().isEmail(),
  body('participant_phone').optional().trim().isString()
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const participant = await DealParticipant.update(id, req.body);

    if (!participant) {
      res.status(404).json({ error: { message: 'Participant not found' } });
      return;
    }

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: participant.deal_id,
        activity_type: 'participant_updated',
        description: `Participant updated: ${participant.role}`,
        performed_by: req.user.id,
        metadata: { participant_id: participant.id }
      });
    }

    await logAudit(req, 'UPDATE', 'participant', participant.id, { name: participant.participant_name || participant.role || '', ...req.body });
    res.json(participant);
  } catch (error) {
    console.error('Error updating participant:', error);
    res.status(500).json({ error: { message: 'Failed to update participant' } });
  }
});

// Delete participant
router.delete('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const participant = await DealParticipant.delete(id);

    if (!participant) {
      res.status(404).json({ error: { message: 'Participant not found' } });
      return;
    }

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: participant.deal_id,
        activity_type: 'participant_removed',
        description: `Participant removed: ${participant.role}`,
        performed_by: req.user.id,
        metadata: { participant_id: participant.id }
      });
    }

    await logAudit(req, 'DELETE', 'participant', participant.id, { name: participant.participant_name || participant.role || '' });
    res.json({ message: 'Participant deleted successfully', participant });
  } catch (error) {
    console.error('Error deleting participant:', error);
    res.status(500).json({ error: { message: 'Failed to delete participant' } });
  }
});

// Get participants by type
router.get('/deal/:dealId/type/:type', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const dealId = Array.isArray(req.params.dealId) ? req.params.dealId[0] : req.params.dealId;
    const type = Array.isArray(req.params.type) ? req.params.type[0] : req.params.type;
    const participants = await DealParticipant.findByType(dealId, type);
    res.json(participants);
  } catch (error) {
    console.error('Error fetching participants by type:', error);
    res.status(500).json({ error: { message: 'Failed to fetch participants' } });
  }
});

export default router;
