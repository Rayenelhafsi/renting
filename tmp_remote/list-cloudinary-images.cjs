const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const targets = [
  ["media","id","url"],
  ["biens","id","image_url"],
  ["zones","id","image_url"],
  ["zones","id","pays_image_url"],
  ["zones","id","gouvernerat_image_url"],
  ["zones","id","region_image_url"],
  ["zones","id","quartier_image_url"],
  ["type_filter_images","id","image_url"],
  ["home_filter_option_images","id","image_url"],
  ["reservation_demands","id","identity_document_image_url"],
  ["reservation_demands","id","payment_receipt_image_url"],
  ["utilisateurs","id","cin_image_url"],
  ["utilisateurs","id","avatar"],
];

function getDbConfig() {
  const src = String(process.env.DB_SOURCE || process.env.DB_TARGET || "local").trim().toLowerCase();
  const isSite = src === "site" || src === "production";
  const siteDbHost = String(process.env.SITE_DB_HOST || process.env.VPS_DB_HOST || "").trim();
  const siteDbPort = String(process.env.SITE_DB_PORT || process.env.VPS_DB_PORT || "").trim();
  const siteDbUser = String(process.env.SITE_DB_USER || process.env.VPS_DB_USER || "").trim();
  const siteDbPassword = String(process.env.SITE_DB_PASSWORD || process.env.VPS_DB_PASSWORD || "").trim();
  const siteDbName = String(process.env.SITE_DB_NAME || process.env.VPS_DB_NAME || "").trim();
  if (isSite && siteDbHost && siteDbUser && siteDbName) {
    return { host: siteDbHost, port: Number(siteDbPort || 3306), user: siteDbUser, password: siteDbPassword, database: siteDbName };
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: Object.prototype.hasOwnProperty.call(process.env, "DB_PASSWORD") ? process.env.DB_PASSWORD : "root",
    database: process.env.DB_NAME || "dwira",
  };
}

(async () => {
  const conn = await mysql.createConnection(getDbConfig());
  const rows = [];
  for (const [table, pk, col] of targets) {
    try {
      const q = `SELECT ${pk} AS row_id, ${col} AS image_url FROM ${table} WHERE ${col} IS NOT NULL AND TRIM(${col}) <> '' AND ${col} LIKE ?`;
      const [result] = await conn.query(q, ["%res.cloudinary.com%"]);
      for (const r of result) {
        rows.push({ table, column: col, row_id: r.row_id, image_url: r.image_url });
      }
    } catch (e) {
      rows.push({ table, column: col, row_id: null, image_url: null, error: String(e.message || e) });
    }
  }
  await conn.end();

  const outJson = "/var/www/dwiraimmobilier.com/public/cloudinary-images-list.json";
  const outCsv = "/var/www/dwiraimmobilier.com/public/cloudinary-images-list.csv";

  fs.writeFileSync(outJson, JSON.stringify(rows, null, 2));

  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = "table,column,row_id,image_url,error\n";
  const body = rows.map(r => [r.table, r.column, r.row_id ?? "", r.image_url ?? "", r.error ?? ""].map(esc).join(",")).join("\n");
  fs.writeFileSync(outCsv, header + body + "\n");

  const total = rows.filter(r => r.image_url).length;
  const unique = new Set(rows.filter(r => r.image_url).map(r => r.image_url)).size;
  const perTable = {};
  for (const r of rows) {
    if (!r.image_url) continue;
    perTable[r.table] = (perTable[r.table] || 0) + 1;
  }

  console.log(JSON.stringify({ total, unique, perTable, outJson, outCsv }, null, 2));
})();
