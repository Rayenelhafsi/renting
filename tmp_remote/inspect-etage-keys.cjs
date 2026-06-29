const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
(async () => {
  const c = await mysql.createConnection({host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD') ? process.env.DB_PASSWORD : 'root', database: process.env.DB_NAME || 'dwira'});
  const [rows] = await c.query(`SELECT mode_bien, filter_group, option_key, image_url FROM home_filter_option_images ORDER BY mode_bien, filter_group, option_key`);
  console.log(JSON.stringify(rows, null, 2));
  await c.end();
})();