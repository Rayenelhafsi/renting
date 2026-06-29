const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SRC_DIR = '/var/www/dwiraimmobilier.com/public/tmp_type_icons_new';
const mode = 'location_saisonniere';

function mime(file) {
  const e = path.extname(file).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg' || e === '.jfif') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

(async () => {
  const map = {
    appartement: 'appartement.png',
    villa_maison: 'Villa maison.png',
    studio: 'Studio.png',
    immeuble: 'Immeuble.png',
    autre: 'Residence.png',
  };

  for (const [k, f] of Object.entries(map)) {
    if (!fs.existsSync(path.join(SRC_DIR, f))) throw new Error(`missing ${k}: ${f}`);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
  });
  const base = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

  const uploaded = {};
  for (const [mainType, file] of Object.entries(map)) {
    const p = path.join(SRC_DIR, file);
    const ext = path.extname(file).toLowerCase() || '.png';
    const digest = crypto.createHash('sha1').update(`${mainType}:${file}`).digest('hex').slice(0, 10);
    const key = `dwira_uploads/filter-type-main/${mainType}-${digest}${ext}`;
    const body = fs.readFileSync(p);
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: mime(file), ContentLength: body.length }));
    uploaded[mainType] = `${base}/${key}`;
  }

  const conn = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root', database: process.env.DB_NAME || 'dwira' });
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const now = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  for (const [mainType, url] of Object.entries(uploaded)) {
    const [rows] = await conn.query("SELECT id FROM type_filter_images WHERE mode_bien=? AND main_type=? AND sub_type IS NULL LIMIT 1", [mode, mainType]);
    if (rows.length) {
      await conn.query("UPDATE type_filter_images SET image_url=?, updated_at=? WHERE id=?", [url, now, rows[0].id]);
    } else {
      const id = `tfi_${mode}_${mainType}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      await conn.query("INSERT INTO type_filter_images (id, mode_bien, main_type, sub_type, image_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?)", [id, mode, mainType, null, url, now, now]);
    }
  }

  const [rows] = await conn.query("SELECT mode_bien, main_type, sub_type, image_url FROM type_filter_images WHERE mode_bien=? ORDER BY main_type, sub_type IS NULL DESC, sub_type", [mode]);
  await conn.end();
  console.log(JSON.stringify({ ok: true, uploaded, rows }, null, 2));
})();