const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root', database: process.env.DB_NAME || 'dwira' });
  const [src] = await c.query("SELECT region_image_url, quartier_image_url FROM zones WHERE region='Kelibia' AND quartier='Mansoura' AND region_image_url IS NOT NULL AND quartier_image_url IS NOT NULL LIMIT 1");
  if (src.length) {
    await c.query("UPDATE zones SET region_image_url=?, quartier_image_url=? WHERE id='z3'", [src[0].region_image_url, src[0].quartier_image_url]);
  }
  const [sum] = await c.query("SELECT SUM(CASE WHEN pays_image_url IS NULL OR gouvernerat_image_url IS NULL OR region_image_url IS NULL OR quartier_image_url IS NULL THEN 1 ELSE 0 END) AS null_filter_fields, SUM(CASE WHEN coalesce(pays_image_url,'') LIKE '%cloudinary.com%' OR coalesce(gouvernerat_image_url,'') LIKE '%cloudinary.com%' OR coalesce(region_image_url,'') LIKE '%cloudinary.com%' OR coalesce(quartier_image_url,'') LIKE '%cloudinary.com%' OR coalesce(image_url,'') LIKE '%cloudinary.com%' THEN 1 ELSE 0 END) AS any_cloudinary FROM zones");
  const [z3] = await c.query("SELECT id,nom,pays_image_url,gouvernerat_image_url,region_image_url,quartier_image_url FROM zones WHERE id='z3'");
  console.log(JSON.stringify({ summary: sum[0], z3: z3[0] }, null, 2));
  await c.end();
})();