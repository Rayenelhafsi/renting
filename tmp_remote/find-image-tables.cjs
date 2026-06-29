const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [tables] = await c.query("SHOW TABLES");
  const tableNames = tables.map((r)=>Object.values(r)[0]);
  const withImageLike = [];
  for (const t of tableNames) {
    const [cols] = await c.query(`DESCRIBE \`${t}\``);
    const imgCols = cols.map(c=>c.Field).filter(f=>/image|media|photo|cover|gallery|url/i.test(f));
    if (imgCols.length) withImageLike.push({ table: t, cols: imgCols });
  }
  console.log(JSON.stringify(withImageLike, null, 2));
  await c.end();
})();