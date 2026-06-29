const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/dwiraimmobilier.com/public/.env' });
(async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});
  const [a]=await c.query("SELECT COUNT(*) total FROM media WHERE motif_upload='migration_new_saison_2026_r2'");
  const [b]=await c.query("SELECT b.reference,COUNT(*) n FROM media m JOIN biens b ON b.id=m.bien_id WHERE motif_upload='migration_new_saison_2026_r2' GROUP BY b.reference ORDER BY b.reference");
  const [d]=await c.query("SELECT COUNT(*) cloudinary_left FROM media m JOIN biens b ON b.id=m.bien_id WHERE m.url LIKE '%res.cloudinary.com%' AND b.reference IN (SELECT reference FROM biens WHERE id IN (SELECT bien_id FROM media WHERE motif_upload='migration_new_saison_2026_r2'))");
  console.log(JSON.stringify({migrated_media_total:a[0].total,updated_biens:b.length,cloudinary_left_on_updated_biens:d[0].cloudinary_left,sample:b.slice(0,20)},null,2));
  await c.end();
})();
