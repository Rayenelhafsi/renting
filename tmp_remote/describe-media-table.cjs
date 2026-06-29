const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await c.query('DESCRIBE media');
  console.log(JSON.stringify(rows, null, 2));
  const [sample] = await c.query('SELECT * FROM media LIMIT 5');
  console.log('SAMPLE');
  console.log(JSON.stringify(sample, null, 2));
  await c.end();
})();