/**
 * Download all objects from Selectel S3 bucket to local disk
 * Usage: node download-s3-objects.js
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3Config = {
    endpoint: 'https://s3.ru-7.storage.selcloud.ru',
    region: 'ru-7',
    credentials: {
        accessKeyId: 'dcd051b46a3b4756be55ae6759911360',
        secretAccessKey: 'b3ae0ce3731b4af9afd191e630918e0b',
    },
    forcePathStyle: true,
};

const bucket = 'vk-crm-storage-1';
const downloadDir = path.join(__dirname, 'backend', 'storage', 'downloads', 's3-backup');

const s3Client = new S3Client(s3Config);

async function downloadAll() {
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    let continuationToken = undefined;
    let total = 0;
    let downloaded = 0;
    let errors = 0;

    console.log('📦 Starting download from S3 bucket:', bucket);
    console.log('💾 Download directory:', downloadDir);
    console.log('');

    do {
        const listCmd = new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        });

        const listResult = await s3Client.send(listCmd);
        const objects = listResult.Contents || [];

        for (const obj of objects) {
            total++;
            const key = obj.Key;
            const localPath = path.join(downloadDir, key);
            const localDir = path.dirname(localPath);

            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }

            // Skip if already exists and same size
            if (fs.existsSync(localPath)) {
                const stat = fs.statSync(localPath);
                if (stat.size === obj.Size) {
                    console.log(`⏭  [${total}] ${key} (already exists, same size)`);
                    continue;
                }
            }

            try {
                const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
                const response = await s3Client.send(getCmd);
                const stream = response.Body;

                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                fs.writeFileSync(localPath, buffer);

                downloaded++;
                const sizeMB = (obj.Size / 1024 / 1024).toFixed(2);
                console.log(`✅ [${total}] ${key} (${sizeMB} MB)`);
            } catch (err) {
                errors++;
                console.error(`❌ [${total}] ${key}:`, err.message);
            }
        }

        continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    console.log('');
    console.log('🎉 Download complete!');
    console.log(`   Total objects: ${total}`);
    console.log(`   Downloaded: ${downloaded}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Saved to: ${downloadDir}`);
}

downloadAll().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
