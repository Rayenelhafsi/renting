const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT = '/var/www/dwiraimmobilier.com/public/tmp_new_saison_2026';
const TARGET = new Set(['ref-200','ref-212','ref-228','ref-249','ref-259']);
const UPLOAD_PREFIX = 'dwira_uploads/biens';
const PUBLIC_BASE = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'');

function listFiles(root){
  const out = execFileSync('find', [root, '-type', 'f', '-print0'], { encoding: 'buffer' });
  return out.toString('utf8').split('\u0000').filter(Boolean);
}
function isImage(f){ return /\.(jpe?g|png|webp|gif|avif|heic|heif|jfif)$/i.test(f); }
function mime(f){ const e=path.extname(f).toLowerCase(); if(['.jpg','.jpeg','.jfif'].includes(e)) return 'image/jpeg'; if(e==='.png') return 'image/png'; if(e==='.webp') return 'image/webp'; if(e==='.gif') return 'image/gif'; if(e==='.avif') return 'image/avif'; if(e==='.heic') return 'image/heic'; if(e==='.heif') return 'image/heif'; return 'application/octet-stream'; }
function safe(s){ return String(s).replace(/[^a-zA-Z0-9._-]+/g,'_'); }
function extractRefFromPath(file){ const parts=file.split('/'); for(const p of parts){ const m=String(p).match(/^(\d{1,6})\b/); if(m) return `ref-${m[1]}`; } return null; }

(async()=>{
  const all = listFiles(ROOT).filter(isImage).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));
  const s3 = new S3Client({ region:'auto', endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY} });
  const map = {}; const failures=[];

  for(const f of all){
    const ref = extractRefFromPath(f);
    if(!ref || !TARGET.has(ref)) continue;
    try {
      const ext = path.extname(f).toLowerCase() || '.jpg';
      const digest = crypto.createHash('sha1').update(f).digest('hex').slice(0,10);
      const key = `${UPLOAD_PREFIX}/${ref}/${safe(path.basename(f,ext))}-${digest}${ext}`;
      const body = fs.readFileSync(f);
      await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: mime(f), ContentLength: body.length }));
      const url = `${PUBLIC_BASE}/${key}`;
      (map[ref]||(map[ref]=[])).push(url);
    } catch (e) {
      failures.push({ file:f, ref, err:String(e.message||e) });
    }
  }

  const conn = await mysql.createConnection({ host:process.env.DB_HOST||'localhost', port:Number(process.env.DB_PORT||3306), user:process.env.DB_USER||'root', password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root', database:process.env.DB_NAME||'dwira' });

  const db = {updated:[], missing:[], errors:[]};
  for(const ref of Array.from(TARGET)){
    const urls = Array.from(new Set(map[ref]||[]));
    if(!urls.length){ db.missing.push({ref, reason:'no_uploaded_urls'}); continue; }
    try{
      const [rows] = await conn.query('SELECT id FROM biens WHERE reference = ? LIMIT 1', [ref.toUpperCase()]);
      if(!rows.length){ db.missing.push({ref, reason:'bien_not_found'}); continue; }
      const bienId = rows[0].id;
      await conn.beginTransaction();
      await conn.query('DELETE FROM media WHERE bien_id=?', [bienId]);
      let p=0;
      for(const url of urls){
        const id = `m${Date.now()}${Math.floor(Math.random()*1e6)}`;
        await conn.query('INSERT INTO media (id,bien_id,type,url,motif_upload,position) VALUES (?,?,?,?,?,?)', [id,bienId,'image',url,'remigration_ref_200_212_228_249_259',p]);
        p += 1;
      }
      await conn.commit();
      db.updated.push({ref, bienId, count:urls.length});
    } catch(e){
      try{ await conn.rollback(); } catch {}
      db.errors.push({ref, err:String(e.message||e)});
    }
  }

  // quick health check for first image
  const health = [];
  for(const ref of ['REF-200','REF-212','REF-228','REF-249','REF-259']){
    const [r] = await conn.query('SELECT b.id, m.url FROM biens b LEFT JOIN media m ON m.bien_id=b.id WHERE b.reference=? ORDER BY m.position ASC LIMIT 1', [ref]);
    if(!r.length || !r[0].url){ health.push({ref, first:null, status:null}); continue; }
    let status = null;
    try { const h = await fetch(r[0].url, {method:'HEAD'}); status = h.status; } catch {}
    health.push({ref, first:r[0].url, status});
  }
  await conn.end();

  const report = { target:Array.from(TARGET), uploadedRefs:Object.keys(map), failuresCount:failures.length, failures:failures.slice(0,50), db, health };
  fs.writeFileSync('/var/www/dwiraimmobilier.com/public/remigration-target-200-212-228-249-259-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();