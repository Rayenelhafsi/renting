const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const url = 'https://pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev/dwira_uploads/filter-icons/ChatGPT_Image_30_mai_2026_19_18_53_1-b327363fc5.png';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const conn = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root', database: process.env.DB_NAME || 'dwira' });

  const [existing] = await conn.query("SELECT id FROM home_filter_option_images WHERE mode_bien='location_saisonniere' AND filter_group='comfort' AND option_key='premier_etage' LIMIT 1");
  if (existing.length) {
    await conn.query("UPDATE home_filter_option_images SET image_url=?, updated_at=? WHERE id=?", [url, dt, existing[0].id]);
  } else {
    const id = `home_filter_${Date.now()}_premier_etage`;
    await conn.query("INSERT INTO home_filter_option_images (id,mode_bien,filter_group,option_key,image_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [id, 'location_saisonniere', 'comfort', 'premier_etage', url, dt, dt]);
  }

  const [row] = await conn.query("SELECT id, mode_bien, filter_group, option_key, image_url, created_at, updated_at FROM home_filter_option_images WHERE mode_bien='location_saisonniere' AND filter_group='comfort' AND option_key='premier_etage' LIMIT 1");
  console.log(JSON.stringify(row[0] || null, null, 2));
  await conn.end();
})();