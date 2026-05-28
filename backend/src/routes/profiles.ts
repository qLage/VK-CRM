import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import * as s3Service from '../services/s3.service';
import { compressImage, renameWithExtension } from '../utils/imageCompress';
import { emitProfileEvent } from '../services/realtime-broadcaster.service';
import { logAudit } from '../utils/audit';

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    // Accept up to 25 MB raw — sharp will compress down to <= 500 KB before storage.
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        // Accept anything that looks like an image — sharp can decode jpeg/png/gif/webp/avif/heic/tiff.
        // Some browsers (iOS Safari) report 'application/octet-stream' for HEIC/HEIF — also accept by extension.
        const allowedExt = /\.(jpe?g|png|gif|webp|avif|heic|heif|tiff?|bmp)$/i;
        const isImageMime = (file.mimetype || '').startsWith('image/');
        const hasImageExt = allowedExt.test(file.originalname || '');
        if (isImageMime || hasImageExt) return cb(null, true);
        cb(new Error(`Неподдерживаемый файл: ${file.mimetype || 'unknown'} (${file.originalname || 'no name'})`));
    }
});

/**
 * GET /:id/avatar — serves the avatar bytes for a profile.
 * Bypasses base64 inclusion in list responses (huge bloat).
 * Long-cache for performance.
 *
 * NOTE: Public (no auth) so <img> tags can load it without custom headers.
 */
router.get('/:id/avatar', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const isPreview = req.query.size === 'preview';
        const r = await query('SELECT avatar_url, updated_at FROM profiles WHERE id = $1', [id]);
        const avatarUrl = r.rows[0]?.avatar_url;
        const updatedAt = r.rows[0]?.updated_at ? new Date(r.rows[0].updated_at).getTime() : 0;
        const sendDefaultAvatar = () => {
            const etag = `"${id}-${updatedAt}-default-${isPreview ? 'p' : 'f'}"`;
            if (req.headers['if-none-match'] === etag) {
                res.status(304).end();
                return;
            }
            // Lightweight placeholder avoids noisy 404s for users without uploaded avatars.
            const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#18181b"/>
  <circle cx="128" cy="98" r="42" fill="#3f3f46"/>
  <path d="M52 220c10-42 40-66 76-66s66 24 76 66" fill="#3f3f46"/>
</svg>`;
            res.set('Content-Type', 'image/svg+xml; charset=utf-8');
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            res.set('ETag', etag);
            res.send(svg);
        };
        if (!avatarUrl) {
            sendDefaultAvatar();
            return;
        }
        if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
            try {
                // Proxy remote avatar instead of redirect:
                // avoids client-side empty images on cross-domain/cache/CDN edge cases.
                // Some S3 objects are private and direct URL returns 403;
                // in that case we fallback to signed URL.
                let upstream = await fetch(avatarUrl, { redirect: 'follow' });
                if (!upstream.ok && s3Service.isS3Enabled) {
                    const bucket = process.env.S3_BUCKET || 'crm-uploads';
                    const marker = `/${bucket}/`;
                    const idx = avatarUrl.indexOf(marker);
                    if (idx !== -1) {
                        const key = avatarUrl.slice(idx + marker.length);
                        if (key) {
                            const signed = await s3Service.getFileUrl(key, 3600);
                            if (signed) {
                                upstream = await fetch(signed, { redirect: 'follow' });
                            }
                        }
                    }
                }
                if (!upstream.ok) {
                    console.error(`[avatar] upstream fetch failed: ${upstream.status} ${upstream.statusText}`);
                    sendDefaultAvatar();
                    return;
                }
                const mime = upstream.headers.get('content-type') || 'image/jpeg';
                const buf = Buffer.from(await upstream.arrayBuffer());
                const etag = `"${id}-${updatedAt}-${isPreview ? 'p' : 'f'}"`;
                if (req.headers['if-none-match'] === etag) {
                    res.status(304).end();
                    return;
                }
                res.set('Content-Type', mime);
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
                res.set('ETag', etag);
                res.send(buf);
                return;
            } catch (e) {
                console.error('[avatar] upstream proxy error:', e);
                sendDefaultAvatar();
                return;
            }
        }
        if (avatarUrl.startsWith('/uploads/') || avatarUrl.startsWith('uploads/')) {
            const rel = avatarUrl.startsWith('/') ? avatarUrl.slice(1) : avatarUrl;
            const abs = path.join(process.cwd(), rel);
            res.sendFile(abs, (err) => {
                if (err) {
                    console.error('[avatar] local file error:', err);
                    if (!res.headersSent) sendDefaultAvatar();
                }
            });
            return;
        }
        if (avatarUrl.startsWith('data:')) {
            const m = /^data:([^;]+);base64,(.+)$/.exec(avatarUrl);
            if (!m) { sendDefaultAvatar(); return; }
            let mime = m[1];
            let buf = Buffer.from(m[2], 'base64');

            if (isPreview) {
                try {
                    buf = await sharp(buf, { failOn: 'none' })
                        .rotate()
                        .resize({ width: 256, height: 256, fit: 'cover', withoutEnlargement: true })
                        .jpeg({ quality: 70, progressive: true, mozjpeg: true })
                        .toBuffer();
                    mime = 'image/jpeg';
                } catch (e) {
                    console.error('[avatar preview] sharp failed, serving full:', e);
                }
            }

            // ETag привязан к updated_at профиля → при загрузке новой аватарки кеш сбрасывается.
            // Cache-Control: no-store, чтобы CDN/Service Worker НЕ кэшировали ответ
            // (SW полностью байпасит этот путь, но оставляем заголовок для надёжности).
            const etag = `"${id}-${updatedAt}-${isPreview ? 'p' : 'f'}"`;
            if (req.headers['if-none-match'] === etag) {
                res.status(304).end();
                return;
            }
            res.set('Content-Type', mime);
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            res.set('ETag', etag);
            res.send(buf);
            return;
        }
        sendDefaultAvatar();
    } catch (error) {
        console.error('Error serving avatar:', error);
        res.status(500).end();
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

        const row = result.rows[0];
        // Strip giant base64 avatar — client should use /api/profiles/:id/avatar
        if (row.avatar_url && row.avatar_url.startsWith('data:')) {
            row.avatar_url = `/api/profiles/${row.id}/avatar`;
        }
        res.json(row);
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

            // 1) Compress to <= 500 KB regardless of storage backend
            const compressed = await compressImage(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                { maxBytes: 500 * 1024, maxWidth: 1024, minWidth: 256 }
            );
            const finalBuffer = compressed.buffer;
            const finalMime = compressed.mimeType;
            const finalName = renameWithExtension(req.file.originalname, compressed.extension);
            console.log(`[avatar] ${req.user!.id}: ${req.file.size} → ${finalBuffer.length} bytes (${finalMime})`);

            if (s3Service.isS3Enabled) {
                // Пытаемся удалить старую аватарку из S3, если она там была
                const currentProfile = await query('SELECT avatar_url FROM profiles WHERE id = $1', [req.user!.id]);
                if (currentProfile.rows[0]?.avatar_url) {
                    await s3Service.deleteFile(currentProfile.rows[0].avatar_url);
                }

                // Загружаем в S3 (публичный доступ для аватарок)
                const uploaded = await s3Service.uploadFile(
                    finalBuffer,
                    finalName,
                    finalMime,
                    true // isPublic
                );
                avatarUrl = uploaded.fileUrl;
            } else {
                // Fallback для локальной разработки: используем Base64
                avatarUrl = `data:${finalMime};base64,${finalBuffer.toString('base64')}`;
            }

            // Update profile in DB and read back updated_at to use as cache-buster
            const upd = await query<{ updated_at: any }>(
                'UPDATE profiles SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING updated_at',
                [avatarUrl, req.user!.id]
            );
            const ver = upd.rows[0]?.updated_at ? new Date(upd.rows[0].updated_at).getTime() : Date.now();
            console.log(`[avatar] DB updated for user ${req.user!.id} (size=${finalBuffer.length}, ver=${ver})`);
            await logAudit(req, 'UPDATE', 'profile', req.user!.id, { name: (req.user as any).full_name || req.user!.id || '' });

            // ALWAYS return a path-based URL with version param. This avoids:
            //  • shipping huge base64 strings via JSON (CDN/SW caching issues)
            //  • broken <img> when data: URL is malformed
            //  • stale browser cache (the v=ts changes every upload)
            const publicUrl = `/api/profiles/${req.user!.id}/avatar?v=${ver}`;
            res.json({ avatar_url: publicUrl });
            emitProfileEvent('avatar_updated', { id: req.user!.id, avatar_url: publicUrl, version: ver });
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
        await logAudit(req, 'UPDATE', 'profile', req.user!.id, { name: (req.user as any).full_name || req.user!.id || '' });
        res.json({ success: true });
        emitProfileEvent('avatar_updated', { id: req.user!.id, avatar_url: null });
    } catch (error) {
        console.error('Avatar delete error:', error);
        res.status(500).json({ error: { message: 'Ошибка при удалении аватара' } });
    }
});

export default router;
