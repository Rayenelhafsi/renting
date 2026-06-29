const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/dwiraimmobilier.com/public/.env' });
(async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});
  const [h]=await c.query("SELECT mode_bien,filter_group,option_key,image_url FROM home_filter_option_images ORDER BY mode_bien,filter_group,option_key");
  const [t]=await c.query("SELECT mode_bien,main_type,sub_type,image_url FROM type_filter_images ORDER BY mode_bien,main_type,sub_type");
  console.log(JSON.stringify({homeCount:h.length,typeCount:t.length,home:h,type:t},null,2));
  await c.end();
})();
