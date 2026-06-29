const mysql = require('mysql2/promise');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function head(url){ try{ const r=await fetch(url,{method:'HEAD'}); return r.status; }catch{return 0;} }

(async()=>{
  const c = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const base = String(process.env.R2_PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'');
  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = new S3Client({ region:'auto', endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY} });

  const [rows] = await c.query("SELECT id,url FROM media WHERE type='image' AND url LIKE '%r2.dev/%/biens/ref-%' AND url NOT LIKE '%/dwira_uploads/biens/ref-%'");

  let copied = 0, updated = 0, missingSource = 0, copyFailed = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const oldUrl = String(row.url||'').trim();
      const u = new URL(oldUrl);
      const oldKey = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      const oldPath = oldKey.replace(/^.*?\//, ''); // remove bucket-like prefix if any
      const m = oldPath.match(/(^|\/)biens\/(ref-[^/]+\/.*)$/i);
      if (!m) continue;
      const suffix = m[2];
      const newKey = `dwira_uploads/biens/${suffix.replace(/^ref-/i,'ref-')}`;
      const newUrl = `${base}/${newKey}`;

      const newStatus = await head(newUrl);
      if (newStatus !== 200) {
        const oldStatus = await head(oldUrl);
        if (oldStatus !== 200) {
          missingSource += 1;
          errors.push({id: row.id, oldUrl, reason:'source_404'});
          continue;
        }
        const res = await fetch(oldUrl);
        if (!res.ok) {
          copyFailed += 1;
          errors.push({id: row.id, oldUrl, reason:`fetch_old_${res.status}`});
          continue;
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') || 'application/octet-stream';
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: newKey, Body: bytes, ContentType: ct, ContentLength: bytes.length }));
        copied += 1;
      }

      await c.query('UPDATE media SET url=? WHERE id=?', [newUrl, row.id]);
      updated += 1;
    } catch (e) {
      errors.push({id: row.id, reason:String(e.message||e)});
    }
  }

  const [left] = await c.query("SELECT COUNT(*) n FROM media WHERE type='image' AND url LIKE '%r2.dev/%/biens/ref-%' AND url NOT LIKE '%/dwira_uploads/biens/ref-%'");
  const [bad] = await c.query("SELECT COUNT(*) n FROM media WHERE type='image' AND (url IS NULL OR url='')");
  await c.end();

  const report = { scanned: rows.length, copied, updated, missingSource, copyFailed, leftLegacyPrefix: Number(left[0].n||0), emptyUrls: Number(bad[0].n||0), errors: errors.slice(0,200) };
  require('fs').writeFileSync('/var/www/dwiraimmobilier.com/public/normalize-media-prefix-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();