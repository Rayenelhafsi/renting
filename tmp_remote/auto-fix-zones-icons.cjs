const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT_CANDIDATES = [
  '/var/www/dwiraimmobilier.com/public/tmp_icon_all_ascii',
  '/var/www/dwiraimmobilier.com/public/tmp_icon_all_ascii/icon_all_ascii',
];

function existingRoot(){
  for(const r of ROOT_CANDIDATES){ if(fs.existsSync(r)) return r; }
  throw new Error('icon folder not found on server');
}
function walk(dir,out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) walk(p,out); else out.push(p);} return out; }
function isImage(f){ return /\.(jpe?g|png|webp|gif|avif|heic|heif|jfif)$/i.test(f); }
function mime(f){ const e=path.extname(f).toLowerCase(); if(['.jpg','.jpeg','.jfif'].includes(e))return 'image/jpeg'; if(e==='.png')return 'image/png'; if(e==='.webp')return 'image/webp'; if(e==='.gif')return 'image/gif'; if(e==='.avif')return 'image/avif'; if(e==='.heic')return 'image/heic'; if(e==='.heif')return 'image/heif'; return 'application/octet-stream'; }
function slug(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }

const STOP = new Set(['tunisie','centre','ville','plage','zone','touristique','de','la','le','les','des','du','et','sud','nord','est','ouest']);
function tokens(s){ return slug(s).split(/\s+/).filter(t=>t && !STOP.has(t)); }

function scoreName(value, fileBase){
  const vT = tokens(value);
  const fT = tokens(fileBase);
  if (!vT.length || !fT.length) return 0;
  const set = new Set(fT);
  let hits=0;
  for(const t of vT){ if(set.has(t)) hits++; }
  const ratio = hits / vT.length;
  let bonus=0;
  const v = slug(value), f = slug(fileBase);
  if (f.includes(v) || v.includes(f)) bonus += 0.25;
  if (v==='kelibia' && f.includes('kelibia')) bonus += 0.2;
  if (v==='hammam ghezze' && (f.includes('ghzez')||f.includes('hamemghzez'))) bonus += 0.2;
  if (v==='houmt souk' && f.includes('houmet')) bonus += 0.2;
  if (v==='karkouane' && (f.includes('karkouane')||f.includes('kerkouane'))) bonus += 0.2;
  return ratio + bonus;
}

(async()=>{
  const root = existingRoot();
  const files = walk(root).filter(isImage);
  const fileMetas = files.map(f=>({ path:f, base:path.basename(f, path.extname(f)), ext:path.extname(f) }));

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'');

  const conn = await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});
  const [zones] = await conn.query('SELECT id,nom,pays,gouvernerat,region,quartier,pays_image_url,gouvernerat_image_url,region_image_url,quartier_image_url FROM zones ORDER BY nom');

  const uploadCache = new Map();
  async function upload(file){
    if(uploadCache.has(file.path)) return uploadCache.get(file.path);
    const ext = file.ext.toLowerCase() || '.jpg';
    const digest = crypto.createHash('sha1').update(file.path).digest('hex').slice(0,10);
    const safeBase = slug(file.base).replace(/\s+/g,'-') || 'img';
    const key = `zones/icons/${safeBase}-${digest}${ext}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: fs.createReadStream(file.path), ContentType: mime(file.path) }));
    const url = `${publicBase}/${key}`;
    uploadCache.set(file.path, url);
    return url;
  }

  const fieldCfg = [
    ['pays_image_url','pays'],
    ['gouvernerat_image_url','gouvernerat'],
    ['region_image_url','region'],
    ['quartier_image_url','quartier'],
  ];

  let updates = 0;
  const unresolved = [];

  for (const z of zones) {
    for (const [field, sourceField] of fieldCfg) {
      const curr = String(z[field] || '').trim();
      if (!curr || !curr.includes('cloudinary.com')) continue;
      const value = String(z[sourceField] || '').trim();
      let best = null; let bestScore = 0;
      for(const f of fileMetas){
        const s = scoreName(value, f.base);
        if (s > bestScore) { bestScore = s; best = f; }
      }
      if (!best || bestScore < 0.45) {
        unresolved.push({ zone_id:z.id, zone_nom:z.nom, field, value, score:bestScore, best:best?.base || null });
        continue;
      }
      const newUrl = await upload(best);
      await conn.query(`UPDATE zones SET ${field} = ? WHERE id = ?`, [newUrl, z.id]);
      updates += 1;
    }
  }

  const [left] = await conn.query("SELECT COUNT(*) n FROM zones WHERE pays_image_url LIKE '%cloudinary.com%' OR gouvernerat_image_url LIKE '%cloudinary.com%' OR region_image_url LIKE '%cloudinary.com%' OR quartier_image_url LIKE '%cloudinary.com%'");
  await conn.end();

  const report = {
    root,
    candidateFiles: files.length,
    uploadedFilesUsed: uploadCache.size,
    zoneFieldUpdates: updates,
    cloudinaryZoneFieldsRemainingRows: left[0].n,
    unresolvedCount: unresolved.length,
    unresolved: unresolved.slice(0,200)
  };
  fs.writeFileSync('/var/www/dwiraimmobilier.com/public/zones-icons-auto-fix-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
