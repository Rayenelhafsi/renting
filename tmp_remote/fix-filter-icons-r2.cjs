const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SRC = '/var/www/dwiraimmobilier.com/public/tmp_filter_icon_fix';
const BASE = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'');

const fileMap = {
  'type:location_saisonniere:appartement:__main__': 'ChatGPT Image 20 mars 2026, 22_20_45 (1).png',
  'type:location_saisonniere:appartement:S+1': 'ChatGPT Image 1 mai 2026, 13_54_41 (1).png',
  'type:location_saisonniere:appartement:S+2': 'ChatGPT Image 1 mai 2026, 15_29_23 (1).png',
  'type:location_saisonniere:appartement:S+3': 'ChatGPT Image 1 mai 2026, 15_32_29 (1).png',
  'type:location_saisonniere:appartement:S+4': 'ChatGPT Image 1 mai 2026, 15_34_54 (1).png',
  'type:location_saisonniere:autre:__main__': 'images.jfif',
  'type:location_saisonniere:immeuble:__main__': 'ff.JPG',
  'type:location_saisonniere:studio:__main__': 'ChatGPT Image 21 mars 2026, 11_50_39 (1).png',
  'type:location_saisonniere:villa_maison:__main__': 'ChatGPT Image 21 mars 2026, 11_48_41 (1).png',

  'home:location_saisonniere:comfort:climatise': 'ChatGPT Image 20 mars 2026, 22_30_41 (1).png',
  'home:location_saisonniere:comfort:jardin_gazon': 'temlel.png',
  'home:location_saisonniere:comfort:piscine_partagee': 'ChatGPT Image 1 mai 2026, 15_32_29 (1).png',
  'home:location_saisonniere:comfort:piscine_privee': 'ChatGPT Image 1 mai 2026, 15_34_54 (1).png',
  'home:location_saisonniere:comfort:rdc': 'dar_allouche.jpg',
  'home:location_saisonniere:comfort:terrasse': 'Corniche_Mahdia.png',
  'home:location_saisonniere:comfort:toutes_pieces_climatisees': 'ChatGPT Image 21 mars 2026, 12_16_48 (1).png',
  'home:location_saisonniere:seaside:pied_dans_eau': 'ezzahraplage.jfif',
  'home:location_saisonniere:seaside:pres_plage': 'aghir plage.JPG',
  'home:location_saisonniere:seaside:vue_sur_mer': 'vue-depuis-le-fort-de.jpg',
};

function mime(file){const e=path.extname(file).toLowerCase(); if(e==='.jpg'||e==='.jpeg')return 'image/jpeg'; if(e==='.png')return 'image/png'; if(e==='.webp')return 'image/webp'; if(e==='.gif')return 'image/gif'; if(e==='.avif')return 'image/avif'; if(e==='.heic')return 'image/heic'; if(e==='.heif')return 'image/heif'; if(e==='.jfif')return 'image/jpeg'; return 'application/octet-stream';}
function safe(s){ return String(s).replace(/[^a-zA-Z0-9._-]+/g,'_'); }

(async()=>{
  const s3 = new S3Client({ region:'auto', endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID, secretAccessKey:process.env.R2_SECRET_ACCESS_KEY} });
  const uploadedByFile = {};
  const missingFiles = [];

  for (const filename of Array.from(new Set(Object.values(fileMap)))) {
    const p = path.join(SRC, filename);
    if (!fs.existsSync(p)) { missingFiles.push(filename); continue; }
    const ext = path.extname(filename) || '.jpg';
    const digest = crypto.createHash('sha1').update(filename).digest('hex').slice(0,10);
    const key = `dwira_uploads/filter-icons/${safe(path.basename(filename, ext))}-${digest}${ext.toLowerCase()}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: fs.createReadStream(p), ContentType: mime(filename) }));
    uploadedByFile[filename] = `${BASE}/${key}`;
  }

  const conn = await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});

  const updates = [];
  for (const [k, filename] of Object.entries(fileMap)) {
    const url = uploadedByFile[filename];
    if (!url) continue;
    const parts = k.split(':');
    if (parts[0] === 'type') {
      const [,mode,main,sub] = parts;
      const subType = sub === '__main__' ? null : sub;
      await conn.query('UPDATE type_filter_images SET image_url = ? WHERE mode_bien = ? AND main_type = ? AND ((sub_type IS NULL AND ? IS NULL) OR sub_type = ?)', [url, mode, main, subType, subType]);
      updates.push({ table:'type_filter_images', mode, main, sub:subType, url });
    } else {
      const [,mode,group,opt] = parts;
      await conn.query('UPDATE home_filter_option_images SET image_url = ? WHERE mode_bien = ? AND filter_group = ? AND option_key = ?', [url, mode, group, opt]);
      updates.push({ table:'home_filter_option_images', mode, group, opt, url });
    }
  }

  const [leftType] = await conn.query("SELECT COUNT(*) n FROM type_filter_images WHERE image_url LIKE '%cloudinary.com%'");
  const [leftHome] = await conn.query("SELECT COUNT(*) n FROM home_filter_option_images WHERE image_url LIKE '%cloudinary.com%'");
  await conn.end();

  const report = { uploadedFiles: Object.keys(uploadedByFile).length, missingFiles, updates: updates.length, leftTypeCloudinary: leftType[0].n, leftHomeCloudinary: leftHome[0].n };
  fs.writeFileSync('/var/www/dwiraimmobilier.com/public/filter-icons-fix-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
