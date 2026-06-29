const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const refs = ['REF-259','REF-249','REF-212','REF-200','REF-228','REF-201'];
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await c.query(
    'SELECT reference,id,titre,mode,ui_config_json,location_saisonniere_config_json FROM biens WHERE reference IN (?,?,?,?,?,?) ORDER BY reference',
    refs
  );
  await c.end();

  const slim = rows.map((r) => {
    const ui = (()=>{ try{return JSON.parse(r.ui_config_json||'{}')}catch{return {}} })();
    const sc = (()=>{ try{return JSON.parse(r.location_saisonniere_config_json||'{}')}catch{return {}} })();
    return {
      reference: r.reference,
      id: r.id,
      titre: r.titre,
      mode: r.mode,
      ui_cover: ui?.card?.coverImage || ui?.coverImage || null,
      ui_images_count: Array.isArray(ui?.images) ? ui.images.length : null,
      ui_images_sample: Array.isArray(ui?.images) ? ui.images.slice(0,3) : null,
      sc_images_count: Array.isArray(sc?.images) ? sc.images.length : null,
      sc_images_sample: Array.isArray(sc?.images) ? sc.images.slice(0,3) : null,
    };
  });
  console.log(JSON.stringify(slim, null, 2));
})();