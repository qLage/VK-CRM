/**
 * Avito Realty integration service
 *
 * Publication via XML Autoload feed:
 *   - GET /api/avito/feed.xml?token=<feed_token>   — public XML feed URL
 *   - POST /api/avito/publish/:propertyId          — add property to feed
 *   - POST /api/avito/unpublish/:propertyId        — remove from feed
 *
 * The feed URL is given to Avito "Загрузка по ссылке" in personal account.
 * Avito fetches it on schedule and syncs listings automatically.
 *
 * OAuth is still used for testConnection (verifying credentials).
 */

import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const AVITO_TOKEN_URL = 'https://api.avito.ru/token/';
const AVITO_API_BASE = 'https://api.avito.ru';

export interface AvitoCredentials {
    id: string;
    company_id: string;
    client_id: string;
    client_secret: string;
    user_id: string | null;
    access_token: string | null;
    token_expires_at: string | null;
    refresh_token: string | null;
    enabled: boolean;
    last_sync_at: string | null;
    last_error: string | null;
    feed_token: string | null;
}

export async function getCredentials(companyId: string): Promise<AvitoCredentials | null> {
    const result = await query('SELECT * FROM avito_credentials WHERE company_id = $1', [companyId]);
    return result.rows[0] || null;
}

export async function getCredentialsByFeedToken(feedToken: string): Promise<AvitoCredentials | null> {
    const result = await query('SELECT * FROM avito_credentials WHERE feed_token = $1', [feedToken]);
    return result.rows[0] || null;
}

export async function saveCredentials(
    companyId: string,
    clientId: string,
    clientSecret: string,
    userId?: string
): Promise<AvitoCredentials> {
    const existing = await getCredentials(companyId);
    if (existing) {
        await query(
            `UPDATE avito_credentials
             SET client_id = $1, client_secret = $2, user_id = $3,
                 access_token = NULL, token_expires_at = NULL,
                 last_error = NULL, updated_at = NOW()
             WHERE company_id = $4`,
            [clientId, clientSecret, userId || existing.user_id, companyId]
        );
    } else {
        const id = uuidv4();
        const feedToken = crypto.randomBytes(32).toString('hex');
        await query(
            `INSERT INTO avito_credentials
             (id, company_id, client_id, client_secret, user_id, enabled, feed_token)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
            [id, companyId, clientId, clientSecret, userId || null, feedToken]
        );
    }
    return (await getCredentials(companyId))!;
}

/**
 * Ensure feed_token exists (for older records that don't have one)
 */
export async function ensureFeedToken(companyId: string): Promise<string> {
    const creds = await getCredentials(companyId);
    if (!creds) throw new Error('Avito credentials not configured');
    if (creds.feed_token) return creds.feed_token;
    const token = crypto.randomBytes(32).toString('hex');
    await query('UPDATE avito_credentials SET feed_token = $1, updated_at = NOW() WHERE company_id = $2', [token, companyId]);
    return token;
}

export async function deleteCredentials(companyId: string): Promise<void> {
    await query('DELETE FROM avito_credentials WHERE company_id = $1', [companyId]);
}

/**
 * Obtain OAuth2 access token via client_credentials grant.
 */
export async function getAccessToken(companyId: string): Promise<string> {
    const creds = await getCredentials(companyId);
    if (!creds) throw new Error('Avito credentials not configured');
    if (!creds.enabled) throw new Error('Avito integration disabled');

    if (creds.access_token && creds.token_expires_at) {
        const expiresAt = new Date(creds.token_expires_at).getTime();
        if (expiresAt - Date.now() > 60_000) {
            return creds.access_token;
        }
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.client_id,
        client_secret: creds.client_secret,
    });

    const resp = await fetch(AVITO_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!resp.ok) {
        const text = await resp.text();
        await query(
            'UPDATE avito_credentials SET last_error = $1, updated_at = NOW() WHERE company_id = $2',
            [`OAuth failed: ${resp.status} ${text.substring(0, 500)}`, companyId]
        );
        throw new Error(`Avito OAuth failed: ${resp.status}`);
    }

    const data = await resp.json() as { access_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();

    await query(
        `UPDATE avito_credentials
         SET access_token = $1, token_expires_at = $2, last_error = NULL, updated_at = NOW()
         WHERE company_id = $3`,
        [data.access_token, expiresAt, companyId]
    );

    return data.access_token;
}

/**
 * Test that credentials work by requesting token + a simple ping.
 */
export async function testConnection(companyId: string): Promise<{ ok: true; user_id?: string } | { ok: false; error: string }> {
    try {
        const token = await getAccessToken(companyId);
        const resp = await fetch(`${AVITO_API_BASE}/core/v1/accounts/self`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
            const text = await resp.text();
            return { ok: false, error: `Self check failed: ${resp.status} ${text.substring(0, 200)}` };
        }
        const data = await resp.json() as any;
        if (data?.id) {
            await query(
                'UPDATE avito_credentials SET user_id = $1, last_sync_at = NOW() WHERE company_id = $2',
                [String(data.id), companyId]
            );
        }
        return { ok: true, user_id: data?.id };
    } catch (e: any) {
        return { ok: false, error: e.message || 'Unknown error' };
    }
}

// ─── XML Feed Generation ──────────────────────────────────────────────────

function escapeXml(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

const baseNoTrailingSlash = (baseUrl: string) => String(baseUrl || '').replace(/\/+$/, '');

/**
 * Публичный URL фото для Avito Autoload (XML Image @url).
 * По инструкции Авито: ссылка https/http, по ней должно открываться/скачиваться изображение, без авторизации.
 *
 * Раньше: (1) при фото только в БД часто пустой file_url → все ссылки отбрасывались;
 * (2) ключ S3 в file_url без схемы https → отбрасывалось → в XML не было Images.
 */
function publicPhotoUrlForAvitoFeed(
    row: { id: string; file_url: string | null; has_data: boolean },
    baseUrl: string
): string | null {
    const base = baseNoTrailingSlash(baseUrl);
    if (!base) return null;

    const url = String(row.file_url ?? '').trim();
    const hasData = Boolean(row.has_data);

    if (url.startsWith('data:')) return null;

    if (hasData) {
        return `${base}/api/properties/photo-data/${row.id}.jpg`;
    }

    if (url.startsWith('db://')) {
        const photoId = url.replace(/^db:\/\//, '').trim() || row.id;
        return `${base}/api/properties/photo-data/${photoId}.jpg`;
    }

    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    // Локальные пути, ключи S3, legacy private/* — GET /photo-data/:id отдаёт файл или редирект на S3
    if (url) {
        return `${base}/api/properties/photo-data/${row.id}.jpg`;
    }

    return null;
}

function normalizeAvitoPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
    if (digits.length === 10) return `7${digits}`;
    if (digits.length >= 11) return digits.slice(0, 11);
    return null;
}

function normalizeAvitoBooleanOption(value: unknown): 'Да' | 'Нет' | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    if (['yes', 'true', '1', 'да', 'можно', 'allowed'].includes(raw)) return 'Да';
    if (['no', 'false', '0', 'нет', 'нельзя', 'not_allowed', 'forbidden'].includes(raw)) return 'Нет';
    return null;
}

/**
 * Map internal property category to Avito Category + OperationType
 */
function getAvitoCategory(prop: any): { Category: string; OperationType: string; ObjectType?: string; ObjectSubtype?: string } {
    const category = prop.category || 'apartment_sell';

    if (category === 'rent' || category === 'apartment_rent') {
        return { Category: 'Квартиры', OperationType: 'Сдам' };
    }
    if (category === 'house') {
        return { Category: 'Дома, дачи, коттеджи', OperationType: 'Продам' };
    }
    if (category === 'land') {
        return { Category: 'Земельные участки', OperationType: 'Продам' };
    }
    if (category === 'commercial') {
        return { Category: 'Коммерческая недвижимость', OperationType: 'Продам' };
    }
    // apartment_sell, secondary, newbuilding
    return { Category: 'Квартиры', OperationType: 'Продам' };
}

/**
 * Avito-specific enum mappings
 */
const houseTypeMap: Record<string, string> = {
    panel: 'Панельный', brick: 'Кирпичный', monolith: 'Монолитный',
    'monolith-brick': 'Монолитно-кирпичный', block: 'Блочный', wood: 'Деревянный', other: 'Иной',
};
const renovationMap: Record<string, string> = {
    without: 'Требуется',
    cosmetic: 'Косметический',
    designer: 'Дизайнерский',
    euro: 'Евро',
    requires: 'Требуется',
};
const bathroomMap: Record<string, string> = {
    combined: 'Совмещённый', separate: 'Раздельный', multiple: 'Два и более',
};
const balconyMap: Record<string, string> = {
    balcony: 'Балкон', loggia: 'Лоджия', both: 'Балкон и лоджия', none: 'Нет',
};
const elevatorMap: Record<string, string> = {
    none: 'Нет', passenger: '1', freight: '1', both: '1',
};
const viewMap: Record<string, string> = {
    yard: 'Во двор', street: 'На улицу', sunny: 'На солнечную сторону',
};
const parkingMap: Record<string, string> = {
    underground: 'Подземная',
    ground: 'Наземная многоуровневая',
    yard_open: 'Открытая во дворе',
    yard_barrier: 'За шлагбаумом во дворе',
    guest: 'Гостевая',
};

// House object type mapping (for Дома, дачи, коттеджи)
const houseObjectTypeMap: Record<string, string> = {
    house: 'Дом', cottage: 'Коттедж', dacha: 'Дача', townhouse: 'Таунхаус', other: 'Дом',
};

// House bathroom mapping (values: В доме / На улице)
const houseBathroomMap: Record<string, string> = {
    inside: 'В доме', outside: 'На улице',
    combined: 'В доме', separate: 'В доме', multiple: 'В доме',
};

// House parking type mapping (ParkingType tag, not Parking)
const houseParkingTypeMap: Record<string, string> = {
    none: 'Нет', garage: 'Гараж', parking_space: 'Парковочное место',
    underground: 'Нет', ground: 'Нет', yard_open: 'Нет', yard_barrier: 'Нет', guest: 'Нет',
};

// Commercial ObjectType mapping
const commercialObjectTypeMap: Record<string, string> = {
    office: 'Офисное помещение',
    free_purpose: 'Помещение свободного назначения',
    retail: 'Торговое помещение',
    warehouse: 'Складское помещение',
    production: 'Производственное помещение',
    catering: 'Помещение общественного питания',
    hotel: 'Гостиница',
    autoservice: 'Автосервис',
    building: 'Здание',
    coworking: 'Коворкинг',
    storage: 'Кладовая',
    residential: 'Помещение свободного назначения',
    other: 'Помещение свободного назначения',
};

const ALLOWED_RENOVATIONS = new Set([
    'Косметический',
    'Евро',
    'Дизайнерский',
    'Требуется',
]);

function normalizeRenovation(value: string | null | undefined): string | null {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (ALLOWED_RENOVATIONS.has(raw)) return raw;

    const normalized = raw.toLowerCase();
    const fromSlug = renovationMap[normalized];
    if (fromSlug && ALLOWED_RENOVATIONS.has(fromSlug)) return fromSlug;

    // Compatibility with legacy/manual values.
    if (
        normalized === 'требуется' ||
        normalized === 'требуется ремонт' ||
        normalized === 'требует ремонт' ||
        normalized === 'без ремонта' ||
        normalized === 'без отделки'
    ) {
        return 'Требуется';
    }

    // Direct Russian value matching (handles values saved as labels)
    if (normalized === 'косметический') return 'Косметический';
    if (normalized === 'евро' || normalized === 'евроремонт') return 'Евро';
    if (normalized === 'дизайнерский') return 'Дизайнерский';

    return null;
}

/**
 * Generate a single <Ad> XML element for a property.
 * Format matches working feed from topnlab (Avito Autoload v3).
 */
function propertyToAdXml(prop: any, photoUrls: string[]): string {
    const { Category, OperationType } = getAvitoCategory(prop);
    const isApartmentRent = Category === 'Квартиры' && OperationType === 'Сдам';
    const toNumber = (v: any): number | null => {
        if (v === null || v === undefined) return null;
        const raw = String(v).trim().replace(',', '.');
        if (!raw) return null;
        const direct = Number(raw);
        if (Number.isFinite(direct)) return direct;
        const m = raw.match(/-?\d+(\.\d+)?/);
        if (!m) return null;
        const parsed = Number(m[0]);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const lines: string[] = [];
    lines.push(`    <Ad>`);
    lines.push(`        <Id>${escapeXml(prop.id)}</Id>`);
    if (prop.avito_item_id) {
        lines.push(`        <AvitoId>${escapeXml(String(prop.avito_item_id))}</AvitoId>`);
    }
    lines.push(`        <Category>${escapeXml(Category)}</Category>`);
    lines.push(`        <AdStatus>Free</AdStatus>`);
    lines.push(`        <ListingFee>PackageSingle</ListingFee>`);
    lines.push(`        <OperationType>${escapeXml(OperationType)}</OperationType>`);
    lines.push(`        <PropertyRights>${escapeXml(prop.property_rights || 'Посредник')}</PropertyRights>`);

    // Address — полный: "Область, Город, Улица, дом"
    const addressParts: string[] = [];
    if (prop.city) addressParts.push(prop.city);
    if (prop.address) addressParts.push(prop.address);
    const fullAddress = addressParts.join(', ');
    lines.push(`        <Address>${escapeXml(fullAddress)}</Address>`);

    // Coordinates
    if (prop.lat && prop.lng) {
        lines.push(`        <Latitude>${prop.lat}</Latitude>`);
        lines.push(`        <Longitude>${prop.lng}</Longitude>`);
    }

    // ─── Квартиры ───
    if (Category === 'Квартиры') {
        // Mandatory fields with safe fallbacks
        lines.push(`        <Rooms>${escapeXml(String(prop.rooms || '1'))}</Rooms>`);
        lines.push(`        <Floor>${prop.floor || 1}</Floor>`);
        lines.push(`        <Floors>${prop.floors_total || 1}</Floors>`);

        // HouseType
        const ht = prop.house_type && houseTypeMap[prop.house_type] ? houseTypeMap[prop.house_type] : 'Панельный';
        lines.push(`        <HouseType>${escapeXml(ht)}</HouseType>`);

        // KitchenSpace — mandatory for 1+ rooms; safe fallback
        lines.push(`        <KitchenSpace>${prop.area_kitchen || 5}</KitchenSpace>`);

        // RoomType — mandatory for 2+ rooms
        const roomCountNum = typeof prop.rooms === 'string' && /^\d+$/.test(prop.rooms) ? Number(prop.rooms) : (prop.rooms === '10 и более' ? 10 : null);
        if (roomCountNum !== null && roomCountNum >= 2) {
            const roomType = prop.room_type || 'Изолированные';
            lines.push(`        <RoomType><Option>${escapeXml(roomType)}</Option></RoomType>`);
        }

        // LeaseType is mandatory for apartment rent ("Срок аренды" on Avito side).
        if (isApartmentRent) {
            const leaseTypeMap: Record<string, string> = {
                long: 'На длительный срок',
                short: 'Посуточно',
                any: 'На длительный срок',
            };
            const leaseTypeRaw = String(prop.lease_term || '').trim().toLowerCase();
            const leaseType = leaseTypeMap[leaseTypeRaw] || 'На длительный срок';
            // HouseType is mandatory for rent too (already output above)
            // For rent flow, Avito expects rental-specific fields.
            lines.push(`        <RentalType>Прямая</RentalType>`);
            lines.push(`        <LeaseType>${escapeXml(leaseType)}</LeaseType>`);

            // Commission size (percent). If not provided, use a safe default.
            // Required by Avito for agency listings.
            const commissionSizeRaw =
                toNumber((prop as any).lease_commission_size) ??
                toNumber((prop as any).commission_percent) ??
                toNumber((prop as any).commission) ??
                50;
            const commissionSize = Math.max(0, Math.min(200, Math.round(commissionSizeRaw)));
            lines.push(`        <LeaseCommissionSize>${commissionSize}</LeaseCommissionSize>`);

            // Deposit amount. Accept absolute amount or "N months" shorthand.
            const depositRaw = String((prop as any).deposit_amount ?? '').trim();
            const depositNum = toNumber(depositRaw);
            let depositAmount = 0;
            if (depositNum && depositNum > 0) {
                // If value is small (e.g. "1", "2"), treat as number of monthly rents.
                if (
                    (depositNum <= 12 && Number(prop.price || 0) > 0 && /меся|month|мес/i.test(depositRaw)) ||
                    (depositNum <= 3 && !/\d{4,}/.test(depositRaw))
                ) {
                    depositAmount = Math.round(Number(prop.price || 0) * depositNum);
                } else {
                    depositAmount = Math.round(depositNum);
                }
            } else {
                // Required by Avito; fallback to one monthly payment.
                depositAmount = Math.max(0, Math.round(Number(prop.price || 0)));
            }
            lines.push(`        <DepositAmount>${depositAmount}</DepositAmount>`);

            // Utilities block required in many rent templates.
            lines.push(`        <OtherUtilities>Оплачивается арендатором</OtherUtilities>`);
            const otherUtilitiesPaymentRaw =
                toNumber((prop as any).other_utilities_payment) ??
                toNumber((prop as any).utilities_payment) ??
                toNumber((prop as any).utility_payment) ??
                toNumber((prop as any).other_expenses) ??
                3000;
            const otherUtilitiesPayment = Math.max(1, Math.round(otherUtilitiesPaymentRaw));
            lines.push(`        <OtherUtilitiesPayment>${otherUtilitiesPayment}</OtherUtilitiesPayment>`);
            lines.push(`        <UtilityMeters>Оплачивается арендатором</UtilityMeters>`);

            // Bathroom for rent — multiple values supported
            if (prop.bathroom) {
                const bathValues = String(prop.bathroom).split(',').map(v => v.trim()).filter(Boolean);
                const bathOpts = bathValues.map(v => bathroomMap[v]).filter(Boolean);
                if (bathOpts.length > 0) {
                    lines.push(`        <BathroomMulti>${bathOpts.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</BathroomMulti>`);
                }
            }

            // Avito rent feed: explicit yes/no flags for children, pets and smoking.
            const childrenAllowed = normalizeAvitoBooleanOption((prop as any).children_allowed) || 'Да';
            const petsAllowed = normalizeAvitoBooleanOption((prop as any).pets_allowed) || 'Да';
            const smokingAllowed = normalizeAvitoBooleanOption((prop as any).smoking_allowed) || 'Нет';
            lines.push(`        <ChildrenAllowed>${childrenAllowed}</ChildrenAllowed>`);
            lines.push(`        <PetsAllowed>${petsAllowed}</PetsAllowed>`);
            lines.push(`        <SmokingAllowed>${smokingAllowed}</SmokingAllowed>`);

            // Rent-specific optional fields (appliances / comfort)
            const internetVal = normalizeAvitoBooleanOption((prop as any).internet);
            if (internetVal) lines.push(`        <Internet>${internetVal}</Internet>`);

            const hasConditioner = normalizeAvitoBooleanOption((prop as any).conditioner) === 'Да';
            const hasWashingMachine = normalizeAvitoBooleanOption((prop as any).washing_machine) === 'Да';
            const hasDishwasher = normalizeAvitoBooleanOption((prop as any).dishwasher) === 'Да';
            const hasFridge = normalizeAvitoBooleanOption((prop as any).fridge) === 'Да';
            const hasTV = normalizeAvitoBooleanOption((prop as any).tv) === 'Да';

            if (hasConditioner) lines.push(`        <AirCondition>Да</AirCondition>`);
            if (hasWashingMachine) lines.push(`        <WashingMachine>Да</WashingMachine>`);
            if (hasDishwasher) lines.push(`        <Dishwasher>Да</Dishwasher>`);
            if (hasFridge) lines.push(`        <Refrigerator>Да</Refrigerator>`);
            if (hasTV) lines.push(`        <TV>Да</TV>`);
        } else {
            // DealType is used for sale flow only.
            lines.push(`        <DealType>${escapeXml(prop.deal_type || 'Прямая продажа')}</DealType>`);
        }

        // LivingSpace
        if (prop.area_living) lines.push(`        <LivingSpace>${prop.area_living}</LivingSpace>`);

        // MarketType
        const isNewbuilding = prop.category === 'newbuilding' && prop.new_development_id;
        lines.push(`        <MarketType>${isNewbuilding ? 'Новостройка' : 'Вторичка'}</MarketType>`);

        if (isNewbuilding) {
            lines.push(`        <NewDevelopmentId>${escapeXml(prop.new_development_id)}</NewDevelopmentId>`);
            const decoration = prop.decoration || 'Чистовая';
            lines.push(`        <Decoration>${escapeXml(decoration)}</Decoration>`);
            const saleMethod = prop.sale_method || 'Договор долевого участия';
            lines.push(`        <SaleMethod>${escapeXml(saleMethod)}</SaleMethod>`);
        }

        // Renovation — mandatory for apartments; fallback to 'Требуется'
        const apartmentRenovation = normalizeRenovation(prop.renovation);
        if (Category === 'Квартиры') {
            lines.push(`        <Renovation>${escapeXml(apartmentRenovation || 'Требуется')}</Renovation>`);
        } else if (apartmentRenovation) {
            lines.push(`        <Renovation>${escapeXml(apartmentRenovation)}</Renovation>`);
        }

        // Status — mandatory (Квартира / Апартаменты)
        const aptStatus = prop.apartment_type === 'apartments' ? 'Апартаменты' : 'Квартира';
        lines.push(`        <Status>${aptStatus}</Status>`);

        // ViewFromWindows
        if (prop.view_from_window) {
            const views = String(prop.view_from_window).split(',').map(v => viewMap[v.trim()] || v.trim()).filter(Boolean);
            if (views.length > 0) {
                lines.push(`        <ViewFromWindows>${views.map(v => `<Option>${escapeXml(v)}</Option>`).join('')}</ViewFromWindows>`);
            }
        }

        // Square — mandatory
        lines.push(`        <Square>${prop.area_total || 10}</Square>`);

        // BalconyOrLoggiaMulti — multiple values supported
        if (prop.balcony && prop.balcony !== 'none') {
            const balconyValues = String(prop.balcony).split(',').map(v => v.trim()).filter(Boolean);
            const balconyOpts: string[] = [];
            for (const v of balconyValues) {
                if (v === 'balcony') balconyOpts.push('Балкон');
                else if (v === 'loggia') balconyOpts.push('Лоджия');
                else if (v === 'both') { balconyOpts.push('Балкон', 'Лоджия'); }
            }
            if (balconyOpts.length > 0) {
                lines.push(`        <BalconyOrLoggiaMulti>${balconyOpts.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</BalconyOrLoggiaMulti>`);
            }
        }

        // BathroomMulti — multiple values supported
        if (prop.bathroom) {
            const bathValues = String(prop.bathroom).split(',').map(v => v.trim()).filter(Boolean);
            const bathOpts = bathValues.map(v => bathroomMap[v]).filter(Boolean);
            if (bathOpts.length > 0) {
                lines.push(`        <BathroomMulti>${bathOpts.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</BathroomMulti>`);
            }
        }

        // SaleOptions — map UI values to Avito-allowed options
        const SALE_OPTIONS_MAP: Record<string, string[]> = {
            'Можно в ипотеку': ['Можно в ипотеку'],
            'Ипотека и маткапитал': ['Можно в ипотеку', 'Материнский капитал'],
            'Материнский капитал': ['Материнский капитал'],
            'Военная ипотека': ['Военная ипотека'],
            'Переуступка': ['Переуступка'],
            'Назначение компенсации': ['Назначение компенсации'],
        };
        if (!isApartmentRent) {
            const mappedOpts = prop.sale_options
                ? (SALE_OPTIONS_MAP[String(prop.sale_options).trim()] || [String(prop.sale_options).trim()])
                : ['Можно в ипотеку'];
            const validOpts = mappedOpts.filter(o => Object.values(SALE_OPTIONS_MAP).flat().includes(o));
            if (validOpts.length > 0) {
                lines.push(`        <SaleOptions>${validOpts.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</SaleOptions>`);
            } else {
                lines.push(`        <SaleOptions><Option>Можно в ипотеку</Option></SaleOptions>`);
            }
        }

        // Parking — multiple values supported
        if (prop.parking) {
            const parkValues = String(prop.parking).split(',').map(v => v.trim()).filter(Boolean);
            const parkOpts = parkValues.map(v => parkingMap[v]).filter(Boolean);
            if (parkOpts.length > 0) {
                lines.push(`        <Parking>${parkOpts.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</Parking>`);
            }
        }

        // Elevators — support count from dedicated fields or legacy elevator type
        const passengerElevatorCount = toNumber((prop as any).passenger_elevator_count);
        const freightElevatorCount = toNumber((prop as any).freight_elevator_count);
        const elev = prop.elevator || 'none';
        const passengerElevator = passengerElevatorCount !== null
            ? (passengerElevatorCount > 0 ? String(passengerElevatorCount) : 'Нет')
            : (elev === 'passenger' || elev === 'both' ? '1' : 'Нет');
        const freightElevator = freightElevatorCount !== null
            ? (freightElevatorCount > 0 ? String(freightElevatorCount) : 'Нет')
            : (elev === 'freight' || elev === 'both' ? '1' : 'Нет');
        lines.push(`        <PassengerElevator>${passengerElevator}</PassengerElevator>`);
        lines.push(`        <FreightElevator>${freightElevator}</FreightElevator>`);

        if (prop.ceiling_height) lines.push(`        <CeilingHeight>${prop.ceiling_height}</CeilingHeight>`);
        if (prop.year_built || prop.built_year) {
            lines.push(`        <YearBuilt>${prop.year_built || prop.built_year}</YearBuilt>`);
        }
        // Heating / utilities for apartments
        const aptYesNoMap = (v: string | null | undefined) => v === 'yes' ? 'Есть' : v === 'no' ? 'Нет' : null;
        const aptHeating = aptYesNoMap(prop.heating);
        if (aptHeating) lines.push(`        <Heating>${aptHeating}</Heating>`);
        const aptWater = aptYesNoMap(prop.water_supply);
        if (aptWater) lines.push(`        <WaterSupply>${aptWater}</WaterSupply>`);
        const aptSewer = aptYesNoMap(prop.sewerage);
        if (aptSewer) lines.push(`        <Sewerage>${aptSewer}</Sewerage>`);
        const aptGas = aptYesNoMap(prop.gas_supply);
        if (aptGas) lines.push(`        <GasSupply>${aptGas}</GasSupply>`);
    }

    // ─── Дома, дачи, коттеджи ───
    if (Category === 'Дома, дачи, коттеджи') {
        // ObjectType — mandatory: Дом / Дача / Коттедж / Таунхаус
        const houseObjType = prop.object_type && houseObjectTypeMap[prop.object_type]
            ? houseObjectTypeMap[prop.object_type]
            : (prop.house_type && houseObjectTypeMap[prop.house_type]
                ? houseObjectTypeMap[prop.house_type]
                : 'Дом');
        lines.push(`        <ObjectType>${escapeXml(houseObjType)}</ObjectType>`);

        // Mandatory fields with safe fallbacks
        lines.push(`        <Square>${prop.area_total || 20}</Square>`);
        lines.push(`        <LandArea>${prop.land_area || 1}</LandArea>`);
        lines.push(`        <Floors>${prop.floors_total || 1}</Floors>`);
        lines.push(`        <Rooms>${prop.rooms || 1}</Rooms>`);

        // WallsType from walls_type or house_type — mandatory
        const wallsTypeMap: Record<string, string> = {
            brick: 'Кирпич', wood: 'Дерево', block: 'Блоки', monolith: 'Монолит', frame: 'Каркас',
            panel: 'Каркас', 'monolith-brick': 'Кирпич',
        };
        const wt = prop.walls_type || prop.house_type;
        const wallsTypeVal = wt && wallsTypeMap[wt] ? wallsTypeMap[wt] : 'Кирпич';
        lines.push(`        <WallsType>${escapeXml(wallsTypeVal)}</WallsType>`);

        const houseRenovation = normalizeRenovation(prop.renovation);
        lines.push(`        <Renovation>${escapeXml(houseRenovation || 'Требуется')}</Renovation>`);

        // BathroomMulti for houses — values: В доме / На улице, multiple supported
        const houseBathValues: string[] = [];
        if (prop.bathroom_location) {
            const blValues = String(prop.bathroom_location).split(',').map(v => v.trim()).filter(Boolean);
            for (const v of blValues) {
                if (houseBathroomMap[v]) houseBathValues.push(houseBathroomMap[v]);
            }
        }
        if (prop.bathroom && houseBathValues.length === 0) {
            const bValues = String(prop.bathroom).split(',').map(v => v.trim()).filter(Boolean);
            for (const v of bValues) {
                if (houseBathroomMap[v]) houseBathValues.push(houseBathroomMap[v]);
            }
        }
        if (houseBathValues.length === 0) houseBathValues.push('В доме');
        lines.push(`        <BathroomMulti>${houseBathValues.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</BathroomMulti>`);
        // Heating / utilities for houses — Avito requires specific values
        // Use utility_details if available, otherwise fallback to yes/no mapping
        const u = prop.utility_details || {};
        
        const waterSupplyMap: Record<string, string> = {
            'central': 'Центральное',
            'well': 'Скважина',
            'spring': 'Колодец',
            'no': 'Нет',
        };
        const sewerageMap: Record<string, string> = {
            'central': 'Центральная',
            'septic': 'Септик',
            'cesspool': 'Выгребная яма',
            'bio_station': 'Станция биоочистки',
            'no': 'Нет',
        };
        const gasSupplyMap: Record<string, string> = {
            'in_house': 'В доме',
            'border': 'По границе участка',
            'no': 'Нет',
        };
        
        // WaterSupply: Нет, Центральное, Скважина, Колодец
        const waterSupplyVal = waterSupplyMap[u.water_supply_type] || (prop.water_supply === 'yes' ? 'Центральное' : 'Нет');
        lines.push(`        <WaterSupply>${escapeXml(waterSupplyVal)}</WaterSupply>`);
        
        // Sewerage: Нет, Центральная, Септик, Выгребная яма, Станция биоочистки
        const sewerageVal = sewerageMap[u.sewerage_type] || (prop.sewerage === 'yes' ? 'Центральная' : 'Нет');
        lines.push(`        <Sewerage>${escapeXml(sewerageVal)}</Sewerage>`);
        
        // GasSupply: Нет, По границе участка, В доме
        const gasSupplyVal = gasSupplyMap[u.gas_supply_type] || (prop.gas_supply === 'yes' ? 'В доме' : 'Нет');
        lines.push(`        <GasSupply>${escapeXml(gasSupplyVal)}</GasSupply>`);
        
        // Heating: Нет, Есть — необязательный, выводим только если задано
        const hasHeating = u.heating_type || prop.heating === 'yes';
        if (hasHeating) {
            const heatingVal = u.heating_type ? 'Есть' : (prop.heating === 'yes' ? 'Есть' : 'Нет');
            if (heatingVal === 'Есть') {
                lines.push(`        <Heating>Есть</Heating>`);
                // HeatingType — несколько значений через Option
                const htMap: Record<string, string> = {
                    central: 'Центральное',
                    gas: 'Газовое',
                    electric: 'Электрическое',
                    solid: 'Жидкотопливный котёл',
                    stove: 'Печь',
                    fireplace: 'Камин',
                    other: 'Другое'
                };
                // Поддержка нескольких типов отопления через запятую
                const htRaw = u.heating_type || 'other';
                const htTypes = String(htRaw).split(',').map(t => t.trim()).filter(Boolean);
                const htOptions = htTypes.map(t => htMap[t] || t).filter(Boolean);
                if (htOptions.length > 0) {
                    lines.push(`        <HeatingType>${htOptions.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</HeatingType>`);
                }
            } else if (prop.heating === 'no') {
                lines.push(`        <Heating>Нет</Heating>`);
            }
        }
        
        // Electricity: Нет, Есть
        const electricityVal = u.electricity || (prop.electricity === 'yes' || prop.heating === 'yes' ? 'Есть' : 'Нет');
        lines.push(`        <Electricity>${escapeXml(electricityVal)}</Electricity>`);
        // LandStatus — mandatory for houses
        const landStatusMap: Record<string, string> = {
            izhs: 'Индивидуальное жилищное строительство (ИЖС)',
            snt: 'Садоводческое некоммерческое товарищество (СНТ)',
            dnp: 'Дачное некоммерческое партнерство (ДНП)',
            lpx: 'Личное подсобное хозяйство (ЛПХ)',
        };
        const landStatus = prop.land_status && landStatusMap[prop.land_status]
            ? landStatusMap[prop.land_status]
            : prop.land_status || 'Индивидуальное жилищное строительство (ИЖС)';
        lines.push(`        <LandStatus>${escapeXml(landStatus)}</LandStatus>`);
        if (prop.year_built || prop.built_year) {
            lines.push(`        <BuiltYear>${prop.year_built || prop.built_year}</BuiltYear>`);
        }
        // Additional house fields
        if (prop.area_living) lines.push(`        <LivingSpace>${prop.area_living}</LivingSpace>`);
        if (prop.area_kitchen) lines.push(`        <KitchenSpace>${prop.area_kitchen}</KitchenSpace>`);
        if (prop.balcony && prop.balcony !== 'none') {
            const balconyValues = String(prop.balcony).split(',').map(v => v.trim()).filter(Boolean);
            const balconyOpts: string[] = [];
            for (const v of balconyValues) {
                if (v === 'balcony') balconyOpts.push('Балкон');
                else if (v === 'loggia') balconyOpts.push('Лоджия');
                else if (v === 'both') { balconyOpts.push('Балкон', 'Лоджия'); }
            }
            if (balconyOpts.length > 0) {
                lines.push(`        <BalconyOrLoggiaMulti>${balconyOpts.map(o => `<Option>${escapeXml(o)}</Option>`).join('')}</BalconyOrLoggiaMulti>`);
            }
        }
        if (prop.view_from_window) {
            const views = String(prop.view_from_window).split(',').map(v => viewMap[v.trim()] || v.trim()).filter(Boolean);
            if (views.length > 0) {
                lines.push(`        <ViewFromWindows>${views.map(v => `<Option>${escapeXml(v)}</Option>`).join('')}</ViewFromWindows>`);
            }
        }
        if (prop.ceiling_height) lines.push(`        <CeilingHeight>${prop.ceiling_height}</CeilingHeight>`);
        // ParkingType for houses (not Parking!)
        const houseParking = prop.parking && houseParkingTypeMap[prop.parking]
            ? houseParkingTypeMap[prop.parking]
            : 'Нет';
        lines.push(`        <ParkingType>${escapeXml(houseParking)}</ParkingType>`);

        // Elevators for houses
        const housePassengerElevatorCount = toNumber((prop as any).passenger_elevator_count);
        const houseFreightElevatorCount = toNumber((prop as any).freight_elevator_count);
        const houseElev = prop.elevator || 'none';
        const housePassengerElevator = housePassengerElevatorCount !== null
            ? (housePassengerElevatorCount > 0 ? String(housePassengerElevatorCount) : 'Нет')
            : (houseElev === 'passenger' || houseElev === 'both' ? '1' : 'Нет');
        const houseFreightElevator = houseFreightElevatorCount !== null
            ? (houseFreightElevatorCount > 0 ? String(houseFreightElevatorCount) : 'Нет')
            : (houseElev === 'freight' || houseElev === 'both' ? '1' : 'Нет');
        lines.push(`        <PassengerElevator>${housePassengerElevator}</PassengerElevator>`);
        lines.push(`        <FreightElevator>${houseFreightElevator}</FreightElevator>`);
    }

    // ─── Земельные участки ───
    if (Category === 'Земельные участки') {
        // LandArea — mandatory
        lines.push(`        <LandArea>${prop.land_area || 1}</LandArea>`);
        // ObjectType — категория земель (не LandStatus!)
        const landObjectTypeMap: Record<string, string> = {
            izhs: 'Поселений (ИЖС)',
            snt: 'Сельхозназначения (СНТ, ДНП)',
            dnp: 'Сельхозназначения (СНТ, ДНП)',
            lpx: 'Поселений (ИЖС)',
            prom: 'Промназначения',
        };
        const objType = prop.land_status && landObjectTypeMap[prop.land_status]
            ? landObjectTypeMap[prop.land_status]
            : 'Поселений (ИЖС)';
        lines.push(`        <ObjectType>${escapeXml(objType)}</ObjectType>`);
    }

    // ─── Коммерческая недвижимость ───
    if (Category === 'Коммерческая недвижимость') {
        // ObjectType — mandatory for commercial
        const commercialObjType = prop.commercial_type && commercialObjectTypeMap[prop.commercial_type]
            ? commercialObjectTypeMap[prop.commercial_type]
            : 'Помещение свободного назначения';
        lines.push(`        <ObjectType>${escapeXml(commercialObjType)}</ObjectType>`);

        // TransactionType for sale / RentalType for rent
        if (OperationType === 'Продам') {
            lines.push(`        <TransactionType>${escapeXml(prop.transaction_type || 'Продажа')}</TransactionType>`);
        } else if (OperationType === 'Сдам') {
            lines.push(`        <RentalType>${escapeXml(prop.rental_type || 'Прямая')}</RentalType>`);
        }

        const commercialBuildingTypeMap: Record<string, string> = {
            business_center: 'Бизнес-центр',
            shopping_center: 'Торговый центр',
            administrative: 'Административное здание',
            residential: 'Жилой дом',
            other: 'Другой',
        };
        const buildingType = prop.commercial_type && commercialBuildingTypeMap[prop.commercial_type]
            ? commercialBuildingTypeMap[prop.commercial_type]
            : 'Другой';
        lines.push(`        <BuildingType>${escapeXml(buildingType)}</BuildingType>`);
        if (prop.floor) {
            lines.push(`        <Floor>${prop.floor}</Floor>`);
        } else {
            lines.push(`        <Floor>1</Floor>`);
        }
        lines.push(`        <Square>${prop.area_total || 5}</Square>`);
        if (prop.year_built || prop.built_year) {
            lines.push(`        <BuiltYear>${prop.year_built || prop.built_year}</BuiltYear>`);
        }
        // HouseType for residential commercial
        if (prop.commercial_type === 'residential' && prop.house_type && houseTypeMap[prop.house_type]) {
            lines.push(`        <HouseType>${escapeXml(houseTypeMap[prop.house_type])}</HouseType>`);
        }
    }

    // Description
    const desc = prop.description || 'Объект недвижимости';
    lines.push(`        <Description><![CDATA[${desc}]]></Description>`);

    // Company & Contact info
    lines.push(`        <CompanyName>ВАША КРЫША</CompanyName>`);
    if (prop.owner_name) {
        lines.push(`        <ManagerName>${escapeXml(prop.owner_name)}</ManagerName>`);
    }
    if (prop.owner_email) {
        lines.push(`        <EMail>${escapeXml(prop.owner_email)}</EMail>`);
    }
    const contactPhone = normalizeAvitoPhone(prop.owner_phone || prop.contact_phone);
    if (contactPhone) {
        lines.push(`        <ContactPhone>${escapeXml(contactPhone)}</ContactPhone>`);
    }

    // Price
    lines.push(`        <Price>${Math.round(Number(prop.price || 0))}</Price>`);

    // Photos
    if (photoUrls.length > 0) {
        lines.push(`        <Images>`);
        for (const url of photoUrls) {
            lines.push(`            <Image url="${escapeXml(url)}"/>`);
        }
        lines.push(`        </Images>`);
    }

    // Listing & contact settings
    lines.push(`        <AllowEmail>Да</AllowEmail>`);
    lines.push(`        <ContactMethod>По телефону и в сообщениях</ContactMethod>`);

    lines.push(`    </Ad>`);
    return lines.join('\n');
}

/**
 * Generate full Avito Autoload XML feed for a company.
 * Only includes properties with avito_feed_enabled = TRUE and status in approved states.
 */
export async function generateFeedXml(companyId: string, baseUrl: string): Promise<string> {
    const propsResult = await query(
        `SELECT p.*, 
                pr.full_name as owner_name, pr.phone as owner_phone, pr.email as owner_email
         FROM properties p
         LEFT JOIN profiles pr ON pr.id = p.owner_id
         WHERE p.company_id = $1
           AND p.avito_feed_enabled = TRUE
           AND p.status IN ('approved', 'avito_approved', 'published_avito', 'in_feed')
         ORDER BY p.created_at DESC`,
        [companyId]
    );

    const ads: string[] = [];

    for (const prop of propsResult.rows) {
        const photosResult = await query(
            'SELECT id, file_url, (file_data IS NOT NULL) AS has_data FROM property_photos WHERE property_id = $1 ORDER BY sort_order',
            [prop.id]
        );
        const photoUrls = photosResult.rows
            .map((p: any) =>
                publicPhotoUrlForAvitoFeed(
                    { id: String(p.id), file_url: p.file_url, has_data: Boolean(p.has_data) },
                    baseUrl
                )
            )
            .filter(Boolean) as string[];

        ads.push(propertyToAdXml(prop, photoUrls));
    }

    const xml = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<Ads formatVersion="3" target="Avito.ru">`,
        ...ads,
        `</Ads>`,
    ].join('\n');

    // Update last_sync_at
    await query(
        'UPDATE avito_credentials SET last_sync_at = NOW(), last_error = NULL WHERE company_id = $1',
        [companyId]
    );

    return xml;
}

/**
 * Add property to feed (set avito_feed_enabled = true, status = 'in_feed')
 */
export async function addToFeed(companyId: string, propertyId: string): Promise<void> {
    const propResult = await query(
        'SELECT id, status FROM properties WHERE id = $1 AND company_id = $2',
        [propertyId, companyId]
    );
    if (propResult.rows.length === 0) throw new Error('Property not found');

    const prop = propResult.rows[0];
    if (!['approved', 'avito_approved', 'avito_pending', 'in_feed'].includes(prop.status)) {
        throw new Error('Property must be approved before adding to feed');
    }

    await query(
        `UPDATE properties
         SET avito_feed_enabled = TRUE,
             status = 'in_feed',
             avito_last_error = NULL,
             avito_last_attempt_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [propertyId]
    );
}

/**
 * Remove property from feed
 */
export async function removeFromFeed(companyId: string, propertyId: string): Promise<void> {
    await query(
        `UPDATE properties
         SET avito_feed_enabled = FALSE,
             status = 'approved',
             updated_at = NOW()
         WHERE id = $1 AND company_id = $2`,
        [propertyId, companyId]
    );
}

/**
 * Get feed stats for a company
 */
export async function getFeedStats(companyId: string): Promise<{ total_in_feed: number; feed_url: string | null }> {
    const countResult = await query(
        'SELECT COUNT(*) as cnt FROM properties WHERE company_id = $1 AND avito_feed_enabled = TRUE',
        [companyId]
    );
    const creds = await getCredentials(companyId);
    return {
        total_in_feed: Number(countResult.rows[0]?.cnt || 0),
        feed_url: creds?.feed_token ? `/api/avito/feed.xml?token=${creds.feed_token}` : null,
    };
}

// ─── Avito Autoload API v2 (programmatic feed upload) ─────────────────────

/**
 * Upload XML feed to Avito via Autoload API v2.
 * POST https://api.avito.ru/autoload/v2/accounts/{user_id}/items
 * Content-Type: application/xml
 * 
 * This pushes the feed to Avito immediately instead of waiting for
 * Avito to pull it by schedule.
 */
export async function syncFeedToAvito(companyId: string, baseUrl: string): Promise<{ success: boolean; items_count: number; error?: string }> {
    const creds = await getCredentials(companyId);
    if (!creds) throw new Error('Avito credentials not configured');
    if (!creds.user_id) throw new Error('Avito user_id not set. Run "Test connection" first.');

    const token = await getAccessToken(companyId);
    const xml = await generateFeedXml(companyId, baseUrl);

    // Count ads in feed
    const itemsCount = (xml.match(/<Ad>/g) || []).length;

    const url = `${AVITO_API_BASE}/autoload/v2/accounts/${creds.user_id}/items`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/xml',
        },
        body: xml,
    });

    if (!resp.ok) {
        const text = await resp.text();
        const errorMsg = `Autoload API: ${resp.status} ${text.substring(0, 500)}`;
        await query(
            'UPDATE avito_credentials SET last_error = $1, updated_at = NOW() WHERE company_id = $2',
            [errorMsg, companyId]
        );
        return { success: false, items_count: itemsCount, error: errorMsg };
    }

    await query(
        'UPDATE avito_credentials SET last_sync_at = NOW(), last_error = NULL, updated_at = NOW() WHERE company_id = $1',
        [companyId]
    );

    // Update all in_feed properties to published_avito
    await query(
        `UPDATE properties SET status = 'published_avito', updated_at = NOW()
         WHERE company_id = $1 AND avito_feed_enabled = TRUE AND status = 'in_feed'`,
        [companyId]
    );

    return { success: true, items_count: itemsCount };
}

/**
 * После смены контактных данных владельца объекта (profiles) — отправить актуальный XML в Avito Autoload,
 * чтобы объявления обновились без ожидания опроса фида по ссылке.
 * Ничего не делает, если интеграция выключена, нет user_id OAuth, или у сотрудника нет объектов в фиде.
 */
export async function pushAvitoFeedAfterOwnerContactChange(
    companyId: string,
    profileId: string,
    baseUrl: string
): Promise<void> {
    try {
        const creds = await getCredentials(companyId);
        if (!creds?.enabled || !creds.user_id) {
            return;
        }

        const own = await query(
            `SELECT 1 FROM properties p
             WHERE p.company_id = $1
               AND p.owner_id::text = $2::text
               AND p.avito_feed_enabled = TRUE
               AND p.status IN ('approved', 'avito_approved', 'published_avito', 'in_feed')
             LIMIT 1`,
            [companyId, profileId]
        );
        if (own.rows.length === 0) {
            return;
        }

        const result = await syncFeedToAvito(companyId, baseUrl);
        if (!result.success) {
            console.warn(`[Avito] push after profile ${profileId} update failed:`, result.error || 'unknown');
        } else {
            console.log(`[Avito] feed pushed after profile ${profileId} contact update, items=${result.items_count}`);
        }
    } catch (e: any) {
        console.warn('[Avito] push after profile update error:', e?.message || e);
    }
}

/**
 * Get last completed autoload report from Avito.
 * GET https://api.avito.ru/autoload/v2/accounts/{user_id}/reports/last_completed
 */
export async function getLastReport(companyId: string): Promise<any> {
    const creds = await getCredentials(companyId);
    if (!creds || !creds.user_id) throw new Error('Avito credentials or user_id not configured');

    const token = await getAccessToken(companyId);
    const url = `${AVITO_API_BASE}/autoload/v2/accounts/${creds.user_id}/reports/last_completed`;

    const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Report fetch failed: ${resp.status} ${text.substring(0, 300)}`);
    }

    return await resp.json();
}

/**
 * Get status of a specific item on Avito by its Id.
 * GET https://api.avito.ru/autoload/v2/accounts/{user_id}/items/{item_id}
 */
export async function getItemStatus(companyId: string, itemId: string): Promise<any> {
    const creds = await getCredentials(companyId);
    if (!creds || !creds.user_id) throw new Error('Avito credentials or user_id not configured');

    const token = await getAccessToken(companyId);
    const url = `${AVITO_API_BASE}/autoload/v2/accounts/${creds.user_id}/items/${encodeURIComponent(itemId)}`;

    const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Item status failed: ${resp.status} ${text.substring(0, 300)}`);
    }

    return await resp.json();
}
