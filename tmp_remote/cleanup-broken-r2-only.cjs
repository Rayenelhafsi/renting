const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function head(url){ try{ const r=await fetch(url,{method:'HEAD'}); return r.status; }catch{return 0;} }

(async()=>{
  const db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const [rows] = await db.query("SELECT m.id,m.bien_id,m.url,m.position,b.reference FROM media m JOIN biens b ON b.id=m.bien_id WHERE m.type='image' AND m.url LIKE '%r2.dev/%' ORDER BY m.bien_id,m.position,m.id");

  const byBien = new Map();
  for (const r of rows) { if(!byBien.has(r.bien_id)) byBien.set(r.bien_id, []); byBien.get(r.bien_id).push(r); }

  const toDelete = [];
  const allBrokenRefs = [];
  const summary = [];

  for (const [bienId, list] of byBien.entries()) {
    let ok = 0, bad = 0;
    const statuses = [];
    for (const m of list) {
      const st = await head(m.url);
      statuses.push({ m, st });
      if (st === 200) ok++; else bad++;
    }
    if (ok > 0 && bad > 0) {
      for (const s of statuses) if (s.st !== 200) toDelete.push(s.m.id);
    }
    if (ok === 0) allBrokenRefs.push({ reference: list[0].reference, bien_id: bienId, count: list.length });
    summary.push({ reference: list[0].reference, bien_id: bienId, ok, bad, total: list.length });
  }

  let deleted = 0;
  if (toDelete.length) {
    const chunk = 500;
    for (let i=0; i<toDelete.length; i+=chunk) {
      const part = toDelete.slice(i, i+chunk);
      await db.query(`DELETE FROM media WHERE id IN (${part.map(()=>'?').join(',')})`, part);
      deleted += part.length;
    }
  }

  // resequence positions per bien
  const [bienIdsRows] = await db.query("SELECT DISTINCT bien_id FROM media WHERE type='image'");
  for (const b of bienIdsRows) {
    const [med] = await db.query("SELECT id FROM media WHERE bien_id=? AND type='image' ORDER BY position,id", [b.bien_id]);
    let p = 0;
    for (const m of med) {
      await db.query("UPDATE media SET position=? WHERE id=?", [p, m.id]);
      p += 1;
    }
  }

  await db.end();

  const report = {
    scannedMedia: rows.length,
    deletedBrokenWhereBienHasValid: deleted,
    remainingAllBrokenBiens: allBrokenRefs.length,
    allBrokenBiensSample: allBrokenRefs.slice(0,80),
  };
  require('fs').writeFileSync('/var/www/dwiraimmobilier.com/public/cleanup-broken-media-r2-only-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();