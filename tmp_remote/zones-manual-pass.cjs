const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT = '/var/www/dwiraimmobilier.com/public/tmp_icon_all_ascii/icon_all_ascii';
const ROOT2 = '/var/www/dwiraimmobilier.com/public/tmp_icon_all_ascii';
const baseDir = fs.existsSync(ROOT) ? ROOT : ROOT2;

const pick = {
  tunisie: 'Djerba.jpg',
  ain_grenz: 'aingrenz.jpg',
  centre_ville: 'centre-ville_hammem_ghzez.jfif',
  hammam_ghezze: 'Hammem_ghzez.jpg',
  ezzahra_hammem_jabli: 'ezzahrahammemjabli.jfif',
  ezzahra_plage: 'ezzahraplage.jfif',
  fatha: 'fathaplage.jpg',
  jinen_mansoura: 'jinenmansoura.jpg',
  kelibia_blanche: 'kelibialablanche.webp',
  mansoura: 'mansourah.jpg',
  petit_paris: 'petitparis.jpg',
  plage_karkouane: 'karkouaaanepalge.jpg',
  plage_zone_touristique: 'hamemghzez.jfif',
  sidi_mansoura: 'sidiimansour.jpg'
};

function existsFile(name){ return fs.existsSync(path.join(baseDir,name)); }
function mime(f){ const e=path.extname(f).toLowerCase(); if(['.jpg','.jpeg','.jfif'].includes(e))return 'image/jpeg'; if(e==='.png')return 'image/png'; if(e==='.webp')return 'image/webp'; if(e==='.gif')return 'image/gif'; return 'application/octet-stream'; }

(async()=>{
  const s3 = new S3Client({ region:'auto', endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY} });
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'');

  const uploadUrl = {};
  for(const [k,f] of Object.entries(pick)){
    if(!existsFile(f)) continue;
    const p = path.join(baseDir,f);
    const ext = path.extname(f).toLowerCase();
    const digest = crypto.createHash('sha1').update(f).digest('hex').slice(0,10);
    const key = `zones/icons/manual/${f.replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/\.[^.]+$/,'')}-${digest}${ext}`;
    await s3.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:key,Body:fs.createReadStream(p),ContentType:mime(f)}));
    uploadUrl[k] = `${publicBase}/${key}`;
  }

  const c = await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:Object.prototype.hasOwnProperty.call(process.env,'DB_PASSWORD')?process.env.DB_PASSWORD:'root',database:process.env.DB_NAME||'dwira'});

  // 1) all remaining cloudinary pays_image_url where pays=Tunisie
  await c.query("UPDATE zones SET pays_image_url = ? WHERE pays='Tunisie' AND pays_image_url LIKE '%cloudinary.com%'", [uploadUrl.tunisie]);

  // 2) deterministic unresolved mappings
  const updates = [
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Ain Grenz' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.ain_grenz],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Centre Ville' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.centre_ville],
    ["UPDATE zones SET region_image_url=? WHERE region='Hammam Ghezèze' AND region_image_url LIKE '%cloudinary.com%'", uploadUrl.hammam_ghezze],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Plage Zone touristique' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.plage_zone_touristique],
    ["UPDATE zones SET region_image_url=? WHERE region='Ezzahra Hammem Jabli' AND region_image_url LIKE '%cloudinary.com%'", uploadUrl.ezzahra_hammem_jabli],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Ezzahra Plage' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.ezzahra_plage],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='FATHA' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.fatha],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Jinen Mansoura' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.jinen_mansoura],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Kélibia la blanche' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.kelibia_blanche],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Mansoura' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.mansoura],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Petit Paris' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.petit_paris],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Plage Karkouane' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.plage_karkouane],
    ["UPDATE zones SET quartier_image_url=? WHERE quartier='Sidi Mansoura' AND quartier_image_url LIKE '%cloudinary.com%'", uploadUrl.sidi_mansoura],
  ];

  for(const [sql,val] of updates){ if(val) await c.query(sql,[val]); }

  const [left] = await c.query("SELECT COUNT(*) n FROM zones WHERE pays_image_url LIKE '%cloudinary.com%' OR gouvernerat_image_url LIKE '%cloudinary.com%' OR region_image_url LIKE '%cloudinary.com%' OR quartier_image_url LIKE '%cloudinary.com%'");
  const [sample] = await c.query("SELECT id,nom,pays_image_url,gouvernerat_image_url,region_image_url,quartier_image_url FROM zones WHERE pays_image_url LIKE '%cloudinary.com%' OR gouvernerat_image_url LIKE '%cloudinary.com%' OR region_image_url LIKE '%cloudinary.com%' OR quartier_image_url LIKE '%cloudinary.com%' LIMIT 50");
  await c.end();

  const report = { uploadedKeys:Object.keys(uploadUrl), leftCloudinaryRows:left[0].n, sample };
  fs.writeFileSync('/var/www/dwiraimmobilier.com/public/zones-icons-manual-pass-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();
