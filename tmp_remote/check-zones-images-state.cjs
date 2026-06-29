require('dotenv').config();
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const s = await pool.query("SELECT count(*) FILTER (WHERE coalesce(pays_image_url,'') ILIKE '%cloudinary.com%' OR coalesce(gouvernerat_image_url,'') ILIKE '%cloudinary.com%' OR coalesce(region_image_url,'') ILIKE '%cloudinary.com%' OR coalesce(quartier_image_url,'') ILIKE '%cloudinary.com%') AS cloudinary_filter_fields, count(*) FILTER (WHERE coalesce(image_url,'') ILIKE '%cloudinary.com%') AS cloudinary_image_url, count(*) FILTER (WHERE pays_image_url IS NULL OR gouvernerat_image_url IS NULL OR region_image_url IS NULL OR quartier_image_url IS NULL) AS null_filter_fields FROM zones");
  const probe = await pool.query("SELECT id, nom, pays_image_url, gouvernerat_image_url, region_image_url, quartier_image_url FROM zones WHERE id IN ('z1','z2','z3','test_cov_zone_1','test_cov_zone_2','test_cov_zone_3') ORDER BY id");
  console.log(JSON.stringify({ summary: s.rows[0], probe: probe.rows }, null, 2));
  await pool.end();
})();