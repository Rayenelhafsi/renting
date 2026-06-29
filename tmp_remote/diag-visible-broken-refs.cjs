const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function head(url){ try{ const r=await fetch(url,{method:'HEAD'}); return r.status; }catch{return 0;} }

(async()=>{
  const refs = ['REF-243','REF-280','REF-242','REF-244','REF-245','REF-246','REF-247','REF-248','REF-279','REF-281'];
  const c = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const [biens] = await c.query(`SELECT id,reference,titre FROM biens WHERE reference IN (${refs.map(()=>'?').join(',')}) ORDER BY reference`, refs);
  const ids = biens.map(b=>b.id);
  const [media] = ids.length ? await c.query(`SELECT id,bien_id,url,position FROM media WHERE bien_id IN (${ids.map(()=>'?').join(',')}) ORDER BY bien_id,position,id`, ids) : [[]];
  await c.end();
  const by = new Map();
  for(const m of media){ if(!by.has(m.bien_id)) by.set(m.bien_id,[]); by.get(m.bien_id).push(m); }
  const out=[];
  for(const b of biens){
    const list = by.get(b.id)||[];
    const sample=[];
    for(const m of list.slice(0,5)){ sample.push({position:m.position,status:await head(m.url),url:m.url}); }
    const okCount = (await Promise.all(list.map(async m => (await head(m.url))===200?1:0))).reduce((a,b)=>a+b,0);
    out.push({reference:b.reference,id:b.id,total:list.length,ok:okCount,bad:list.length-okCount,sample});
  }
  console.log(JSON.stringify(out,null,2));
})();