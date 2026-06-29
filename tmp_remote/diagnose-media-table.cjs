const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function headStatus(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: null, ok: false, error: String(e.message || e) };
  }
}

(async () => {
  const refs = ['REF-259','REF-249','REF-212','REF-200','REF-228','REF-201'];
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [biens] = await c.query('SELECT id,reference,titre FROM biens WHERE reference IN (?,?,?,?,?,?) ORDER BY reference', refs);
  const ids = biens.map(b => b.id);
  const placeholders = ids.map(()=>'?').join(',');
  const [media] = await c.query(`SELECT entity_id,url,ordre,kind FROM media WHERE entity_type='bien' AND entity_id IN (${placeholders}) ORDER BY entity_id,ordre,id`, ids);
  await c.end();

  const byId = new Map();
  for (const m of media) {
    if (!byId.has(m.entity_id)) byId.set(m.entity_id, []);
    byId.get(m.entity_id).push(m);
  }

  const out = [];
  for (const b of biens) {
    const list = byId.get(b.id) || [];
    const samples = [];
    for (const m of list.slice(0, 3)) {
      const st = await headStatus(m.url);
      samples.push({ url: m.url, kind: m.kind, ordre: m.ordre, status: st.status, ok: st.ok, error: st.error || null });
    }
    out.push({ reference: b.reference, id: b.id, media_count: list.length, sample: samples });
  }

  const cloudinaryCount = media.filter(m => String(m.url||'').includes('cloudinary.com')).length;
  const r2Count = media.filter(m => String(m.url||'').includes('.r2.dev')).length;
  console.log(JSON.stringify({ totals: { mediaRows: media.length, cloudinaryCount, r2Count }, out }, null, 2));
})();