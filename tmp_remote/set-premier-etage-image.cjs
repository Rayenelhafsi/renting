const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const filename = 'ChatGPT_Image_30_mai_2026_19_18_53_1.png';
  const p = `/var/www/dwiraimmobilier.com/public/tmp_filter_icon_fix/${filename}`;
  if (!fs.existsSync(p)) throw new Error(`missing file: ${p}`);

  const base = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const digest = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 10);
  const key = `dwira_uploads/filter-icons/${filename.replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/\.[^.]+$/,'')}-${digest}.png`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
  });
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: fs.createReadStream(p), ContentType: 'image/png' }));
  const url = `${base}/${key}`;

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root',
    database: process.env.DB_NAME || 'dwira'
  });

  await conn.query(
    `INSERT INTO home_filter_option_images (mode_bien, filter_group, option_key, image_url)
     VALUES ('location_saisonniere','comfort','premier_etage',?)
     ON DUPLICATE KEY UPDATE image_url = VALUES(image_url)`,
    [url]
  );

  const [row] = await conn.query("SELECT mode_bien, filter_group, option_key, image_url FROM home_filter_option_images WHERE mode_bien='location_saisonniere' AND filter_group='comfort' AND option_key='premier_etage' LIMIT 1");
  await conn.end();
  console.log(JSON.stringify({ ok: true, uploadedKey: key, url, row: row[0] || null }, null, 2));
})();