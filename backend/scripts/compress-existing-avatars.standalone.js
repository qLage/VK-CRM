/**
 * Self-contained one-off script (CommonJS, no TypeScript / no source deps).
 * Copy into the running backend container and execute with `node`.
 * Compresses every base64 avatar in `profiles.avatar_url` down to ≤ 1 MB JPEG.
 *
 * Usage inside container:
 *   node /tmp/compress-existing-avatars.js            # dry run
 *   node /tmp/compress-existing-avatars.js --apply    # write changes
 *
 * Requires: pg + sharp installed in the same node_modules (true for crm-backend).
 * Reads DATABASE_URL from env.
 */
const { Pool } = require('pg');
const sharp = require('sharp');

const APPLY = process.argv.includes('--apply');
const MAX_BYTES = 1 * 1024 * 1024;
const QUALITY_STEPS = [85, 75, 65, 55, 45];
const MAX_WIDTH = 1024;
const MIN_WIDTH = 256;

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL must be set');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

function fmt(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function compressBuffer(input) {
    let targetWidth = MAX_WIDTH;
    let last = null;
    while (targetWidth >= MIN_WIDTH) {
        for (const q of QUALITY_STEPS) {
            const buf = await sharp(input, { failOn: 'none' })
                .rotate()
                .resize({ width: targetWidth, withoutEnlargement: true })
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .jpeg({ quality: q, mozjpeg: true, progressive: true })
                .toBuffer();
            last = buf;
            if (buf.length <= MAX_BYTES) return buf;
        }
        targetWidth = Math.floor(targetWidth * 0.8);
    }
    return last;
}

(async () => {
    console.log(`[compress-avatars] mode = ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

    const r = await pool.query(`
        SELECT id, full_name, avatar_url, octet_length(avatar_url) AS bytes
        FROM profiles
        WHERE avatar_url LIKE 'data:%'
        ORDER BY octet_length(avatar_url) DESC
    `);

    if (r.rows.length === 0) {
        console.log('Nothing to do.');
        await pool.end();
        return;
    }

    let totalBefore = 0, totalAfter = 0, processed = 0, skipped = 0, failed = 0;

    for (const row of r.rows) {
        const m = /^data:([^;]+);base64,(.+)$/.exec(row.avatar_url);
        if (!m) {
            console.warn(`  SKIP ${row.id} ${row.full_name} – malformed`);
            skipped++;
            continue;
        }
        const mime = m[1];
        const buf = Buffer.from(m[2], 'base64');
        const before = buf.length;
        totalBefore += before;

        if (before <= MAX_BYTES && (mime === 'image/jpeg' || mime === 'image/webp')) {
            totalAfter += before;
            skipped++;
            continue;
        }

        try {
            const out = await compressBuffer(buf);
            const after = out.length;
            totalAfter += after;
            processed++;
            const reduction = ((1 - after / before) * 100).toFixed(1);
            console.log(`  ${APPLY ? 'WRITE' : 'PLAN '} ${row.id} ${row.full_name}: ${fmt(before)} → ${fmt(after)} (-${reduction}%)`);

            if (APPLY) {
                const newUrl = `data:image/jpeg;base64,${out.toString('base64')}`;
                await pool.query(
                    'UPDATE profiles SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [newUrl, row.id]
                );
            }
        } catch (err) {
            failed++;
            console.error(`  FAIL  ${row.id} ${row.full_name}: ${err.message}`);
        }
    }

    console.log('');
    console.log('───────────────────────────────────────────');
    console.log(`Total avatars seen   : ${r.rows.length}`);
    console.log(`Compressed            : ${processed}`);
    console.log(`Already small (skip)  : ${skipped}`);
    console.log(`Failed                : ${failed}`);
    console.log(`Bytes before          : ${fmt(totalBefore)}`);
    console.log(`Bytes after           : ${fmt(totalAfter)}`);
    if (totalBefore > 0) {
        console.log(`Reduction             : ${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%`);
    }
    if (!APPLY) console.log('\nDRY RUN — re-run with --apply to persist.');

    await pool.end();
})().catch((err) => {
    console.error('Fatal:', err);
    pool.end();
    process.exit(1);
});
