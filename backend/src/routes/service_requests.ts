import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import * as notificationService from '../services/notificationService';
import websocketService from '../services/websocket.service';
import * as s3Service from '../services/s3.service';
import { logAudit } from '../utils/audit';

const router = express.Router();

// Get all requests (filtered by role and paginated)
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { role, id: userId, branch_id: userBranchId, team_id: userTeamId } = req.user!;
        const companyId = req.user!.company_id;
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchLevel = ['commercial', 'head_sales', 'sales_manager'].includes(role);
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;
        const teamId = req.query.teamId as string | undefined;

        let sql = `
            SELECT sr.*, p.full_name as author_name, ('/api/profiles/' || p.id || '/avatar') as author_avatar,
                   p.branch_id as branch_id, p.team_id as team_id,
                   p.branch_id as author_branch_id, p.team_id as author_team_id
            FROM service_requests sr
            LEFT JOIN profiles p ON sr.user_id = p.id
        `;

        const params: any[] = [];
        const whereClauses: string[] = [];

        // Add company_id filter for tenant isolation
        whereClauses.push(`sr.company_id = $${params.length + 1}`);
        params.push(companyId);

        // Role-based filtering with team filter support
        if (isGlobalManagement) {
            // No filter for management - see all within company
        } else if (teamId === 'true' && userTeamId) {
            // Team filter active - show ALL team requests (including own)
            whereClauses.push(`p.team_id = $${params.length + 1}`);
            params.push(userTeamId);
        } else if (isBranchLevel && userBranchId) {
            whereClauses.push(`p.branch_id = $${params.length + 1}`);
            params.push(userBranchId);
        } else {
            // Realtor sees only their own
            whereClauses.push(`sr.user_id = $${params.length + 1}`);
            params.push(userId);
        }

        if (cursor) {
            whereClauses.push(`sr.created_at < $${params.length + 1}`);
            params.push(cursor);
        }

        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }

        sql += ` ORDER BY sr.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit + 1);

        const result = await query(sql, params);

        let hasNextPage = false;
        if (result.rows.length > limit) {
            hasNextPage = true;
            result.rows.pop();
        }

        const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null;

        const requests = result.rows.map((row: any) => ({
            ...row,
            data: row.data ? JSON.parse(row.data) : null
        }));

        res.json({
            data: requests,
            nextCursor,
            hasNextPage
        });
    } catch (error) {
        console.error('Error fetching service requests:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Create request
router.post('/',
    authenticateToken,
    [
        body('type').notEmpty().withMessage('Type is required').isString(),
        body('title').optional().isString().isLength({ max: 255 }),
        body('description').optional().isString(),
        body('priority').optional().isIn(['low', 'normal', 'medium', 'high', 'urgent']),
        body('data').optional().isObject()
    ],
    async (req: Request, res: Response): Promise<void> => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
            return;
        }

        try {
            const { type, title, description, priority, data } = req.body;
            const id = uuidv4();
            const userId = req.user!.id;
            const companyId = req.user!.company_id;
            const dataJson = data ? JSON.stringify(data) : null;
            const now = new Date().toISOString();

            const result = await query(
                `INSERT INTO service_requests (id, user_id, type, title, description, priority, data, created_at, updated_at, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [id, userId, type, title, description, priority, dataJson, now, now, companyId]
            );

            if (result.rowCount === 0) {
                res.status(500).json({ error: { message: 'Failed to create service request' } });
                return;
            }

            await logAudit(req, 'CREATE', 'service_request', id, { name: title || '' });
            res.status(201).json({ success: true, id });
        } catch (error) {
            console.error('Error creating service request:', error);
            res.status(500).json({ error: { message: 'Internal server error' } });
        }
    });

// Update request
router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { type, title, description, priority, data } = req.body;
        const { role, id: userId, company_id: companyId, branch_id: userBranchId } = req.user!;
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);

        const existing = await query(
            `SELECT sr.*, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON p.id = sr.user_id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        if (existing.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }

        const sr = existing.rows[0];
        if (
            !isGlobalManagement &&
            !(
                isBranchManagement &&
                userBranchId &&
                String(sr.author_branch_id || '') === String(userBranchId)
            ) &&
            sr.user_id !== userId
        ) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }

        const dataJson = data ? JSON.stringify(data) : sr.data;
        const now = new Date().toISOString();

        let statusUpdate = '';
        if (sr.status === 'rejected') {
            statusUpdate = ", status = 'pending', rejection_reason = NULL";
        }

        await query(
            `UPDATE service_requests SET type=$1, title=$2, description=$3, priority=$4, data=$5, updated_at=$6${statusUpdate} WHERE id=$7`,
            [type || sr.type, title || sr.title, description || sr.description, priority || sr.priority, dataJson, now, id]
        );

        const changes: Record<string, any> = {};
        if (type !== undefined) changes.type = type;
        if (title !== undefined) changes.title = title;
        if (description !== undefined) changes.description = description;
        if (priority !== undefined) changes.priority = priority;
        if (data !== undefined) changes.data = data;
        await logAudit(req, 'UPDATE', 'service_request', id, { name: title || sr.title || '', ...changes }, sr);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating service request:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Update status
router.patch('/:id/status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { status, reason } = req.body;
        const { company_id: companyId, role, branch_id: userBranchId } = req.user!;
        const accessLevel = Number(req.user!.access_level || 0);

        // Position-based access: МОП/РОП (>=50) must be able to approve/reject service requests.
        if (accessLevel < 50) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }

        const srResult = await query(
            `SELECT sr.*, p.full_name as author_name, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON sr.user_id = p.id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        if (srResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }
        const sr = srResult.rows[0];
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);
        if (
            !isGlobalManagement &&
            isBranchManagement &&
            String(sr.author_branch_id || '') !== String(userBranchId || '')
        ) {
            res.status(403).json({ error: { message: 'Access denied: чужой филиал' } });
            return;
        }

        await query(
            'UPDATE service_requests SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4',
            [status, reason || null, id, companyId]
        );

        await logAudit(req, 'UPDATE', 'service_request', id, { name: sr.title || '', status }, sr);

        if (status === 'rejected') {
            const notificationId = uuidv4();
            const now = new Date().toISOString();
            const title = `Отклонена: ${sr.title}`;
            const message = reason ? `Причина: ${reason}` : 'Заявка отклонена без указания причины';

            await query(
                `INSERT INTO notifications (id, user_id, title, message, type, is_forced, created_by, created_at, company_id, entity_id, entity_type)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [notificationId, sr.user_id, title, message, 'error', 1, req.user!.id, now, companyId, sr.id, 'service_request']
            );

            const notification = {
                id: notificationId,
                user_id: sr.user_id,
                title,
                message,
                type: 'error',
                is_forced: true,
                created_by: req.user!.id,
                created_at: now,
                is_read: 0,
                entity_id: sr.id,
                entity_type: 'service_request'
            };
            notificationService.sendToUser(sr.user_id, { type: 'NOTIFICATION_RECEIVED', notification });
            await websocketService.emitEvent('NOTIFICATION_RECEIVED', { notification }, sr.user_id);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating service request status:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Add manager comment (without approve/reject) + optional neutral decision note
router.patch('/:id/comment', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const comment = String(req.body?.comment || '').trim();
        const neutral = Boolean(req.body?.neutral);
        const { company_id: companyId, role, branch_id: userBranchId } = req.user!;
        const accessLevel = Number(req.user!.access_level || 0);

        if (accessLevel < 50) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }
        if (!comment) {
            res.status(400).json({ error: { message: 'Комментарий обязателен' } });
            return;
        }

        const srResult = await query(
            `SELECT sr.*, p.full_name as author_name, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON sr.user_id = p.id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        if (srResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }
        const sr = srResult.rows[0];
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);
        if (
            !isGlobalManagement &&
            isBranchManagement &&
            String(sr.author_branch_id || '') !== String(userBranchId || '')
        ) {
            res.status(403).json({ error: { message: 'Access denied: чужой филиал' } });
            return;
        }

        let dataObj: any = {};
        try {
            dataObj = sr.data
                ? (typeof sr.data === 'string' ? JSON.parse(sr.data) : sr.data)
                : {};
        } catch {
            dataObj = {};
        }
        const managerComments = Array.isArray(dataObj.__manager_comments) ? dataObj.__manager_comments : [];
        const commentEntry = {
            id: uuidv4(),
            text: comment,
            neutral,
            author_id: req.user!.id,
            author_name: req.user!.email || 'Руководитель',
            created_at: new Date().toISOString(),
        };
        managerComments.push(commentEntry);
        dataObj.__manager_comments = managerComments;

        await query(
            'UPDATE service_requests SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3',
            [JSON.stringify(dataObj), id, companyId]
        );

        await logAudit(req, 'UPDATE', 'service_request', id, { name: sr.title || '', comment }, sr);

        const notificationId = uuidv4();
        const now = new Date().toISOString();
        const title = neutral
            ? `Нейтральное решение: ${sr.title}`
            : `Комментарий к служебке: ${sr.title}`;
        await query(
            `INSERT INTO notifications (id, user_id, title, message, type, is_forced, created_by, created_at, company_id, entity_id, entity_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [notificationId, sr.user_id, title, comment, neutral ? 'info' : 'warning', 1, req.user!.id, now, companyId, sr.id, 'service_request']
        );
        const notification = {
            id: notificationId,
            user_id: sr.user_id,
            title,
            message: comment,
            type: neutral ? 'info' : 'warning',
            is_forced: true,
            created_by: req.user!.id,
            created_at: now,
            is_read: 0,
            entity_id: sr.id,
            entity_type: 'service_request'
        };
        notificationService.sendToUser(sr.user_id, { type: 'NOTIFICATION_RECEIVED', notification });
        await websocketService.emitEvent('NOTIFICATION_RECEIVED', { notification }, sr.user_id);

        res.json({ success: true, comment: commentEntry });
    } catch (error) {
        console.error('Error adding service request comment:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Delete request
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { role, id: userId, company_id: companyId, branch_id: userBranchId } = req.user!;
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);

        const existing = await query(
            `SELECT sr.*, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON p.id = sr.user_id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        if (existing.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }

        const sr = existing.rows[0];
        if (
            !isGlobalManagement &&
            !(
                isBranchManagement &&
                userBranchId &&
                String(sr.author_branch_id || '') === String(userBranchId)
            ) &&
            sr.user_id !== userId
        ) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }

        // Cleanup S3 attachments if they exist
        const attachments = await query('SELECT file_url FROM service_request_attachments WHERE request_id = $1', [id]);
        for (const att of attachments.rows) {
            await s3Service.deleteFile(att.file_url);
        }

        await query('DELETE FROM service_request_attachments WHERE request_id = $1', [id]);
        await query(
            `DELETE FROM notifications
             WHERE entity_type = 'service_request'
               AND entity_id = $1
               AND (company_id = $2 OR company_id IS NULL)`,
            [id, companyId]
        );
        await query('DELETE FROM service_requests WHERE id = $1 AND company_id = $2', [id, companyId]);

        await logAudit(req, 'DELETE', 'service_request', id, { name: sr.title || '' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting service request:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// Attachments logic
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.zip'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
            cb(null, true);
        } else {
            cb(new Error('Недопустимый тип файла'));
        }
    }
});

// GET attachments list
router.get('/:id/attachments', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { company_id: companyId, role, id: userId, branch_id: userBranchId } = req.user!;
        const requestMeta = await query(
            `SELECT sr.user_id, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON p.id = sr.user_id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        if (requestMeta.rows.length === 0) {
            res.status(404).json({ error: { message: 'Request not found' } });
            return;
        }
        const meta = requestMeta.rows[0];
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);
        if (
            !isGlobalManagement &&
            !(
                isBranchManagement &&
                userBranchId &&
                String(meta.author_branch_id || '') === String(userBranchId)
            ) &&
            String(meta.user_id || '') !== String(userId)
        ) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }
        const result = await query(
            `SELECT att.* FROM service_request_attachments att
             INNER JOIN service_requests sr ON att.request_id = sr.id
             WHERE att.request_id = $1 AND sr.company_id = $2
             ORDER BY att.created_at ASC`,
            [id, companyId]
        );

        // Transform results: if private key in S3, generate signed URL
        const transformedRows = await Promise.all(result.rows.map(async (row: any) => {
            if (s3Service.isS3Enabled && !row.file_url.startsWith('data:') && !row.file_url.startsWith('http')) {
                const signedUrl = await s3Service.getFileUrl(row.file_url);
                return { ...row, file_url: signedUrl };
            }
            return row;
        }));

        res.json(transformedRows);
    } catch (error) {
        console.error('Attachments fetch error:', error);
        res.json([]);
    }
});

// POST upload attachment
router.post('/:id/attachments', authenticateToken, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { company_id: companyId, role, id: userId, branch_id: userBranchId } = req.user!;
        if (!req.file) {
            res.status(400).json({ error: { message: 'No file uploaded' } });
            return;
        }

        const reqResult = await query(
            `SELECT sr.id, sr.user_id, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON p.id = sr.user_id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        if (reqResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Request not found' } });
            return;
        }
        const meta = reqResult.rows[0];
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);
        if (
            !isGlobalManagement &&
            !(
                isBranchManagement &&
                userBranchId &&
                String(meta.author_branch_id || '') === String(userBranchId)
            ) &&
            String(meta.user_id || '') !== String(userId)
        ) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }

        const attId = uuidv4();
        const now = new Date().toISOString();
        let fileUrl: string;

        if (s3Service.isS3Enabled) {
            // Upload as private (default)
            const uploaded = await s3Service.uploadFile(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                false // NOT public
            );
            fileUrl = uploaded.fileUrl; // This will be the S3 Key
        } else {
            // Fallback
            const base64Data = req.file.buffer.toString('base64');
            fileUrl = `data:${req.file.mimetype};base64,${base64Data}`;
        }

        await query(
            `INSERT INTO service_request_attachments(id, request_id, file_name, file_url, file_size, uploaded_by, created_at)
             VALUES($1, $2, $3, $4, $5, $6, $7)`,
            [attId, id, req.file.originalname, fileUrl, req.file.size, req.user!.id, now]
        );

        // If S3 is enabled, return a temporary signed URL for the immediate response
        const displayUrl = (s3Service.isS3Enabled && !fileUrl.startsWith('data:'))
            ? await s3Service.getFileUrl(fileUrl)
            : fileUrl;

        res.json({ id: attId, file_name: req.file.originalname, file_url: displayUrl, file_size: req.file.size });
    } catch (error) {
        console.error('Attachment upload error:', error);
        res.status(500).json({ error: { message: 'Upload failed' } });
    }
});

// DELETE attachment
router.delete('/:id/attachments/:attId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const attId = req.params.attId as string;
        const { role, id: userId, company_id: companyId, branch_id: userBranchId } = req.user!;
        const isGlobalManagement = ['admin', 'director'].includes(role);
        const isBranchManagement = ['commercial', 'head_sales', 'sales_manager'].includes(role);

        const attResult = await query(
            `SELECT att.* FROM service_request_attachments att
             INNER JOIN service_requests sr ON att.request_id = sr.id
             WHERE att.id = $1 AND att.request_id = $2 AND sr.company_id = $3`,
            [attId, id, companyId]
        );
        if (attResult.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }

        const attachment = attResult.rows[0];
        const reqResult = await query(
            `SELECT sr.user_id, p.branch_id as author_branch_id
             FROM service_requests sr
             LEFT JOIN profiles p ON p.id = sr.user_id
             WHERE sr.id = $1 AND sr.company_id = $2`,
            [id, companyId]
        );
        const requestOwnerId = reqResult.rows[0]?.user_id;
        const requestBranchId = reqResult.rows[0]?.author_branch_id;

        if (
            !isGlobalManagement &&
            !(
                isBranchManagement &&
                userBranchId &&
                String(requestBranchId || '') === String(userBranchId)
            ) &&
            requestOwnerId !== userId
        ) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }

        // Delete from S3
        await s3Service.deleteFile(attachment.file_url);
        
        await query('DELETE FROM service_request_attachments WHERE id = $1', [attId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Attachment delete error:', error);
        res.status(500).json({ error: { message: 'Delete failed' } });
    }
});

export default router;
