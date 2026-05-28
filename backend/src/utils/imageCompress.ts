/**
 * Image compression utility — resizes/re-encodes images so that the resulting
 * buffer is <= maxBytes (default 1 MB). Uses sharp.
 *
 * Strategy:
 *  1. Auto-rotate (respect EXIF orientation), strip metadata.
 *  2. If width > maxWidth → resize to maxWidth (keeping aspect).
 *  3. Re-encode to JPEG (quality 85). If still > maxBytes, drop quality
 *     in steps (75 → 65 → 55 → 45). If still too big, downscale further.
 *  4. PNG with alpha is converted to JPEG with white background (smaller).
 *  5. Returns compressed Buffer + new mime type + extension.
 *
 * Animated GIFs are passed through untouched.
 */
import sharp from 'sharp';
import path from 'path';

export interface CompressedImage {
    buffer: Buffer;
    mimeType: string;
    extension: string;     // includes leading dot, e.g. ".jpg"
    originalSize: number;
    compressedSize: number;
}

export interface CompressOptions {
    maxBytes?: number;     // hard upper bound, default 1 MB
    maxWidth?: number;     // initial downscale target, default 2560
    minWidth?: number;     // never go below this width, default 800
}

const DEFAULT_MAX_BYTES = 1 * 1024 * 1024;
const DEFAULT_MAX_WIDTH = 2560;
const DEFAULT_MIN_WIDTH = 800;

const QUALITY_STEPS = [85, 75, 65, 55, 45];

/**
 * Compress an arbitrary image buffer down to <= maxBytes.
 * If input is already small enough AND in a web-friendly format (jpg/webp),
 * it is returned unchanged.
 */
export async function compressImage(
    input: Buffer,
    originalName: string,
    originalMime: string,
    opts: CompressOptions = {}
): Promise<CompressedImage> {
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
    const minWidth = opts.minWidth ?? DEFAULT_MIN_WIDTH;

    const lowerMime = (originalMime || '').toLowerCase();
    const lowerExt = path.extname(originalName).toLowerCase();

    // Pass through animated GIFs (sharp loses animation by default).
    if (lowerMime === 'image/gif' || lowerExt === '.gif') {
        return {
            buffer: input,
            mimeType: 'image/gif',
            extension: '.gif',
            originalSize: input.length,
            compressedSize: input.length,
        };
    }

    // If already small and in a friendly format, skip re-encoding.
    if (input.length <= maxBytes && (lowerMime === 'image/jpeg' || lowerMime === 'image/webp')) {
        return {
            buffer: input,
            mimeType: lowerMime,
            extension: lowerMime === 'image/webp' ? '.webp' : '.jpg',
            originalSize: input.length,
            compressedSize: input.length,
        };
    }

    let pipeline = sharp(input, { failOn: 'none' }).rotate(); // auto-rotate via EXIF

    const meta = await pipeline.metadata().catch(() => ({} as sharp.Metadata));
    const origWidth = meta.width || 0;

    // Initial resize if needed
    let targetWidth = origWidth > 0 ? Math.min(origWidth, maxWidth) : maxWidth;

    let lastBuffer: Buffer | null = null;

    while (targetWidth >= minWidth) {
        for (const q of QUALITY_STEPS) {
            const buf = await sharp(input, { failOn: 'none' })
                .rotate()
                .resize({ width: targetWidth, withoutEnlargement: true })
                .flatten({ background: { r: 255, g: 255, b: 255 } }) // strip alpha for smaller JPEGs
                .jpeg({ quality: q, mozjpeg: true, progressive: true })
                .toBuffer();
            lastBuffer = buf;
            if (buf.length <= maxBytes) {
                return {
                    buffer: buf,
                    mimeType: 'image/jpeg',
                    extension: '.jpg',
                    originalSize: input.length,
                    compressedSize: buf.length,
                };
            }
        }
        // Still too big — shrink by 20%
        targetWidth = Math.floor(targetWidth * 0.8);
    }

    // Could not get below maxBytes even at minWidth + lowest quality —
    // return the smallest variant we produced.
    return {
        buffer: lastBuffer ?? input,
        mimeType: 'image/jpeg',
        extension: '.jpg',
        originalSize: input.length,
        compressedSize: (lastBuffer ?? input).length,
    };
}

/**
 * Replace the extension of a filename with the new one.
 * "photo.HEIC" + ".jpg" → "photo.jpg"
 */
export function renameWithExtension(originalName: string, newExt: string): string {
    const base = path.basename(originalName, path.extname(originalName));
    return base + newExt;
}
