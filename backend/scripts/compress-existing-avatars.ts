/**
 * One-shot script: compress every base64 avatar already stored in `profiles.avatar_url`
 * down to ≤ 1 MB JPEG using the same `compressImage` utility used by uploads.
 *
 * Usage:
 *   tsx backend/scripts/compress-existing-avatars.ts                # dry run (no DB writes)
 *   tsx backend/scripts/compress-existing-avatars.ts --apply        # actually update DB
 *
 * Reads DATABASE_URL from env (or falls back to backend/src/db config).
 *
 * Skips:
 *   - rows where avatar_url is NULL
 *   - rows where avatar_url is an http(s) / S3 URL (only `data:` blobs are touched)
 *   - rows already ≤ 1 MB
 */
import 'dotenv/config';
import { query } from '../src/db';
import { compressImage } from '../src/utils/imageCompress';

const APPLY = process.argv.includes('--apply');
const MAX_BYTES = 1 * 1024 * 1024;

function fmt(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
    console.log(`[compress-avatars] mode = ${APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN'}`);

    const r = await query(
        `SELECT id, full_name, avatar_url, octet_length(avatar_url) AS bytes
         FROM profiles
         WHERE avatar_url LIKE 'data:%'
         ORDER BY octet_length(avatar_url) DESC`
    );

    if (r.rows.length === 0) {
        console.log('[compress-avatars] no base64 avatars found. Nothing to do.');
        return;
    }

    let totalBefore = 0;
    let totalAfter = 0;
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of r.rows) {
        const url: string = row.avatar_url;
        const m = /^data:([^;]+);base64,(.+)$/.exec(url);
        if (!m) {
            console.warn(`  SKIP ${row.id} ${row.full_name} – malformed data URL`);
            skipped++;
            continue;
        }

        const mime = m[1];
        const buf = Buffer.from(m[2], 'base64');
        const before = buf.length;
        totalBefore += before;

        // Already small? Just count it.
        if (before <= MAX_BYTES && (mime === 'image/jpeg' || mime === 'image/webp')) {
            totalAfter += before;
            skipped++;
            continue;
        }

        try {
            const compressed = await compressImage(buf, `avatar-${row.id}`, mime, {
                maxBytes: MAX_BYTES,
                maxWidth: 1024,
                minWidth: 256,
            });
            const after = compressed.compressedSize;
            totalAfter += after;
            processed++;

            const reduction = ((1 - after / before) * 100).toFixed(1);
            console.log(`  ${APPLY ? 'WRITE' : 'PLAN '} ${row.id} ${row.full_name}: ${fmt(before)} → ${fmt(after)} (-${reduction}%, ${compressed.mimeType})`);

            if (APPLY) {
                const newDataUrl = `data:${compressed.mimeType};base64,${compressed.buffer.toString('base64')}`;
                await query(
                    'UPDATE profiles SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [newDataUrl, row.id]
                );
            }
        } catch (err: any) {
            failed++;
            console.error(`  FAIL  ${row.id} ${row.full_name}:`, err?.message || err);
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
    if (!APPLY) {
        console.log('\nThis was a DRY RUN. Re-run with --apply to persist changes.');
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal:', err);
        process.exit(1);
    });
