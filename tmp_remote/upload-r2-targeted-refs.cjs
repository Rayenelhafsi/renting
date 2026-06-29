const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ROOT = 'C:/Users/elhaf/Downloads/new-saison-2026';
const TARGET_REFS = new Set(['ref-239','ref-240','ref-277','ref-278','ref-279','ref-280','ref-281','ref-282','ref-283','ref-284']);

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'' );

if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE_URL) {
  throw new Error('Missing R2 env vars');
}

function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function isImage(f){ return /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f); }
function mime(f){ const e=path.extname(f).toLowerCase(); if(e==='.jpg'||e==='.jpeg')return 'image/jpeg'; if(e==='.png')return 'image/png'; if(e==='.webp')return 'image/webp'; if(e==='.gif')return 'image/gif'; if(e==='.avif')return 'image/avif'; if(e==='.heic')return 'image/heic'; if(e==='.heif')return 'image/heif'; return 'application/octet-stream'; }
function safe(s){ return String(s).replace(/[^a-zA-Z0-9._-]+/g,'_'); }
function refFromPath(p){
  const parts = p.split(/[\\/]+/);
  for (const seg of parts) {
    const m = seg.match(/^(\d{1,6})\b/);
    if (m) return `ref-${m[1]}`;
  }
  return null;
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

(async()=>{
  const files = walk(ROOT).filter(isImage).filter(f => TARGET_REFS.has(refFromPath(f) || '')).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));
  const mapping = {};
  const failures = [];
  let uploaded = 0;

  for (const f of files) {
    const ref = refFromPath(f);
    const ext = path.extname(f).toLowerCase() || '.jpg';
    const digest = crypto.createHash('sha1').update(f).digest('hex').slice(0,10);
    const key = `dwira_uploads/biens/${ref}/${safe(path.basename(f, ext))}-${digest}${ext}`;
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: fs.createReadStream(f), ContentType: mime(f) }));
      const url = `${R2_PUBLIC_BASE_URL}/${key}`;
      if (!mapping[ref]) mapping[ref] = [];
      mapping[ref].push(url);
      uploaded += 1;
      if (uploaded % 25 === 0) console.log(`uploaded ${uploaded}/${files.length}`);
    } catch (e) {
      failures.push({ file: f, ref, reason: String(e.message || e) });
    }
  }

  for (const ref of Object.keys(mapping)) {
    mapping[ref] = Array.from(new Set(mapping[ref]));
  }

  const out = {
    totalCandidates: files.length,
    uploaded,
    failed: failures.length,
    refs: Object.keys(mapping).length,
    mapping,
    failures,
  };

  fs.writeFileSync('C:/Users/elhaf/Downloads/renting/tmp_remote/new-saison-r2-targeted-mapping.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ totalCandidates: files.length, uploaded, failed: failures.length, refs: Object.keys(mapping).length }, null, 2));
})();
