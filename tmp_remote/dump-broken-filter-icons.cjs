const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/dwiraimmobilier.com/public/.env' });
(async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});
  const [t]=await c.query("SELECT id,mode_bien,main_type,sub_type,image_url FROM type_filter_images WHERE image_url LIKE '%cloudinary.com%' ORDER BY mode_bien,main_type,sub_type");
  const [h]=await c.query("SELECT id,mode_bien,filter_group,option_key,image_url FROM home_filter_option_images WHERE image_url LIKE '%cloudinary.com%' ORDER BY mode_bien,filter_group,option_key");
  console.log(JSON.stringify({type_filter_images:t,home_filter_option_images:h},null,2));
  await c.end();
})();
