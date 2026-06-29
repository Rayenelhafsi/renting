const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SITE_BASE = String(process.env.CLOUDINARY_UPLOAD_SOURCE_BASE_URL || 'https://www.dwiraimmobilier.com').trim().replace(/\/+$/, '');
const CLOUDFLARE_ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const CLOUDFLARE_API_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const CLOUDFLARE_IMAGES_VARIANT = String(process.env.CLOUDFLARE_IMAGES_VARIANT || 'public').trim() || 'public';
const REQUIRE_SIGNED = String(process.env.CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS || '').trim().toLowerCase() === 'true';

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  throw new Error('Missing CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN');
}

const tables = [
  { table: 'media', pk: 'id', col: 'url' },
  { table: 'biens', pk: 'id', col: 'image_url' },
  { table: 'zones', pk: 'id', col: 'image_url' },
  { table: 'zones', pk: 'id', col: 'pays_image_url' },
  { table: 'zones', pk: 'id', col: 'gouvernerat_image_url' },
  { table: 'zones', pk: 'id', col: 'region_image_url' },
  { table: 'zones', pk: 'id', col: 'quartier_image_url' },
  { table: 'type_filter_images', pk: 'id', col: 'image_url' },
  { table: 'home_filter_option_images', pk: 'id', col: 'image_url' },
  { table: 'reservation_demands', pk: 'id', col: 'identity_document_image_url' },
  { table: 'reservation_demands', pk: 'id', col: 'payment_receipt_image_url' },
  { table: 'utilisateurs', pk: 'id', col: 'cin_image_url' },
  { table: 'utilisateurs', pk: 'id', col: 'avatar' },
];

function dbConfig() {
  const isSite = ['site', 'production'].includes(String(process.env.DB_SOURCE || process.env.DB_TARGET || 'local').trim().toLowerCase());
  const siteDbHost = String(process.env.SITE_DB_HOST || process.env.VPS_DB_HOST || '').trim();
  const siteDbPort = String(process.env.SITE_DB_PORT || process.env.VPS_DB_PORT || '').trim();
  const siteDbUser = String(process.env.SITE_DB_USER || process.env.VPS_DB_USER || '').trim();
  const siteDbPassword = String(process.env.SITE_DB_PASSWORD || process.env.VPS_DB_PASSWORD || '').trim();
  const siteDbName = String(process.env.SITE_DB_NAME || process.env.VPS_DB_NAME || '').trim();
  if (isSite && siteDbHost && siteDbUser && siteDbName) {
    return { host: siteDbHost, port: Number(siteDbPort || 3306), user: siteDbUser, password: siteDbPassword, database: siteDbName };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root',
    database: process.env.DB_NAME || 'dwira',
  };
}

function isCloudflareUrl(v) {
  const s = String(v || '').trim();
  return /imagedelivery\.net|\.r2\.dev|cloudflarestream\.com|videodelivery\.net/i.test(s);
}

function normalizeSourceUrl(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const p = s.startsWith('/') ? s : `/${s}`;
  return `${SITE_BASE}${p}`;
}

function sanitizeName(url, table, col, id) {
  const ext = (String(url).match(/\.(jpg|jpeg|png|webp|gif|avif|heic|heif)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
  const h = crypto.createHash('sha1').update(`${table}|${col}|${id}|${url}`).digest('hex').slice(0, 20);
  return `${table}_${col}_${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}_${h}.${ext}`;
}

async function uploadBinaryToCloudflare(buffer, filename, contentType) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/images/v1`;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType || 'application/octet-stream' }), filename);
  form.append('requireSignedURLs', REQUIRE_SIGNED ? 'true' : 'false');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || `Cloudflare upload failed (${res.status})`);
  }
  const variants = payload?.result?.variants || [];
  const delivery = variants.find((u) => String(u).split('/').pop() === CLOUDFLARE_IMAGES_VARIANT) || variants[0] || null;
  if (!delivery) throw new Error('No Cloudflare delivery URL returned');
  return delivery;
}

async function fetchSourceImage(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Source fetch failed (${res.status})`);
  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('image/')) throw new Error(`Source is not image (${ct || 'unknown'})`);
  const ab = await res.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType: ct };
}

(async () => {
  const conn = await mysql.createConnection(dbConfig());
  const stats = { scanned: 0, candidates: 0, migrated: 0, skipped: 0, failed: 0 };
  const failures = [];

  for (const t of tables) {
    let rows;
    try {
      const [r] = await conn.query(`SELECT ${t.pk} AS pk, ${t.col} AS url FROM ${t.table} WHERE ${t.col} IS NOT NULL AND TRIM(${t.col}) <> ''`);
      rows = r;
    } catch {
      continue;
    }

    for (const row of rows) {
      stats.scanned += 1;
      const original = String(row.url || '').trim();
      if (!original || isCloudflareUrl(original) || original.startsWith('data:image/')) {
        stats.skipped += 1;
        continue;
      }
      stats.candidates += 1;
      const src = normalizeSourceUrl(original);
      if (!src) {
        stats.failed += 1;
        failures.push({ table: t.table, col: t.col, id: row.pk, url: original, reason: 'invalid source url' });
        continue;
      }

      try {
        const img = await fetchSourceImage(src);
        const filename = sanitizeName(original, t.table, t.col, row.pk);
        const cfUrl = await uploadBinaryToCloudflare(img.buffer, filename, img.contentType);
        await conn.query(`UPDATE ${t.table} SET ${t.col} = ? WHERE ${t.pk} = ?`, [cfUrl, row.pk]);
        stats.migrated += 1;
        if (stats.migrated % 20 === 0) console.log(`migrated ${stats.migrated}`);
      } catch (e) {
        stats.failed += 1;
        failures.push({ table: t.table, col: t.col, id: row.pk, url: original, reason: e?.message || String(e) });
      }
    }
  }

  const reportPath = path.resolve(__dirname, '../migration-cloudflare-failures.json');
  fs.writeFileSync(reportPath, JSON.stringify({ stats, failures }, null, 2));
  console.log(JSON.stringify({ stats, reportPath }, null, 2));
  await conn.end();
})();
