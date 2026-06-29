const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root',
    database: process.env.DB_NAME || 'dwira'
  });

  // Fill null filter fields by matching existing non-null values by dimension.
  await c.query(`UPDATE zones z
    JOIN (
      SELECT pays, MAX(pays_image_url) AS img
      FROM zones WHERE pays_image_url IS NOT NULL AND pays_image_url <> '' GROUP BY pays
    ) s ON s.pays = z.pays
    SET z.pays_image_url = s.img
    WHERE z.pays_image_url IS NULL OR z.pays_image_url = ''`);

  await c.query(`UPDATE zones z
    JOIN (
      SELECT gouvernerat, MAX(gouvernerat_image_url) AS img
      FROM zones WHERE gouvernerat_image_url IS NOT NULL AND gouvernerat_image_url <> '' GROUP BY gouvernerat
    ) s ON s.gouvernerat = z.gouvernerat
    SET z.gouvernerat_image_url = s.img
    WHERE z.gouvernerat_image_url IS NULL OR z.gouvernerat_image_url = ''`);

  await c.query(`UPDATE zones z
    JOIN (
      SELECT region, MAX(region_image_url) AS img
      FROM zones WHERE region_image_url IS NOT NULL AND region_image_url <> '' GROUP BY region
    ) s ON s.region = z.region
    SET z.region_image_url = s.img
    WHERE z.region_image_url IS NULL OR z.region_image_url = ''`);

  await c.query(`UPDATE zones z
    JOIN (
      SELECT quartier, MAX(quartier_image_url) AS img
      FROM zones WHERE quartier_image_url IS NOT NULL AND quartier_image_url <> '' GROUP BY quartier
    ) s ON s.quartier = z.quartier
    SET z.quartier_image_url = s.img
    WHERE z.quartier_image_url IS NULL OR z.quartier_image_url = ''`);

  // Replace last Cloudinary in generic image_url with available R2 fallback.
  await c.query(`UPDATE zones
    SET image_url = COALESCE(quartier_image_url, region_image_url, gouvernerat_image_url, pays_image_url)
    WHERE image_url LIKE '%cloudinary.com%'`);

  const [summary] = await c.query(`SELECT
      SUM(CASE WHEN COALESCE(pays_image_url,'') LIKE '%cloudinary.com%' OR COALESCE(gouvernerat_image_url,'') LIKE '%cloudinary.com%' OR COALESCE(region_image_url,'') LIKE '%cloudinary.com%' OR COALESCE(quartier_image_url,'') LIKE '%cloudinary.com%' THEN 1 ELSE 0 END) AS cloudinary_filter_fields,
      SUM(CASE WHEN COALESCE(image_url,'') LIKE '%cloudinary.com%' THEN 1 ELSE 0 END) AS cloudinary_image_url,
      SUM(CASE WHEN pays_image_url IS NULL OR gouvernerat_image_url IS NULL OR region_image_url IS NULL OR quartier_image_url IS NULL THEN 1 ELSE 0 END) AS null_filter_fields
    FROM zones`);

  const [probe] = await c.query(`SELECT id,nom,pays_image_url,gouvernerat_image_url,region_image_url,quartier_image_url
    FROM zones
    WHERE id IN ('z1','z2','z3','test_cov_zone_1','test_cov_zone_2','test_cov_zone_3')
    ORDER BY id`);

  console.log(JSON.stringify({ summary: summary[0], probe }, null, 2));
  await c.end();
})();