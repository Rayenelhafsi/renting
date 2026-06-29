const mysql = require('mysql2/promise');
const path = require('path');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function swapKey(key) {
  if (key.startsWith('dwira_uploads/biens/')) return `biens/${key.slice('dwira_uploads/biens/'.length)}`;
  if (key.startsWith('biens/')) return `dwira_uploads/biens/${key.slice('biens/'.length)}`;
  return null;
}

async function headHttp(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.status; } catch { return 0; }
}

(async()=>{
  const base = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'');
  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = new S3Client({
    region:'auto',
    endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials:{ accessKeyId:process.env.R2_ACCESS_KEY_ID, secretAccessKey:process.env.R2_SECRET_ACCESS_KEY }
  });
  const db = await mysql.createConnection({
    host:process.env.DB_HOST, port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER, password:process.env.DB_PASSWORD, database:process.env.DB_NAME
  });

  const [rows] = await db.query("SELECT id,bien_id,url,position FROM media WHERE type='image' AND url LIKE '%r2.dev/%' ORDER BY bien_id,position,id");

  let scanned=0, broken=0, fixed=0, noAlt=0, altMissing=0, updateErr=0;
  const samples = [];

  for (const row of rows) {
    scanned += 1;
    const st = await headHttp(row.url);
    if (st === 200) continue;
    broken += 1;

    let key;
    try { key = decodeURIComponent(new URL(row.url).pathname.replace(/^\/+/, '')); } catch { key = null; }
    if (!key) { noAlt += 1; continue; }

    const altKey = swapKey(key);
    if (!altKey) { noAlt += 1; continue; }

    let existsAlt = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: altKey }));
      existsAlt = true;
    } catch {
      existsAlt = false;
    }

    if (!existsAlt) { altMissing += 1; continue; }

    const newUrl = `${base}/${altKey}`;
    const check = await headHttp(newUrl);
    if (check !== 200) { altMissing += 1; continue; }

    try {
      await db.query('UPDATE media SET url=? WHERE id=?', [newUrl, row.id]);
      fixed += 1;
      if (samples.length < 40) samples.push({ media_id: row.id, old: row.url, new: newUrl });
    } catch (e) {
      updateErr += 1;
      if (samples.length < 40) samples.push({ media_id: row.id, old: row.url, err: String(e.message||e) });
    }
  }

  const [left] = await db.query("SELECT COUNT(*) n FROM media WHERE type='image' AND url LIKE '%r2.dev/%'");
  await db.end();

  const report = { scanned, broken, fixed, noAlt, altMissing, updateErr, totalR2Rows: Number(left[0].n||0), samples };
  require('fs').writeFileSync('/var/www/dwiraimmobilier.com/public/fix-media-from-r2-only-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();