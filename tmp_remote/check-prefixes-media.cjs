const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await c.query(`
    SELECT
      SUM(CASE WHEN url LIKE '%/biens/ref-%' THEN 1 ELSE 0 END) AS biens_prefix,
      SUM(CASE WHEN url LIKE '%/dwira_uploads/biens/ref-%' THEN 1 ELSE 0 END) AS dwira_uploads_biens_prefix,
      SUM(CASE WHEN url LIKE '%cloudinary.com%' THEN 1 ELSE 0 END) AS cloudinary,
      COUNT(*) AS total
    FROM media
    WHERE type='image'
  `);
  const [sampleA] = await c.query("SELECT b.reference,m.position,m.url FROM media m JOIN biens b ON b.id=m.bien_id WHERE m.type='image' AND m.url LIKE '%/biens/ref-%' ORDER BY b.reference,m.position LIMIT 10");
  const [sampleB] = await c.query("SELECT b.reference,m.position,m.url FROM media m JOIN biens b ON b.id=m.bien_id WHERE m.type='image' AND m.url LIKE '%/dwira_uploads/biens/ref-%' ORDER BY b.reference,m.position LIMIT 10");
  await c.end();
  console.log(JSON.stringify({ counts: rows[0], sample_biens_prefix: sampleA, sample_dwira_uploads_prefix: sampleB }, null, 2));
})();