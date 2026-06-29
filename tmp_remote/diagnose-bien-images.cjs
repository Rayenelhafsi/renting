const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const refs = ['REF-259','REF-249','REF-212','REF-200','REF-228','REF-201'];
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await c.query(
    'SELECT reference,id,titre,images,cover_image_url FROM biens WHERE reference IN (?,?,?,?,?,?) ORDER BY reference',
    refs
  );
  await c.end();
  console.log(JSON.stringify(rows, null, 2));
})();