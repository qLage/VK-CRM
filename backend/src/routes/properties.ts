import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as notificationService from '../services/notificationService';
import websocketService from '../services/websocket.service';
import { emitPropertyEvent } from '../services/realtime-broadcaster.service';
import * as s3Service from '../services/s3.service';
import { compressImage, renameWithExtension } from '../utils/imageCompress';
import { logAudit } from '../utils/audit';

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
    // For local /uploads paths we need absolute URL because frontend may be on a different port
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '127.0.0.1:5000';
    return `${proto}://${host}`;
}

function resolveLocalUrl(fileUrl: string, req: Request): string {
    if (!fileUrl) return fileUrl;
    if (fileUrl.startsWith('/uploads')) return `${getBaseUrl(req)}${fileUrl}`;
    return fileUrl;
}

function canApprove(userRole: string, userAccessLevel: number, userBranchId: string | null, userTeamId: string | null, propBranchId: string | null, propTeamId: string | null): boolean {
    // Director (accessLevel >= 100) can approve anything
    if (userAccessLevel >= 100) return true;
    // Commercial director (accessLevel >= 90) can approve within their branch
    if (userAccessLevel >= 90 && userBranchId && userBranchId === propBranchId) return true;
    // Team leader (accessLevel >= 50) can approve objects within their team.
    // We rely on access_level (position-based) rather than legacy role names.
    if (userAccessLevel >= 50 && userTeamId && userTeamId === propTeamId) return true;
    // Legacy role-based fallback (kept for backwards compatibility with old DBs)
    if (['head_sales', 'sales_manager', 'manager'].includes(userRole) && userTeamId && userTeamId === propTeamId) return true;
    return false;
}

function buildVisibilityFilter(user: any, viewMode: string): { clauses: string[], params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];
    const { role, id: userId, branch_id: branchId, team_id: teamId, access_level } = user;
    const accessLevel = Number(access_level || 0);

    // Company filter always
    clauses.push(`p.company_id = $${params.length + 1}`);
    params.push(user.company_id);

    // Director sees all, can filter by branch
    if (accessLevel >= 100) {
        // no extra filter (can see all)
        return { clauses, params };
    }

    // Everyone else sees only their branch (but also incoming transfers)
    if (branchId) {
        clauses.push(`(p.branch_id = $${params.length + 1} OR p.id IN (SELECT pt.property_id FROM property_transfers pt WHERE pt.to_user_id = $${params.length + 2} AND pt.status = 'pending'))`);
        params.push(branchId, userId);
    }

    // viewMode: 'my' = only own (+ incoming transfers), 'team' = team objects
    if (viewMode === 'my') {
        clauses.push(`(p.owner_id = $${params.length + 1} OR p.id IN (SELECT pt.property_id FROM property_transfers pt WHERE pt.to_user_id = $${params.length + 1} AND pt.status = 'pending'))`);
        params.push(userId);
    } else if (viewMode === 'team' && teamId) {
        clauses.push(`(p.team_id = $${params.length + 1} OR p.id IN (SELECT pt.property_id FROM property_transfers pt WHERE pt.to_user_id = $${params.length + 2} AND pt.status = 'pending'))`);
        params.push(teamId, userId);
    }

    return { clauses, params };
}

async function sendNotification(companyId: string, userId: string, createdBy: string, title: string, message: string, entityId: string) {
    const notificationId = uuidv4();
    const now = new Date().toISOString();
    await query(
        `INSERT INTO notifications (id, user_id, title, message, type, is_forced, created_by, created_at, company_id, entity_id, entity_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [notificationId, userId, title, message, 'info', 1, createdBy, now, companyId, entityId, 'property']
    );
    const notification = { id: notificationId, user_id: userId, title, message, type: 'info', is_forced: true, created_by: createdBy, created_at: now, is_read: 0, entity_id: entityId, entity_type: 'property' };
    notificationService.sendToUser(userId, { type: 'NOTIFICATION_RECEIVED', notification });
    await websocketService.emitEvent('NOTIFICATION_RECEIVED', { notification }, userId);
}

// ─── YANDEX MAPS PROXY ────────────────────────────────────────────────
// Suggest API for autocomplete (fast, lightweight) + Geocoder for lat/lng resolution.
// Key: ee98d354-dc43-46d3-9c87-89b17e6faffa (limit: 25000 req/day)
const YANDEX_API_KEY = process.env.YANDEX_API_KEY || 'ee98d354-dc43-46d3-9c87-89b17e6faffa';

// Address suggestions (autocomplete) — uses Geocoder since Suggest API requires referer restrictions
router.get('/suggest', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const q = req.query.q as string;
        if (!q || q.trim().length < 2) { res.json({ suggestions: [] }); return; }
        // Use geocoder for suggestions (works without referer restrictions)
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_API_KEY}&geocode=${encodeURIComponent(q)}&format=json&results=7&lang=ru_RU`;
        const resp = await fetch(url);
        if (!resp.ok) { res.json({ suggestions: [] }); return; }
        const data = await resp.json() as any;
        const members = data?.response?.GeoObjectCollection?.featureMember || [];
        const suggestions = members.map((m: any) => {
            const obj = m.GeoObject;
            const pos = obj.Point.pos.split(' ');
            return {
                name: obj.name,
                description: obj.description || '',
                fullAddress: obj.metaDataProperty?.GeocoderMetaData?.text || `${obj.description}, ${obj.name}`,
                lat: parseFloat(pos[1]),
                lng: parseFloat(pos[0]),
            };
        });
        res.json({ suggestions });
    } catch (error) {
        console.error('Suggest error:', error);
        res.json({ suggestions: [] });
    }
});

// Resolve full address to lat/lng
router.get('/geocode', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const q = req.query.q as string;
        if (!q || q.trim().length < 2) { res.json({ suggestions: [] }); return; }
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_API_KEY}&geocode=${encodeURIComponent(q)}&format=json&results=5&lang=ru_RU`;
        const resp = await fetch(url);
        if (!resp.ok) { res.json({ suggestions: [] }); return; }
        const data = await resp.json() as any;
        const members = data?.response?.GeoObjectCollection?.featureMember || [];
        const suggestions = members.map((m: any) => {
            const obj = m.GeoObject;
            const pos = obj.Point.pos.split(' ');
            return {
                name: obj.name,
                description: obj.description || '',
                fullAddress: obj.metaDataProperty?.GeocoderMetaData?.text || `${obj.description}, ${obj.name}`,
                lat: parseFloat(pos[1]),
                lng: parseFloat(pos[0]),
            };
        });
        res.json({ suggestions });
    } catch (error) {
        console.error('Geocode error:', error);
        res.json({ suggestions: [] });
    }
});

// ─── GET pending approval count (for managers badge) ──────────────────
router.get('/pending-count', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user!;
        const accessLevel = Number(user.access_level || 0);

        // Only managers+ see this
        if (accessLevel < 50) { res.json({ count: 0 }); return; }

        const params: any[] = [user.company_id];
        let where = `p.company_id = $1 AND p.status IN ('pending_approval', 'avito_pending', 'archive_pending')`;

        // Scope by visibility
        if (accessLevel >= 100) {
            // director sees all
        } else if (accessLevel >= 90) {
            if (user.branch_id) { params.push(user.branch_id); where += ` AND p.branch_id = $${params.length}`; }
        } else {
            // team lead
            if (user.team_id) { params.push(user.team_id); where += ` AND p.team_id = $${params.length}`; }
        }

        const result = await query(`SELECT COUNT(*)::int AS count FROM properties p WHERE ${where}`, params);
        res.json({ count: result.rows[0]?.count || 0 });
    } catch (error) {
        console.error('Error fetching pending count:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── PUBLIC: property photo bytes (Avito XML / crawlers) — no auth ────
// Must be registered BEFORE `GET /:id` so `/photo-data/...` is never captured as an id.
const servePhotoData = async (req: Request, res: Response): Promise<void> => {
    try {
        const rawPhotoId = String(req.params.photoId || '');
        const photoId = rawPhotoId.includes('.') ? rawPhotoId.split('.')[0] : rawPhotoId;
        const result = await query('SELECT file_data, mime_type, file_name, file_url FROM property_photos WHERE id = $1', [photoId]);
        if (result.rows.length === 0) {
            res.status(404).send('Not found');
            return;
        }
        const { file_data, mime_type, file_url } = result.rows[0];
        if (file_data) {
            res.set('Content-Type', mime_type || 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            res.send(file_data);
            return;
        }

        if (typeof file_url === 'string' && file_url.trim()) {
            const rawUrl = file_url.trim();
            // Absolute URL: try same-bucket stream first (private objects), else redirect
            if (/^https?:\/\//i.test(rawUrl)) {
                if (s3Service.isS3Enabled) {
                    try {
                        const streamed = await s3Service.streamObjectToResponse(res, rawUrl, {
                            contentType: typeof mime_type === 'string' ? mime_type : undefined,
                        });
                        if (streamed) return;
                    } catch (e) {
                        console.warn('S3 stream failed for absolute photo URL:', rawUrl, (e as any)?.message);
                    }
                }
                res.redirect(302, rawUrl);
                return;
            }

            const isLocalUploads = rawUrl.startsWith('/uploads') || rawUrl.startsWith('uploads/');
            if (s3Service.isS3Enabled && !isLocalUploads) {
                try {
                    const streamed = await s3Service.streamObjectToResponse(res, rawUrl, {
                        contentType: typeof mime_type === 'string' ? mime_type : undefined,
                    });
                    if (streamed) return;
                } catch (e) {
                    console.warn('S3 stream failed for photo-data:', rawUrl, (e as any)?.message);
                }
            }

            const uploadsBase = path.join(__dirname, '../../storage/uploads');
            let relative = rawUrl.replace(/^\/+/, '');
            if (relative.startsWith('uploads/')) {
                relative = relative.replace(/^uploads\//, '');
            }
            const normalized = path.normalize(relative);
            if (!normalized.startsWith('..')) {
                const filePath = path.join(uploadsBase, normalized);
                if (fs.existsSync(filePath)) {
                    res.set('Cache-Control', 'public, max-age=31536000, immutable');
                    res.sendFile(filePath);
                    return;
                }
            }
        }

        res.status(404).send('Not found');
    } catch (error) {
        console.error('Error serving photo:', error);
        res.status(500).send('Error');
    }
};

router.get('/photo-data/:photoId.:ext', servePhotoData);
router.get('/photo-data/:photoId', servePhotoData);

// ─── GET list ─────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user!;
        const viewMode = (req.query.view as string) || 'my';
        const status = req.query.status as string;
        const category = req.query.category as string;
        const search = req.query.search as string;
        const branchFilter = req.query.branch_id as string;
        const priceMin = req.query.price_min as string;
        const priceMax = req.query.price_max as string;
        const rooms = req.query.rooms as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const { clauses, params } = buildVisibilityFilter(user, viewMode);

        // Branch filter for directors
        if (branchFilter && Number(user.access_level || 0) >= 100) {
            clauses.push(`p.branch_id = $${params.length + 1}`);
            params.push(branchFilter);
        }

        if (status && status !== 'all') {
            clauses.push(`p.status = $${params.length + 1}`);
            params.push(status);
        }
        if (category && category !== 'all') {
            clauses.push(`p.category = $${params.length + 1}`);
            params.push(category);
        }
        if (search) {
            clauses.push(`(p.address ILIKE $${params.length + 1} OR p.city ILIKE $${params.length + 1} OR pr.full_name ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
        }
        if (priceMin) {
            clauses.push(`p.price >= $${params.length + 1}`);
            params.push(Number(priceMin));
        }
        if (priceMax) {
            clauses.push(`p.price <= $${params.length + 1}`);
            params.push(Number(priceMax));
        }
        if (rooms) {
            clauses.push(`p.rooms = $${params.length + 1}`);
            params.push(rooms);
        }

        const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';

        const countResult = await query(`SELECT COUNT(*) as total FROM properties p LEFT JOIN profiles pr ON p.owner_id = pr.id ${where}`, params);
        const total = parseInt(countResult.rows[0].total);

        const sql = `
            SELECT p.*, 
                   pr.full_name as owner_name, pr.avatar_url as owner_avatar,
                   br.name as branch_name, t.name as team_name,
                   (SELECT COUNT(*) FROM property_photos ph WHERE ph.property_id = p.id) as photo_count,
                   (SELECT ph.file_url FROM property_photos ph WHERE ph.property_id = p.id ORDER BY ph.sort_order LIMIT 1) as cover_url,
                   (SELECT ph.id FROM property_photos ph WHERE ph.property_id = p.id AND ph.file_data IS NOT NULL ORDER BY ph.sort_order LIMIT 1) as cover_photo_db_id,
                   (SELECT pt.status FROM property_transfers pt WHERE pt.property_id = p.id AND pt.status = 'pending' LIMIT 1) as transfer_status,
                   (SELECT pt.to_user_id FROM property_transfers pt WHERE pt.property_id = p.id AND pt.status = 'pending' LIMIT 1) as transfer_to_user_id,
                   (SELECT pr2.full_name FROM property_transfers pt JOIN profiles pr2 ON pt.to_user_id = pr2.id WHERE pt.property_id = p.id AND pt.status = 'pending' LIMIT 1) as transfer_to_name
            FROM properties p
            LEFT JOIN profiles pr ON p.owner_id = pr.id
            LEFT JOIN branches br ON p.branch_id = br.id
            LEFT JOIN teams t ON p.team_id = t.id
            ${where}
            ORDER BY p.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        params.push(limit, offset);

        const result = await query(sql, params);

        // Sign cover URLs if S3, prefix with absolute URL if local
        const rows = await Promise.all(result.rows.map(async (r: any) => {
            if (r.cover_photo_db_id) {
                r.cover_url = `${getBaseUrl(req)}/api/properties/photo-data/${r.cover_photo_db_id}`;
            } else if (r.cover_url && r.cover_url.startsWith('/uploads')) {
                r.cover_url = resolveLocalUrl(r.cover_url, req);
            } else if (r.cover_url && s3Service.isS3Enabled && !r.cover_url.startsWith('data:') && !r.cover_url.startsWith('http')) {
                r.cover_url = await s3Service.getFileUrl(r.cover_url);
            }
            delete r.cover_photo_db_id;
            return r;
        }));

        res.json({ data: rows, total, limit, offset });
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── GET single ───────────────────────────────────────────────────────

router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { company_id: companyId } = req.user!;
        const result = await query(`
            SELECT p.*, pr.full_name as owner_name, pr.avatar_url as owner_avatar,
                   br.name as branch_name, t.name as team_name
            FROM properties p
            LEFT JOIN profiles pr ON p.owner_id = pr.id
            LEFT JOIN branches br ON p.branch_id = br.id
            LEFT JOIN teams t ON p.team_id = t.id
            WHERE p.id = $1 AND p.company_id = $2
        `, [req.params.id, companyId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }

        // Get photos
        const photos = await query('SELECT id, property_id, file_url, file_name, file_size, sort_order, created_at, mime_type, (file_data IS NOT NULL) as has_data FROM property_photos WHERE property_id = $1 ORDER BY sort_order ASC, id ASC', [req.params.id]);
        const transformedPhotos = await Promise.all(photos.rows.map(async (p: any) => {
            // If photo stored in DB as binary, serve via our endpoint
            if (p.has_data) {
                return { ...p, file_url: `${getBaseUrl(req)}/api/properties/photo-data/${p.id}`, has_data: undefined };
            }
            if (p.file_url && p.file_url.startsWith('/uploads')) {
                return { ...p, file_url: resolveLocalUrl(p.file_url, req) };
            }
            if (s3Service.isS3Enabled && p.file_url && !p.file_url.startsWith('data:') && !p.file_url.startsWith('http')) {
                const signedUrl = await s3Service.getFileUrl(p.file_url);
                return { ...p, file_url: signedUrl };
            }
            return p;
        }));

        // Get transfers
        const transfers = await query(`
            SELECT pt.*, pf.full_name as from_name, pto.full_name as to_name
            FROM property_transfers pt
            LEFT JOIN profiles pf ON pt.from_user_id = pf.id
            LEFT JOIN profiles pto ON pt.to_user_id = pto.id
            WHERE pt.property_id = $1 ORDER BY pt.created_at DESC
        `, [req.params.id]);

        res.json({ ...result.rows[0], photos: transformedPhotos, transfers: transfers.rows });
    } catch (error) {
        console.error('Error fetching property:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── CREATE ───────────────────────────────────────────────────────────

router.post('/', authenticateToken, [
    body('category').isIn(['newbuilding', 'secondary', 'apartment_sell', 'apartment_rent', 'house', 'land', 'commercial', 'rent']),
    body('city').optional().isString(),
    body('address').optional().isString(),
    body('price').isNumeric(),
], async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
        return;
    }

    try {
        const user = req.user!;
        const id = uuidv4();
        const {
            category, city, address, lat, lng, price, area_total, area_living, area_kitchen,
            rooms, floor, floors_total, description,
            house_type, year_built, renovation, bathroom, balcony, ceiling_height,
            parking, view_from_window, elevator, land_area, land_status, commercial_type,
            deal_type, room_type, sale_options, walls_type, heating, water_supply, sewerage, gas_supply,
            furniture, appliances, internet, conditioner, washing_machine, dishwasher, fridge, tv,
            pets_allowed, children_allowed, prepayment, deposit_amount, lease_term, tenant_requirements,
            infrastructure, transport_accessibility,
            object_type, bathroom_location, smoking_allowed, apartment_type,
            client_id, utility_details
        } = req.body;
        const now = new Date().toISOString();

        if (!client_id) {
            res.status(400).json({ error: { message: 'Поле "Клиент" обязательно' } });
            return;
        }

        await query(`
            INSERT INTO properties (
                id, company_id, owner_id, branch_id, team_id,
                category, city, address, lat, lng, price,
                area_total, area_living, area_kitchen, rooms, floor, floors_total, description,
                house_type, year_built, renovation, bathroom, balcony, ceiling_height,
                parking, view_from_window, elevator, land_area, land_status, commercial_type,
                deal_type, room_type, sale_options, walls_type, heating, water_supply, sewerage, gas_supply,
                furniture, appliances, internet, conditioner, washing_machine, dishwasher, fridge, tv,
                pets_allowed, children_allowed, prepayment, deposit_amount, lease_term, tenant_requirements,
                infrastructure, transport_accessibility,
                object_type, bathroom_location, smoking_allowed, apartment_type,
                client_id, utility_details,
                status, created_at, updated_at
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
                $31,$32,$33,$34,$35,$36,$37,$38,
                $39,$40,$41,$42,$43,$44,$45,$46,
                $47,$48,$49,$50,$51,$52,
                $53,$54,$55,$56,$57,$58,
                $59,
                $60,
                $61,$62,$63
            )
        `, [
            id, user.company_id, user.id, user.branch_id, user.team_id,
            category, city, address, lat || null, lng || null, price,
            area_total || null, area_living || null, area_kitchen || null,
            rooms || null, floor || null, floors_total || null, description || null,
            house_type || null, year_built || null, renovation || null, bathroom || null, balcony || null, ceiling_height || null,
            parking || null, view_from_window || null, elevator || null, land_area || null, land_status || null, commercial_type || null,
            deal_type || null, room_type || null, sale_options || null, walls_type || null, heating || null, water_supply || null, sewerage || null, gas_supply || null,
            furniture || null, appliances || null, internet || null, conditioner || null, washing_machine || null, dishwasher || null, fridge || null, tv || null,
            pets_allowed || null, children_allowed || null, prepayment || null, deposit_amount || null, lease_term || null, tenant_requirements || null,
            infrastructure || null, transport_accessibility || null,
            object_type || null, bathroom_location || null, smoking_allowed || null, apartment_type || null,
            client_id || null,
            utility_details || null,
            'draft', now, now
        ]);

        // Update elevator counts if provided
        const { passenger_elevator_count, freight_elevator_count } = req.body;
        if (passenger_elevator_count !== undefined || freight_elevator_count !== undefined) {
            await query(`
                UPDATE properties SET
                    passenger_elevator_count = COALESCE($1, passenger_elevator_count),
                    freight_elevator_count = COALESCE($2, freight_elevator_count),
                    updated_at = NOW()
                WHERE id = $3
            `, [passenger_elevator_count !== undefined ? passenger_elevator_count : null, freight_elevator_count !== undefined ? freight_elevator_count : null, id]);
        }

        await logAudit(req, 'CREATE', 'property', id, { name: address || city || '' });
        res.status(201).json({ success: true, id });
        emitPropertyEvent('created', { id });
    } catch (error) {
        console.error('Error creating property:', error);
        console.error('POST body:', JSON.stringify(req.body));
        res.status(500).json({ error: { message: 'Internal server error', detail: String(error) } });
    }
});

// ─── UPDATE ───────────────────────────────────────────────────────────

router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId, access_level, team_id: userTeamId, branch_id: userBranchId, role: userRole } = req.user!;
        const accessLevel = Number(access_level || 0);
        const propId = req.params.id;

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: { message: 'Not found' } });
            return;
        }
        const prop = existing.rows[0];

        // Edit permission rules:
        // 1. Owner can edit own property in ANY status (incl. approved/published/avito).
        // 2. Team leader (>=50) can edit any property of their own team in any status.
        // 3. Branch director (>=90) can edit anything in their branch.
        // 4. Director (>=100) can edit anything in the company.
        const isOwner = prop.owner_id === userId;
        const sameTeam = userTeamId && userTeamId === prop.team_id;
        const sameBranch = userBranchId && userBranchId === prop.branch_id;
        const canEdit =
            isOwner ||
            accessLevel >= 100 ||
            (accessLevel >= 90 && sameBranch) ||
            (accessLevel >= 50 && sameTeam) ||
            // legacy role fallback
            (['head_sales', 'sales_manager', 'manager'].includes(userRole) && sameTeam);

        if (!canEdit) {
            res.status(403).json({ error: { message: 'Access denied' } });
            return;
        }

        const {
            category, city, address, lat, lng, price, area_total, area_living, area_kitchen,
            rooms, floor, floors_total, description,
            house_type, year_built, renovation, bathroom, balcony, ceiling_height,
            parking, view_from_window, elevator, land_area, land_status, commercial_type,
            deal_type, room_type, sale_options, walls_type, heating, water_supply, sewerage, gas_supply,
            furniture, appliances, internet, conditioner, washing_machine, dishwasher, fridge, tv,
            pets_allowed, children_allowed, prepayment, deposit_amount, lease_term, tenant_requirements,
            infrastructure, transport_accessibility,
            object_type, bathroom_location, smoking_allowed, apartment_type,
            client_id, utility_details
        } = req.body;
        const now = new Date().toISOString();

        if (!prop.client_id && !client_id) {
            res.status(400).json({ error: { message: 'Поле "Клиент" обязательно' } });
            return;
        }

        // If was rejected, resubmit as draft
        let statusUpdate = '';
        if (prop.status === 'rejected') {
            statusUpdate = ", status = 'draft', rejection_reason = NULL";
        }

        await query(`
            UPDATE properties SET
                category=COALESCE($1,category), city=COALESCE($2,city), address=COALESCE($3,address),
                lat=COALESCE($4,lat), lng=COALESCE($5,lng), price=COALESCE($6,price),
                area_total=COALESCE($7,area_total), area_living=COALESCE($8,area_living), area_kitchen=COALESCE($9,area_kitchen),
                rooms=COALESCE($10,rooms), floor=COALESCE($11,floor), floors_total=COALESCE($12,floors_total),
                description=COALESCE($13,description),
                house_type=COALESCE($14,house_type), year_built=COALESCE($15,year_built),
                renovation=COALESCE($16,renovation), bathroom=COALESCE($17,bathroom), balcony=COALESCE($18,balcony),
                ceiling_height=COALESCE($19,ceiling_height), parking=COALESCE($20,parking),
                view_from_window=COALESCE($21,view_from_window), elevator=COALESCE($22,elevator),
                land_area=COALESCE($23,land_area), land_status=COALESCE($24,land_status),
                commercial_type=COALESCE($25,commercial_type),
                deal_type=COALESCE($26,deal_type), room_type=COALESCE($27,room_type),
                sale_options=COALESCE($28,sale_options), walls_type=COALESCE($29,walls_type),
                heating=COALESCE($30,heating), water_supply=COALESCE($31,water_supply),
                sewerage=COALESCE($32,sewerage), gas_supply=COALESCE($33,gas_supply),
                furniture=COALESCE($34,furniture), appliances=COALESCE($35,appliances),
                internet=COALESCE($36,internet), conditioner=COALESCE($37,conditioner),
                washing_machine=COALESCE($38,washing_machine), dishwasher=COALESCE($39,dishwasher),
                fridge=COALESCE($40,fridge), tv=COALESCE($41,tv),
                pets_allowed=COALESCE($42,pets_allowed), children_allowed=COALESCE($43,children_allowed),
                prepayment=COALESCE($44,prepayment), deposit_amount=COALESCE($45,deposit_amount),
                lease_term=COALESCE($46,lease_term), tenant_requirements=COALESCE($47,tenant_requirements),
                infrastructure=COALESCE($48,infrastructure), transport_accessibility=COALESCE($49,transport_accessibility),
                object_type=COALESCE($50,object_type), bathroom_location=COALESCE($51,bathroom_location), smoking_allowed=COALESCE($52,smoking_allowed), apartment_type=COALESCE($53,apartment_type),
                client_id=COALESCE($54,client_id),
                utility_details=COALESCE($55,utility_details),
                updated_at=$56 ${statusUpdate}
            WHERE id=$57
        `, [
            category, city, address, lat, lng, price,
            area_total, area_living, area_kitchen, rooms, floor, floors_total, description,
            house_type, year_built, renovation, bathroom, balcony, ceiling_height,
            parking, view_from_window, elevator, land_area, land_status, commercial_type,
            deal_type, room_type, sale_options, walls_type, heating, water_supply, sewerage, gas_supply,
            furniture, appliances, internet, conditioner, washing_machine, dishwasher, fridge, tv,
            pets_allowed, children_allowed, prepayment, deposit_amount, lease_term, tenant_requirements,
            infrastructure, transport_accessibility,
            object_type, bathroom_location, smoking_allowed, apartment_type,
            client_id || null,
            utility_details || null,
            now, propId
        ]);

        // Update elevator counts if provided
        const { passenger_elevator_count: pec, freight_elevator_count: fec } = req.body;
        if (pec !== undefined || fec !== undefined) {
            await query(`
                UPDATE properties SET
                    passenger_elevator_count = COALESCE($1, passenger_elevator_count),
                    freight_elevator_count = COALESCE($2, freight_elevator_count),
                    updated_at = NOW()
                WHERE id = $3
            `, [pec !== undefined ? pec : null, fec !== undefined ? fec : null, propId]);
        }

        await logAudit(req, 'UPDATE', 'property', propId, { name: prop.address || prop.city || '', ...req.body }, prop);
        res.json({ success: true });
        emitPropertyEvent('updated', { id: propId });
    } catch (error) {
        console.error('Error updating property:', error);
        console.error('PUT body:', JSON.stringify(req.body));
        res.status(500).json({ error: { message: 'Internal server error', detail: String(error) } });
    }
});

// ─── SUBMIT FOR APPROVAL ─────────────────────────────────────────────

router.patch('/:id/submit', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const propId = req.params.id;

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (existing.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        const prop = existing.rows[0];

        if (prop.owner_id !== userId) { res.status(403).json({ error: { message: 'Only owner can submit' } }); return; }
        if (!['draft', 'rejected'].includes(prop.status)) { res.status(400).json({ error: { message: 'Can only submit from draft/rejected' } }); return; }

        await query("UPDATE properties SET status = 'pending_approval', updated_at = NOW() WHERE id = $1", [propId]);
        res.json({ success: true });
        emitPropertyEvent('status_changed', { id: propId, status: 'pending_approval' });
    } catch (error) {
        console.error('Error submitting property:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── APPROVE / REJECT ─────────────────────────────────────────────────

router.patch('/:id/approve', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user!;
        const propId = req.params.id;
        const { action, reason } = req.body; // action: 'approve' | 'reject'

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, user.company_id]);
        if (existing.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        const prop = existing.rows[0];

        if (!canApprove(user.role, Number(user.access_level || 0), user.branch_id, user.team_id, prop.branch_id, prop.team_id)) {
            res.status(403).json({ error: { message: 'Access denied' } }); return;
        }

        if (prop.status !== 'pending_approval' && prop.status !== 'avito_pending' && prop.status !== 'archive_pending') {
            res.status(400).json({ error: { message: 'Not in approvable state' } }); return;
        }

        if (action === 'approve') {
            let newStatus = 'approved';
            if (prop.status === 'avito_pending') newStatus = 'avito_approved';
            if (prop.status === 'archive_pending') {
                newStatus = 'archived';
                const autoDelete = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                await query("UPDATE properties SET status = $1, archived_at = NOW(), archive_approved_by = $2, auto_delete_at = $3, approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $4",
                    [newStatus, user.id, autoDelete, propId]);
            } else {
                await query("UPDATE properties SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = NULL, updated_at = NOW() WHERE id = $3",
                    [newStatus, user.id, propId]);
            }

            try {
                await sendNotification(user.company_id, prop.owner_id, user.id,
                    prop.status === 'archive_pending' ? 'Объект архивирован' : 'Объект одобрен',
                    `Объект "${prop.address || prop.city || 'Без адреса'}" одобрен`,
                    propId);
            } catch (notifErr) { console.warn('Notification send failed:', notifErr); }
        } else {
            await query("UPDATE properties SET status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2", [reason || null, propId]);
            try {
                await sendNotification(user.company_id, prop.owner_id, user.id,
                    'Объект отклонён',
                    reason ? `Причина: ${reason}` : 'Объект отклонён без указания причины',
                    propId);
            } catch (notifErr) { console.warn('Notification send failed:', notifErr); }
        }

        res.json({ success: true });
        emitPropertyEvent('status_changed', { id: propId, action });
    } catch (error) {
        console.error('Error approving property:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── REQUEST ARCHIVE ──────────────────────────────────────────────────

router.patch('/:id/archive', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const propId = req.params.id;

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (existing.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        const prop = existing.rows[0];

        if (prop.owner_id !== userId) { res.status(403).json({ error: { message: 'Only owner can request archive' } }); return; }

        await query("UPDATE properties SET status = 'archive_pending', updated_at = NOW() WHERE id = $1", [propId]);
        res.json({ success: true });
        emitPropertyEvent('status_changed', { id: propId, status: 'archive_pending' });
    } catch (error) {
        console.error('Error archiving property:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── REQUEST AVITO PUBLISH ────────────────────────────────────────────

router.patch('/:id/avito-request', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const propId = req.params.id;

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (existing.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        const prop = existing.rows[0];

        if (prop.owner_id !== userId) { res.status(403).json({ error: { message: 'Only owner can request' } }); return; }
        if (prop.status !== 'approved') { res.status(400).json({ error: { message: 'Object must be approved first' } }); return; }

        await query("UPDATE properties SET status = 'avito_pending', updated_at = NOW() WHERE id = $1", [propId]);

        // Notify all relevant approvers instantly (team lead / branch director / company director).
        try {
            const approvers = await query(
                `SELECT id
                 FROM profiles
                 WHERE company_id = $1
                   AND is_active = true
                   AND id <> $2
                   AND (
                     access_level >= 100
                     OR (access_level >= 90 AND branch_id = $3)
                     OR (access_level >= 50 AND team_id = $4)
                   )`,
                [companyId, userId, prop.branch_id || null, prop.team_id || null]
            );

            for (const approver of approvers.rows) {
                await sendNotification(
                    companyId,
                    approver.id,
                    userId,
                    'Запрос публикации Avito',
                    `Объект "${prop.address || prop.city || 'Без адреса'}" отправлен на публикацию`,
                    propId
                );
            }
        } catch (notifyErr) {
            console.warn('Failed to send avito request notifications:', notifyErr);
        }

        res.json({ success: true });
        emitPropertyEvent('status_changed', { id: propId, status: 'avito_pending' });
    } catch (error) {
        console.error('Error requesting avito publish:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── TRANSFER ─────────────────────────────────────────────────────────

router.post('/:id/transfer', authenticateToken, [
    body('to_user_id').notEmpty(),
], async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const propId = req.params.id;
        const { to_user_id } = req.body;

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (existing.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        const prop = existing.rows[0];

        if (prop.owner_id !== userId) { res.status(403).json({ error: { message: 'Only owner can transfer' } }); return; }

        // Check no pending transfer
        const pendingCheck = await query("SELECT id FROM property_transfers WHERE property_id = $1 AND status = 'pending'", [propId]);
        if (pendingCheck.rows.length > 0) { res.status(400).json({ error: { message: 'Transfer already pending' } }); return; }

        // Check target user exists and is in same company
        const targetUser = await query('SELECT id, branch_id, full_name FROM profiles WHERE id = $1 AND company_id = $2', [to_user_id, companyId]);
        if (targetUser.rows.length === 0) { res.status(404).json({ error: { message: 'Target user not found' } }); return; }

        const transferId = uuidv4();
        await query("INSERT INTO property_transfers (id, property_id, from_user_id, to_user_id, status, created_at) VALUES ($1,$2,$3,$4,'pending',NOW())",
            [transferId, propId, userId, to_user_id]);
        await query("UPDATE properties SET status = 'transfer_pending', updated_at = NOW() WHERE id = $1", [propId]);

        // Notify target
        const ownerProfile = await query('SELECT full_name FROM profiles WHERE id = $1', [userId]);
        await sendNotification(companyId, to_user_id, userId,
            'Передача объекта',
            `${ownerProfile.rows[0]?.full_name || 'Сотрудник'} хочет передать вам объект "${prop.address || prop.city || 'Без адреса'}"`,
            propId);

        res.json({ success: true, transfer_id: transferId });
        emitPropertyEvent('status_changed', { id: propId, status: 'transfer_pending' });
    } catch (error) {
        console.error('Error transferring property:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── ACCEPT / REJECT / CANCEL TRANSFER ────────────────────────────────

router.patch('/transfers/:transferId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const { transferId } = req.params;
        const { action } = req.body; // accept, reject, cancel

        const transferResult = await query(`
            SELECT pt.*, p.company_id, p.status as prop_status, p.address, p.city
            FROM property_transfers pt
            JOIN properties p ON pt.property_id = p.id
            WHERE pt.id = $1 AND p.company_id = $2 AND pt.status = 'pending'
        `, [transferId, companyId]);

        if (transferResult.rows.length === 0) { res.status(404).json({ error: { message: 'Transfer not found' } }); return; }
        const transfer = transferResult.rows[0];

        if (action === 'cancel') {
            if (transfer.from_user_id !== userId) { res.status(403).json({ error: { message: 'Only sender can cancel' } }); return; }
            await query("UPDATE property_transfers SET status = 'cancelled', resolved_at = NOW() WHERE id = $1", [transferId]);
            await query("UPDATE properties SET status = 'approved', updated_at = NOW() WHERE id = $1", [transfer.property_id]);
            await sendNotification(companyId, transfer.to_user_id, userId, 'Передача отменена', `Передача объекта "${transfer.address || transfer.city || ''}" отменена`, transfer.property_id);
        } else if (action === 'accept') {
            if (transfer.to_user_id !== userId) { res.status(403).json({ error: { message: 'Only recipient can accept' } }); return; }
            // Get recipient's team
            const recipientProfile = await query('SELECT team_id, branch_id FROM profiles WHERE id = $1', [userId]);
            const newTeamId = recipientProfile.rows[0]?.team_id || null;
            const newBranchId = recipientProfile.rows[0]?.branch_id || null;
            
            await query("UPDATE property_transfers SET status = 'accepted', resolved_at = NOW() WHERE id = $1", [transferId]);
            await query("UPDATE properties SET owner_id = $1, team_id = $2, branch_id = $3, status = 'approved', updated_at = NOW() WHERE id = $4", [userId, newTeamId, newBranchId, transfer.property_id]);
            await sendNotification(companyId, transfer.from_user_id, userId, 'Передача принята', `Объект "${transfer.address || transfer.city || ''}" успешно передан`, transfer.property_id);
        } else if (action === 'reject') {
            if (transfer.to_user_id !== userId) { res.status(403).json({ error: { message: 'Only recipient can reject' } }); return; }
            await query("UPDATE property_transfers SET status = 'rejected', resolved_at = NOW() WHERE id = $1", [transferId]);
            await query("UPDATE properties SET status = 'approved', updated_at = NOW() WHERE id = $1", [transfer.property_id]);
            await sendNotification(companyId, transfer.from_user_id, userId, 'Передача отклонена', `Получатель отклонил передачу объекта "${transfer.address || transfer.city || ''}"`, transfer.property_id);
        }

        res.json({ success: true });
        emitPropertyEvent('updated', { id: transfer.property_id });
    } catch (error) {
        console.error('Error handling transfer:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── PHOTO UPLOAD ─────────────────────────────────────────────────────

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    // Accept up to 30 MB per file — sharp will compress each to ≤1 MB before storage.
    limits: { fileSize: 30 * 1024 * 1024, files: 50 },
    fileFilter: (_req, file, cb) => {
        // Decode original name from latin1 to utf8 (multer default issue with cyrillic)
        try { file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch {}

        const mime = (file.mimetype || '').toLowerCase();
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.gif', '.bmp', '.avif', '.tiff', '.tif'];

        // Accept any image/* mime OR known extension
        if (mime.startsWith('image/') || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            console.warn(`[properties/photos] Rejected file: name="${file.originalname}" mime="${mime}" ext="${ext}"`);
            cb(new Error(`Файл не является изображением (mime=${mime || 'неизвестно'}, ext=${ext || 'нет'})`));
        }
    }
});

router.post('/:id/photos', authenticateToken, upload.array('photos', 50), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const propId = req.params.id;

        const existing = await query('SELECT * FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (existing.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        const prop = existing.rows[0];

        if (prop.owner_id !== userId && Number(req.user!.access_level || 0) < 90) {
            res.status(403).json({ error: { message: 'Access denied' } }); return;
        }

        // Check current photo count
        const countResult = await query('SELECT COUNT(*) as cnt FROM property_photos WHERE property_id = $1', [propId]);
        const currentCount = parseInt(countResult.rows[0].cnt);
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) { res.status(400).json({ error: { message: 'No files' } }); return; }
        const PHOTO_LIMIT = 50;
        if (currentCount + files.length > PHOTO_LIMIT) { res.status(400).json({ error: { message: `Max ${PHOTO_LIMIT} photos. Current: ${currentCount}` } }); return; }

        const results: any[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const photoId = uuidv4();
            let fileUrl: string;
            let displayUrl: string;

            // Compress to ≤ 1 MB before any storage
            let buffer = file.buffer;
            let mime = file.mimetype;
            let name = file.originalname;
            let size = file.size;
            try {
                const compressed = await compressImage(file.buffer, file.originalname, file.mimetype, {
                    maxBytes: 1 * 1024 * 1024,
                    maxWidth: 2560,
                    minWidth: 800,
                });
                buffer = compressed.buffer;
                mime = compressed.mimeType;
                name = renameWithExtension(file.originalname, compressed.extension);
                size = compressed.compressedSize;
                console.log(`[property-photo] ${propId}: ${file.originalname} ${file.size} → ${size} bytes (${mime})`);
            } catch (compErr) {
                console.warn('[property-photo] compression failed, using original:', (compErr as any)?.message);
            }

            // Try S3 first, fall back to local disk on failure
            let s3Ok = false;
            if (s3Service.isS3Enabled) {
                try {
                    const uploaded = await s3Service.uploadFile(buffer, name, mime, false);
                    fileUrl = uploaded.fileUrl;
                    displayUrl = await s3Service.getFileUrl(fileUrl);
                    s3Ok = true;
                } catch (s3err) {
                    console.warn('[properties/photos] S3 upload failed, falling back to local disk:', (s3err as any)?.message);
                }
            }

            if (!s3Ok) {
                // Store photo binary directly in the database (no filesystem dependency)
                fileUrl = `db://${photoId}`;
                displayUrl = `${getBaseUrl(req)}/api/properties/photo-data/${photoId}`;
                await query(
                    'INSERT INTO property_photos (id, property_id, file_url, file_name, file_size, sort_order, file_data, mime_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
                    [photoId, propId, fileUrl, name, size, currentCount + i, buffer, mime]
                );
                results.push({ id: photoId, file_url: displayUrl, file_name: name, file_size: size });
                continue;
            }

            await query('INSERT INTO property_photos (id, property_id, file_url, file_name, file_size, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
                [photoId, propId, fileUrl!, name, size, currentCount + i]);

            results.push({ id: photoId, file_url: displayUrl!, file_name: name, file_size: size });
        }

        res.json(results);
        emitPropertyEvent('updated', { id: propId });
    } catch (error: any) {
        console.error('Error uploading photos:', error);
        res.status(500).json({ error: { message: error?.message || 'Upload failed', detail: String(error?.code || error?.detail || '') } });
    }
});

router.delete('/:id/photos/:photoId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const { id: propId, photoId } = req.params;

        const photo = await query('SELECT pp.* FROM property_photos pp JOIN properties p ON pp.property_id = p.id WHERE pp.id = $1 AND pp.property_id = $2 AND p.company_id = $3', [photoId, propId, companyId]);
        if (photo.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }

        const prop = await query('SELECT owner_id FROM properties WHERE id = $1', [propId]);
        if (prop.rows[0]?.owner_id !== userId && Number(req.user!.access_level || 0) < 90) {
            res.status(403).json({ error: { message: 'Access denied' } }); return;
        }

        await s3Service.deleteFile(photo.rows[0].file_url);
        await query('DELETE FROM property_photos WHERE id = $1', [photoId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting photo:', error);
        res.status(500).json({ error: { message: 'Delete failed' } });
    }
});

// ─── REORDER photos ───────────────────────────────────────────────────

router.put('/:id/photos/reorder', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: userId, company_id: companyId } = req.user!;
        const propId = req.params.id;
        const { photo_ids } = req.body as { photo_ids: string[] };

        if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
            res.status(400).json({ error: { message: 'photo_ids array required' } });
            return;
        }

        const propResult = await query('SELECT owner_id FROM properties WHERE id = $1 AND company_id = $2', [propId, companyId]);
        if (propResult.rows.length === 0) { res.status(404).json({ error: { message: 'Not found' } }); return; }
        if (propResult.rows[0].owner_id !== userId && Number(req.user!.access_level || 0) < 90) {
            res.status(403).json({ error: { message: 'Access denied' } }); return;
        }

        // Update sort_order in batch
        for (let i = 0; i < photo_ids.length; i++) {
            await query('UPDATE property_photos SET sort_order = $1 WHERE id = $2 AND property_id = $3',
                [i, photo_ids[i], propId]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering photos:', error);
        res.status(500).json({ error: { message: 'Reorder failed' } });
    }
});

// ─── CHECK DUPLICATE address ──────────────────────────────────────────

router.get('/check/duplicate', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user!;
        const address = (req.query.address as string || '').trim();
        const city = (req.query.city as string || '').trim();
        const excludeId = req.query.exclude_id as string;

        if (!address && !city) {
            res.json({ duplicates: [] });
            return;
        }

        const params: any[] = [user.company_id];
        let where = 'p.company_id = $1';
        if (address) {
            params.push(`%${address.toLowerCase()}%`);
            where += ` AND LOWER(p.address) LIKE $${params.length}`;
        } else if (city) {
            params.push(`%${city.toLowerCase()}%`);
            where += ` AND LOWER(p.city) LIKE $${params.length}`;
        }
        if (excludeId) {
            params.push(excludeId);
            where += ` AND p.id != $${params.length}`;
        }
        // Don't show archived/transfer-pending in duplicate check
        where += ` AND p.status NOT IN ('archived', 'transfer_pending')`;

        const result = await query(`
            SELECT p.id, p.address, p.city, p.price, p.status, p.category, p.rooms, p.area_total,
                   pr.full_name as owner_name, br.name as branch_name
            FROM properties p
            LEFT JOIN profiles pr ON p.owner_id = pr.id
            LEFT JOIN branches br ON p.branch_id = br.id
            WHERE ${where}
            ORDER BY p.created_at DESC
            LIMIT 5
        `, params);

        res.json({ duplicates: result.rows });
    } catch (error) {
        console.error('Error checking duplicates:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── ANALYTICS / STATS ────────────────────────────────────────────────

router.get('/stats/summary', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user!;
        const companyId = user.company_id;
        const branchId = (req.query.branch_id as string) || null;
        const fromRaw = (req.query.from as string) || '';
        const toRaw = (req.query.to as string) || '';

        const params: any[] = [companyId];
        let where = 'p.company_id = $1';
        if (branchId) { params.push(branchId); where += ` AND p.branch_id = $${params.length}`; }
        if (fromRaw) { params.push(fromRaw); where += ` AND p.created_at >= $${params.length}`; }
        if (toRaw)   { params.push(toRaw);   where += ` AND p.created_at <= $${params.length}`; }

        // 1. Status breakdown
        const byStatus = await query(`
            SELECT p.status, COUNT(*)::int AS count
            FROM properties p
            WHERE ${where}
            GROUP BY p.status
        `, params);

        // 2. Category breakdown
        const byCategory = await query(`
            SELECT p.category, COUNT(*)::int AS count
            FROM properties p
            WHERE ${where}
            GROUP BY p.category
        `, params);

        // 3. By branch
        const byBranch = await query(`
            SELECT br.id, br.name,
                   COUNT(*)::int AS total,
                   SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
                   SUM(CASE WHEN p.status IN ('published_avito','in_feed') OR p.avito_feed_enabled = TRUE THEN 1 ELSE 0 END)::int AS published,
                   SUM(CASE WHEN p.status = 'sold' THEN 1 ELSE 0 END)::int AS sold
            FROM properties p
            LEFT JOIN branches br ON p.branch_id = br.id
            WHERE ${where}
            GROUP BY br.id, br.name
            ORDER BY total DESC
        `, params);

        // 4. Top realtors (by approved count)
        const topRealtors = await query(`
            SELECT pr.id, pr.full_name, pr.avatar_url,
                   COUNT(*)::int AS total,
                   SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
                   SUM(CASE WHEN p.status IN ('published_avito','in_feed') OR p.avito_feed_enabled = TRUE THEN 1 ELSE 0 END)::int AS published,
                   SUM(CASE WHEN p.status = 'sold' THEN 1 ELSE 0 END)::int AS sold
            FROM properties p
            LEFT JOIN profiles pr ON p.owner_id = pr.id
            WHERE ${where}
            GROUP BY pr.id, pr.full_name, pr.avatar_url
            ORDER BY approved DESC, total DESC
            LIMIT 10
        `, params);

        // 5. Funnel/conversion totals
        const totals = await query(`
            SELECT
              COUNT(*)::int AS total,
              SUM(CASE WHEN p.status = 'draft' THEN 1 ELSE 0 END)::int AS drafts,
              SUM(CASE WHEN p.status = 'pending_approval' THEN 1 ELSE 0 END)::int AS pending,
              SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
              SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END)::int AS rejected,
              SUM(CASE WHEN p.status IN ('published_avito','in_feed') OR p.avito_feed_enabled = TRUE THEN 1 ELSE 0 END)::int AS published,
              SUM(CASE WHEN p.status = 'sold' THEN 1 ELSE 0 END)::int AS sold,
              SUM(CASE WHEN p.status = 'archived' THEN 1 ELSE 0 END)::int AS archived,
              AVG(CASE WHEN p.price > 0 THEN p.price END)::float AS avg_price
            FROM properties p
            WHERE ${where}
        `, params);

        // 6. Time series (created per day, last 30 days within window)
        const timeline = await query(`
            SELECT DATE(p.created_at) AS day,
                   COUNT(*)::int AS created,
                   SUM(CASE WHEN p.status IN ('approved','published_avito','sold') THEN 1 ELSE 0 END)::int AS approved
            FROM properties p
            WHERE ${where}
            GROUP BY DATE(p.created_at)
            ORDER BY day ASC
            LIMIT 90
        `, params);

        res.json({
            totals: totals.rows[0] || {},
            by_status: byStatus.rows,
            by_category: byCategory.rows,
            by_branch: byBranch.rows,
            top_realtors: topRealtors.rows,
            timeline: timeline.rows,
        });
    } catch (error) {
        console.error('Error computing property stats:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

// ─── DELETE (hard delete for directors only) ──────────────────────────

router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { company_id: companyId, access_level } = req.user!;
        if (Number(access_level || 0) < 100) {
            res.status(403).json({ error: { message: 'Only directors can permanently delete' } }); return;
        }

        // Delete photos from S3
        const photos = await query('SELECT file_url FROM property_photos WHERE property_id = $1', [req.params.id]);
        for (const p of photos.rows) { await s3Service.deleteFile(p.file_url); }

        await query('DELETE FROM property_photos WHERE property_id = $1', [req.params.id]);
        await query('DELETE FROM property_transfers WHERE property_id = $1', [req.params.id]);
        await query(
            `DELETE FROM notifications
             WHERE entity_type = 'property'
               AND entity_id = $1
               AND (company_id = $2 OR company_id IS NULL)`,
            [req.params.id, companyId]
        );
        const deletedResult = await query('DELETE FROM properties WHERE id = $1 AND company_id = $2 RETURNING id, address, city', [req.params.id, companyId]);
        await logAudit(req, 'DELETE', 'property', req.params.id, { name: deletedResult.rows[0]?.address || deletedResult.rows[0]?.city || '' });
        res.json({ success: true });
        emitPropertyEvent('deleted', { id: req.params.id });
    } catch (error) {
        console.error('Error deleting property:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
});

export default router;
