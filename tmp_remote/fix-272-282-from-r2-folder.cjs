const mysql = require('mysql2/promise');
const path = require('path');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async()=>{
  const s3 = new S3Client({
    region:'auto',
    endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials:{ accessKeyId:process.env.R2_ACCESS_KEY_ID, secretAccessKey:process.env.R2_SECRET_ACCESS_KEY }
  });
  const bucket = process.env.R2_BUCKET_NAME;
  const base = String(process.env.R2_PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'');

  const targets = [
    { ref:'REF-272', prefix:'biens/ref-272/images/' },
    { ref:'REF-282', prefix:'biens/ref-282/images/' },
  ];

  const db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const report = {};

  for (const t of targets) {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: t.prefix, MaxKeys: 2000 }));
    const keys = (list.Contents || [])
      .map(x => x.Key)
      .filter(k => k && !k.endsWith('/'))
      .sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));

    const [bRows] = await db.query('SELECT id FROM biens WHERE reference=? LIMIT 1', [t.ref]);
    if (!bRows.length) {
      report[t.ref] = { foundBien:false, objectCount:keys.length, updated:0, note:'bien not found' };
      continue;
    }
    const bienId = bRows[0].id;
    const [mRows] = await db.query('SELECT id,position,url FROM media WHERE bien_id=? ORDER BY position,id', [bienId]);

    let updated = 0;
    const n = Math.min(mRows.length, keys.length);
    for (let i=0; i<n; i++) {
      const newUrl = `${base}/${keys[i]}`;
      await db.query('UPDATE media SET url=?, position=? WHERE id=?', [newUrl, i, mRows[i].id]);
      updated += 1;
    }

    // if more media rows than objects, delete trailing rows
    if (mRows.length > keys.length) {
      const toDelete = mRows.slice(keys.length).map(r=>r.id);
      if (toDelete.length) {
        await db.query(`DELETE FROM media WHERE id IN (${toDelete.map(()=>'?').join(',')})`, toDelete);
      }
    }

    report[t.ref] = {
      foundBien:true,
      bienId,
      objectCount:keys.length,
      mediaBefore:mRows.length,
      mediaUpdated:updated,
      mediaDeleted: Math.max(0, mRows.length - keys.length),
      sample: keys.slice(0,8).map(k => `${base}/${k}`),
    };
  }

  await db.end();
  require('fs').writeFileSync('/var/www/dwiraimmobilier.com/public/fix-272-282-from-r2-folder-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})();