const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function parseCloudinaryCredentials() {
  const cloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();
  if (cloudinaryUrl.startsWith('cloudinary://')) {
    try {
      const parsed = new URL(cloudinaryUrl);
      const cloudName = String(parsed.hostname || '').trim();
      const apiKey = decodeURIComponent(String(parsed.username || '').trim());
      const apiSecret = decodeURIComponent(String(parsed.password || '').trim());
      if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };
    } catch {}
  }
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

function signCloudinaryParams(params, apiSecret) {
  const signatureBase = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${signatureBase}${apiSecret}`).digest('hex');
}

function guessContentTypeFromExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (['jpg', 'jpeg', 'jfif'].includes(e)) return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  if (e === 'avif') return 'image/avif';
  if (e === 'heic') return 'image/heic';
  if (e === 'heif') return 'image/heif';
  return 'application/octet-stream';
}

async function headStatus(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status;
  } catch {
    return 0;
  }
}

async function downloadFromCloudinaryByPublicId(cloudinaryCreds, publicId, format) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: publicId,
    timestamp: String(timestamp),
    type: 'upload',
    ...(format ? { format } : {}),
  };
  const signature = signCloudinaryParams(params, cloudinaryCreds.apiSecret);
  const endpoint = new URL(`https://api.cloudinary.com/v1_1/${cloudinaryCreds.cloudName}/image/download`);
  endpoint.searchParams.set('public_id', publicId);
  endpoint.searchParams.set('type', 'upload');
  if (format) endpoint.searchParams.set('format', format);
  endpoint.searchParams.set('timestamp', String(timestamp));
  endpoint.searchParams.set('api_key', cloudinaryCreds.apiKey);
  endpoint.searchParams.set('signature', signature);

  const res = await fetch(endpoint.toString());
  if (!res.ok) {
    return { ok: false, status: res.status, bytes: null, contentType: null };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || guessContentTypeFromExt(format);
  return { ok: true, status: res.status, bytes, contentType };
}

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const cloudinary = parseCloudinaryCredentials();
  if (!cloudinary) throw new Error('Missing cloudinary credentials in env');

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  });

  const [rows] = await db.query("SELECT id,bien_id,url,position FROM media WHERE type='image' AND url LIKE '%r2.dev/%' ORDER BY bien_id,position,id");

  const broken = [];
  for (const row of rows) {
    const status = await headStatus(row.url);
    if (status !== 200) broken.push({ ...row, status });
  }

  const results = { scanned: rows.length, broken: broken.length, restored: 0, notFoundInCloudinary: 0, failedUpload: 0, errors: [] };

  for (const row of broken) {
    try {
      const u = new URL(row.url);
      const key = decodeURIComponent(u.pathname.replace(/^\/+/, '')); // keep same R2 key
      const fileName = path.basename(key);
      const ext = (fileName.split('.').pop() || '').toLowerCase();
      const publicId = key.replace(/\.[^.]+$/, '');

      const dl = await downloadFromCloudinaryByPublicId(cloudinary, publicId, ext || null);
      if (!dl.ok || !dl.bytes || !dl.bytes.length) {
        results.notFoundInCloudinary += 1;
        results.errors.push({ media_id: row.id, url: row.url, step: 'cloudinary_download', status: dl.status, publicId });
        continue;
      }

      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: dl.bytes,
        ContentType: dl.contentType || guessContentTypeFromExt(ext),
        ContentLength: dl.bytes.length,
      }));

      const recheck = await headStatus(row.url);
      if (recheck === 200) results.restored += 1;
      else {
        results.failedUpload += 1;
        results.errors.push({ media_id: row.id, url: row.url, step: 'r2_recheck', status: recheck });
      }
    } catch (e) {
      results.failedUpload += 1;
      results.errors.push({ media_id: row.id, url: row.url, step: 'exception', error: String(e.message || e) });
    }
  }

  const reportPath = '/var/www/dwiraimmobilier.com/public/restore-r2-from-cloudinary-report.json';
  require('fs').writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ reportPath, ...results, errorsSample: results.errors.slice(0, 30) }, null, 2));
  await db.end();
})();