const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function head(url){ try{ const r=await fetch(url,{method:'HEAD'}); return r.status; }catch{return 0;} }

(async()=>{
  const c = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const [rows] = await c.query(`
    SELECT b.reference,b.id AS bien_id,COUNT(*) AS n
    FROM media m
    JOIN biens b ON b.id=m.bien_id
    WHERE m.type='image' AND COALESCE(m.motif_upload,'') LIKE 'migration_new_sais%'
    GROUP BY b.reference,b.id
    HAVING COUNT(*) >= 20
    ORDER BY n DESC
    LIMIT 20
  `);
  const out=[];
  for(const r of rows){
    const [media] = await c.query('SELECT id,url,position,motif_upload FROM media WHERE bien_id=? ORDER BY position,id',[r.bien_id]);
    let ok=0,bad=0;
    const sample=[];
    for(const m of media){
      const st = await head(m.url);
      if(st===200) ok++; else bad++;
      if(sample.length<8) sample.push({position:m.position,status:st,url:m.url,motif:m.motif_upload});
    }
    out.push({reference:r.reference,bien_id:r.bien_id,total:media.length,ok,bad,sample});
  }
  await c.end();
  console.log(JSON.stringify(out,null,2));
})();