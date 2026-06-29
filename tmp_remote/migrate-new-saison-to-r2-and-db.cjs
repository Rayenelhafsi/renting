const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT = '/var/www/dwiraimmobilier.com/public/tmp_new_saison_2026';
const UPLOAD_PREFIX = 'dwira_uploads/biens';
const PUBLIC_BASE = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'');

function isImage(f){ return /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f); }
function mime(f){ const e=path.extname(f).toLowerCase(); if(e==='.jpg'||e==='.jpeg')return 'image/jpeg'; if(e==='.png')return 'image/png'; if(e==='.webp')return 'image/webp'; if(e==='.gif')return 'image/gif'; if(e==='.avif')return 'image/avif'; if(e==='.heic')return 'image/heic'; if(e==='.heif')return 'image/heif'; return 'application/octet-stream'; }
function folderRef(file){ const b=path.basename(path.dirname(file)); const m=b.match(/^(\d{1,6})\b/); return m ? `ref-${m[1]}` : null; }
function safe(s){ return String(s).replace(/[^a-zA-Z0-9._-]+/g,'_'); }

function listFilesWithFind(root) {
  const out = execFileSync('find', [root, '-type', 'f', '-print0'], { encoding: 'buffer' });
  const chunks = out.toString('utf8').split('\u0000').filter(Boolean);
  return chunks;
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root',
  database: process.env.DB_NAME || 'dwira',
};

(async()=>{
  if(!fs.existsSync(ROOT)) throw new Error(`Missing folder: ${ROOT}`);
  if(!PUBLIC_BASE) throw new Error('R2_PUBLIC_BASE_URL missing');

  const allFiles = listFilesWithFind(ROOT);
  const files = allFiles.filter(isImage).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));

  const map = {};
  const failures = [];
  let uploaded = 0;

  for (const f of files) {
    const ref = folderRef(f);
    if (!ref) { failures.push({file:f, reason:'no_ref'}); continue; }
    if (!fs.existsSync(f)) { failures.push({file:f, ref, reason:'path_unreadable_encoding'}); continue; }

    const ext = path.extname(f).toLowerCase() || '.jpg';
    const digest = crypto.createHash('sha1').update(f).digest('hex').slice(0,10);
    const key = `${UPLOAD_PREFIX}/${ref}/${safe(path.basename(f, ext))}-${digest}${ext}`;
    try {
      await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: fs.createReadStream(f), ContentType: mime(f) }));
      const url = `${PUBLIC_BASE}/${key}`;
      if (!map[ref]) map[ref] = [];
      map[ref].push(url);
      uploaded += 1;
      if (uploaded % 100 === 0) console.log(`uploaded ${uploaded}/${files.length}`);
    } catch (e) {
      failures.push({file:f, ref, reason:String(e.message||e)});
    }
  }

  const conn = await mysql.createConnection(dbConfig);
  const report = { totalFilesListed: allFiles.length, totalImagesListed: files.length, uploaded, uploadFailures: failures.length, refsWithUploads: Object.keys(map).length, dbUpdatedBiens: 0, dbMissingRefs: [], dbErrors: [] };

  for (const ref of Object.keys(map).sort()) {
    const urls = Array.from(new Set(map[ref]));
    try {
      const [rows] = await conn.query('SELECT id FROM biens WHERE reference = ? LIMIT 1', [ref]);
      if (!rows.length) { report.dbMissingRefs.push(ref); continue; }
      const bienId = rows[0].id;
      await conn.beginTransaction();
      await conn.query('DELETE FROM media WHERE bien_id = ?', [bienId]);
      let pos = 1;
      for (const url of urls) {
        const id = `m${Date.now()}${Math.floor(Math.random()*1e6)}`;
        await conn.query('INSERT INTO media (id, bien_id, type, url, motif_upload, position) VALUES (?, ?, ?, ?, ?, ?)', [id, bienId, 'image', url, 'migration_new_saison_2026_r2', pos]);
        pos += 1;
      }
      await conn.commit();
      report.dbUpdatedBiens += 1;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      report.dbErrors.push({ ref, error: String(e.message||e) });
    }
  }

  await conn.end();
  fs.writeFileSync('/var/www/dwiraimmobilier.com/public/new-saison-r2-migration-report.json', JSON.stringify({ report, failuresPreview: failures.slice(0,300) }, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
