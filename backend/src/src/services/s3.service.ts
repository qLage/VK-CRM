import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * S3Service - Unified storage service for Selectel Object Storage (S3)
 * Provides methods for uploading, deleting, and generating URLs for files.
 */

// S3 Configuration from environment
const s3Config = {
    endpoint: process.env.S3_ENDPOINT || 'https://s3.selectel.ru',
    region: process.env.S3_REGION || 'ru-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
    },
    forcePathStyle: true, // Required for many S3-compatible providers like Selectel
};

const bucket = process.env.S3_BUCKET || 'crm-uploads';
const isS3Enabled = !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);

// Initialize client ONLY if enabled to avoid startup errors if keys are missing
let s3Client: S3Client | null = null;
if (isS3Enabled) {
    s3Client = new S3Client(s3Config);
    console.log('📦 S3 Storage initialized (Endpoint:', s3Config.endpoint, ')');
} else {
    console.warn('⚠️ S3 Storage is NOT configured. Using local fallback (not recommended for production).');
}

export interface UploadedFile {
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
}

/**
 * Upload a file to S3
 * @param buffer File buffer
 * @param originalName Original filename
 * @param mimeType Mime type
 * @param isPublic If true, the file will have a direct public URL
 */
export const uploadFile = async (
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    isPublic: boolean = false
): Promise<UploadedFile> => {
    if (!isS3Enabled || !s3Client) {
        throw new Error('S3 storage is not configured');
    }

    const fileExt = path.extname(originalName);
    const fileName = `${uuidv4()}${fileExt}`;
    const key = isPublic ? `public/${fileName}` : `private/${fileName}`;

    try {
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                // ACL is often handled by bucket policy in Selectel, 
                // but setting it here for compatibility if needed.
                ACL: isPublic ? 'public-read' : 'private',
            },
        });

        await upload.done();

        // For public files, we return a direct link
        // For private files, we return the key (url will be signed on request)
        const fileUrl = isPublic 
            ? `${s3Config.endpoint}/${bucket}/${key}`
            : key;

        return {
            id: uuidv4(),
            fileName: originalName,
            fileUrl,
            fileSize: buffer.length,
            mimeType,
        };
    } catch (error) {
        console.error('❌ S3 Upload Error:', error);
        throw new Error('Failed to upload file to cloud storage');
    }
};

/**
 * Delete a file from S3
 * @param fileUrl The URL or Key of the file
 */
export const deleteFile = async (fileUrl: string): Promise<void> => {
    if (!isS3Enabled || !s3Client) return;

    // Extract key from URL if it's a full URL
    let key = fileUrl;
    if (fileUrl.startsWith('http')) {
        const urlParts = fileUrl.split(`${bucket}/`);
        if (urlParts.length > 1) {
            key = urlParts[1];
        }
    }

    try {
        const command = new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        await s3Client.send(command);
    } catch (error) {
        console.error('❌ S3 Delete Error:', error);
        // We don't throw here to avoid failing the whole request if cleanup fails
    }
};

/**
 * Generate a signed URL for private files
 * @param key The S3 key
 * @param expiresSeconds Expiration in seconds (default 1 hour)
 */
export const getFileUrl = async (key: string, expiresSeconds: number = 3600): Promise<string> => {
    if (!isS3Enabled || !s3Client) return '';

    // If it's already a full public URL, return as is
    if (key.startsWith('http')) return key;

    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        return await getSignedUrl(s3Client, command, { expiresIn: expiresSeconds });
    } catch (error) {
        console.error('❌ S3 Sign URL Error:', error);
        return '';
    }
};

export { isS3Enabled };
