const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/dwiraimmobilier.com/public/.env' });
(async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});
  const [z]=await c.query("SELECT id,nom,pays,gouvernerat,region,quartier,image_url,pays_image_url,gouvernerat_image_url,region_image_url,quartier_image_url FROM zones ORDER BY nom");
  console.log(JSON.stringify(z,null,2));
  await c.end();
})();
