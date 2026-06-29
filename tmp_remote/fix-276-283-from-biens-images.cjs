const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function head(url){ try{ const r=await fetch(url,{method:'HEAD'}); return r.status; }catch{return 0;} }

function candidateUrls(url, ref){
  const out = [];
  const m = String(ref||'').toLowerCase();
  const u = String(url||'');
  const baseSwap = u.replace(`/dwira_uploads/biens/${m}/`, `/biens/${m}/images/`);
  out.push(baseSwap);
  const noHash = baseSwap.replace(/-[a-f0-9]{10}(?=\.[a-z0-9]+$)/i, '');
  out.push(noHash);
  return Array.from(new Set(out.filter(Boolean)));
}

(async()=>{
  const db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const refs = ['REF-276','REF-283'];
  const [biens] = await db.query(`SELECT id,reference FROM biens WHERE reference IN (${refs.map(()=>'?').join(',')})`, refs);

  const report = { refs: {}, updated: 0, unchanged: 0 };

  for (const b of biens) {
    const [media] = await db.query('SELECT id,url,position FROM media WHERE bien_id=? ORDER BY position,id', [b.id]);
    const ref = String(b.reference || '').toLowerCase();
    report.refs[b.reference] = { total: media.length, fixed: 0, stillBroken: 0, sample: [] };

    for (const m of media) {
      const curStatus = await head(m.url);
      if (curStatus === 200) {
        report.unchanged += 1;
        continue;
      }

      const candidates = candidateUrls(m.url, ref);
      let chosen = null;
      for (const c of candidates) {
        const st = await head(c);
        if (st === 200) { chosen = c; break; }
      }

      if (chosen) {
        await db.query('UPDATE media SET url=? WHERE id=?', [chosen, m.id]);
        report.updated += 1;
        report.refs[b.reference].fixed += 1;
        if (report.refs[b.reference].sample.length < 10) report.refs[b.reference].sample.push({ id:m.id, old:m.url, new:chosen });
      } else {
        report.refs[b.reference].stillBroken += 1;
      }
    }
  }

  await db.end();
  require('fs').writeFileSync('/var/www/dwiraimmobilier.com/public/fix-276-283-from-biens-images-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();