const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BASE = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'' );
const BUCKET = process.env.R2_BUCKET_NAME;

function parseKey(url) {
  try {
    const u = new URL(String(url || '').trim());
    return decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

async function headHttp(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.status; } catch { return 0; }
}

async function headObject(s3, key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; } catch { return false; }
}

function buildCandidates(refLower, basename, currentKey) {
  const out = [];
  if (currentKey) out.push(currentKey);
  out.push(`biens/${refLower}/images/${basename}`);
  out.push(`dwira_uploads/biens/${refLower}/${basename}`);
  out.push(`biens/${refLower}/${basename}`);
  return Array.from(new Set(out.filter(Boolean)));
}

(async () => {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [rows] = await db.query(`
    SELECT m.id AS media_id, m.bien_id, m.url, m.position, b.reference
    FROM media m
    JOIN biens b ON b.id=m.bien_id
    WHERE m.type='image'
    ORDER BY b.reference, m.position, m.id
  `);

  const report = {
    scanned: rows.length,
    mappedToCanonical: 0,
    copiedToCanonical: 0,
    unresolved: 0,
    deletedBroken: 0,
    resequencedBiens: 0,
    unresolvedSample: [],
  };

  // pass 1: map/copy to canonical
  for (const r of rows) {
    const refLower = String(r.reference || '').toLowerCase(); // REF-123 -> ref-123
    const curKey = parseKey(r.url);
    if (!curKey) {
      report.unresolved += 1;
      if (report.unresolvedSample.length < 50) report.unresolvedSample.push({ media_id: r.media_id, reference: r.reference, reason: 'bad_url', url: r.url });
      continue;
    }

    const baseName = path.basename(curKey);
    const canonicalKey = `biens/${refLower}/images/${baseName}`;
    const canonicalUrl = `${BASE}/${canonicalKey}`;

    // already good and exists
    if (curKey === canonicalKey) {
      const ok = await headHttp(canonicalUrl);
      if (ok === 200) {
        report.mappedToCanonical += 1;
        continue;
      }
    }

    let canonicalExists = await headObject(s3, canonicalKey);

    if (!canonicalExists) {
      const candidates = buildCandidates(refLower, baseName, curKey);
      let sourceUrl = null;
      for (const k of candidates) {
        const u = `${BASE}/${k}`;
        const st = await headHttp(u);
        if (st === 200) { sourceUrl = u; break; }
      }

      if (!sourceUrl) {
        report.unresolved += 1;
        if (report.unresolvedSample.length < 50) report.unresolvedSample.push({ media_id: r.media_id, reference: r.reference, reason: 'no_source_found', key: curKey });
        continue;
      }

      const res = await fetch(sourceUrl);
      if (!res.ok) {
        report.unresolved += 1;
        if (report.unresolvedSample.length < 50) report.unresolvedSample.push({ media_id: r.media_id, reference: r.reference, reason: `source_fetch_${res.status}`, sourceUrl });
        continue;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'application/octet-stream';
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: canonicalKey, Body: bytes, ContentType: ct, ContentLength: bytes.length }));
      report.copiedToCanonical += 1;
      canonicalExists = true;
    }

    if (!canonicalExists) {
      report.unresolved += 1;
      continue;
    }

    const canSt = await headHttp(canonicalUrl);
    if (canSt !== 200) {
      report.unresolved += 1;
      if (report.unresolvedSample.length < 50) report.unresolvedSample.push({ media_id: r.media_id, reference: r.reference, reason: 'canonical_not_public_200', canonicalUrl, status: canSt });
      continue;
    }

    await db.query('UPDATE media SET url=? WHERE id=?', [canonicalUrl, r.media_id]);
    report.mappedToCanonical += 1;
  }

  // pass 2: cleanup broken media when bien has at least one valid image
  const [afterRows] = await db.query(`
    SELECT m.id AS media_id, m.bien_id, m.url, b.reference
    FROM media m
    JOIN biens b ON b.id=m.bien_id
    WHERE m.type='image'
    ORDER BY b.reference, m.position, m.id
  `);

  const byBien = new Map();
  for (const r of afterRows) {
    if (!byBien.has(r.bien_id)) byBien.set(r.bien_id, []);
    byBien.get(r.bien_id).push(r);
  }

  for (const [bienId, list] of byBien) {
    let ok = 0;
    const badIds = [];
    for (const m of list) {
      const st = await headHttp(m.url);
      if (st === 200) ok += 1; else badIds.push(m.media_id);
    }
    if (ok > 0 && badIds.length > 0) {
      await db.query(`DELETE FROM media WHERE id IN (${badIds.map(()=>'?').join(',')})`, badIds);
      report.deletedBroken += badIds.length;
    }
  }

  // pass 3: resequence positions
  const [bienIds] = await db.query("SELECT DISTINCT bien_id FROM media WHERE type='image'");
  for (const b of bienIds) {
    const [med] = await db.query('SELECT id FROM media WHERE bien_id=? AND type=\'image\' ORDER BY position,id', [b.bien_id]);
    let p = 0;
    for (const m of med) {
      await db.query('UPDATE media SET position=? WHERE id=?', [p, m.id]);
      p += 1;
    }
    report.resequencedBiens += 1;
  }

  // final verification
  const [finalRows] = await db.query("SELECT id,url FROM media WHERE type='image' ORDER BY id");
  let finalBad = 0;
  for (const r of finalRows) {
    const st = await headHttp(r.url);
    if (st !== 200) finalBad += 1;
  }
  report.finalMediaRows = finalRows.length;
  report.finalBad = finalBad;

  await db.end();

  const out = '/var/www/dwiraimmobilier.com/public/unify-all-refs-single-folder-report.json';
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, ...report }, null, 2));
})();