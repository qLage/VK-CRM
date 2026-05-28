import express, { Request, Response } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import DealDocument from '../models/DealDocument';
import DealActivity from '../models/DealActivity';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Upload document to deal
router.post('/', authenticateToken, requireAccessLevel(50), [
  body('deal_id').isUUID().withMessage('Valid deal_id is required'),
  body('file_name').trim().notEmpty().withMessage('File name is required'),
  body('file_type').optional().trim().isString(),
  body('file_size').optional().isInt({ min: 0 }),
  body('file_url').optional().isURL()
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const document = await DealDocument.create(req.body);

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: document.deal_id,
        activity_type: 'document_uploaded',
        description: `Document uploaded: ${document.file_name}`,
        performed_by: req.user.id,
        metadata: { document_id: document.id }
      });
    }

    await logAudit(req, 'CREATE', 'document', document.id, { name: document.file_name || '' });
    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: { message: 'Failed to upload document' } });
  }
});

// Get documents by deal ID
router.get('/deal/:dealId', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const documents = await DealDocument.findByDealId(req.params.dealId as string);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: { message: 'Failed to fetch documents' } });
  }
});

// Get document by ID
router.get('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const document = await DealDocument.findById(req.params.id as string);

    if (!document) {
      res.status(404).json({ error: { message: 'Document not found' } });
      return;
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: { message: 'Failed to fetch document' } });
  }
});

// Update document metadata
router.put('/:id', authenticateToken, requireAccessLevel(50), [
  body('file_name').optional().trim().notEmpty(),
  body('file_type').optional().trim().isString(),
  body('file_size').optional().isInt({ min: 0 })
], async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    return;
  }

  try {
    const document = await DealDocument.update(req.params.id as string, req.body);

    if (!document) {
      res.status(404).json({ error: { message: 'Document not found' } });
      return;
    }

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: document.deal_id,
        activity_type: 'document_updated',
        description: `Document updated: ${document.file_name}`,
        performed_by: req.user.id,
        metadata: { document_id: document.id }
      });
    }

    await logAudit(req, 'UPDATE', 'document', document.id, { name: document.file_name || '', ...req.body });
    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: { message: 'Failed to update document' } });
  }
});

// Delete document
router.delete('/:id', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const document = await DealDocument.delete(req.params.id as string);

    if (!document) {
      res.status(404).json({ error: { message: 'Document not found' } });
      return;
    }

    // Log activity
    if (req.user) {
      await DealActivity.create({
        deal_id: document.deal_id,
        activity_type: 'document_deleted',
        description: `Document deleted: ${document.file_name}`,
        performed_by: req.user.id,
        metadata: { document_id: document.id }
      });
    }

    await logAudit(req, 'DELETE', 'document', document.id, { name: document.file_name || '' });
    res.json({ message: 'Document deleted successfully', document });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: { message: 'Failed to delete document' } });
  }
});

// Get documents by type
router.get('/deal/:dealId/type/:type', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const documents = await DealDocument.findByType(
      req.params.dealId as string,
      req.params.type as string
    );
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents by type:', error);
    res.status(500).json({ error: { message: 'Failed to fetch documents' } });
  }
});

export default router;
