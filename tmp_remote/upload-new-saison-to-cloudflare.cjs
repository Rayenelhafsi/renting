const fs = require('fs');
const path = require('path');

const ROOT = process.env.SOURCE_DIR;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const VARIANT = process.env.CLOUDFLARE_IMAGES_VARIANT || 'public';
const REQUIRE_SIGNED = String(process.env.CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS || '').toLowerCase() === 'true';
const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 6);

if (!ROOT || !fs.existsSync(ROOT)) throw new Error('SOURCE_DIR missing or invalid');
if (!ACCOUNT_ID || !API_TOKEN) throw new Error('Cloudflare credentials missing');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function isImage(file) {
  return /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file);
}

function mimeFromExt(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.heic') return 'image/heic';
  if (ext === '.heif') return 'image/heif';
  return 'application/octet-stream';
}

function extractRefFromFolder(file) {
  const folder = path.basename(path.dirname(file));
  const m = folder.match(/^(\d{1,6})\b/);
  return m ? `ref-${m[1]}` : null;
}

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function uploadOne(file, idx, total) {
  const ref = extractRefFromFolder(file);
  if (!ref) return { file, skipped: true, reason: 'no_ref_prefix' };

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ACCOUNT_ID)}/images/v1`;
  const filename = safeName(`${ref}_${path.basename(file)}`);
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeFromExt(file) }), filename);
  form.append('requireSignedURLs', REQUIRE_SIGNED ? 'true' : 'false');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    const msg = payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || `HTTP ${res.status}`;
    return { file, ref, ok: false, reason: msg };
  }
  const variants = payload?.result?.variants || [];
  const url = variants.find((u) => String(u).split('/').pop() === VARIANT) || variants[0] || null;
  if (!url) return { file, ref, ok: false, reason: 'no_delivery_url' };

  if (idx % 50 === 0) console.log(`uploaded ${idx}/${total}`);
  return { file, ref, ok: true, url };
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i + 1, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runner()));
  return results;
}

(async () => {
  const allFiles = walk(ROOT).filter(isImage);
  const results = await runPool(allFiles, uploadOne, CONCURRENCY);

  const mapping = {};
  const failures = [];
  let uploaded = 0;
  let skipped = 0;

  for (const r of results) {
    if (!r) continue;
    if (r.skipped) {
      skipped += 1;
      failures.push(r);
      continue;
    }
    if (!r.ok) {
      failures.push(r);
      continue;
    }
    uploaded += 1;
    if (!mapping[r.ref]) mapping[r.ref] = [];
    mapping[r.ref].push(r.url);
  }

  for (const ref of Object.keys(mapping)) {
    mapping[ref] = Array.from(new Set(mapping[ref]));
  }

  const outDir = path.resolve(process.cwd(), 'tmp_remote');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const mapPath = path.join(outDir, 'new-saison-cloudflare-mapping.json');
  const reportPath = path.join(outDir, 'new-saison-cloudflare-upload-report.json');
  fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2));
  fs.writeFileSync(reportPath, JSON.stringify({ totalImages: allFiles.length, uploaded, skipped, failed: failures.length, refs: Object.keys(mapping).length, failures }, null, 2));

  console.log(JSON.stringify({ totalImages: allFiles.length, uploaded, skipped, failed: failures.length, refs: Object.keys(mapping).length, mapPath, reportPath }, null, 2));
})();
