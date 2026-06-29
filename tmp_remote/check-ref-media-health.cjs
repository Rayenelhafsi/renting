const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status === 200;
  } catch {
    return false;
  }
}

(async () => {
  const refs = ['REF-259','REF-249','REF-212','REF-200','REF-228','REF-201'];
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [biens] = await c.query('SELECT id,reference FROM biens WHERE reference IN (?,?,?,?,?,?) ORDER BY reference', refs);
  const ids = biens.map(b => b.id);
  const ph = ids.map(()=>'?').join(',');
  const [media] = await c.query(`SELECT id,bien_id,url,position FROM media WHERE bien_id IN (${ph}) ORDER BY bien_id,position,id`, ids);
  await c.end();

  const byRef = {};
  const idToRef = Object.fromEntries(biens.map(b=>[b.id,b.reference]));
  for (const m of media) {
    const ref = idToRef[m.bien_id];
    if (!byRef[ref]) byRef[ref] = { total: 0, ok: 0, bad: 0, firstBad: null };
    byRef[ref].total += 1;
    const ok = await headOk(m.url);
    if (ok) byRef[ref].ok += 1;
    else { byRef[ref].bad += 1; if (!byRef[ref].firstBad) byRef[ref].firstBad = m.url; }
  }
  console.log(JSON.stringify(byRef, null, 2));
})();