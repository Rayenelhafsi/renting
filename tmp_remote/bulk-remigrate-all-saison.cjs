const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOTS = [
  '/var/www/dwiraimmobilier.com/public/tmp_new_saison_2026',
  '/var/www/dwiraimmobilier.com/public/tmp_new_saison_targeted_ascii',
];
const UPLOAD_PREFIX = 'dwira_uploads/biens';
const PUBLIC_BASE = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'' );

function listFiles(root){
  if (!fs.existsSync(root)) return [];
  const out = execFileSync('find', [root, '-type', 'f', '-print0'], { encoding: 'buffer' });
  return out.toString('utf8').split('\u0000').filter(Boolean);
}
function isImage(f){ return /\.(jpe?g|png|webp|gif|avif|heic|heif|jfif)$/i.test(f); }
function mime(f){ const e=path.extname(f).toLowerCase(); if(['.jpg','.jpeg','.jfif'].includes(e))return 'image/jpeg'; if(e==='.png')return 'image/png'; if(e==='.webp')return 'image/webp'; if(e==='.gif')return 'image/gif'; if(e==='.avif')return 'image/avif'; if(e==='.heic')return 'image/heic'; if(e==='.heif')return 'image/heif'; return 'application/octet-stream'; }
function safe(s){ return String(s).replace(/[^a-zA-Z0-9._-]+/g,'_'); }
function extractRefFromPath(file){
  const parts = file.split('/');
  for(const p of parts){
    const m1 = String(p).match(/^ref-(\d{1,6})\b/i); if(m1) return `ref-${m1[1]}`;
    const m2 = String(p).match(/^(\d{1,6})\b/); if(m2) return `ref-${m2[1]}`;
  }
  return null;
}
async function head(url){ try{ const r=await fetch(url,{method:'HEAD'}); return r.status; }catch{return 0;} }

(async()=>{
  const allFiles = ROOTS.flatMap((r)=>listFiles(r)).filter(isImage).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));

  // build refs map from files
  const filesByRef = new Map();
  for (const f of allFiles) {
    const ref = extractRefFromPath(f);
    if (!ref) continue;
    if (!filesByRef.has(ref)) filesByRef.set(ref, []);
    filesByRef.get(ref).push(f);
  }

  const conn = await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});
  const [targetRows] = await conn.query("SELECT id,reference FROM biens WHERE mode='location_saisonniere' AND reference REGEXP '^REF-[0-9]+' ORDER BY reference");

  const s3 = new S3Client({ region:'auto', endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY} });

  const report = {
    scannedSeasonRefs: targetRows.length,
    refsWithSourceFiles: 0,
    refsUpdated: 0,
    refsMissingSource: [],
    uploadFailures: [],
    dbFailures: [],
    healthSample: []
  };

  for (const row of targetRows) {
    const ref = String(row.reference || '').toLowerCase();
    const files = filesByRef.get(ref) || [];
    if (!files.length) {
      report.refsMissingSource.push(row.reference);
      continue;
    }
    report.refsWithSourceFiles += 1;

    const urls = [];
    for (const f of files) {
      try {
        const ext = path.extname(f).toLowerCase() || '.jpg';
        const digest = crypto.createHash('sha1').update(f).digest('hex').slice(0,10);
        const key = `${UPLOAD_PREFIX}/${ref}/${safe(path.basename(f, ext))}-${digest}${ext}`;
        const body = fs.readFileSync(f);
        await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: mime(f), ContentLength: body.length }));
        urls.push(`${PUBLIC_BASE}/${key}`);
      } catch (e) {
        report.uploadFailures.push({ ref: row.reference, file: f, error: String(e.message || e) });
      }
    }

    const uniqueUrls = Array.from(new Set(urls));
    if (!uniqueUrls.length) {
      report.dbFailures.push({ ref: row.reference, reason: 'no_uploaded_urls_after_attempt' });
      continue;
    }

    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM media WHERE bien_id=?', [row.id]);
      let pos = 0;
      for (const url of uniqueUrls) {
        const id = `m${Date.now()}${Math.floor(Math.random()*1e6)}`;
        await conn.query('INSERT INTO media (id,bien_id,type,url,motif_upload,position) VALUES (?,?,?,?,?,?)', [id,row.id,'image',url,'bulk_remigration_all_saison_refs',pos]);
        pos += 1;
      }
      await conn.commit();
      report.refsUpdated += 1;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      report.dbFailures.push({ ref: row.reference, error: String(e.message || e) });
    }
  }

  // health sample on updated refs: check first image status for first 50 refs
  const [firsts] = await conn.query(`
    SELECT b.reference, m.url
    FROM biens b
    LEFT JOIN media m ON m.bien_id=b.id
    WHERE b.mode='location_saisonniere'
    ORDER BY b.reference, m.position
  `);
  const seen = new Set();
  for (const r of firsts) {
    if (!r.reference || seen.has(r.reference)) continue;
    seen.add(r.reference);
    if (report.healthSample.length >= 50) break;
    const status = r.url ? await head(r.url) : null;
    report.healthSample.push({ reference: r.reference, status, url: r.url || null });
  }

  await conn.end();

  const out = '/var/www/dwiraimmobilier.com/public/bulk-remigration-all-saison-report.json';
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    out,
    scannedSeasonRefs: report.scannedSeasonRefs,
    refsWithSourceFiles: report.refsWithSourceFiles,
    refsUpdated: report.refsUpdated,
    missingSourceCount: report.refsMissingSource.length,
    uploadFailures: report.uploadFailures.length,
    dbFailures: report.dbFailures.length,
    health200: report.healthSample.filter(x=>x.status===200).length,
    healthNon200: report.healthSample.filter(x=>x.status!==200).length,
    healthSample: report.healthSample.slice(0,20)
  }, null, 2));
})();