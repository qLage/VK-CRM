import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import * as s3Service from '../services/s3.service';

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Разрешены только изображения (jpg, png, gif, webp)'));
    }
});

// GET single profile by ID
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await query(`
            SELECT p.*, t.name as team_name, t.leader_id as team_leader_id
            FROM profiles p
            LEFT JOIN teams t ON p.team_id = t.id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: { message: 'Profile not found' } });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// POST upload avatar
router.post('/avatar', authenticateToken, (req: Request, res: Response): void => {
    upload.single('avatar')(req, res, async (err: any) => {
        if (err instanceof multer.MulterError) {
            res.status(400).json({ error: { message: `Ошибка Multer: ${err.message}` } });
            return;
        } else if (err) {
            res.status(400).json({ error: { message: err.message } });
            return;
        }

        try {
            if (!req.file) {
                res.status(400).json({ error: { message: 'Файл не загружен' } });
                return;
            }

            let avatarUrl: string;

            if (s3Service.isS3Enabled) {
                // Пытаемся удалить старую аватарку из S3, если она там была
                const currentProfile = await query('SELECT avatar_url FROM profiles WHERE id = $1', [req.user!.id]);
                if (currentProfile.rows[0]?.avatar_url) {
                    await s3Service.deleteFile(currentProfile.rows[0].avatar_url);
                }

                // Загружаем в S3 (публичный доступ для аватарок)
                const uploaded = await s3Service.uploadFile(
                    req.file.buffer,
                    req.file.originalname,
                    req.file.mimetype,
                    true // isPublic
                );
                avatarUrl = uploaded.fileUrl;
            } else {
                // Fallback для локальной разработки: используем Base64
                avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            }

            // Update profile in DB
            await query(
                'UPDATE profiles SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [avatarUrl, req.user!.id]
            );

            res.json({ avatar_url: avatarUrl });
        } catch (error) {
            console.error('Avatar upload error:', error);
            res.status(500).json({ error: { message: 'Ошибка при сохранении аватара в облако или базу данных' } });
        }
    });
});

// DELETE remove avatar
router.delete('/avatar', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        await query('UPDATE profiles SET avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user!.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Avatar delete error:', error);
        res.status(500).json({ error: { message: 'Ошибка при удалении аватара' } });
    }
});

export default router;
