const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function parseCloudinaryCredentials() {
  const cloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();
  if (cloudinaryUrl.startsWith('cloudinary://')) {
    const parsed = new URL(cloudinaryUrl);
    const cloudName = String(parsed.hostname || '').trim();
    const apiKey = decodeURIComponent(String(parsed.username || '').trim());
    const apiSecret = decodeURIComponent(String(parsed.password || '').trim());
    if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };
  }
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Missing Cloudinary creds');
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

async function fetchWithTimeout(url, options = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function listResourcesPage(creds, prefix, nextCursor) {
  const url = new URL(`https://api.cloudinary.com/v1_1/${creds.cloudName}/resources/image/upload`);
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('max_results', '500');
  if (nextCursor) url.searchParams.set('next_cursor', nextCursor);
  const auth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
  const res = await fetchWithTimeout(url.toString(), { headers: { Authorization: `Basic ${auth}` } }, 45000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cloudinary list failed ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function downloadAsset(creds, publicId, format) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp: String(timestamp), type: 'upload', ...(format ? { format } : {}) };
  const signature = signCloudinaryParams(params, creds.apiSecret);
  const endpoint = new URL(`https://api.cloudinary.com/v1_1/${creds.cloudName}/image/download`);
  endpoint.searchParams.set('public_id', publicId);
  endpoint.searchParams.set('type', 'upload');
  if (format) endpoint.searchParams.set('format', format);
  endpoint.searchParams.set('timestamp', String(timestamp));
  endpoint.searchParams.set('api_key', creds.apiKey);
  endpoint.searchParams.set('signature', signature);
  const res = await fetchWithTimeout(endpoint.toString(), {}, 45000);
  if (!res.ok) throw new Error(`download failed ${res.status} for ${publicId}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

(async () => {
  const prefixes = process.argv.slice(2);
  const targetPrefixes = prefixes.length ? prefixes : ['dwira_uploads/biens'];
  const creds = parseCloudinaryCredentials();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  const reportPath = '/var/www/dwiraimmobilier.com/public/cloudinary-folders-to-r2-report.json';
  const progressPath = '/var/www/dwiraimmobilier.com/public/cloudinary-folders-to-r2-progress.json';
  const report = { startedAt: new Date().toISOString(), prefixes: targetPrefixes, listed: 0, uploaded: 0, skippedExisting: 0, failed: 0, pages: 0, failures: [] };
  fs.writeFileSync(progressPath, JSON.stringify(report, null, 2));

  for (const prefix of targetPrefixes) {
    let cursor = null;
    do {
      report.pages += 1;
      const page = await listResourcesPage(creds, prefix, cursor);
      const resources = Array.isArray(page.resources) ? page.resources : [];
      report.listed += resources.length;

      for (const r of resources) {
        const publicId = String(r.public_id || '').trim();
        const format = String(r.format || '').trim();
        if (!publicId) continue;
        const key = format ? `${publicId}.${format}` : publicId;
        try {
          try {
            await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
            report.skippedExisting += 1;
          } catch {
            const dl = await downloadAsset(creds, publicId, format || null);
            await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: dl.bytes, ContentType: dl.contentType, ContentLength: dl.bytes.length }));
            report.uploaded += 1;
          }
        } catch (e) {
          report.failed += 1;
          if (report.failures.length < 300) report.failures.push({ key, publicId, format, error: String(e.message || e) });
        }

        if ((report.uploaded + report.skippedExisting + report.failed) % 25 === 0) {
          fs.writeFileSync(progressPath, JSON.stringify(report, null, 2));
        }
      }

      fs.writeFileSync(progressPath, JSON.stringify(report, null, 2));
      cursor = page.next_cursor || null;
    } while (cursor);
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(progressPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();