/**
 * Client-side image compression before upload.
 * Targets: ≤ 1.5 MB, max 1920px wide, JPEG output.
 */

export interface CompressedPhoto {
  /** Compressed file ready for upload */
  file: File;
  /** Small thumbnail for instant preview (≤ 300px) */
  thumbnail: string;
  /** Original file name (for ID generation) */
  originalName: string;
}

const MAX_WIDTH = 1920;
const THUMB_WIDTH = 300;
const TARGET_SIZE = 1.5 * 1024 * 1024; // 1.5 MB
const MIME = 'image/jpeg';

/**
 * Compress a single image file.
 */
export async function compressImageFile(file: File): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // 1. Create thumbnail (fast, small)
  const thumbCanvas = document.createElement('canvas');
  const thumbScale = Math.min(1, THUMB_WIDTH / width);
  thumbCanvas.width = Math.round(width * thumbScale);
  thumbCanvas.height = Math.round(height * thumbScale);
  const thumbCtx = thumbCanvas.getContext('2d')!;
  thumbCtx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumbnail = thumbCanvas.toDataURL(MIME, 0.6);

  // 2. Create compressed full image
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, MAX_WIDTH / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  bitmap.close(); // free memory

  // Binary search for best quality ≤ target size
  let bestBlob: Blob | null = null;
  let low = 0.3;
  let high = 0.92;
  for (let i = 0; i < 6; i++) {
    const quality = (low + high) / 2;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), MIME, quality)
    );
    if (!blob) break;
    if (blob.size <= TARGET_SIZE) {
      bestBlob = blob;
      low = quality;
    } else {
      high = quality;
    }
  }

  // Fallback: if nothing fit, use lowest quality attempt
  if (!bestBlob) {
    bestBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), MIME, 0.4)
    );
  }

  if (!bestBlob) {
    throw new Error(`Failed to compress ${file.name}`);
  }

  const compressedFile = new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: MIME,
    lastModified: Date.now(),
  });

  return { file: compressedFile, thumbnail, originalName: file.name };
}

/**
 * Compress multiple images in sequence (avoids UI freeze).
 * Returns results in the same order.
 */
export async function compressImages(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<CompressedPhoto[]> {
  const results: CompressedPhoto[] = [];
  for (let i = 0; i < files.length; i++) {
    const compressed = await compressImageFile(files[i]);
    results.push(compressed);
    onProgress?.(i + 1, files.length);
  }
  return results;
}
