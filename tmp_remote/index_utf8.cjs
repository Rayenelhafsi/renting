const express = require('express');

const mysql = require('mysql2/promise');

const cors = require('cors');

const multer = require('multer');

const path = require('path');

const fs = require('fs');

const crypto = require('crypto');

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const sharp = require('sharp');

const bcrypt = require('bcryptjs');

const nodemailer = require('nodemailer');

const Tesseract = require('tesseract.js');

const XLSX = require('xlsx');

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

let firebaseAdmin = null;

try {

  firebaseAdmin = require('firebase-admin');

} catch {

  firebaseAdmin = null;

}

const {

  generateRegistrationOptions,

  verifyRegistrationResponse,

  generateAuthenticationOptions,

  verifyAuthenticationResponse,

} = require('@simplewebauthn/server');

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });





const app = express();

app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const CANONICAL_FRONTEND_URL = String(FRONTEND_URL || '').trim().replace('https://dwiraimmobilier.com', 'https://www.dwiraimmobilier.com');

const API_BASE_URL = String(process.env.API_BASE_URL || '').trim().replace(/\/+$/, '') || '';

const FLOUCI_API_BASE_URL = String(process.env.FLOUCI_API_BASE_URL || 'https://developers.flouci.com/api/v2').trim().replace(/\/+$/, '');

const FLOUCI_PUBLIC_KEY = String(process.env.FLOUCI_PUBLIC_KEY || '').trim();

const FLOUCI_PRIVATE_KEY = String(process.env.FLOUCI_PRIVATE_KEY || '').trim();

const FLOUCI_WEBHOOK_SECRET = String(process.env.FLOUCI_WEBHOOK_SECRET || '').trim();

const MOBILE_FLOW_DEBUG = String(process.env.MOBILE_FLOW_DEBUG || '').trim().toLowerCase() === 'true';

const FLOUCI_AMOUNT_MULTIPLIER = Number.isFinite(Number(process.env.FLOUCI_AMOUNT_MULTIPLIER))

  ? Math.max(1, Number(process.env.FLOUCI_AMOUNT_MULTIPLIER))

  : 1000;

const FLOUCI_SESSION_TIMEOUT_SECS = Number.isFinite(Number(process.env.FLOUCI_SESSION_TIMEOUT_SECS))

  ? Math.max(300, Number(process.env.FLOUCI_SESSION_TIMEOUT_SECS))

  : 1800;

const MESSENGER_VERIFY_TOKEN = String(process.env.MESSENGER_VERIFY_TOKEN || '').trim();

const MESSENGER_PAGE_ACCESS_TOKEN = String(process.env.MESSENGER_PAGE_ACCESS_TOKEN || '').trim();

const MESSENGER_PAGE_ACCESS_TOKEN_LOCATION = String(process.env.MESSENGER_PAGE_ACCESS_TOKEN_LOCATION || '').trim();

const MESSENGER_PAGE_ACCESS_TOKEN_VENTE = String(process.env.MESSENGER_PAGE_ACCESS_TOKEN_VENTE || '').trim();

const MESSENGER_PAGE_ID_LOCATION = String(process.env.MESSENGER_PAGE_ID_LOCATION || '').trim();

const MESSENGER_PAGE_ID_VENTE = String(process.env.MESSENGER_PAGE_ID_VENTE || '').trim();

const MESSENGER_APP_SECRET = String(process.env.MESSENGER_APP_SECRET || '').trim();

const MESSENGER_API_VERSION = String(process.env.MESSENGER_API_VERSION || 'v21.0').trim();

const GOOGLE_MAPS_API_KEY = String(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '').trim();

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();

const OPENAI_OCR_MODEL = String(process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini').trim();

const CLOUDINARY_UPLOAD_SOURCE_BASE_URL = String(process.env.CLOUDINARY_UPLOAD_SOURCE_BASE_URL || 'https://www.dwiraimmobilier.com').trim().replace(/\/+$/, '');

const MEDIA_UPLOAD_PROVIDER = String(process.env.MEDIA_UPLOAD_PROVIDER || 'auto').trim().toLowerCase();

const MEDIA_REQUIRED_UPLOAD = String(

  process.env.MEDIA_REQUIRED_UPLOAD || process.env.CLOUDINARY_REQUIRED_UPLOAD || ''

).trim().toLowerCase() === 'true';

const CLOUDFLARE_ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();

const CLOUDFLARE_API_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();

const CLOUDFLARE_IMAGES_VARIANT = String(process.env.CLOUDFLARE_IMAGES_VARIANT || 'public').trim() || 'public';

const CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS = String(process.env.CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS || '').trim().toLowerCase() === 'true';

const CLOUDFLARE_STREAM_CUSTOMER_CODE = String(process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '').trim();

const R2_ACCOUNT_ID = String(process.env.R2_ACCOUNT_ID || '').trim();

const R2_BUCKET_NAME = String(process.env.R2_BUCKET_NAME || '').trim();

const R2_ACCESS_KEY_ID = String(process.env.R2_ACCESS_KEY_ID || '').trim();

const R2_SECRET_ACCESS_KEY = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();

const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

const SESSION_COOKIE_NAME = 'dwira_session';

const AGENT_SESSION_COOKIE_NAME = 'dwira_agent_session';

const DEVICE_COOKIE_NAME = 'dwira_device';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const DEVICE_COOKIE_DURATION_MS = 180 * 24 * 60 * 60 * 1000;

const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const WEBAUTHN_RP_NAME = String(process.env.WEBAUTHN_RP_NAME || 'Dwira Immobilier').trim() || 'Dwira Immobilier';

const WEBAUTHN_RP_ID = String(process.env.WEBAUTHN_RP_ID || '').trim().toLowerCase();

const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();

const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || '').trim();

const FLOUCI_ENABLED = Boolean(FLOUCI_PUBLIC_KEY && FLOUCI_PRIVATE_KEY);

if (!String(process.env.SESSION_SECRET || '').trim()) {

  console.warn('[Auth] SESSION_SECRET missing. Using ephemeral in-memory secret; sessions reset on server restart.');

}



function readFirebaseServiceAccount() {

  const inline = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();

  if (inline) {

    try {

      return JSON.parse(inline);

    } catch (error) {

      console.warn('[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', error?.message || error);

    }

  }

  const pathValue = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();

  if (pathValue) {

    try {

      const raw = fs.readFileSync(pathValue, 'utf8');

      return JSON.parse(raw);

    } catch (error) {

      console.warn('[FCM] Unable to read FIREBASE_SERVICE_ACCOUNT_PATH:', error?.message || error);

    }

  }

  return null;

}



function safeParseJson(value, fallbackValue = null) {

  if (value === null || value === undefined || value === '') return fallbackValue;

  if (typeof value === 'object') return value;

  try {

    return JSON.parse(String(value));

  } catch {

    return fallbackValue;

  }

}



function buildFlouciAuthorizationHeaders() {

  const bearer = `Bearer ${FLOUCI_PUBLIC_KEY}:${FLOUCI_PRIVATE_KEY}`;

  return {

    'Content-Type': 'application/json',

    Accept: 'application/json',

    Authorization: bearer,

  };

}



function buildFlouciTokenHeaders() {

  return {

    'Content-Type': 'application/json',

    Accept: 'application/json',

    apptoken: FLOUCI_PUBLIC_KEY,

    appsecret: FLOUCI_PRIVATE_KEY,

  };

}



function normalizeFlouciAmount(amountTnd) {

  const numeric = Number(amountTnd || 0);

  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  return Math.round(numeric * FLOUCI_AMOUNT_MULTIPLIER);

}



function isFlouciSuccessStatus(status) {

  const normalized = String(status || '').trim().toUpperCase();

  return ['SUCCESS', 'SUCCEEDED', 'PAID', 'COMPLETED', 'DONE'].includes(normalized);

}



async function parseFlouciResponse(response) {

  const rawText = await response.text().catch(() => '');

  let data = {};

  try {

    data = rawText ? JSON.parse(rawText) : {};

  } catch {

    data = {};

  }

  return { rawText, data };

}



function extractFlouciErrorMessage(response, data, rawText) {

  return String(

    data?.result?.message ||

    data?.detail ||

    data?.message ||

    data?.error ||

    rawText ||

    `HTTP ${response.status}`

  ).trim();

}



async function flouciGeneratePayment(payload) {

  const firstResponse = await fetch(`${FLOUCI_API_BASE_URL}/generate_payment`, {

    method: 'POST',

    headers: buildFlouciAuthorizationHeaders(),

    body: JSON.stringify(payload),

  });

  const firstParsed = await parseFlouciResponse(firstResponse);

  if (firstResponse.ok) return firstParsed.data;



  const firstMessage = extractFlouciErrorMessage(firstResponse, firstParsed.data, firstParsed.rawText);

  const shouldRetryWithTokenHeaders =

    firstResponse.status === 401 ||

    firstResponse.status === 403 ||

    /authentication credentials were not provided|unauthorized|forbidden|token/i.test(firstMessage);



  if (!shouldRetryWithTokenHeaders) {

    throw new Error(firstMessage || 'Echec creation paiement Flouci');

  }



  const secondResponse = await fetch(`${FLOUCI_API_BASE_URL}/generate_payment`, {

    method: 'POST',

    headers: buildFlouciTokenHeaders(),

    body: JSON.stringify(payload),

  });

  const secondParsed = await parseFlouciResponse(secondResponse);

  if (!secondResponse.ok) {

    const secondMessage = extractFlouciErrorMessage(secondResponse, secondParsed.data, secondParsed.rawText);

    throw new Error(secondMessage || 'Echec creation paiement Flouci');

  }

  return secondParsed.data;

}



async function flouciVerifyPayment(paymentId) {

  const response = await fetch(`${FLOUCI_API_BASE_URL}/verify_payment/${encodeURIComponent(String(paymentId || '').trim())}`, {

    method: 'GET',

    headers: buildFlouciAuthorizationHeaders(),

  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {

    const message = String(data?.message || data?.error || `HTTP ${response.status}`).trim();

    throw new Error(message || 'Echec verification paiement Flouci');

  }

  return data;

}



const FIREBASE_SERVICE_ACCOUNT = readFirebaseServiceAccount();

let firebaseMessaging = null;

if (firebaseAdmin && FIREBASE_SERVICE_ACCOUNT) {

  try {

    const appName = 'dwira-server-fcm';

    const existing = firebaseAdmin.apps.find((a) => a?.name === appName);

    const appInstance = existing || firebaseAdmin.initializeApp(

      { credential: firebaseAdmin.credential.cert(FIREBASE_SERVICE_ACCOUNT) },

      appName

    );

    firebaseMessaging = appInstance.messaging();

  } catch (error) {

    console.warn('[FCM] initialization failed:', error?.message || error);

  }

} else if (!firebaseAdmin) {

  console.warn('[FCM] firebase-admin package not installed. Push disabled.');

} else {

  console.warn('[FCM] service account missing. Push disabled.');

}



function parseCloudinaryCredentials() {

  const cloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();

  if (cloudinaryUrl.startsWith('cloudinary://')) {

    try {

      const parsed = new URL(cloudinaryUrl);

      const cloudName = String(parsed.hostname || '').trim();

      const apiKey = decodeURIComponent(String(parsed.username || '').trim());

      const apiSecret = decodeURIComponent(String(parsed.password || '').trim());

      if (cloudName && apiKey && apiSecret) {

        return { cloudName, apiKey, apiSecret };

      }

    } catch {

      // fallback to explicit env vars

    }

  }

  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();

  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();

  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) return null;

  return { cloudName, apiKey, apiSecret };

}



const CLOUDINARY_CREDS = parseCloudinaryCredentials();

const CLOUDINARY_UPLOAD_FOLDER = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'dwira_uploads').trim().replace(/^\/+|\/+$/g, '');

const CLOUDINARY_REQUIRED_UPLOAD = String(process.env.CLOUDINARY_REQUIRED_UPLOAD || '').trim().toLowerCase() === 'true';

const R2_S3_ENDPOINT = R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '';

const R2_CLIENT = (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)

  ? new S3Client({

      region: 'auto',

      endpoint: R2_S3_ENDPOINT,

      credentials: {

        accessKeyId: R2_ACCESS_KEY_ID,

        secretAccessKey: R2_SECRET_ACCESS_KEY,

      },

    })

  : null;



function hasCloudflareBaseConfig() {

  return Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN);

}



function hasR2Config() {

  return Boolean(R2_CLIENT && R2_BUCKET_NAME && R2_PUBLIC_BASE_URL);

}



function hasCloudflareImagesConfig() {

  return hasCloudflareBaseConfig();

}



function hasCloudflareStreamConfig() {

  return hasCloudflareBaseConfig();

}



function getCloudflareHeaders() {

  if (!hasCloudflareBaseConfig()) return null;

  return {

    Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,

  };

}



function parseCloudflareApiEnvelope(payload) {

  if (payload && typeof payload === 'object') return payload;

  return {};

}



function extractCloudflareErrorDetail(payload, fallbackMessage) {

  const envelope = parseCloudflareApiEnvelope(payload);

  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {

    const message = envelope.errors

      .map((entry) => String(entry?.message || entry?.code || '').trim())

      .filter(Boolean)

      .join('; ');

    if (message) return message;

  }

  return String(envelope.message || fallbackMessage || 'Cloudflare request failed').trim();

}



function buildCloudflareStreamIframeUrl(videoUid) {

  const uid = String(videoUid || '').trim();

  if (!uid) return '';

  if (CLOUDFLARE_STREAM_CUSTOMER_CODE) {

    return `https://customer-${CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${uid}/iframe`;

  }

  return `https://iframe.videodelivery.net/${uid}`;

}



function buildR2ObjectKey({ filename, folderKey, uploadScope, mediaType }) {

  const normalizedScope = String(uploadScope || '').trim().toLowerCase();

  const scopeFolder =

    normalizedScope === 'zone' ? 'zones'

    : normalizedScope === 'amicale' ? 'amicales'

    : 'biens';

  const safeFolderKey = String(folderKey || 'unassigned')

    .trim()

    .toLowerCase()

    .replace(/[^a-z0-9._/-]+/g, '-')

    .replace(/-+/g, '-')

    .replace(/^[-/]+|[-/]+$/g, '') || 'unassigned';

  const safeFilename = path.basename(String(filename || `media_${Date.now()}`)).replace(/[^a-zA-Z0-9._-]+/g, '_');

  const mediaFolder = String(mediaType || '').startsWith('video') ? 'videos' : 'images';

  return `${scopeFolder}/${safeFolderKey}/${mediaFolder}/${safeFilename}`;

}



function buildR2PublicUrl(objectKey) {

  const normalizedKey = String(objectKey || '').replace(/^\/+/, '');

  if (!normalizedKey || !R2_PUBLIC_BASE_URL) return '';

  return `${R2_PUBLIC_BASE_URL}/${normalizedKey}`;

}



async function uploadLocalMediaToR2({ localFilePath, filename, mimetype, folderKey, uploadScope, mediaType }) {

  if (!hasR2Config()) return null;

  const body = await fs.promises.readFile(localFilePath);

  const objectKey = buildR2ObjectKey({ filename, folderKey, uploadScope, mediaType });

  const command = new PutObjectCommand({

    Bucket: R2_BUCKET_NAME,

    Key: objectKey,

    Body: body,

    ContentType: String(mimetype || '').trim() || 'application/octet-stream',

    CacheControl: String(mediaType || '').startsWith('video') ? 'public, max-age=86400' : 'public, max-age=31536000, immutable',

  });

  await R2_CLIENT.send(command);

  return {

    provider: 'r2',

    objectKey,

    url: buildR2PublicUrl(objectKey),

  };

}



async function uploadLocalImageToCloudflare({ localFilePath, filename, folderKey, uploadScope }) {

  if (!hasCloudflareImagesConfig()) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/images/v1`;

  const fileBuffer = await fs.promises.readFile(localFilePath);

  const blob = new Blob([fileBuffer]);

  const form = new FormData();

  form.append('file', blob, String(filename || `image_${Date.now()}`));

  form.append('requireSignedURLs', CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS ? 'true' : 'false');

  form.append('metadata', JSON.stringify({

    folderKey,

    scope: String(uploadScope || 'bien'),

    originalFilename: String(filename || '').trim(),

  }));



  const response = await fetch(endpoint, {

    method: 'POST',

    headers: getCloudflareHeaders(),

    body: form,

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {

    throw new Error(extractCloudflareErrorDetail(payload, `Cloudflare Images upload failed (${response.status})`));

  }



  const result = payload?.result || {};

  const variants = Array.isArray(result?.variants) ? result.variants : [];

  const preferredVariant = variants.find((url) => {

    try {

      const parsed = new URL(String(url || '').trim());

      const segments = parsed.pathname.split('/').filter(Boolean);

      return segments[segments.length - 1] === CLOUDFLARE_IMAGES_VARIANT;

    } catch {

      return false;

    }

  });

  const url = String(preferredVariant || variants[0] || '').trim();

  if (!url) {

    throw new Error('Cloudflare Images upload succeeded but no delivery URL was returned');

  }



  return {

    provider: 'cloudflare-images',

    url,

    imageId: String(result?.id || '').trim(),

    filename: String(result?.filename || filename || '').trim(),

    variants,

  };

}



async function uploadLocalVideoToCloudflare({ localFilePath, filename }) {

  if (!hasCloudflareStreamConfig()) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/stream`;

  const fileBuffer = await fs.promises.readFile(localFilePath);

  const blob = new Blob([fileBuffer]);

  const form = new FormData();

  form.append('file', blob, String(filename || `video_${Date.now()}`));



  const response = await fetch(endpoint, {

    method: 'POST',

    headers: getCloudflareHeaders(),

    body: form,

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {

    throw new Error(extractCloudflareErrorDetail(payload, `Cloudflare Stream upload failed (${response.status})`));

  }



  const result = payload?.result || {};

  const uid = String(result?.uid || '').trim();

  const iframeUrl = buildCloudflareStreamIframeUrl(uid);

  if (!uid || !iframeUrl) {

    throw new Error('Cloudflare Stream upload succeeded but video UID is missing');

  }



  return {

    provider: 'cloudflare-stream',

    url: iframeUrl,

    videoUid: uid,

    thumbnail: String(result?.thumbnail || '').trim(),

    preview: String(result?.preview || '').trim(),

    status: String(result?.status?.state || result?.readyToStream || '').trim(),

  };

}



function canUseProviderForMedia(provider, mediaType) {

  const normalizedProvider = String(provider || '').trim().toLowerCase();

  const normalizedMediaType = String(mediaType || '').startsWith('video') ? 'video' : 'image';

  if (normalizedProvider === 'r2') {

    return hasR2Config();

  }

  if (normalizedProvider === 'cloudflare') {

    return normalizedMediaType === 'video' ? hasCloudflareStreamConfig() : hasCloudflareImagesConfig();

  }

  if (normalizedProvider === 'cloudinary') {

    return Boolean(CLOUDINARY_CREDS);

  }

  if (normalizedProvider === 'local') {

    return true;

  }

  return false;

}



function getUploadProviderCandidates(mediaType) {

  const normalizedProvider = String(MEDIA_UPLOAD_PROVIDER || 'auto').trim().toLowerCase();

  if (normalizedProvider && normalizedProvider !== 'auto') {

    return [normalizedProvider, 'local'];

  }

  const orderedProviders = ['r2', 'cloudflare', 'cloudinary', 'local'];

  return orderedProviders.filter((provider) => canUseProviderForMedia(provider, mediaType));

}



function signCloudinaryParams(params, apiSecret) {

  const signatureBase = Object.keys(params)

    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')

    .sort()

    .map((key) => `${key}=${params[key]}`)

    .join('&');

  return crypto.createHash('sha1').update(`${signatureBase}${apiSecret}`).digest('hex');

}



function buildCloudinaryPublicId(filename, folderPrefix = CLOUDINARY_UPLOAD_FOLDER) {

  const safeBase = String(filename || '')

    .replace(/\.[a-z0-9]+$/i, '')

    .replace(/[^a-zA-Z0-9/_-]+/g, '_')

    .replace(/_+/g, '_')

    .replace(/^_+|_+$/g, '') || `media_${Date.now()}`;

  return safeBase;

}



async function uploadLocalMediaToCloudinary({ localFilePath, filename, mimetype, folderPrefix }) {

  if (!CLOUDINARY_CREDS) return null;

  const mediaType = String(mimetype || '').startsWith('video/') ? 'video' : 'image';

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CREDS.cloudName}/${mediaType}/upload`;

  const publicId = buildCloudinaryPublicId(filename, folderPrefix);

  const cloudinaryFolder = String(folderPrefix || '').trim().replace(/^\/+|\/+$/g, '');

  const fileBuffer = await fs.promises.readFile(localFilePath);

  const effectiveMime = String(mimetype || '').trim() || 'application/octet-stream';

  const dataUri = `data:${effectiveMime};base64,${fileBuffer.toString('base64')}`;



  const sendCloudinaryUpload = async (timestamp) => {

    const paramsForSignature = {

      folder: cloudinaryFolder,

      invalidate: 'true',

      overwrite: 'true',

      public_id: publicId,

      timestamp: String(timestamp),

      type: 'upload',

      unique_filename: 'false',

      use_filename: 'false',

    };

    const signature = signCloudinaryParams(paramsForSignature, CLOUDINARY_CREDS.apiSecret);



    const form = new FormData();

    form.append('file', dataUri);

    if (cloudinaryFolder) {

      form.append('folder', cloudinaryFolder);

    }

    form.append('public_id', publicId);

    form.append('overwrite', 'true');

    form.append('invalidate', 'true');

    form.append('unique_filename', 'false');

    form.append('use_filename', 'false');

    form.append('type', 'upload');

    form.append('timestamp', String(timestamp));

    form.append('api_key', CLOUDINARY_CREDS.apiKey);

    form.append('signature', signature);



    const response = await fetch(endpoint, { method: 'POST', body: form });

    const payload = await response.json().catch(() => ({}));

    return { response, payload };

  };



  let timestamp = Math.floor(Date.now() / 1000);

  let { response, payload } = await sendCloudinaryUpload(timestamp);

  if (!response.ok) {

    const detail = String(payload?.error?.message || payload?.message || `HTTP ${response.status}`);

    const staleRequest = /stale request|timestamp/i.test(detail);

    if (staleRequest) {

      const cloudDateHeader = String(response.headers.get('date') || '').trim();

      const cloudServerMs = cloudDateHeader ? Date.parse(cloudDateHeader) : Number.NaN;

      if (Number.isFinite(cloudServerMs) && cloudServerMs > 0) {

        timestamp = Math.floor(cloudServerMs / 1000);

        const retried = await sendCloudinaryUpload(timestamp);

        response = retried.response;

        payload = retried.payload;

      }

    }

  }

  if (!response.ok) {

    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;

    throw new Error(detail);

  }

  return {

    url: String(payload.secure_url || '').trim(),

    publicId: String(payload.public_id || publicId).trim(),

    resourceType: String(payload.resource_type || mediaType).trim(),

    bytes: Number(payload.bytes || 0),

  };

}



function isCloudinaryUrl(value) {

  return /(^https?:\/\/)?res\.cloudinary\.com\//i.test(String(value || '').trim());

}



function isCloudflareImageUrl(value) {

  return /(^https?:\/\/)?imagedelivery\.net\//i.test(String(value || '').trim());

}



function isCloudflareStreamUrl(value) {

  return /(^https?:\/\/)?(?:customer-[a-z0-9_-]+\.cloudflarestream\.com|iframe\.videodelivery\.net)\//i.test(String(value || '').trim());

}



function isR2PublicUrl(value) {

  const mediaUrl = String(value || '').trim();

  if (!mediaUrl || !R2_PUBLIC_BASE_URL) return false;

  return mediaUrl.startsWith(`${R2_PUBLIC_BASE_URL}/`) || mediaUrl === R2_PUBLIC_BASE_URL;

}



function extractCloudflareImageIdFromUrl(assetUrl) {

  const value = String(assetUrl || '').trim();

  if (!value) return null;

  let parsed;

  try {

    parsed = new URL(value);

  } catch {

    return null;

  }

  if (!/imagedelivery\.net$/i.test(parsed.hostname)) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);

  if (segments.length < 3) return null;

  return String(segments[1] || '').trim() || null;

}



function extractCloudflareStreamUidFromUrl(assetUrl) {

  const value = String(assetUrl || '').trim();

  if (!value) return null;

  let parsed;

  try {

    parsed = new URL(value);

  } catch {

    return null;

  }

  const host = parsed.hostname.toLowerCase();

  if (host === 'iframe.videodelivery.net') {

    const segments = parsed.pathname.split('/').filter(Boolean);

    return String(segments[0] || '').trim() || null;

  }

  if (!host.endsWith('.cloudflarestream.com')) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);

  return String(segments[0] || '').trim() || null;

}



function extractR2ObjectKeyFromUrl(assetUrl) {

  const value = String(assetUrl || '').trim();

  if (!value || !R2_PUBLIC_BASE_URL) return null;

  if (!value.startsWith(`${R2_PUBLIC_BASE_URL}/`)) return null;

  const suffix = value.slice(R2_PUBLIC_BASE_URL.length).replace(/^\/+/, '');

  return suffix || null;

}



function isCloudinaryTransformationSegment(segment) {

  const value = String(segment || '').trim();

  if (!value) return false;

  if (value.includes(',')) return true;

  return /^(?:[a-z]{1,4}_[^/]+)$/i.test(value);

}



function extractCloudinaryPublicIdFromUrl(assetUrl) {

  const value = String(assetUrl || '').trim();

  if (!value) return null;

  let parsed;

  try {

    parsed = new URL(value);

  } catch {

    return null;

  }

  if (!/res\.cloudinary\.com$/i.test(parsed.hostname)) return null;

  const marker = '/image/upload/';

  const idx = parsed.pathname.indexOf(marker);

  if (idx < 0) return null;



  const tail = parsed.pathname.slice(idx + marker.length);

  const segments = tail.split('/').filter(Boolean);

  if (segments.length === 0) return null;



  let i = 0;

  while (i < segments.length && isCloudinaryTransformationSegment(segments[i])) i += 1;

  if (i < segments.length && /^v\d+$/i.test(segments[i])) i += 1;

  const publicPath = segments.slice(i).join('/');

  if (!publicPath) return null;



  const decoded = decodeURIComponent(publicPath);

  return decoded.replace(/\.[a-z0-9]+$/i, '');

}



async function deleteCloudinaryAssetByUrl(assetUrl, mediaTypeHint = 'image') {

  if (!CLOUDINARY_CREDS) {

    throw new Error('Cloudinary credentials missing');

  }

  const publicId = extractCloudinaryPublicIdFromUrl(assetUrl);

  if (!publicId) {

    throw new Error('Unable to extract Cloudinary public_id from URL');

  }

  const resourceType = String(mediaTypeHint || '').startsWith('video') ? 'video' : 'image';

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CREDS.cloudName}/${resourceType}/destroy`;

  const timestamp = Math.floor(Date.now() / 1000);

  const paramsForSignature = {

    invalidate: 'true',

    public_id: publicId,

    timestamp: String(timestamp),

  };

  const signature = signCloudinaryParams(paramsForSignature, CLOUDINARY_CREDS.apiSecret);



  const form = new FormData();

  form.append('public_id', publicId);

  form.append('invalidate', 'true');

  form.append('timestamp', String(timestamp));

  form.append('api_key', CLOUDINARY_CREDS.apiKey);

  form.append('signature', signature);



  const response = await fetch(endpoint, { method: 'POST', body: form });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {

    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;

    throw new Error(detail);

  }

  const result = String(payload?.result || '').toLowerCase();

  if (result !== 'ok' && result !== 'not found') {

    throw new Error(`Cloudinary destroy failed: ${result || 'unknown result'}`);

  }

  return { publicId, result };

}



async function deleteCloudflareImageByUrl(assetUrl) {

  if (!hasCloudflareImagesConfig()) {

    throw new Error('Cloudflare Images credentials missing');

  }

  const imageId = extractCloudflareImageIdFromUrl(assetUrl);

  if (!imageId) {

    throw new Error('Unable to extract Cloudflare image ID from URL');

  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/images/v1/${encodeURIComponent(imageId)}`;

  const response = await fetch(endpoint, {

    method: 'DELETE',

    headers: getCloudflareHeaders(),

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {

    throw new Error(extractCloudflareErrorDetail(payload, `Cloudflare image delete failed (${response.status})`));

  }

  return { imageId };

}



async function deleteCloudflareStreamByUrl(assetUrl) {

  if (!hasCloudflareStreamConfig()) {

    throw new Error('Cloudflare Stream credentials missing');

  }

  const videoUid = extractCloudflareStreamUidFromUrl(assetUrl);

  if (!videoUid) {

    throw new Error('Unable to extract Cloudflare Stream video UID from URL');

  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/stream/${encodeURIComponent(videoUid)}`;

  const response = await fetch(endpoint, {

    method: 'DELETE',

    headers: getCloudflareHeaders(),

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {

    throw new Error(extractCloudflareErrorDetail(payload, `Cloudflare Stream delete failed (${response.status})`));

  }

  return { videoUid };

}



async function deleteR2ObjectByUrl(assetUrl) {

  if (!hasR2Config()) {

    throw new Error('R2 credentials missing');

  }

  const objectKey = extractR2ObjectKeyFromUrl(assetUrl);

  if (!objectKey) {

    throw new Error('Unable to extract R2 object key from URL');

  }

  const command = new DeleteObjectCommand({

    Bucket: R2_BUCKET_NAME,

    Key: objectKey,

  });

  await R2_CLIENT.send(command);

  return { objectKey };

}

const ALLOWED_ORIGINS = [

  ...String(process.env.FRONTEND_URL || CANONICAL_FRONTEND_URL).split(',').map((value) => value.trim()).filter(Boolean),

  CANONICAL_FRONTEND_URL,

  'http://localhost:5173',

  'https://localhost:5173',

  'http://localhost:5174',

  'https://localhost:5174',

  'https://www.dwiraimmobilier.com',

  'https://dwiraimmobilier.com',

];

app.disable('x-powered-by');

const AGENCY_TIME_ZONE = 'Africa/Tunis';



console.log(`[OCR] OpenAI OCR enabled: ${OPENAI_API_KEY ? 'yes' : 'no'} (model=${OPENAI_OCR_MODEL || 'n/a'})`);



process.on('unhandledRejection', (reason) => {

  console.error('UNHANDLED_REJECTION:', reason);

});



process.on('uncaughtException', (error) => {

  console.error('UNCAUGHT_EXCEPTION:', error);

});



function isLocalDevOrigin(origin) {

  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || '').trim());

}



function getAgencySqlDateTime(date = new Date()) {

  const parts = new Intl.DateTimeFormat('en-CA', {

    timeZone: AGENCY_TIME_ZONE,

    year: 'numeric',

    month: '2-digit',

    day: '2-digit',

    hour: '2-digit',

    minute: '2-digit',

    second: '2-digit',

    hourCycle: 'h23',

    hour12: false,

  }).formatToParts(date);

  let year = parts.find((part) => part.type === 'year')?.value || '1970';

  let month = parts.find((part) => part.type === 'month')?.value || '01';

  let day = parts.find((part) => part.type === 'day')?.value || '01';

  let hour = parts.find((part) => part.type === 'hour')?.value || '00';

  const minute = parts.find((part) => part.type === 'minute')?.value || '00';

  const second = parts.find((part) => part.type === 'second')?.value || '00';

  // Guard against rare locale edge-case returning hour "24" which MySQL rejects.

  if (hour === '24') {

    const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));

    year = String(next.getUTCFullYear());

    month = String(next.getUTCMonth() + 1).padStart(2, '0');

    day = String(next.getUTCDate()).padStart(2, '0');

    hour = '00';

  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;

}



function getAgencyDateParts(date = new Date()) {

  const parts = new Intl.DateTimeFormat('en-CA', {

    timeZone: AGENCY_TIME_ZONE,

    year: 'numeric',

    month: '2-digit',

    day: '2-digit',

    hour: '2-digit',

    minute: '2-digit',

    second: '2-digit',

    hourCycle: 'h23',

    hour12: false,

  }).formatToParts(date);

  return {

    year: parts.find((part) => part.type === 'year')?.value || '1970',

    month: parts.find((part) => part.type === 'month')?.value || '01',

    day: parts.find((part) => part.type === 'day')?.value || '01',

    hour: parts.find((part) => part.type === 'hour')?.value || '00',

    minute: parts.find((part) => part.type === 'minute')?.value || '00',

    second: parts.find((part) => part.type === 'second')?.value || '00',

  };

}



function getAgencyLocalDate(date = new Date()) {

  const parts = getAgencyDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;

}



function getAgencyLocalTime(date = new Date()) {

  const parts = getAgencyDateParts(date);

  return `${parts.hour}:${parts.minute}:${parts.second}`;

}



function clampCalendarPromptHour(value, fallback = 20) {

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return fallback;

  return Math.min(23, Math.max(0, Math.trunc(numeric)));

}



function clampCalendarPromptMinute(value, fallback = 0) {

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return fallback;

  return Math.min(59, Math.max(0, Math.trunc(numeric)));

}



function normalizeCalendarPromptScheduleRow(row) {

  const dispatchHour = clampCalendarPromptHour(row?.dispatch_hour, 20);

  const dispatchMinute = clampCalendarPromptMinute(row?.dispatch_minute, 0);

  return {

    id: String(row?.id || 'default'),

    enabled: Number(row?.enabled || 0) === 1,

    startDate: String(row?.start_date || '').trim() || null,

    dispatchHour,

    dispatchMinute,

    dailyTime: `${String(dispatchHour).padStart(2, '0')}:${String(dispatchMinute).padStart(2, '0')}`,

    timezoneName: String(row?.timezone_name || AGENCY_TIME_ZONE).trim() || AGENCY_TIME_ZONE,

    timezoneOffsetLabel: 'UTC+01:00',

    lastDispatchedLocalDate: String(row?.last_dispatched_local_date || '').trim() || null,

    createdAt: row?.created_at || null,

    updatedAt: row?.updated_at || null,

  };

}



function normalizeText(value) {

  return String(value || '')

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '');

}



function normalizeTabNameForMatch(value) {

  return normalizeText(String(value || '').replace(/^\s*\d+\s*[\.\-:)]\s*/g, ''))

    .replace(/\s+/g, ' ')

    .trim();

}



function isMobileUserAgent(userAgent = '') {

  const ua = String(userAgent || '');

  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

}



function sanitizeReturnToPath(rawValue) {

  const value = String(rawValue || '').trim();

  if (!value) return null;

  if (!value.startsWith('/')) return null;

  if (value.startsWith('//')) return null;

  return value;

}



function encodeOauthState(payload) {

  try {

    return Buffer.from(JSON.stringify(payload || {}), 'utf8').toString('base64url');

  } catch {

    return '';

  }

}



function decodeOauthState(rawState) {

  const rawInput = Array.isArray(rawState) ? rawState[0] : rawState;

  const raw = String(rawInput || '').trim();

  if (!raw) return null;

  const normalized = raw.replace(/^['"]+|['"]+$/g, '');

  try {

    const json = Buffer.from(normalized, 'base64url').toString('utf8');

    const parsed = JSON.parse(json);

    return parsed && typeof parsed === 'object' ? parsed : null;

  } catch {

    return null;

  }

}



function logMobileFlow(step, req, extra = {}) {

  if (!MOBILE_FLOW_DEBUG) return;

  try {

    const ua = String(req?.headers?.['user-agent'] || '').slice(0, 180);

    const ip = String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim();

    const payload = {

      step,

      method: req?.method,

      path: req?.originalUrl || req?.url,

      ip,

      ua,

      userId: req?.authUser?.id || null,

      userRole: req?.authUser?.role || null,

      ...extra,

    };

    console.log('[MOBILE_FLOW_DEBUG]', JSON.stringify(payload));

  } catch (error) {

    console.warn('[MOBILE_FLOW_DEBUG] logging failed:', error?.message || error);

  }

}



function resolvePublicApiBase(req) {

  if (API_BASE_URL) return API_BASE_URL;

  const host = String(req?.get?.('host') || '').trim();

  if (!host) return '';

  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);

  const protocol = isLocalHost ? String(req?.protocol || 'http') : 'https';

  return `${protocol}://${host}`;

}



function toSqlDateBoundary(input, endOfDay = false) {

  const raw = String(input || '').trim();

  if (!raw) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  return `${raw} ${endOfDay ? '23:59:59' : '00:00:00'}`;

}



function escapeCsvCell(value, delimiter = ';') {

  if (value === null || value === undefined) return '';

  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);

  const mustQuote = raw.includes('"') || raw.includes('\n') || raw.includes('\r') || raw.includes(delimiter);

  if (mustQuote) {

    return `"${raw.replace(/"/g, '""')}"`;

  }

  return raw;

}



function buildCsvFromRows(rows, columns, options = {}) {

  const delimiter = String(options?.delimiter || ';');

  const includeExcelSeparatorHint = options?.includeExcelSeparatorHint !== false;

  const header = columns.map((col) => escapeCsvCell(col.label, delimiter)).join(delimiter);

  const lines = includeExcelSeparatorHint ? [`sep=${delimiter}`, header] : [header];

  for (const row of rows || []) {

    lines.push(columns.map((col) => escapeCsvCell(row[col.key], delimiter)).join(delimiter));

  }

  return `\uFEFF${lines.join('\r\n')}`;

}



function buildXlsxBufferFromRows(rows, sheetName = 'Export') {

  const workbook = XLSX.utils.book_new();

  const worksheet = XLSX.utils.json_to_sheet(Array.isArray(rows) ? rows : []);

  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName || 'Export').slice(0, 31) || 'Export');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

}



function parseCookies(cookieHeader) {

  const raw = String(cookieHeader || '').trim();

  if (!raw) return {};

  return raw.split(';').reduce((acc, segment) => {

    const [key, ...rest] = segment.split('=');

    const normalizedKey = String(key || '').trim();

    if (!normalizedKey) return acc;

    acc[normalizedKey] = decodeURIComponent(rest.join('=').trim());

    return acc;

  }, {});

}



function getWebauthnRpId(req) {

  if (WEBAUTHN_RP_ID) return WEBAUTHN_RP_ID;

  const hostHeader = String(req?.headers?.host || '').trim().toLowerCase();

  const hostOnly = hostHeader.split(':')[0] || '';

  if (hostOnly) return hostOnly;

  try {

    const parsed = new URL(CANONICAL_FRONTEND_URL);

    return String(parsed.hostname || '').trim().toLowerCase() || 'localhost';

  } catch {

    return 'localhost';

  }

}



function getExpectedWebauthnOrigins(req) {

  const origins = new Set();

  const originHeader = String(req?.headers?.origin || '').trim();

  if (originHeader) origins.add(originHeader);

  if (CANONICAL_FRONTEND_URL) origins.add(CANONICAL_FRONTEND_URL);

  if (FRONTEND_URL) origins.add(FRONTEND_URL);

  origins.add(`http://localhost:5173`);

  origins.add(`https://localhost:5173`);

  origins.add(`http://localhost:5174`);

  origins.add(`https://localhost:5174`);

  return Array.from(origins).filter(Boolean);

}



function generateDeviceId() {

  return `dev_${crypto.randomBytes(18).toString('base64url')}`;

}



function ensureDeviceIdCookie(req, res) {

  const cookies = parseCookies(req.headers?.cookie);

  let deviceId = String(cookies[DEVICE_COOKIE_NAME] || '').trim();

  if (deviceId && /^[a-zA-Z0-9_-]{8,120}$/.test(deviceId)) {

    return deviceId;

  }

  deviceId = generateDeviceId();

  res.cookie(DEVICE_COOKIE_NAME, deviceId, {

    httpOnly: true,

    sameSite: 'lax',

    secure: isSecureRequest(req),

    path: '/',

    maxAge: DEVICE_COOKIE_DURATION_MS,

  });

  return deviceId;

}



const passkeyChallengeStore = new Map();



function persistPasskeyChallenge({ flow, challenge, userId = null, deviceId = null, credentialIds = [] }) {

  const id = `pkc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  passkeyChallengeStore.set(id, {

    flow: String(flow || '').trim(),

    challenge: String(challenge || '').trim(),

    userId: userId ? String(userId).trim() : null,

    deviceId: deviceId ? String(deviceId).trim() : null,

    credentialIds: Array.isArray(credentialIds) ? credentialIds.map((value) => String(value || '').trim()).filter(Boolean) : [],

    expiresAt: Date.now() + (5 * 60 * 1000),

  });

  return id;

}



function consumePasskeyChallenge(id, expectedFlow, reqDeviceId) {

  const key = String(id || '').trim();

  if (!key) return null;

  const record = passkeyChallengeStore.get(key);

  if (!record) return null;

  passkeyChallengeStore.delete(key);

  if (Number(record.expiresAt || 0) <= Date.now()) return null;

  if (expectedFlow && String(record.flow || '') !== String(expectedFlow)) return null;

  if (record.deviceId && reqDeviceId && String(record.deviceId) !== String(reqDeviceId)) return null;

  if (!record.challenge) return null;

  return record;

}



function signSessionPayload(encodedPayload) {

  return crypto.createHmac('sha256', SESSION_SECRET).update(String(encodedPayload || '')).digest('base64url');

}



function createSignedSessionToken(user) {

  const now = Date.now();

  const payload = {

    v: 1,

    iat: now,

    exp: now + SESSION_DURATION_MS,

    id: String(user?.id || ''),

    email: String(user?.email || '').toLowerCase(),

    name: String(user?.name || '').trim(),

    firstName: user?.firstName ? String(user.firstName).trim() : null,

    lastName: user?.lastName ? String(user.lastName).trim() : null,

    role: String(user?.role || '').trim(),

    avatar: user?.avatar ? String(user.avatar) : null,

    clientType: user?.clientType ? String(user.clientType) : null,

    telephone: user?.telephone ? String(user.telephone) : null,

    cin: user?.cin ? String(user.cin) : null,

    cinImageUrl: user?.cinImageUrl ? String(user.cinImageUrl) : null,

    profileCompleted: Boolean(user?.profileCompleted),

  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  const signature = signSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;

}



function verifySignedSessionToken(token) {

  const raw = String(token || '').trim();

  if (!raw || !raw.includes('.')) return null;

  const [encodedPayload, signature] = raw.split('.');

  if (!encodedPayload || !signature) return null;

  const expectedSignature = signSessionPayload(encodedPayload);

  try {

    const providedBuffer = Buffer.from(signature);

    const expectedBuffer = Buffer.from(expectedSignature);

    if (providedBuffer.length !== expectedBuffer.length) return null;

    if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  } catch {

    return null;

  }

  try {

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

    if (!payload || typeof payload !== 'object') return null;

    if (Number(payload.exp || 0) <= Date.now()) return null;

    if (!payload.id || !payload.email || !payload.name || !payload.role) return null;

    return payload;

  } catch {

    return null;

  }

}



function buildAuthUser(user) {

  return {

    id: String(user?.id || ''),

    email: String(user?.email || '').toLowerCase(),

    name: String(user?.name || '').trim(),

    firstName: user?.firstName ? String(user.firstName).trim() : null,

    lastName: user?.lastName ? String(user.lastName).trim() : null,

    role: String(user?.role || '') === 'admin' ? 'admin' : 'user',

    avatar: user?.avatar || null,

    clientType: user?.clientType || null,

    telephone: user?.telephone || null,

    cin: user?.cin || null,

    cinImageUrl: user?.cinImageUrl || null,

    profileCompleted: Boolean(user?.profileCompleted),

  };

}



function getSessionUserFromRequest(req) {

  const cookies = parseCookies(req.headers?.cookie);

  const token = cookies[SESSION_COOKIE_NAME];

  const payload = verifySignedSessionToken(token);

  if (!payload) return null;

  return buildAuthUser(payload);

}



function isSecureRequest(req) {

  if (req.secure) return true;

  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').toLowerCase();

  return forwardedProto.includes('https');

}



function setAuthSessionCookie(req, res, user) {

  const safeUser = buildAuthUser(user);

  const token = createSignedSessionToken(safeUser);

  const secureFlag = isSecureRequest(req);

  res.cookie(SESSION_COOKIE_NAME, token, {

    httpOnly: true,

    sameSite: 'lax',

    secure: secureFlag,

    path: '/',

    maxAge: SESSION_DURATION_MS,

  });

  logMobileFlow('session_cookie_set', req, {

    userId: safeUser.id,

    role: safeUser.role,

    secure: secureFlag,

    sameSite: 'lax',

    host: String(req.headers?.host || ''),

    origin: String(req.headers?.origin || ''),

  });

  void bindDeviceToUser(req, safeUser.id, {

    reason: 'session_set',

    role: safeUser.role,

  }).catch(() => {});

  if (safeUser.role === 'user') {

    void assignAnonymousInteractionsToUser(req, safeUser).catch(() => {});

  }

}



function clearAuthSessionCookie(req, res) {

  res.cookie(SESSION_COOKIE_NAME, '', {

    httpOnly: true,

    sameSite: 'lax',

    secure: isSecureRequest(req),

    path: '/',

    expires: new Date(0),

    maxAge: 0,

  });

}



function createSignedAgentSessionToken(sessionPayload) {

  const now = Date.now();

  const payload = {

    v: 1,

    iat: now,

    exp: now + SESSION_DURATION_MS,

    role: 'agent_amicale',

    userId: String(sessionPayload?.userId || '').trim(),

    username: String(sessionPayload?.username || '').trim(),

    displayName: String(sessionPayload?.displayName || '').trim(),

    amicaleId: String(sessionPayload?.amicaleId || '').trim(),

    amicaleName: String(sessionPayload?.amicaleName || '').trim(),

  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  const signature = signSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;

}



function verifySignedAgentSessionToken(token) {

  const raw = String(token || '').trim();

  if (!raw || !raw.includes('.')) return null;

  const [encodedPayload, signature] = raw.split('.');

  if (!encodedPayload || !signature) return null;

  const expectedSignature = signSessionPayload(encodedPayload);

  try {

    const providedBuffer = Buffer.from(signature);

    const expectedBuffer = Buffer.from(expectedSignature);

    if (providedBuffer.length !== expectedBuffer.length) return null;

    if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  } catch {

    return null;

  }

  try {

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

    if (!payload || typeof payload !== 'object') return null;

    if (Number(payload.exp || 0) <= Date.now()) return null;

    if (String(payload.role || '') !== 'agent_amicale') return null;

    if (!payload.userId || !payload.username || !payload.amicaleId) return null;

    return payload;

  } catch {

    return null;

  }

}



function getAgentSessionFromRequest(req) {

  const cookies = parseCookies(req.headers?.cookie);

  const token = cookies[AGENT_SESSION_COOKIE_NAME];

  return verifySignedAgentSessionToken(token);

}



function requireAgentAmicaleSession(req, res, next) {

  const session = getAgentSessionFromRequest(req);

  if (!session) {

    return res.status(401).json({ error: 'Session agent invalide' });

  }

  req.agentSession = session;

  return next();

}



function setAgentSessionCookie(req, res, sessionPayload) {

  const token = createSignedAgentSessionToken(sessionPayload);

  res.cookie(AGENT_SESSION_COOKIE_NAME, token, {

    httpOnly: true,

    sameSite: 'lax',

    secure: isSecureRequest(req),

    path: '/',

    maxAge: SESSION_DURATION_MS,

  });

}



function clearAgentSessionCookie(req, res) {

  res.cookie(AGENT_SESSION_COOKIE_NAME, '', {

    httpOnly: true,

    sameSite: 'lax',

    secure: isSecureRequest(req),

    path: '/',

    maxAge: 0,

  });

}



async function authenticateAdminFromHeaders(req) {

  const email = normalizeEmailForCompare(req.headers?.['x-admin-email']);

  const password = String(req.headers?.['x-admin-password'] || '').trim();

  if (!email || !password) return null;



  const [rows] = await pool.query(

    'SELECT id, nom, email, mot_de_passe_hash, actif FROM administrateurs WHERE email = ? LIMIT 1',

    [email]

  );

  const admin = rows[0];

  if (!admin || !admin.actif) return null;



  const isPasswordValid = await bcrypt.compare(password, String(admin.mot_de_passe_hash || ''));

  if (!isPasswordValid) return null;



  return buildAuthUser({

    id: admin.id,

    email: admin.email,

    name: admin.nom,

    role: 'admin',

    profileCompleted: true,

  });

}



function requireAuthenticatedSession(req, res, next) {

  const user = getSessionUserFromRequest(req);

  if (!user) {

    void logSecurityEvent({

      req,

      eventType: 'auth_required_missing_session',

      severity: 'warning',

      success: false,

      statusCode: 401,

      message: 'Access denied: missing authenticated session',

    });

    return res.status(401).json({ error: 'Authentification requise' });

  }

  req.authUser = user;

  return next();

}



async function requireAdminSession(req, res, next) {

  const user = getSessionUserFromRequest(req);

  if (user && user.role === 'admin') {

    req.authUser = user;

    return next();

  }



  try {

    const headerAdmin = await authenticateAdminFromHeaders(req);

    if (headerAdmin && headerAdmin.role === 'admin') {

      req.authUser = headerAdmin;

      return next();

    }

  } catch (error) {

    console.warn('admin_header_auth_failed:', error?.message || error);

  }



  if (!user) {

    void logSecurityEvent({

      req,

      eventType: 'admin_access_missing_session',

      severity: 'warning',

      success: false,

      statusCode: 401,

      message: 'Admin route denied: missing authenticated session',

    });

    return res.status(401).json({ error: 'Authentification requise' });

  }

  if (user.role !== 'admin') {

    void logSecurityEvent({

      req,

      eventType: 'admin_access_denied',

      severity: 'warning',

      success: false,

      statusCode: 403,

      userId: user.id || null,

      userEmail: user.email || null,

      message: 'Admin route denied: insufficient role',

    });

    return res.status(403).json({ error: 'Acces reserve aux administrateurs' });

  }

  req.authUser = user;

  return next();

}



function normalizeEmailForCompare(value) {

  return String(value || '').trim().toLowerCase();

}



function canAccessReservationDemand(authUser, demand) {

  if (!authUser || !demand) return false;

  if (authUser.role === 'admin') return true;

  const authId = String(authUser.id || '').trim();

  const demandUserId = String(demand.client_user_id || '').trim();

  if (authId && demandUserId && authId === demandUserId) return true;

  const authEmail = normalizeEmailForCompare(authUser.email);

  const demandEmail = normalizeEmailForCompare(demand.client_email);

  return Boolean(authEmail && demandEmail && authEmail === demandEmail);

}



function getClientIp(req) {

  const forwarded = String(req.headers?.['x-forwarded-for'] || '').trim();

  if (forwarded) {

    const [firstIp] = forwarded.split(',').map((value) => String(value || '').trim()).filter(Boolean);

    if (firstIp) return firstIp;

  }

  return String(req.socket?.remoteAddress || req.ip || 'unknown').trim() || 'unknown';

}



function maskEmailForLog(value) {

  const email = normalizeEmailForCompare(value);

  if (!email || !email.includes('@')) return '';

  const [local, domain] = email.split('@');

  if (!domain) return '';

  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;

  return `${local.slice(0, 2)}***@${domain}`;

}



async function logSecurityEvent({

  req,

  eventType,

  severity = 'info',

  success = false,

  statusCode = null,

  userId = null,

  userEmail = null,

  message = null,

  metadata = null,

} = {}) {

  try {

    if (!eventType) return;

    const id = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : null;

    const metadataJson = safeMetadata ? JSON.stringify(safeMetadata).slice(0, 10000) : null;

    const requester = req?.authUser || null;

    const resolvedUserId = userId || requester?.id || null;

    const resolvedUserEmail = normalizeEmailForCompare(userEmail || requester?.email || '');

    await pool.query(

      `INSERT INTO security_audit_logs

       (id, event_type, severity, success, http_status, method, path, ip, user_agent, user_id, user_email, message, metadata_json, created_at)

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [

        id,

        String(eventType).trim().slice(0, 80),

        String(severity || 'info').trim().slice(0, 20),

        success ? 1 : 0,

        statusCode === null || statusCode === undefined ? null : Number(statusCode),

        String(req?.method || '').trim().slice(0, 10) || null,

        String(req?.originalUrl || req?.url || '').trim().slice(0, 500) || null,

        getClientIp(req).slice(0, 80),

        String(req?.headers?.['user-agent'] || '').trim().slice(0, 500) || null,

        resolvedUserId ? String(resolvedUserId).trim().slice(0, 100) : null,

        resolvedUserEmail ? String(resolvedUserEmail).trim().slice(0, 255) : null,

        message ? String(message).trim().slice(0, 1000) : null,

        metadataJson,

        getAgencySqlDateTime(),

      ]

    );

  } catch (error) {

    console.warn('security_audit_log_failed:', error?.message || error);

  }

}



async function verifyTurnstileToken(token, remoteIp) {

  if (!TURNSTILE_SECRET_KEY) return { enabled: false, success: true };

  const normalizedToken = String(token || '').trim();

  if (!normalizedToken) return { enabled: true, success: false, reason: 'missing_token' };

  try {

    const form = new URLSearchParams();

    form.set('secret', TURNSTILE_SECRET_KEY);

    form.set('response', normalizedToken);

    if (remoteIp) form.set('remoteip', String(remoteIp).trim());

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {

      method: 'POST',

      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

      body: form.toString(),

    });

    const payload = await response.json().catch(() => ({}));

    return {

      enabled: true,

      success: Boolean(payload?.success),

      reason: Array.isArray(payload?.['error-codes']) && payload['error-codes'].length > 0

        ? String(payload['error-codes'][0])

        : null,

    };

  } catch (error) {

    return { enabled: true, success: false, reason: String(error?.message || 'turnstile_unreachable') };

  }

}



const inMemoryRateLimitStore = new Map();



function createRateLimiter({ windowMs, max, keyPrefix, message }) {

  const windowSize = Math.max(1000, Number(windowMs || 0));

  const maxRequests = Math.max(1, Number(max || 1));

  const prefix = String(keyPrefix || 'default').trim() || 'default';

  const errorMessage = String(message || 'Trop de tentatives, veuillez reessayer plus tard.').trim();



  return (req, res, next) => {

    const now = Date.now();

    const ip = getClientIp(req);

    const key = `${prefix}:${ip}`;

    const current = inMemoryRateLimitStore.get(key);



    if (!current || Number(current.resetAt || 0) <= now) {

      inMemoryRateLimitStore.set(key, { count: 1, resetAt: now + windowSize });

      return next();

    }



    const nextCount = Number(current.count || 0) + 1;

    current.count = nextCount;

    inMemoryRateLimitStore.set(key, current);



    if (nextCount > maxRequests) {

      const retryAfterSeconds = Math.max(1, Math.ceil((Number(current.resetAt || 0) - now) / 1000));

      res.setHeader('Retry-After', String(retryAfterSeconds));

      void logSecurityEvent({

        req,

        eventType: 'rate_limit_exceeded',

        severity: 'warning',

        success: false,

        statusCode: 429,

        message: `Rate limit exceeded for ${prefix}`,

        metadata: {

          keyPrefix: prefix,

          windowMs: windowSize,

          maxRequests,

          retryAfterSeconds,

        },

      });

      return res.status(429).json({ error: errorMessage, retryAfterSeconds });

    }



    return next();

  };

}



setInterval(() => {

  const now = Date.now();

  for (const [key, value] of inMemoryRateLimitStore.entries()) {

    if (Number(value?.resetAt || 0) <= now) {

      inMemoryRateLimitStore.delete(key);

    }

  }

}, 60 * 1000).unref?.();



const authLoginRateLimit = createRateLimiter({

  windowMs: 15 * 60 * 1000,

  max: 12,

  keyPrefix: 'auth-login',

  message: 'Trop de tentatives de connexion. Reessayez dans quelques minutes.',

});



const otpRequestRateLimit = createRateLimiter({

  windowMs: 10 * 60 * 1000,

  max: 6,

  keyPrefix: 'otp-request',

  message: 'Trop de demandes OTP. Reessayez dans quelques minutes.',

});



const otpVerifyRateLimit = createRateLimiter({

  windowMs: 10 * 60 * 1000,

  max: 10,

  keyPrefix: 'otp-verify',

  message: 'Trop de verifications OTP. Reessayez dans quelques minutes.',

});



const reservationMutationRateLimit = createRateLimiter({

  windowMs: 10 * 60 * 1000,

  max: 30,

  keyPrefix: 'reservation-mutation',

  message: 'Trop d actions sensibles sur les reservations. Reessayez dans quelques minutes.',

});



const paymentRateLimit = createRateLimiter({

  windowMs: 10 * 60 * 1000,

  max: 10,

  keyPrefix: 'reservation-pay',

  message: 'Trop de tentatives de paiement. Reessayez dans quelques minutes.',

});



function buildFrontendLoginUrl({ socialToken = null, oauthError = null, returnTo = null } = {}) {

  const params = new URLSearchParams();

  if (socialToken) params.set('social_token', String(socialToken));

  if (oauthError) params.set('oauth_error', String(oauthError));

  const safeReturnTo = sanitizeReturnToPath(returnTo);

  if (safeReturnTo) params.set('returnTo', safeReturnTo);

  const query = params.toString();

  return `${CANONICAL_FRONTEND_URL}/login${query ? `?${query}` : ''}`;

}



function resolveFacebookRedirectUri(req = null) {

  const configured = String(process.env.FACEBOOK_REDIRECT_URI || '').trim();

  if (configured) return configured;

  try {

    return new URL('/api/auth/facebook/callback', CANONICAL_FRONTEND_URL).toString();

  } catch {

    // fall through

  }

  const host = String(req?.headers?.host || '').trim();

  if (host) {

    const protocol = isSecureRequest(req) ? 'https' : 'http';

    return `${protocol}://${host}/api/auth/facebook/callback`;

  }

  return `http://localhost:${PORT}/api/auth/facebook/callback`;

}



function buildFacebookOauthUrl({ mobilePreferred = false, returnTo = null, req = null } = {}) {

  const clientId = process.env.FACEBOOK_CLIENT_ID;

  const redirectUri = resolveFacebookRedirectUri(req);

  if (!clientId) return null;

  const safeReturnTo = sanitizeReturnToPath(returnTo);

  const params = new URLSearchParams({

    client_id: clientId,

    redirect_uri: redirectUri,

    response_type: 'code',

    scope: 'email,public_profile',

    display: mobilePreferred ? 'touch' : 'page',

  });

  if (safeReturnTo) {

    params.set('state', encodeOauthState({ returnTo: safeReturnTo }));

  }

  const oauthHost = mobilePreferred ? 'https://m.facebook.com' : 'https://www.facebook.com';

  return `${oauthHost}/v21.0/dialog/oauth?${params.toString()}`;

}



function decodeBase64Url(value) {

  const input = String(value || '').trim();

  if (!input) return '';

  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');

  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');

}



function parseMessengerRef(rawRef) {

  const ref = String(rawRef || '').trim();

  if (!ref) return null;

  if (ref.startsWith('dwira_prop:')) {

    try {

      const encoded = ref.slice('dwira_prop:'.length);

      const decoded = decodeBase64Url(encoded);

      const parsed = JSON.parse(decoded);

      const propertyUrl = String(parsed?.u || '').trim();

      const title = String(parsed?.t || '').trim();

      const imageUrl = String(parsed?.i || '').trim();

      const reference = String(parsed?.r || '').trim();

      if (!propertyUrl) return null;

      return { propertyUrl, title: title || null, imageUrl: imageUrl || null, reference: reference || null };

    } catch (error) {

      console.warn('Failed to parse Messenger ref payload:', error.message);

      return null;

    }

  }

  if (/^https?:\/\//i.test(ref)) {

    return { propertyUrl: ref, title: null, imageUrl: null, reference: null };

  }

  return null;

}



function extractPropertySlugFromUrl(propertyUrl) {

  const raw = String(propertyUrl || '').trim();

  if (!raw) return null;

  try {

    const parsed = new URL(raw);

    const match = parsed.pathname.match(/\/properties\/([^/?#]+)/i);

    return match && match[1] ? decodeURIComponent(match[1]) : null;

  } catch {

    const match = raw.match(/\/properties\/([^/?#]+)/i);

    return match && match[1] ? decodeURIComponent(match[1]) : null;

  }

}



function isMessengerSignatureValid(req) {

  if (!MESSENGER_APP_SECRET) return true;

  const signatureHeader = String(req.headers['x-hub-signature-256'] || '');

  if (!signatureHeader.startsWith('sha256=')) return false;

  const expected = signatureHeader.slice('sha256='.length);

  const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from('');

  const digest = crypto.createHmac('sha256', MESSENGER_APP_SECRET).update(body).digest('hex');

  try {

    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(digest, 'hex'));

  } catch {

    return false;

  }

}



function resolveMessengerPageAccessToken(pageId) {

  const normalizedPageId = String(pageId || '').trim();

  if (normalizedPageId && MESSENGER_PAGE_ID_LOCATION && normalizedPageId === MESSENGER_PAGE_ID_LOCATION) {

    return MESSENGER_PAGE_ACCESS_TOKEN_LOCATION || MESSENGER_PAGE_ACCESS_TOKEN;

  }

  if (normalizedPageId && MESSENGER_PAGE_ID_VENTE && normalizedPageId === MESSENGER_PAGE_ID_VENTE) {

    return MESSENGER_PAGE_ACCESS_TOKEN_VENTE || MESSENGER_PAGE_ACCESS_TOKEN;

  }

  if (normalizedPageId && MESSENGER_PAGE_ACCESS_TOKEN_LOCATION && !MESSENGER_PAGE_ID_LOCATION && !MESSENGER_PAGE_ID_VENTE) {

    return MESSENGER_PAGE_ACCESS_TOKEN_LOCATION;

  }

  return MESSENGER_PAGE_ACCESS_TOKEN;

}



function extractFacebookVideoIdFromUrl(rawInput) {

  const raw = String(rawInput || '').trim();

  if (!raw) return null;

  let parsed;

  try {

    parsed = new URL(raw);

  } catch {

    return null;

  }

  const host = parsed.hostname.toLowerCase();

  const path = parsed.pathname.toLowerCase();

  const segments = parsed.pathname.split('/').filter(Boolean);

  if (host === 'fb.watch' || host.endsWith('.fb.watch')) {

    return segments[0] || null;

  }

  if (!(host === 'facebook.com' || host.endsWith('.facebook.com'))) return null;

  if (path === '/watch' || path === '/watch/' || path === '/video.php') {

    const videoId = String(parsed.searchParams.get('v') || '').trim();

    return videoId || null;

  }

  if (path.startsWith('/reel/')) {

    return String(segments[1] || '').trim() || null;

  }

  const videosIndex = segments.findIndex((segment) => segment.toLowerCase() === 'videos');

  if (videosIndex >= 0) {

    return String(segments[videosIndex + 1] || '').trim() || null;

  }

  return null;

}



function extractNestedFacebookUrl(rawInput) {

  const raw = String(rawInput || '').trim();

  if (!raw) return '';

  try {

    const parsed = new URL(raw);

    const nested = String(parsed.searchParams.get('u') || parsed.searchParams.get('href') || '').trim();

    return nested ? decodeURIComponent(nested) : '';

  } catch {

    return '';

  }

}



async function resolveFacebookVideoIdFromAnyUrl(rawInput) {

  const direct = extractFacebookVideoIdFromUrl(rawInput);

  if (direct) return { videoId: direct, resolvedUrl: String(rawInput || '').trim() };



  const nested = extractNestedFacebookUrl(rawInput);

  if (nested) {

    const nestedId = extractFacebookVideoIdFromUrl(nested);

    if (nestedId) return { videoId: nestedId, resolvedUrl: nested };

  }



  const raw = String(rawInput || '').trim();

  if (!raw) return { videoId: null, resolvedUrl: '' };



  try {

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(raw, {

      method: 'GET',

      redirect: 'follow',

      signal: controller.signal,

      headers: {

        'User-Agent': 'Mozilla/5.0 (compatible; DwiraBot/1.0; +https://dwira.tn)',

        Accept: 'text/html,application/xhtml+xml',

      },

    });

    clearTimeout(timeout);

    try {

      if (response.body && typeof response.body.cancel === 'function') {

        await response.body.cancel();

      }

    } catch {}

    const finalUrl = String(response?.url || '').trim();

    const finalId = extractFacebookVideoIdFromUrl(finalUrl);

    if (finalId) return { videoId: finalId, resolvedUrl: finalUrl };



    const finalNested = extractNestedFacebookUrl(finalUrl);

    if (finalNested) {

      const finalNestedId = extractFacebookVideoIdFromUrl(finalNested);

      if (finalNestedId) return { videoId: finalNestedId, resolvedUrl: finalNested };

    }

  } catch {}



  return { videoId: null, resolvedUrl: raw };

}



function resolveAnyMessengerPageToken() {

  return (

    MESSENGER_PAGE_ACCESS_TOKEN_LOCATION ||

    MESSENGER_PAGE_ACCESS_TOKEN_VENTE ||

    MESSENGER_PAGE_ACCESS_TOKEN ||

    ''

  ).trim();

}



async function checkFacebookEmbedAvailability(rawInput) {

  const { videoId } = await resolveFacebookVideoIdFromAnyUrl(rawInput);

  if (!videoId) {

    return { embeddable: false, reason: 'facebook_video_id_missing', videoId: null };

  }

  const href = `https://www.facebook.com/watch/?v=${encodeURIComponent(videoId)}`;

  const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false`;

  try {

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(embedUrl, {

      signal: controller.signal,

      headers: {

        'User-Agent': 'Mozilla/5.0 (compatible; DwiraBot/1.0; +https://dwira.tn)',

        Accept: 'text/html,application/xhtml+xml',

      },

    });

    clearTimeout(timeout);

    const html = await response.text().catch(() => '');

    const text = String(html || '').toLowerCase();

    const hasVideoUnavailable = text.includes('video unavailable');

    const hasEmbedRestriction =

      text.includes("can't be embedded")

      || text.includes('cannot be embedded')

      || text.includes('may contain content owned by someone else');

    const unavailable = hasVideoUnavailable && hasEmbedRestriction;

    return {

      embeddable: !unavailable,

      reason: unavailable ? 'facebook_embed_unavailable' : null,

      videoId: String(videoId || ''),

    };

  } catch {

    return { embeddable: null, reason: 'facebook_embed_check_failed', videoId: String(videoId || '') };

  }

}



async function sendMessengerText(psid, text, pageId = null) {

  const pageAccessToken = resolveMessengerPageAccessToken(pageId);

  if (!pageAccessToken) {

    throw new Error('Messenger page access token missing');

  }

  const recipientId = String(psid || '').trim();

  const messageText = String(text || '').trim();

  if (!recipientId || !messageText) return null;



  const endpoint = new URL(`https://graph.facebook.com/${MESSENGER_API_VERSION}/me/messages`);

  endpoint.searchParams.set('access_token', pageAccessToken);

  const response = await fetch(endpoint.toString(), {

    method: 'POST',

    headers: {

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({

      messaging_type: 'RESPONSE',

      recipient: { id: recipientId },

      message: { text: messageText },

    }),

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {

    const errorMessage = payload?.error?.message || `Messenger Send API failed (${response.status})`;

    throw new Error(errorMessage);

  }

  return payload;

}



async function sendMessengerImage(psid, imageUrl, pageId = null) {

  const pageAccessToken = resolveMessengerPageAccessToken(pageId);

  if (!pageAccessToken) {

    throw new Error('Messenger page access token missing');

  }

  const recipientId = String(psid || '').trim();

  const mediaUrl = String(imageUrl || '').trim();

  if (!recipientId || !/^https?:\/\//i.test(mediaUrl)) return null;



  const endpoint = new URL(`https://graph.facebook.com/${MESSENGER_API_VERSION}/me/messages`);

  endpoint.searchParams.set('access_token', pageAccessToken);

  const response = await fetch(endpoint.toString(), {

    method: 'POST',

    headers: {

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({

      messaging_type: 'RESPONSE',

      recipient: { id: recipientId },

      message: {

        attachment: {

          type: 'image',

          payload: {

            url: mediaUrl,

            is_reusable: false,

          },

        },

      },

    }),

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {

    const errorMessage = payload?.error?.message || `Messenger image send failed (${response.status})`;

    throw new Error(errorMessage);

  }

  return payload;

}



async function sendMessengerGenericCard(psid, card, pageId = null) {

  const pageAccessToken = resolveMessengerPageAccessToken(pageId);

  if (!pageAccessToken) {

    throw new Error('Messenger page access token missing');

  }

  const recipientId = String(psid || '').trim();

  const title = String(card?.title || '').trim();

  const subtitle = String(card?.subtitle || '').trim();

  const imageUrl = String(card?.imageUrl || '').trim();

  const webUrl = String(card?.url || '').trim();

  if (!recipientId || !title || !webUrl) return null;



  const endpoint = new URL(`https://graph.facebook.com/${MESSENGER_API_VERSION}/me/messages`);

  endpoint.searchParams.set('access_token', pageAccessToken);

  const response = await fetch(endpoint.toString(), {

    method: 'POST',

    headers: {

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({

      messaging_type: 'RESPONSE',

      recipient: { id: recipientId },

      message: {

        attachment: {

          type: 'template',

          payload: {

            template_type: 'generic',

            elements: [

              {

                title,

                subtitle: subtitle || undefined,

                image_url: /^https?:\/\//i.test(imageUrl) ? imageUrl : undefined,

                default_action: {

                  type: 'web_url',

                  url: webUrl,

                  webview_height_ratio: 'full',

                },

                buttons: [

                  {

                    type: 'web_url',

                    url: webUrl,

                    title: 'Voir le bien',

                  },

                ],

              },

            ],

          },

        },

      },

    }),

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {

    const errorMessage = payload?.error?.message || `Messenger generic card send failed (${response.status})`;

    throw new Error(errorMessage);

  }

  return payload;

}



async function upsertMessengerContact({ pagePsid, pageId, lastRef, propertyUrl, propertyTitle }) {

  const psid = String(pagePsid || '').trim();

  if (!psid) return;

  const now = getAgencySqlDateTime();

  await pool.query(

    `INSERT INTO messenger_contacts (page_psid, page_id, last_ref, last_property_url, last_property_title, created_at, updated_at)

     VALUES (?, ?, ?, ?, ?, ?, ?)

     ON DUPLICATE KEY UPDATE

       page_id = VALUES(page_id),

       last_ref = VALUES(last_ref),

       last_property_url = VALUES(last_property_url),

       last_property_title = VALUES(last_property_title),

       updated_at = VALUES(updated_at)`,

    [

      psid,

      String(pageId || '').trim() || null,

      String(lastRef || '').trim() || null,

      String(propertyUrl || '').trim() || null,

      String(propertyTitle || '').trim() || null,

      now,

      now,

    ]

  );

}



async function getMessengerContactByPsid(pagePsid) {

  const psid = String(pagePsid || '').trim();

  if (!psid) return null;

  const [rows] = await pool.query(

    `SELECT page_psid, page_id, last_ref, last_property_url, last_property_title, updated_at

     FROM messenger_contacts

     WHERE page_psid = ?

     LIMIT 1`,

    [psid]

  );

  return Array.isArray(rows) && rows[0] ? rows[0] : null;

}



async function resolvePropertyImageUrl(propertyUrl, propertyReference = null) {

  const reference = String(propertyReference || '').trim();

  if (!reference) return null;

  try {

    const [rows] = await pool.query(

      `SELECT m.url

       FROM biens b

       JOIN media m ON m.bien_id = b.id

       WHERE b.reference = ? AND m.type = 'image'

       ORDER BY COALESCE(m.position, 9999) ASC, m.id ASC

       LIMIT 1`,

      [reference]

    );

    const url = String(rows?.[0]?.url || '').trim();

    return url || null;

  } catch (error) {

    console.warn('Failed to resolve property image from DB:', error.message);

    return null;

  }

}



async function sendMessengerPropertyReply({ senderId, pageId, propertyUrl, propertyTitle, propertyImageUrl, propertyReference }) {

  const link = String(propertyUrl || '').trim();

  if (!link) return false;

  let imageUrl = String(propertyImageUrl || '').trim() || null;

  if (!imageUrl) {

    imageUrl = await resolvePropertyImageUrl(link, propertyReference);

  }



  const titleSuffix = propertyTitle ? ` : ${propertyTitle}` : '';

  const referenceSegment = propertyReference ? ` Reference ${propertyReference}` : '';

  const text = `Vous etes interesse par le logement${titleSuffix}${referenceSegment} dans notre site ?\n${link}`;



  if (imageUrl) {

    try {

      const cardTitle = propertyTitle || `Logement ${propertyReference || ''}`.trim() || 'Logement Dwira';

      const cardSubtitle = propertyReference ? `Reference ${propertyReference}` : 'Dwira Immobilier';

      await sendMessengerGenericCard(

        senderId,

        {

          title: cardTitle,

          subtitle: cardSubtitle,

          imageUrl,

          url: link,

        },

        pageId

      );

    } catch (cardError) {

      console.error('Messenger card auto-reply failed:', cardError.message);

    }

  }

  try {

    await sendMessengerText(senderId, text, pageId);

    return true;

  } catch (textError) {

    console.error('Messenger text auto-reply failed:', textError.message);

    return false;

  }

}



// Middleware

app.use(cors({

  origin: (origin, callback) => {

    if (!origin) return callback(null, true);

    if (isLocalDevOrigin(origin)) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    return callback(new Error('CORS blocked for this origin'));

  },

  credentials: true,

}));

app.use(express.json({

  verify: (req, res, buffer) => {

    req.rawBody = buffer;

  },

}));

app.use((req, res, next) => {

  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (String(req.headers['x-forwarded-proto'] || '').includes('https')) {

    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  }

  next();

});

app.use((req, res, next) => {

  req.deviceId = ensureDeviceIdCookie(req, res);

  next();

});



function resolveUploadedMediaPath(rawSrc) {

  const src = String(rawSrc || '').trim();

  if (!src.startsWith('/uploads/')) return null;



  const uploadsDir = path.join(__dirname, 'uploads');

  const relativePath = src.replace(/^\/uploads\//, '');

  const normalizedPath = path.normalize(relativePath);

  const absolutePath = path.resolve(uploadsDir, normalizedPath);



  if (!absolutePath.startsWith(path.resolve(uploadsDir))) return null;

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null;

  return absolutePath;

}



const MEDIA_TRANSFORM_CACHE_LIMIT = 220;

const mediaTransformCache = new Map();



function getAcceptedImageFormat(acceptHeader) {

  const accept = String(acceptHeader || '').toLowerCase();

  if (accept.includes('image/avif')) return 'avif';

  return 'webp';

}



function getMediaContentType(format) {

  return format === 'avif' ? 'image/avif' : 'image/webp';

}



function getMediaCacheKey(sourcePath, sourceStat, width, quality, format) {

  return [

    sourcePath,

    String(sourceStat?.mtimeMs || 0),

    String(sourceStat?.size || 0),

    String(width),

    String(quality),

    format,

  ].join('|');

}



function getMediaEtag(cacheKey) {

  return `"${crypto.createHash('sha1').update(cacheKey).digest('hex')}"`;

}



function rememberTransformedMedia(cacheKey, payload) {

  if (mediaTransformCache.has(cacheKey)) {

    mediaTransformCache.delete(cacheKey);

  }

  mediaTransformCache.set(cacheKey, payload);



  if (mediaTransformCache.size <= MEDIA_TRANSFORM_CACHE_LIMIT) return;

  const oldest = mediaTransformCache.keys().next().value;

  if (oldest) mediaTransformCache.delete(oldest);

}



app.get('/api/media', async (req, res) => {

  try {

    const sourcePath = resolveUploadedMediaPath(req.query.src);

    if (!sourcePath) {

      return res.status(404).json({ error: 'Media not found' });

    }



    const width = Math.max(120, Math.min(2200, Number(req.query.w) || 1600));

    const quality = Math.max(35, Math.min(90, Number(req.query.q) || 72));

    const fileExt = path.extname(sourcePath).toLowerCase();

    const format = getAcceptedImageFormat(req.headers.accept);

    const contentType = getMediaContentType(format);

    const sourceStat = fs.statSync(sourcePath);

    const cacheKey = getMediaCacheKey(sourcePath, sourceStat, width, quality, format);

    const etag = getMediaEtag(cacheKey);



    // Keep unsupported formats on the original file path instead of failing the gallery.

    if (fileExt === '.gif' || fileExt === '.svg') {

      return res.redirect(String(req.query.src || '').trim());

    }



    res.setHeader('Vary', 'Accept');

    res.setHeader('ETag', etag);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable, stale-while-revalidate=604800');

    if (String(req.headers['if-none-match'] || '').trim() === etag) {

      return res.status(304).end();

    }



    const cached = mediaTransformCache.get(cacheKey);

    if (cached) {

      // Keep most recently used entries hot.

      mediaTransformCache.delete(cacheKey);

      mediaTransformCache.set(cacheKey, cached);

      res.setHeader('Content-Type', contentType);

      return res.send(cached.buffer);

    }



    const transformer = sharp(sourcePath)

      .rotate()

      .resize({ width, withoutEnlargement: true });



    const transformed = format === 'avif'

      ? await transformer.avif({ quality: Math.max(40, quality - 6), effort: 4 }).toBuffer()

      : await transformer.webp({ quality }).toBuffer();



    rememberTransformedMedia(cacheKey, {

      buffer: transformed,

    });



    res.setHeader('Content-Type', contentType);

    return res.send(transformed);

  } catch (error) {

    console.error('Error transforming media:', error);

    const fallbackSrc = String(req.query.src || '').trim();

    if (fallbackSrc.startsWith('/uploads/')) {

      return res.redirect(fallbackSrc);

    }

    return res.status(500).json({ error: 'Failed to transform media' });

  }

});



app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Backward compatibility: some media URLs in DB still use /api/uploads/*

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/contracts', express.static(path.join(__dirname, 'contracts')));



app.get('/api/health', (req, res) => {

  res.json({

    status: 'ok',

    service: 'dwira-api',

    authAdminRoute: '/api/auth/admin/login',

    version: 'auth-v2',

    timestamp: new Date().toISOString(),

  });

});



app.get('/api/google-places/nearby', async (req, res) => {

  try {

    if (!GOOGLE_MAPS_API_KEY) {

      return res.json({ places: [], disabled: true });

    }

    const lat = Number(req.query.lat);

    const lng = Number(req.query.lng);

    const radius = Math.max(300, Math.min(5000, Number(req.query.radius) || 1800));

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {

      return res.status(400).json({ error: 'Invalid lat/lng' });

    }



    const kinds = ['restaurant', 'cafe', 'supermarket', 'convenience_store'];

    const byPlaceId = new Map();



    for (const kind of kinds) {

      const endpoint = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');

      endpoint.searchParams.set('location', `${lat},${lng}`);

      endpoint.searchParams.set('radius', String(radius));

      endpoint.searchParams.set('type', kind);

      endpoint.searchParams.set('language', 'fr');

      endpoint.searchParams.set('key', GOOGLE_MAPS_API_KEY);



      const response = await fetch(endpoint.toString());

      const payload = await response.json().catch(() => ({}));

      const status = String(payload?.status || '');

      if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(status)) {

        continue;

      }

      const rows = Array.isArray(payload?.results) ? payload.results : [];

      for (const row of rows) {

        const placeId = String(row?.place_id || '').trim();

        if (!placeId || byPlaceId.has(placeId)) continue;

        const types = Array.isArray(row?.types) ? row.types.map((t) => String(t || '')) : [];

        const normalizedKind = types.includes('restaurant')

          ? 'restaurant'

          : types.includes('cafe')

            ? 'cafe'

            : 'shop';

        const photoRef = String(row?.photos?.[0]?.photo_reference || '').trim();

        const maxWidth = 320;

        const imageUrl = photoRef

          ? `/api/google-places/photo?ref=${encodeURIComponent(photoRef)}&maxwidth=${maxWidth}`

          : null;

        byPlaceId.set(placeId, {

          id: placeId,

          placeId,

          name: String(row?.name || '').trim(),

          kind: normalizedKind,

          lat: Number(row?.geometry?.location?.lat),

          lng: Number(row?.geometry?.location?.lng),

          address: String(row?.vicinity || row?.formatted_address || '').trim() || 'Adresse locale',

          opening: row?.opening_hours?.open_now === true ? 'Ouvert maintenant' : row?.opening_hours?.open_now === false ? 'FermÃ© maintenant' : null,

          rating: Number.isFinite(Number(row?.rating)) ? Number(row?.rating) : null,

          userRatingsTotal: Number.isFinite(Number(row?.user_ratings_total)) ? Number(row?.user_ratings_total) : null,

          imageUrl,

        });

      }

    }



    return res.json({ places: Array.from(byPlaceId.values()).slice(0, 18) });

  } catch (error) {

    console.error('Google nearby places error:', error?.message || error);

    return res.status(500).json({ error: 'Failed to fetch Google nearby places' });

  }

});



app.get('/api/google-places/photo', async (req, res) => {

  try {

    if (!GOOGLE_MAPS_API_KEY) {

      return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY is not configured' });

    }

    const photoRef = String(req.query.ref || '').trim();

    const maxwidth = Math.max(80, Math.min(1200, Number(req.query.maxwidth) || 320));

    if (!photoRef) return res.status(400).json({ error: 'Missing photo ref' });



    const endpoint = new URL('https://maps.googleapis.com/maps/api/place/photo');

    endpoint.searchParams.set('photo_reference', photoRef);

    endpoint.searchParams.set('maxwidth', String(maxwidth));

    endpoint.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    const response = await fetch(endpoint.toString());

    if (!response.ok) {

      return res.status(response.status).json({ error: 'Google photo fetch failed' });

    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    const arrayBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);

    res.setHeader('Cache-Control', 'public, max-age=86400');

    return res.send(Buffer.from(arrayBuffer));

  } catch (error) {

    console.error('Google place photo proxy error:', error?.message || error);

    return res.status(500).json({ error: 'Failed to fetch Google place photo' });

  }

});



// Configure multer for file uploads

const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    const uploadDir = path.join(__dirname, 'uploads');

    if (!fs.existsSync(uploadDir)) {

      fs.mkdirSync(uploadDir, { recursive: true });

    }

    cb(null, uploadDir);

  },

  filename: (req, file, cb) => {

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

    const originalExt = path.extname(file.originalname);

    const mime = String(file.mimetype || '').toLowerCase();

    const ext = originalExt || (mime.includes('heic') ? '.heic' : (mime.includes('heif') ? '.heif' : ''));

    cb(null, 'image-' + uniqueSuffix + ext);

  }

});



const MEDIA_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

const MEDIA_UPLOAD_MAX_MESSAGE = 'File too large. Maximum size is 50 MB.';



const upload = multer({ 

  storage: storage,

  limits: { fileSize: MEDIA_UPLOAD_MAX_BYTES },

  fileFilter: (req, file, cb) => {

    const imageTypes = /jpeg|jpg|png|gif|webp|heic|heif/;

    const videoTypes = /mp4|webm|mov|m4v|quicktime/;

    const ext = path.extname(file.originalname).toLowerCase();

    const normalizedExt = ext.replace('.', '');

    const originalName = String(file.originalname || '').toLowerCase();

    const mime = String(file.mimetype || '').toLowerCase();

    const extAllowed = imageTypes.test(normalizedExt) || videoTypes.test(normalizedExt);

    const nameAllowed = imageTypes.test(originalName) || videoTypes.test(originalName);

    const mimeAllowed = mime.startsWith('image/') || mime.startsWith('video/') || imageTypes.test(mime) || videoTypes.test(mime);

    const looseMimeAllowed = mime === '' || mime === 'application/octet-stream';

    if ((extAllowed || nameAllowed || looseMimeAllowed) && (mimeAllowed || looseMimeAllowed)) {

      return cb(null, true);

    }

    cb(new Error('Only image and video files are allowed'));

  }

});



function uploadMediaMiddleware(req, res, next) {

  upload.single('image')(req, res, (error) => {

    if (!error) {

      return next();

    }

    if (error instanceof multer.MulterError) {

      if (error.code === 'LIMIT_FILE_SIZE') {

        return res.status(413).json({ error: MEDIA_UPLOAD_MAX_MESSAGE });

      }

      return res.status(400).json({ error: error.message || 'Invalid upload request' });

    }

    return res.status(400).json({ error: error.message || 'Invalid file upload' });

  });

}





// Database configuration

const DB_SOURCE = String(process.env.DB_SOURCE || process.env.DB_TARGET || 'local')

  .trim()

  .toLowerCase();

const isSiteDbSource = DB_SOURCE === 'site' || DB_SOURCE === 'production';

const siteDbHost = String(process.env.SITE_DB_HOST || process.env.VPS_DB_HOST || '').trim();

const siteDbPort = String(process.env.SITE_DB_PORT || process.env.VPS_DB_PORT || '').trim();

const siteDbUser = String(process.env.SITE_DB_USER || process.env.VPS_DB_USER || '').trim();

const siteDbPassword = String(process.env.SITE_DB_PASSWORD || process.env.VPS_DB_PASSWORD || '').trim();

const siteDbName = String(process.env.SITE_DB_NAME || process.env.VPS_DB_NAME || '').trim();

const localDbPassword = Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD')

  ? process.env.DB_PASSWORD

  : 'root';

if (isSiteDbSource && (!siteDbHost || !siteDbUser || !siteDbName)) {

  throw new Error('[DB] DB_SOURCE=site requires SITE_DB_HOST/SITE_DB_USER/SITE_DB_NAME (or VPS_DB_* equivalents).');

}

const dbConfig = {

  host: isSiteDbSource ? siteDbHost : (process.env.DB_HOST || 'localhost'),

  port: Number(isSiteDbSource ? (siteDbPort || 3306) : (process.env.DB_PORT || 3306)),

  user: isSiteDbSource ? siteDbUser : (process.env.DB_USER || 'root'),

  password: isSiteDbSource ? siteDbPassword : localDbPassword,

  database: isSiteDbSource ? siteDbName : (process.env.DB_NAME || 'dwira'),

  waitForConnections: true,

  connectionLimit: 10

};

console.log(

  `[DB] source=${isSiteDbSource ? 'site' : 'local'} host=${dbConfig.host} db=${dbConfig.database} user=${dbConfig.user}`

);

const canMirrorFromSiteDb = Boolean(siteDbHost && siteDbUser && siteDbName);



const pool = mysql.createPool(dbConfig);

let mediaHasPositionColumn = true;

const socialAuthSessions = new Map();

const phoneOtpSessions = new Map();

const emailOtpSessions = new Map();

const recentMessengerContexts = new Map();

const pendingMessengerReplies = new Map();

const BIEN_MODES = ['vente', 'location_annuelle', 'location_saisonniere'];

const BIEN_TYPES_BY_MODE = {

  vente: ['appartement', 'villa_maison', 'studio', 'immeuble', 'terrain', 'lotissement', 'local_commercial'],

  location_saisonniere: ['appartement', 'villa_maison', 'bungalow', 'studio'],

  location_annuelle: ['appartement', 'local_commercial', 'villa_maison'],

};

const APPARTEMENT_VENTE_RUE_TYPES = ['piste', 'route_goudronnee', 'rue_residentielle'];

const APPARTEMENT_VENTE_PAPIER_TYPES = ['titre_foncier_individuel', 'titre_foncier_collectif', 'contrat_seulement', 'sans_papier'];

const LOCAL_COMMERCIAL_VENTE_RUE_TYPES = APPARTEMENT_VENTE_RUE_TYPES;

const LOCAL_COMMERCIAL_VENTE_PAPIER_TYPES = APPARTEMENT_VENTE_PAPIER_TYPES;

const TERRAIN_VENTE_RUE_TYPES = APPARTEMENT_VENTE_RUE_TYPES;

const TERRAIN_VENTE_PAPIER_TYPES = APPARTEMENT_VENTE_PAPIER_TYPES;

const TERRAIN_VENTE_TYPES = ['agricole', 'habitation', 'industrielle', 'loisir'];

const TERRAIN_AFFICHAGE_PRIX_MODES = ['total_uniquement', 'm2_uniquement', 'total_et_m2'];

const TERRAIN_HAUTEUR_CONSTRUCTION_OPTIONS = ['R+1', 'R+2', 'R+3', 'R+4', 'R+5'];

const TERRAIN_TOPOGRAPHIE_OPTIONS = ['plat', 'en_pente'];

const TERRAIN_VOISINAGE_OPTIONS = ['residentiel_calme', 'touristique_anime', 'agricole'];

const TERRAIN_VIABILISATION_ONAS_OPTIONS = ['disponible', 'en_facade', 'non_disponible'];

const TERRAIN_VIABILISATION_STEG_OPTIONS = ['disponible', 'a_proximite', 'transformateur_proche', 'non_disponible'];

const TERRAIN_TYPE_SOL_OPTIONS = ['sablonneux', 'rocheux', 'terre_agricole'];

const TERRAIN_NIVEAU_SONORE_OPTIONS = ['faible', 'moyen', 'eleve'];

const TERRAIN_DISPONIBILITE_RESEAUX_OPTIONS = ['eau', 'electricite', 'onas'];

const TERRAIN_PROXIMITES_OPTIONS = ['ecole', 'commerce', 'transport', 'centre_ville'];

const TERRAIN_VIABILISATION_EAU_SOURCES_OPTIONS = ['sonede', 'puits', 'citerne'];

const TERRAIN_IDEAL_UTILISATIONS_OPTIONS = ['construction_villa', 'construction_immeuble', 'projet_touristique', 'projet_commercial', 'projet_agricole', 'investissement_longue_duree'];

const TERRAIN_DOCUMENTS_OPTIONS = ['plan_masse', 'plan_topographique', 'certificat_propriete', 'certificat_bornage', 'certificat_conformite_municipal', 'certificat_non_affectation_agricole'];

const LOTISSEMENT_PRIX_M2_MODES = ['m2_unique', 'paliers'];

const TARIFICATION_METHODES = ['avec_commission', 'sans_commission'];

const MODALITES_PAIEMENT_VENTE = ['comptant', 'facilite'];

const DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT = 3;

const DEFAULT_COMMISSION_CLIENT_PERCENT = 2;

const DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE = 30;

const LEGACY_TYPE_MAP = {

  S1: 'appartement',

  S2: 'appartement',

  S3: 'appartement',

  S4: 'appartement',

  villa: 'villa_maison',

  local: 'local_commercial',

};



function normalizeBienType(rawType) {

  return LEGACY_TYPE_MAP[rawType] || rawType;

}



function normalizeReferenceBase(value) {

  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'REF';

}



const MODE_REFERENCE_CODES = {

  vente: 'VENTE',

  location_annuelle: 'LOCANNUELLE',

  location_saisonniere: 'LOCSAISONNIERE',

};



const TYPE_REFERENCE_CODES = {

  appartement: 'APP',

  villa_maison: 'VILLA',

  studio: 'STU',

  immeuble: 'IMM',

  terrain: 'TER',

  lotissement: 'LOT',

  local_commercial: 'LCOM',

  bungalow: 'BUN',

  S1: 'APP',

  S2: 'APP',

  S3: 'APP',

  S4: 'APP',

  villa: 'VILLA',

  local: 'LOC',

};



const TYPE_UNIT_PREFIX = {

  appartement: 'A',

  villa_maison: 'V',

  studio: 'S',

  immeuble: 'I',

  terrain: 'T',

  lotissement: 'L',

  local_commercial: 'C',

  bungalow: 'B',

  S1: 'A',

  S2: 'A',

  S3: 'A',

  S4: 'A',

  villa: 'V',

  local: 'C',

};



function normalizeAnnonceKey({ titre, zoneId, proprietaireId }) {

  const normalizedTitle = String(titre || '')

    .trim()

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .replace(/[^a-z0-9]+/g, ' ')

    .trim();

  return `${normalizedTitle}__${String(zoneId || '')}__${String(proprietaireId || '')}`;

}



function escapeRegExp(value) {

  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

}



async function generateStructuredBienReference({ mode, type, titre, zoneId, proprietaireId, excludeId = null }) {

  const modeCode = MODE_REFERENCE_CODES[mode] || normalizeReferenceBase(mode).replace(/-/g, '');

  const typeCode = TYPE_REFERENCE_CODES[type] || normalizeReferenceBase(type).replace(/-/g, '');

  const unitPrefix = TYPE_UNIT_PREFIX[type] || 'U';

  const basePrefix = `REF-${modeCode}-${typeCode}-ANN`;



  const params = [mode, type];

  let sql = 'SELECT id, reference, titre, zone_id, proprietaire_id FROM biens WHERE mode = ? AND type = ?';

  if (excludeId) {

    sql += ' AND id <> ?';

    params.push(excludeId);

  }

  const [rows] = await pool.query(sql, params);



  const pattern = new RegExp(`^REF-${escapeRegExp(modeCode)}-${escapeRegExp(typeCode)}-ANN(\\d+)-([A-Z])(\\d+)$`);

  const annonceKey = normalizeAnnonceKey({ titre, zoneId, proprietaireId });



  let maxAnnonceNumber = 0;

  let annonceNumberForCurrent = null;

  let maxUnitForCurrentAnnonce = 0;



  for (const row of rows) {

    const parsed = pattern.exec(String(row.reference || '').trim().toUpperCase());

    if (!parsed) continue;

    const annNumber = Number(parsed[1] || 0);

    const rowUnitPrefix = String(parsed[2] || '');

    const rowUnitNumber = Number(parsed[3] || 0);

    if (annNumber > maxAnnonceNumber) maxAnnonceNumber = annNumber;

    const rowKey = normalizeAnnonceKey({

      titre: row.titre,

      zoneId: row.zone_id,

      proprietaireId: row.proprietaire_id,

    });

    if (rowKey === annonceKey) {

      if (!annonceNumberForCurrent) annonceNumberForCurrent = annNumber;

      if (annonceNumberForCurrent === annNumber && rowUnitPrefix === unitPrefix) {

        maxUnitForCurrentAnnonce = Math.max(maxUnitForCurrentAnnonce, rowUnitNumber);

      }

    }

  }



  const finalAnnonceNumber = annonceNumberForCurrent || (maxAnnonceNumber + 1);

  const finalUnitNumber = maxUnitForCurrentAnnonce + 1;

  return `${basePrefix}${finalAnnonceNumber}-${unitPrefix}${finalUnitNumber}`;

}



function buildChildReference(baseReference, prefix, index) {

  return `${normalizeReferenceBase(baseReference)}-${prefix}${index}`;

}



function createSiteMirrorPool() {

  if (!canMirrorFromSiteDb) {

    throw new Error('SITE_DB_* credentials are missing.');

  }

  return mysql.createPool({

    host: siteDbHost,

    port: Number(siteDbPort || 3306),

    user: siteDbUser,

    password: siteDbPassword,

    database: siteDbName,

    waitForConnections: true,

    connectionLimit: 2,

  });

}



function normalizeBienMode(rawMode) {

  if (!rawMode) return 'location_saisonniere';

  if (rawMode === 'location annuelle') return 'location_annuelle';

  if (rawMode === 'location saisonniere') return 'location_saisonniere';

  return rawMode;

}



function buildShortId(prefix, ...parts) {

  const normalized = parts

    .map((part) => String(part || '').trim().toLowerCase())

    .join('|');

  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 20);

  return `${prefix}_${hash}`;

}



function validateModeAndType(mode, type) {

  if (!BIEN_MODES.includes(mode)) {

    return { valid: false, error: 'mode invalide' };

  }

  const allowedTypes = BIEN_TYPES_BY_MODE[mode] || [];

  if (!allowedTypes.includes(type)) {

    return { valid: false, error: `type "${type}" non autorise pour le mode "${mode}"` };

  }

  return { valid: true };

}



function normalizeAppartementVenteDetails(mode, type, payload = {}) {

  const isAppartementVente = mode === 'vente' && type === 'appartement';

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toFlag = (value) => value === true || value === 1 || value === '1';



  if (!isAppartementVente) {

    return {

      typeRue: null,

      typePapier: null,

      superficieM2: null,

      etage: null,

      configuration: null,

      anneeConstruction: null,

      distancePlageM: null,

      prochePlage: false,

      chauffageCentral: false,

      climatisation: false,

      balcon: false,

      terrasse: false,

      ascenseur: false,

      vueMer: false,

      gazVille: false,

      cuisineEquipee: false,

      placeParking: false,

      syndic: false,

      meuble: false,

      independant: false,

      eauPuits: false,

      eauSonede: false,

      electriciteSteg: false,

    };

  }



  const typeRue = payload.type_rue || null;

  const typePapier = payload.type_papier || null;



  if (typeRue && !APPARTEMENT_VENTE_RUE_TYPES.includes(typeRue)) {

    return { error: 'type_rue invalide' };

  }

  if (typePapier && !APPARTEMENT_VENTE_PAPIER_TYPES.includes(typePapier)) {

    return { error: 'type_papier invalide' };

  }



  return {

    typeRue,

    typePapier,

    superficieM2: toNullableNumber(payload.superficie_m2),

    etage: toNullableNumber(payload.etage),

    configuration: (payload.configuration !== undefined && payload.configuration !== null ? String(payload.configuration) : '').trim() || null,

    anneeConstruction: toNullableNumber(payload.annee_construction),

    distancePlageM: toNullableNumber(payload.distance_plage_m),

    prochePlage: toFlag(payload.proche_plage),

    chauffageCentral: toFlag(payload.chauffage_central),

    climatisation: toFlag(payload.climatisation),

    balcon: toFlag(payload.balcon),

    terrasse: toFlag(payload.terrasse),

    ascenseur: toFlag(payload.ascenseur),

    vueMer: toFlag(payload.vue_mer),

    gazVille: toFlag(payload.gaz_ville),

    cuisineEquipee: toFlag(payload.cuisine_equipee),

    placeParking: toFlag(payload.place_parking),

    syndic: toFlag(payload.syndic),

    meuble: toFlag(payload.meuble),

    independant: toFlag(payload.independant),

    eauPuits: toFlag(payload.eau_puits),

    eauSonede: toFlag(payload.eau_sonede),

    electriciteSteg: toFlag(payload.electricite_steg),

  };

}



function normalizeLocalCommercialVenteDetails(mode, type, payload = {}) {

  const isLocalCommercialVente = mode === 'vente' && type === 'local_commercial';

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toFlag = (value) => value === true || value === 1 || value === '1';



  if (!isLocalCommercialVente) {

    return {

      typeRue: null,

      typePapier: null,

      surfaceM2: null,

      facadeM: null,

      hauteurPlafondM: null,

      activiteRecommandee: null,

      toilette: false,

      reserveLocal: false,

      vitrine: false,

      coinAngle: false,

      electricite3Phases: false,

      gazVille: false,

      alarme: false,

      eauPuits: false,

      eauSonede: false,

      electriciteSteg: false,

    };

  }



  const typeRue = payload.type_rue || null;

  const typePapier = payload.type_papier || null;



  if (typeRue && !LOCAL_COMMERCIAL_VENTE_RUE_TYPES.includes(typeRue)) {

    return { error: 'type_rue invalide' };

  }

  if (typePapier && !LOCAL_COMMERCIAL_VENTE_PAPIER_TYPES.includes(typePapier)) {

    return { error: 'type_papier invalide' };

  }



  return {

    typeRue,

    typePapier,

    surfaceM2: toNullableNumber(payload.surface_local_m2),

    facadeM: toNullableNumber(payload.facade_m),

    hauteurPlafondM: toNullableNumber(payload.hauteur_plafond_m),

    activiteRecommandee: (payload.activite_recommandee !== undefined && payload.activite_recommandee !== null ? String(payload.activite_recommandee) : '').trim() || null,

    toilette: toFlag(payload.toilette),

    reserveLocal: toFlag(payload.reserve_local),

    vitrine: toFlag(payload.vitrine),

    coinAngle: toFlag(payload.coin_angle),

    electricite3Phases: toFlag(payload.electricite_3_phases),

    gazVille: toFlag(payload.gaz_ville),

    alarme: toFlag(payload.alarme),

    eauPuits: toFlag(payload.eau_puits),

    eauSonede: toFlag(payload.eau_sonede),

    electriciteSteg: toFlag(payload.electricite_steg),

  };

}



function normalizeTerrainVenteDetails(mode, type, payload = {}) {

  const isTerrainVente = mode === 'vente' && type === 'terrain';

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toFlag = (value) => value === true || value === 1 || value === '1';

  const toNullableString = (value) => {

    if (value === undefined || value === null) return null;

    const text = String(value).trim();

    return text || null;

  };

  const toStringArray = (value) => Array.isArray(value)

    ? value.map((item) => String(item || '').trim()).filter(Boolean)

    : [];

  const normalizeMulti = (value, allowed = []) => {

    const items = toStringArray(value);

    if (!Array.isArray(allowed) || allowed.length === 0) return items;

    return Array.from(new Set(items.filter((item) => allowed.includes(item))));

  };



  if (!isTerrainVente) {

    return {

      typeRue: null,

      typePapier: null,

      typeTerrain: null,

      facadeM: null,

      surfaceM2: null,

      prixAfficheTotal: null,

      prixAfficheParM2: null,

      modeAffichagePrix: null,

      distancePlageM: null,

      zoneTerrain: null,

      constructible: false,

      terrainAngle: false,

      eauPuits: false,

      eauSonede: false,

      electriciteSteg: false,

      terrainDetailsJson: null,

    };

  }



  const typeRue = payload.type_rue || null;

  const typePapier = payload.type_papier || null;

  const typeTerrain = payload.type_terrain || null;

  const modeAffichagePrix = payload.terrain_mode_affichage_prix || 'total_et_m2';

  const surfaceM2 = toNullableNumber(payload.terrain_surface_m2);

  const prixAfficheTotal = toNullableNumber(payload.terrain_prix_affiche_total);

  const prixAfficheParM2 = toNullableNumber(payload.terrain_prix_affiche_par_m2);



  if (typeRue && !TERRAIN_VENTE_RUE_TYPES.includes(typeRue)) {

    return { error: 'type_rue invalide' };

  }

  if (typePapier && !TERRAIN_VENTE_PAPIER_TYPES.includes(typePapier)) {

    return { error: 'type_papier invalide' };

  }

  if (typeTerrain && !TERRAIN_VENTE_TYPES.includes(typeTerrain)) {

    return { error: 'type_terrain invalide' };

  }

  if (!surfaceM2 || surfaceM2 <= 0) {

    return { error: 'terrain_surface_m2 obligatoire (> 0)' };

  }

  if (modeAffichagePrix && !TERRAIN_AFFICHAGE_PRIX_MODES.includes(modeAffichagePrix)) {

    return { error: 'terrain_mode_affichage_prix invalide' };

  }

  const topographie = toNullableString(payload.terrain_topographie);

  if (topographie && !TERRAIN_TOPOGRAPHIE_OPTIONS.includes(topographie)) {

    return { error: 'terrain_topographie invalide' };

  }

  const hauteurConstruction = toNullableString(payload.terrain_hauteur_construction_autorisee);

  if (hauteurConstruction && !TERRAIN_HAUTEUR_CONSTRUCTION_OPTIONS.includes(hauteurConstruction)) {

    return { error: 'terrain_hauteur_construction_autorisee invalide' };

  }

  const voisinage = toNullableString(payload.terrain_voisinage);

  if (voisinage && !TERRAIN_VOISINAGE_OPTIONS.includes(voisinage)) {

    return { error: 'terrain_voisinage invalide' };

  }

  const viabilisationOnas = toNullableString(payload.terrain_viabilisation_onas);

  if (viabilisationOnas && !TERRAIN_VIABILISATION_ONAS_OPTIONS.includes(viabilisationOnas)) {

    return { error: 'terrain_viabilisation_onas invalide' };

  }

  const viabilisationSteg = toNullableString(payload.terrain_viabilisation_steg);

  if (viabilisationSteg && !TERRAIN_VIABILISATION_STEG_OPTIONS.includes(viabilisationSteg)) {

    return { error: 'terrain_viabilisation_steg invalide' };

  }

  const typeSol = toNullableString(payload.terrain_type_sol);

  if (typeSol && !TERRAIN_TYPE_SOL_OPTIONS.includes(typeSol)) {

    return { error: 'terrain_type_sol invalide' };

  }

  const niveauSonore = toNullableString(payload.terrain_niveau_sonore);

  if (niveauSonore && !TERRAIN_NIVEAU_SONORE_OPTIONS.includes(niveauSonore)) {

    return { error: 'terrain_niveau_sonore invalide' };

  }



  const terrainDetails = {

    disponibilite_reseaux: normalizeMulti(payload.terrain_disponibilite_reseaux, TERRAIN_DISPONIBILITE_RESEAUX_OPTIONS),

    hauteur_construction_autorisee: hauteurConstruction,

    route_acces_largeur_m: toNullableNumber(payload.terrain_route_acces_largeur_m),

    forme: toNullableString(payload.terrain_forme),

    topographie,

    bornage: toFlag(payload.terrain_bornage),

    travaux_municipalite_autorises: toFlag(payload.terrain_travaux_municipalite_autorises),

    limites_cadastrales: toFlag(payload.terrain_limites_cadastrales),

    visualisation_limites_cadastrales: toFlag(payload.terrain_visualisation_limites_cadastrales),

    voisinage,

    proximites_commodites: normalizeMulti(payload.terrain_proximites_commodites, TERRAIN_PROXIMITES_OPTIONS),

    proximites_commodites_autres: toNullableString(payload.terrain_proximites_commodites_autres),

    viabilisation_eau_sources: normalizeMulti(payload.terrain_viabilisation_eau_sources, TERRAIN_VIABILISATION_EAU_SOURCES_OPTIONS),

    viabilisation_onas: viabilisationOnas,

    viabilisation_steg: viabilisationSteg,

    viabilisation_gaz_ville: toFlag(payload.terrain_viabilisation_gaz_ville),

    viabilisation_fibre_optique: toFlag(payload.terrain_viabilisation_fibre_optique),

    viabilisation_telephone_fixe: toFlag(payload.terrain_viabilisation_telephone_fixe),

    type_sol: typeSol,

    vegetation: toNullableString(payload.terrain_vegetation),

    niveau_sonore: niveauSonore,

    risque_inondation: toFlag(payload.terrain_risque_inondation),

    exposition_vent: toNullableString(payload.terrain_exposition_vent),

    ideal_utilisations: normalizeMulti(payload.terrain_ideal_utilisations, TERRAIN_IDEAL_UTILISATIONS_OPTIONS),

    documents_disponibles: normalizeMulti(payload.terrain_documents_disponibles, TERRAIN_DOCUMENTS_OPTIONS),

  };



  return {

    typeRue,

    typePapier,

    typeTerrain,

    facadeM: toNullableNumber(payload.terrain_facade_m),

    surfaceM2,

    prixAfficheTotal,

    prixAfficheParM2,

    modeAffichagePrix,

    distancePlageM: toNullableNumber(payload.terrain_distance_plage_m),

    zoneTerrain: (payload.terrain_zone !== undefined && payload.terrain_zone !== null ? String(payload.terrain_zone) : '').trim() || null,

    constructible: toFlag(payload.terrain_constructible),

    terrainAngle: toFlag(payload.terrain_angle),

    eauPuits: toFlag(payload.eau_puits),

    eauSonede: toFlag(payload.eau_sonede),

    electriciteSteg: toFlag(payload.electricite_steg),

    terrainDetailsJson: JSON.stringify(terrainDetails),

  };

}



function normalizeLotissementVenteDetails(mode, type, payload = {}) {

  const isLotissementVente = mode === 'vente' && type === 'lotissement';

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toFlag = (value) => value === true || value === 1 || value === '1';

  if (!isLotissementVente) {

    return {

      nbTerrains: null,

      prixTotal: null,

      modePrixM2: null,

      prixM2Unique: null,

      terrainsJson: null,

      paliersPrixM2Json: null,

    };

  }



  const nbTerrains = Math.max(1, Math.floor(Number(payload.lotissement_nb_terrains || 1)));

  const modePrixM2 = String(payload.lotissement_mode_prix_m2 || 'm2_unique');

  if (!LOTISSEMENT_PRIX_M2_MODES.includes(modePrixM2)) {

    return { error: 'lotissement_mode_prix_m2 invalide' };

  }



  const rawTerrains = Array.isArray(payload.lotissement_terrains) ? payload.lotissement_terrains : [];

  const baseReference = payload.reference || payload.titre || 'LOTISSEMENT';

  const terrains = [];

  for (let i = 0; i < nbTerrains; i += 1) {

    const row = rawTerrains[i] || {};

    const typeTerrain = row.type_terrain || null;

    const typeRue = row.type_rue || null;

    const typePapier = row.type_papier || null;

    if (typeTerrain && !TERRAIN_VENTE_TYPES.includes(typeTerrain)) return { error: `type_terrain invalide pour terrain ${i + 1}` };

    if (typeRue && !TERRAIN_VENTE_RUE_TYPES.includes(typeRue)) return { error: `type_rue invalide pour terrain ${i + 1}` };

    if (typePapier && !TERRAIN_VENTE_PAPIER_TYPES.includes(typePapier)) return { error: `type_papier invalide pour terrain ${i + 1}` };

    const surfaceM2 = toNullableNumber(row.surface_m2);

    if (!surfaceM2 || surfaceM2 <= 0) return { error: `surface_m2 obligatoire pour terrain ${i + 1}` };

    terrains.push({

      index: i + 1,

      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'TRN', i + 1)),

      type_terrain: typeTerrain,

      surface_m2: surfaceM2,

      type_rue: typeRue,

      type_papier: typePapier,

      terrain_zone: row.terrain_zone ? String(row.terrain_zone).trim() : null,

      terrain_distance_plage_m: toNullableNumber(row.terrain_distance_plage_m),

      terrain_constructible: toFlag(row.terrain_constructible),

      terrain_angle: toFlag(row.terrain_angle),

    });

  }



  const prixM2Unique = toNullableNumber(payload.lotissement_prix_m2_unique);

  const prixTotal = toNullableNumber(payload.lotissement_prix_total);

  const rawPaliers = Array.isArray(payload.lotissement_paliers_prix_m2) ? payload.lotissement_paliers_prix_m2 : [];

  let paliers = [];



  if (modePrixM2 === 'm2_unique') {

    if (!prixM2Unique || prixM2Unique <= 0) return { error: 'lotissement_prix_m2_unique obligatoire (> 0)' };

  } else {

    paliers = rawPaliers

      .map((row) => ({

        min_m2: Number(row?.min_m2 || 0),

        max_m2: toNullableNumber(row?.max_m2),

        prix_m2: Number(row?.prix_m2 || 0),

      }))

      .filter((row) => row.min_m2 > 0 && row.prix_m2 > 0);

    if (paliers.length === 0) return { error: 'lotissement_paliers_prix_m2 obligatoire en mode paliers' };

  }



  return {

    nbTerrains,

    prixTotal,

    modePrixM2,

    prixM2Unique: modePrixM2 === 'm2_unique' ? prixM2Unique : null,

    terrainsJson: JSON.stringify(terrains),

    paliersPrixM2Json: modePrixM2 === 'paliers' ? JSON.stringify(paliers) : null,

  };

}



function normalizeImmeubleVenteDetails(mode, type, payload = {}) {

  const isImmeubleVente = mode === 'vente' && type === 'immeuble';

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toFlag = (value) => value === true || value === 1 || value === '1';



  if (!isImmeubleVente) {

    return {

      typeRue: null,

      typePapier: null,

      detailsJson: null,

      appartementsJson: null,

    };

  }



  const typeRue = payload.type_rue || null;

  const typePapier = payload.type_papier || null;

  if (typeRue && !APPARTEMENT_VENTE_RUE_TYPES.includes(typeRue)) {

    return { error: 'type_rue invalide' };

  }

  if (typePapier && !APPARTEMENT_VENTE_PAPIER_TYPES.includes(typePapier)) {

    return { error: 'type_papier invalide' };

  }



  const nbAppartements = Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_appartements) || 0));

  const nbGarages = Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_garages) || 0));

  const nbLocauxCommerciaux = Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_locaux_commerciaux) || 0));

  const baseReference = payload.reference || payload.titre || 'IMMEUBLE';

  const inputRows = Array.isArray(payload.immeuble_appartements) ? payload.immeuble_appartements : [];

  const inputGarages = Array.isArray(payload.immeuble_garages) ? payload.immeuble_garages : [];

  const inputLocaux = Array.isArray(payload.immeuble_locaux_commerciaux) ? payload.immeuble_locaux_commerciaux : [];

  const appartements = [];

  for (let i = 0; i < nbAppartements; i += 1) {

    const row = inputRows[i] || {};

    appartements.push({

      index: i + 1,

      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'APT', i + 1)),

      chambres: Math.max(0, Math.floor(toNullableNumber(row.chambres) || 0)),

      salle_bain: Math.max(0, Math.floor(toNullableNumber(row.salle_bain) || 0)),

      superficie_m2: toNullableNumber(row.superficie_m2),

      configuration: row.configuration ? String(row.configuration).trim() : null,

    });

  }

  const garages = [];

  for (let i = 0; i < nbGarages; i += 1) {

    const row = inputGarages[i] || {};

    garages.push({

      index: i + 1,

      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'GAR', i + 1)),

    });

  }

  const locauxCommerciaux = [];

  for (let i = 0; i < nbLocauxCommerciaux; i += 1) {

    const row = inputLocaux[i] || {};

    locauxCommerciaux.push({

      index: i + 1,

      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'LOC', i + 1)),

    });

  }



  const details = {

    surface_terrain_m2: toNullableNumber(payload.immeuble_surface_terrain_m2),

    surface_batie_m2: toNullableNumber(payload.immeuble_surface_batie_m2),

    nb_niveaux: Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_niveaux) || 0)),

    nb_garages: nbGarages,

    nb_appartements: nbAppartements,

    nb_locaux_commerciaux: nbLocauxCommerciaux,

    distance_plage_m: toNullableNumber(payload.immeuble_distance_plage_m),

    proche_plage: toFlag(payload.immeuble_proche_plage),

    ascenseur: toFlag(payload.immeuble_ascenseur),

    parking_sous_sol: toFlag(payload.immeuble_parking_sous_sol),

    parking_exterieur: toFlag(payload.immeuble_parking_exterieur),

    syndic: toFlag(payload.immeuble_syndic),

    vue_mer: toFlag(payload.immeuble_vue_mer),

    garages,

    locaux_commerciaux: locauxCommerciaux,

  };



  return {

    typeRue,

    typePapier,

    detailsJson: JSON.stringify(details),

    appartementsJson: JSON.stringify(appartements),

  };

}



function deriveBedroomsFromConfiguration(configuration) {

  if (!configuration) return 0;

  const match = String(configuration).match(/S\s*\+\s*(\d+)/i);

  if (!match) return 0;

  const parsed = Number(match[1]);

  return Number.isFinite(parsed) ? parsed : 0;

}



function normalizeVenteTarification(mode, type, payload = {}) {

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;



  if (mode !== 'vente') {

    return {

      tarificationMethode: null,

      prixAfficheClient: null,

      prixFixeProprietaire: null,

      prixFinal: null,

      revenuAgence: null,

      commissionPourcentageProprietaire: null,

      commissionPourcentageClient: null,

      montantMaxReductionNegociation: null,

      prixMinimumAccepte: null,

    };

  }



  let prixAfficheClient = toNullableNumber(payload.prix_affiche_client ?? payload.prix_nuitee);

  if ((prixAfficheClient === null || prixAfficheClient <= 0) && type === 'terrain') {

    const surfaceTerrain = toNullableNumber(payload.terrain_surface_m2);

    const prixParM2 = toNullableNumber(payload.terrain_prix_affiche_par_m2);

    if (surfaceTerrain && surfaceTerrain > 0 && prixParM2 && prixParM2 > 0) {

      prixAfficheClient = toMoney(surfaceTerrain * prixParM2);

    }

  }

  if ((prixAfficheClient === null || prixAfficheClient <= 0) && type === 'lotissement') {

    const prixTotal = toNullableNumber(payload.lotissement_prix_total);

    if (prixTotal && prixTotal > 0) {

      prixAfficheClient = toMoney(prixTotal);

    }

  }

  if (prixAfficheClient === null || prixAfficheClient <= 0) {

    return {

      tarificationMethode: null,

      prixAfficheClient: null,

      prixFixeProprietaire: null,

      prixFinal: null,

      revenuAgence: null,

      commissionPourcentageProprietaire: null,

      commissionPourcentageClient: null,

      montantMaxReductionNegociation: null,

      prixMinimumAccepte: null,

    };

  }



  const tarificationMethode = String(payload.tarification_methode || 'avec_commission');

  if (!TARIFICATION_METHODES.includes(tarificationMethode)) {

    return { error: 'tarification_methode invalide' };

  }



  if (tarificationMethode === 'avec_commission') {

    const commissionPourcentageProprietaire = toNullableNumber(payload.commission_pourcentage_proprietaire) ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT;

    const commissionPourcentageClient = toNullableNumber(payload.commission_pourcentage_client) ?? DEFAULT_COMMISSION_CLIENT_PERCENT;

    if (commissionPourcentageProprietaire < 0 || commissionPourcentageClient < 0) {

      return { error: 'les pourcentages de commission doivent etre >= 0' };

    }



    const commissionPartProprietaire = toMoney((prixAfficheClient * commissionPourcentageProprietaire) / 100);

    const supplementPartClient = toMoney((prixAfficheClient * commissionPourcentageClient) / 100);

    const prixFixeProprietaire = toMoney(prixAfficheClient - commissionPartProprietaire);

    if (prixFixeProprietaire < 0) {

      return { error: 'prix_fixe_proprietaire negatif: verifier la commission proprietaire' };

    }



    return {

      tarificationMethode,

      prixAfficheClient: toMoney(prixAfficheClient),

      prixFixeProprietaire,

      prixFinal: toMoney(prixAfficheClient + supplementPartClient),

      revenuAgence: toMoney(commissionPartProprietaire + supplementPartClient),

      commissionPourcentageProprietaire,

      commissionPourcentageClient,

      montantMaxReductionNegociation: null,

      prixMinimumAccepte: null,

    };

  }



  const prixFixeProprietaire = toNullableNumber(payload.prix_fixe_proprietaire);

  if (prixFixeProprietaire === null || prixFixeProprietaire <= 0) {

    return { error: 'prix_fixe_proprietaire invalide (doit etre > 0)' };

  }

  if (prixFixeProprietaire > prixAfficheClient) {

    return { error: 'prix_fixe_proprietaire ne peut pas depasser le prix_affiche_client' };

  }



  const revenuAgence = toMoney(prixAfficheClient - prixFixeProprietaire);

  const montantMaxReductionNegociation = toNullableNumber(payload.montant_max_reduction_negociation) ?? 0;

  if (montantMaxReductionNegociation < 0) {

    return { error: 'montant_max_reduction_negociation doit etre >= 0' };

  }

  if (montantMaxReductionNegociation > revenuAgence) {

    return { error: 'montant_max_reduction_negociation ne peut pas depasser le revenu_agence' };

  }



  return {

    tarificationMethode,

    prixAfficheClient: toMoney(prixAfficheClient),

    prixFixeProprietaire: toMoney(prixFixeProprietaire),

    prixFinal: toMoney(prixAfficheClient),

    revenuAgence,

    commissionPourcentageProprietaire: 0,

    commissionPourcentageClient: 0,

    montantMaxReductionNegociation: toMoney(montantMaxReductionNegociation),

    prixMinimumAccepte: toMoney(prixAfficheClient - montantMaxReductionNegociation),

  };

}



function normalizeVentePaiement(mode, totalPrixClient, payload = {}) {

  const toNullableNumber = (value) => {

    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;

  };

  const toMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  const toPositiveInt = (value) => {

    const numeric = toNullableNumber(value);

    if (numeric === null) return null;

    return Math.floor(numeric);

  };



  if (mode !== 'vente') {

    return {

      modalitePaiementVente: null,

      pourcentagePremierePartiePromesse: null,

      montantPremierePartiePromesse: null,

      montantDeuxiemePartie: null,

      nombreTranches: null,

      periodeTranchesMois: null,

      montantParTranche: null,

    };

  }



  const total = Number(totalPrixClient || 0);

  if (!Number.isFinite(total) || total <= 0) {

    return {

      modalitePaiementVente: null,

      pourcentagePremierePartiePromesse: null,

      montantPremierePartiePromesse: null,

      montantDeuxiemePartie: null,

      nombreTranches: null,

      periodeTranchesMois: null,

      montantParTranche: null,

    };

  }



  const modalitePaiementVente = String(payload.modalite_paiement_vente || 'comptant');

  if (!MODALITES_PAIEMENT_VENTE.includes(modalitePaiementVente)) {

    return { error: 'modalite_paiement_vente invalide' };

  }



  if (modalitePaiementVente === 'comptant') {

    return {

      modalitePaiementVente,

      pourcentagePremierePartiePromesse: 100,

      montantPremierePartiePromesse: toMoney(total),

      montantDeuxiemePartie: 0,

      nombreTranches: null,

      periodeTranchesMois: null,

      montantParTranche: null,

    };

  }



  const pourcentagePremierePartiePromesse = toNullableNumber(payload.pourcentage_premiere_partie_promesse)

    ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE;

  if (pourcentagePremierePartiePromesse <= 0 || pourcentagePremierePartiePromesse >= 100) {

    return { error: 'pourcentage_premiere_partie_promesse doit etre > 0 et < 100' };

  }



  const nombreTranches = toPositiveInt(payload.nombre_tranches);

  if (nombreTranches === null || nombreTranches <= 0) {

    return { error: 'nombre_tranches invalide (doit etre > 0)' };

  }



  const periodeTranchesMois = toPositiveInt(payload.periode_tranches_mois);

  if (periodeTranchesMois === null || periodeTranchesMois <= 0) {

    return { error: 'periode_tranches_mois invalide (doit etre > 0)' };

  }



  const montantPremierePartiePromesse = toMoney((total * pourcentagePremierePartiePromesse) / 100);

  const montantDeuxiemePartie = toMoney(total - montantPremierePartiePromesse);

  const montantParTranche = toMoney(montantDeuxiemePartie / nombreTranches);



  return {

    modalitePaiementVente,

    pourcentagePremierePartiePromesse,

    montantPremierePartiePromesse,

    montantDeuxiemePartie,

    nombreTranches,

    periodeTranchesMois,

    montantParTranche,

  };

}



async function syncBienCaracteristiques(bienId, caracteristiqueIds) {

  const [bienRows] = await pool.query('SELECT mode, type FROM biens WHERE id = ? LIMIT 1', [bienId]);

  const bien = bienRows[0];

  if (!bien) return;



  const normalizedMode = normalizeBienMode(bien.mode);

  const normalizedType = normalizeBienType(bien.type);



  if (Array.isArray(caracteristiqueIds) && caracteristiqueIds.length > 0) {

    const placeholders = caracteristiqueIds.map(() => '?').join(',');

    const [allowedRows] = await pool.query(

      `SELECT caracteristique_id

       FROM caracteristique_contextes

       WHERE mode_bien = ? AND type_bien = ? AND caracteristique_id IN (${placeholders})`,

      [normalizedMode, normalizedType, ...caracteristiqueIds]

    );

    const allowedIds = new Set(allowedRows.map((row) => row.caracteristique_id));

    const invalidIds = caracteristiqueIds.filter((id) => !allowedIds.has(id));

    if (invalidIds.length > 0) {

      throw new Error(`Invalid caracteristique_ids for mode/type: ${invalidIds.join(', ')}`);

    }

  }



  const normalizedIds = Array.isArray(caracteristiqueIds) ? Array.from(new Set(caracteristiqueIds.map((id) => String(id || '').trim()).filter(Boolean))) : [];

  const [existingRows] = await pool.query(

    'SELECT caracteristique_id FROM bien_caracteristiques WHERE bien_id = ?',

    [bienId]

  );

  const existingIds = new Set(existingRows.map((row) => String(row.caracteristique_id || '').trim()).filter(Boolean));



  const toDelete = [...existingIds].filter((id) => !normalizedIds.includes(id));

  if (toDelete.length > 0) {

    const placeholders = toDelete.map(() => '?').join(',');

    await pool.query(

      `DELETE FROM bien_caracteristiques WHERE bien_id = ? AND caracteristique_id IN (${placeholders})`,

      [bienId, ...toDelete]

    );

  }



  if (normalizedIds.length === 0) return;



  const toInsert = normalizedIds.filter((id) => !existingIds.has(id));

  if (toInsert.length === 0) return;



  const placeholders = toInsert.map(() => '?').join(',');

  const [featureRows] = await pool.query(

    `SELECT id, COALESCE(visibilite_client, 1) AS visibilite_client

     FROM caracteristiques

     WHERE id IN (${placeholders})`,

    toInsert

  );

  const visibilityById = new Map(featureRows.map((row) => [String(row.id), Number(row.visibilite_client) === 0 ? 0 : 1]));



  for (const caracteristiqueId of toInsert) {

    await pool.query(

      `INSERT INTO bien_caracteristiques (

        bien_id, caracteristique_id, visibilite_client, override_nom, override_type_caracteristique, override_unite, override_onglet_id, override_valeur_json

      ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,

      [bienId, caracteristiqueId, visibilityById.get(caracteristiqueId) ?? 1]

    );

  }

}



async function syncBienCaracteristiqueValeurs(bienId, caracteristiqueIds, caracteristiqueValeurs) {

  const normalizedIds = Array.isArray(caracteristiqueIds)

    ? Array.from(new Set(caracteristiqueIds.map((id) => String(id || '').trim()).filter(Boolean)))

    : [];

  const valuesSource = caracteristiqueValeurs && typeof caracteristiqueValeurs === 'object' ? caracteristiqueValeurs : {};



  for (const caracteristiqueId of normalizedIds) {

    const rawValue = Object.prototype.hasOwnProperty.call(valuesSource, caracteristiqueId)

      ? valuesSource[caracteristiqueId]

      : null;

    let serializedValue = null;

    if (rawValue !== null && rawValue !== undefined) {

      if (Array.isArray(rawValue)) {

        const normalizedArray = rawValue.map((item) => String(item || '').trim()).filter(Boolean);

        serializedValue = normalizedArray.length > 0 ? JSON.stringify(normalizedArray) : null;

      } else {

        const normalizedScalar = String(rawValue || '').trim();

        serializedValue = normalizedScalar.length > 0 ? JSON.stringify(normalizedScalar) : null;

      }

    }

    await pool.query(

      'UPDATE bien_caracteristiques SET override_valeur_json = ? WHERE bien_id = ? AND caracteristique_id = ?',

      [serializedValue, bienId, caracteristiqueId]

    );

  }

}



const createTemporarySocialToken = (user) => {

  const token = crypto.randomBytes(32).toString('hex');

  const expiresAt = Date.now() + 5 * 60 * 1000;

  socialAuthSessions.set(token, { user, expiresAt });

  return token;

};



const consumeTemporarySocialToken = (token) => {

  const entry = socialAuthSessions.get(token);

  if (!entry) return null;



  socialAuthSessions.delete(token);

  if (entry.expiresAt < Date.now()) return null;

  return entry.user;

};



setInterval(() => {

  const now = Date.now();

  for (const [token, entry] of socialAuthSessions.entries()) {

    if (entry.expiresAt < now) {

      socialAuthSessions.delete(token);

    }

  }

}, 60 * 1000);



setInterval(() => {

  const now = Date.now();

  for (const [key, entry] of passkeyChallengeStore.entries()) {

    if (Number(entry?.expiresAt || 0) <= now) {

      passkeyChallengeStore.delete(key);

    }

  }

}, 60 * 1000).unref?.();



async function columnExists(tableName, columnName) {

  const [rows] = await pool.query(

    `SELECT COUNT(*) AS total

     FROM information_schema.COLUMNS

     WHERE TABLE_SCHEMA = DATABASE()

       AND TABLE_NAME = ?

       AND COLUMN_NAME = ?`,

    [tableName, columnName]

  );

  return Number(rows?.[0]?.total || 0) > 0;

}



function toNullableNumber(value) {

  if (value === null || value === undefined || value === '') return null;

  const num = Number(value);

  return Number.isFinite(num) ? num : null;

}



async function ensureAuthSchema() {

  const indexExists = async (tableName, indexName) => {

    const [rows] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM information_schema.STATISTICS

       WHERE TABLE_SCHEMA = DATABASE()

         AND TABLE_NAME = ?

         AND INDEX_NAME = ?`,

      [tableName, indexName]

    );

    return Number(rows[0]?.total || 0) > 0;

  };



  await pool.query(`

    CREATE TABLE IF NOT EXISTS administrateurs (

      id VARCHAR(50) PRIMARY KEY,

      nom VARCHAR(100) NOT NULL,

      email VARCHAR(100) NOT NULL UNIQUE,

      mot_de_passe_hash VARCHAR(255) NOT NULL,

      actif BOOLEAN NOT NULL DEFAULT TRUE,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      INDEX idx_admin_email (email)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);



  if (!(await columnExists('utilisateurs', 'auth_provider'))) {

    await pool.query(

      "ALTER TABLE utilisateurs ADD COLUMN auth_provider ENUM('local', 'google', 'facebook', 'phone', 'email', 'passkey') NOT NULL DEFAULT 'local'"

    );

  }



  const [authProviderRows] = await pool.query(

    `SELECT COLUMN_TYPE AS column_type

     FROM information_schema.COLUMNS

     WHERE TABLE_SCHEMA = DATABASE()

       AND TABLE_NAME = 'utilisateurs'

       AND COLUMN_NAME = 'auth_provider'

     LIMIT 1`

  );

  const authProviderColumnType = String(authProviderRows?.[0]?.column_type || '');

  if (

    authProviderColumnType

    && (!authProviderColumnType.includes("'phone'") || !authProviderColumnType.includes("'email'") || !authProviderColumnType.includes("'passkey'"))

  ) {

    await pool.query(

      "ALTER TABLE utilisateurs MODIFY COLUMN auth_provider ENUM('local', 'google', 'facebook', 'phone', 'email', 'passkey') NOT NULL DEFAULT 'local'"

    );

  }



  if (!(await columnExists('utilisateurs', 'provider_user_id'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN provider_user_id VARCHAR(150) NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'last_login_at'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN last_login_at DATETIME NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'telephone'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN telephone VARCHAR(30) NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'cin'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN cin VARCHAR(50) NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'cin_image_url'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN cin_image_url VARCHAR(500) NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'profile_completed_at'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN profile_completed_at DATETIME NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'updated_at'))) {

    await pool.query(

      'ALTER TABLE utilisateurs ADD COLUMN updated_at DATETIME NULL'

    );

  }



  if (!(await columnExists('utilisateurs', 'client_type'))) {

    await pool.query(

      "ALTER TABLE utilisateurs ADD COLUMN client_type ENUM('proprietaire', 'locataire', 'acheteur', 'agent_amicale') NULL"

    );

  }

  await pool.query(

    "ALTER TABLE utilisateurs MODIFY COLUMN client_type ENUM('proprietaire', 'locataire', 'acheteur', 'agent_amicale') NULL"

  );



  if (!(await indexExists('utilisateurs', 'uq_provider_user'))) {

    await pool.query(

      'CREATE UNIQUE INDEX uq_provider_user ON utilisateurs (auth_provider, provider_user_id)'

    );

  }



  await pool.query(

    `CREATE TABLE IF NOT EXISTS amicales (

      id VARCHAR(64) PRIMARY KEY,

      name VARCHAR(255) NOT NULL UNIQUE,

      code VARCHAR(255) NOT NULL,

      logo_url LONGTEXT NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL

    )`

  );



  await pool.query(

    `CREATE TABLE IF NOT EXISTS agent_amicale_profiles (

      user_id VARCHAR(64) PRIMARY KEY,

      amicale_id VARCHAR(64) NOT NULL,

      username VARCHAR(255) NOT NULL,

      password_text VARCHAR(255) NOT NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      INDEX idx_agent_amicale_amicale (amicale_id),

      INDEX idx_agent_amicale_username (username)

    )`

  );



  const seedEmail = process.env.ADMIN_SEED_EMAIL;

  const seedPassword = process.env.ADMIN_SEED_PASSWORD;

  if (seedEmail && seedPassword) {

    const hashedPassword = await bcrypt.hash(seedPassword, 10);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(

      `INSERT INTO administrateurs (id, nom, email, mot_de_passe_hash, actif, created_at, updated_at)

       VALUES (?, ?, ?, ?, 1, ?, ?)

       ON DUPLICATE KEY UPDATE

         nom = VALUES(nom),

         mot_de_passe_hash = VALUES(mot_de_passe_hash),

         actif = 1,

         updated_at = VALUES(updated_at)`,

      ['admin-seed', process.env.ADMIN_SEED_NAME || 'Administrateur', seedEmail.toLowerCase(), hashedPassword, now, now]

    );

  }

}



async function ensureBiensWorkflowSchema() {

  const columnExists = async (tableName, columnName) => {

    const [rows] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM information_schema.COLUMNS

       WHERE TABLE_SCHEMA = DATABASE()

         AND TABLE_NAME = ?

         AND COLUMN_NAME = ?`,

      [tableName, columnName]

    );

    return Number(rows[0]?.total || 0) > 0;

  };



  const indexExists = async (tableName, indexName) => {

    const [rows] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM information_schema.STATISTICS

       WHERE TABLE_SCHEMA = DATABASE()

         AND TABLE_NAME = ?

         AND INDEX_NAME = ?`,

      [tableName, indexName]

    );

    return Number(rows[0]?.total || 0) > 0;

  };



  const hasModeColumn = await columnExists('biens', 'mode');

  const hasModeBienColumn = await columnExists('biens', 'mode_bien');



  if (!hasModeColumn && !hasModeBienColumn) {

    await pool.query(

      "ALTER TABLE biens ADD COLUMN mode ENUM('vente','location_annuelle','location_saisonniere') NOT NULL DEFAULT 'location_saisonniere' AFTER titre"

    );

  }



  if (!hasModeColumn && hasModeBienColumn) {

    await pool.query(

      "ALTER TABLE biens ADD COLUMN mode ENUM('vente','location_annuelle','location_saisonniere') NOT NULL DEFAULT 'location_saisonniere' AFTER titre"

    );

    await pool.query('UPDATE biens SET mode = mode_bien');

  }



  if (hasModeColumn) {

    await pool.query(

      "ALTER TABLE biens MODIFY COLUMN mode ENUM('vente','location_annuelle','location_saisonniere') NOT NULL DEFAULT 'location_saisonniere'"

    );

  }



  if (!(await columnExists('biens', 'caution'))) {

    await pool.query(

      'ALTER TABLE biens ADD COLUMN caution DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER avance'

    );

  }

  if (!(await columnExists('biens', 'visible_sur_site'))) {

    await pool.query(

      'ALTER TABLE biens ADD COLUMN visible_sur_site TINYINT(1) NOT NULL DEFAULT 1 AFTER statut'

    );

  }

  if (!(await columnExists('biens', 'is_featured'))) {

    await pool.query(

      'ALTER TABLE biens ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER visible_sur_site'

    );

  }

  if (!(await columnExists('biens', 'ui_config_json'))) {

    await pool.query(

      'ALTER TABLE biens ADD COLUMN ui_config_json LONGTEXT NULL AFTER visible_sur_site'

    );

  }

  if (!(await columnExists('biens', 'location_saisonniere_config_json'))) {

    await pool.query(

      'ALTER TABLE biens ADD COLUMN location_saisonniere_config_json LONGTEXT NULL AFTER ui_config_json'

    );

  }

  if (!(await columnExists('biens', 'admin_last_saved_at'))) {

    await pool.query(

      'ALTER TABLE biens ADD COLUMN admin_last_saved_at DATETIME NULL AFTER updated_at'

    );

  }



  if (!(await columnExists('biens', 'tarification_methode'))) {

    await pool.query(

      "ALTER TABLE biens ADD COLUMN tarification_methode ENUM('avec_commission','sans_commission') NULL DEFAULT NULL AFTER caution"

    );

  }

  if (!(await columnExists('biens', 'prix_affiche_client'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN prix_affiche_client DECIMAL(12,2) NULL DEFAULT NULL AFTER tarification_methode');

  }

  if (!(await columnExists('biens', 'prix_fixe_proprietaire'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN prix_fixe_proprietaire DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_affiche_client');

  }

  if (!(await columnExists('biens', 'prix_proprietaire'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN prix_proprietaire DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_fixe_proprietaire');

  }

  if (!(await columnExists('biens', 'prix_final'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN prix_final DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_proprietaire');

  }

  if (!(await columnExists('biens', 'revenu_agence'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN revenu_agence DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_final');

  }

  if (!(await columnExists('biens', 'commission_pourcentage_proprietaire'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN commission_pourcentage_proprietaire DECIMAL(5,2) NULL DEFAULT NULL AFTER revenu_agence');

  }

  if (!(await columnExists('biens', 'commission_pourcentage_client'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN commission_pourcentage_client DECIMAL(5,2) NULL DEFAULT NULL AFTER commission_pourcentage_proprietaire');

  }

  if (!(await columnExists('biens', 'montant_max_reduction_negociation'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN montant_max_reduction_negociation DECIMAL(12,2) NULL DEFAULT NULL AFTER commission_pourcentage_client');

  }

  if (!(await columnExists('biens', 'prix_minimum_accepte'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN prix_minimum_accepte DECIMAL(12,2) NULL DEFAULT NULL AFTER montant_max_reduction_negociation');

  }

  if (!(await columnExists('biens', 'modalite_paiement_vente'))) {

    await pool.query(

      "ALTER TABLE biens ADD COLUMN modalite_paiement_vente ENUM('comptant','facilite') NULL DEFAULT NULL AFTER prix_minimum_accepte"

    );

  }

  if (!(await columnExists('biens', 'pourcentage_premiere_partie_promesse'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN pourcentage_premiere_partie_promesse DECIMAL(5,2) NULL DEFAULT NULL AFTER modalite_paiement_vente');

  }

  if (!(await columnExists('biens', 'montant_premiere_partie_promesse'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN montant_premiere_partie_promesse DECIMAL(12,2) NULL DEFAULT NULL AFTER pourcentage_premiere_partie_promesse');

  }

  if (!(await columnExists('biens', 'montant_deuxieme_partie'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN montant_deuxieme_partie DECIMAL(12,2) NULL DEFAULT NULL AFTER montant_premiere_partie_promesse');

  }

  if (!(await columnExists('biens', 'nombre_tranches'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN nombre_tranches INT NULL DEFAULT NULL AFTER montant_deuxieme_partie');

  }

  if (!(await columnExists('biens', 'periode_tranches_mois'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN periode_tranches_mois INT NULL DEFAULT NULL AFTER nombre_tranches');

  }

  if (!(await columnExists('biens', 'montant_par_tranche'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN montant_par_tranche DECIMAL(12,2) NULL DEFAULT NULL AFTER periode_tranches_mois');

  }

  if (!(await columnExists('media', 'motif_upload'))) {

    await pool.query('ALTER TABLE media ADD COLUMN motif_upload VARCHAR(255) NULL DEFAULT NULL AFTER url');

  }



  if (!(await columnExists('biens', 'type_rue'))) {

    await pool.query(

      "ALTER TABLE biens ADD COLUMN type_rue ENUM('piste','route_goudronnee','rue_residentielle') NULL DEFAULT NULL AFTER caution"

    );

  }



  if (!(await columnExists('biens', 'type_papier'))) {

    await pool.query(

      "ALTER TABLE biens ADD COLUMN type_papier ENUM('titre_foncier_individuel','titre_foncier_collectif','contrat_seulement','sans_papier') NULL DEFAULT NULL AFTER type_rue"

    );

  }

  if (!(await columnExists('biens', 'superficie_m2'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN superficie_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER type_papier');

  }

  if (!(await columnExists('biens', 'etage'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN etage INT NULL DEFAULT NULL AFTER superficie_m2');

  }

  if (!(await columnExists('biens', 'configuration'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN configuration VARCHAR(50) NULL DEFAULT NULL AFTER etage');

  }

  if (!(await columnExists('biens', 'annee_construction'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN annee_construction INT NULL DEFAULT NULL AFTER configuration');

  }

  if (!(await columnExists('biens', 'distance_plage_m'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN distance_plage_m INT NULL DEFAULT NULL AFTER annee_construction');

  }

  if (!(await columnExists('biens', 'proche_plage'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN proche_plage TINYINT(1) NOT NULL DEFAULT 0 AFTER distance_plage_m');

  }

  if (!(await columnExists('biens', 'chauffage_central'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN chauffage_central TINYINT(1) NOT NULL DEFAULT 0 AFTER proche_plage');

  }

  if (!(await columnExists('biens', 'climatisation'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN climatisation TINYINT(1) NOT NULL DEFAULT 0 AFTER chauffage_central');

  }

  if (!(await columnExists('biens', 'balcon'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN balcon TINYINT(1) NOT NULL DEFAULT 0 AFTER climatisation');

  }

  if (!(await columnExists('biens', 'terrasse'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrasse TINYINT(1) NOT NULL DEFAULT 0 AFTER balcon');

  }

  if (!(await columnExists('biens', 'ascenseur'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN ascenseur TINYINT(1) NOT NULL DEFAULT 0 AFTER terrasse');

  }

  if (!(await columnExists('biens', 'vue_mer'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN vue_mer TINYINT(1) NOT NULL DEFAULT 0 AFTER ascenseur');

  }

  if (!(await columnExists('biens', 'gaz_ville'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN gaz_ville TINYINT(1) NOT NULL DEFAULT 0 AFTER vue_mer');

  }

  if (!(await columnExists('biens', 'cuisine_equipee'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN cuisine_equipee TINYINT(1) NOT NULL DEFAULT 0 AFTER gaz_ville');

  }

  if (!(await columnExists('biens', 'place_parking'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN place_parking TINYINT(1) NOT NULL DEFAULT 0 AFTER cuisine_equipee');

  }

  if (!(await columnExists('biens', 'syndic'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN syndic TINYINT(1) NOT NULL DEFAULT 0 AFTER place_parking');

  }

  if (!(await columnExists('biens', 'meuble'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN meuble TINYINT(1) NOT NULL DEFAULT 0 AFTER syndic');

  }

  if (!(await columnExists('biens', 'independant'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN independant TINYINT(1) NOT NULL DEFAULT 0 AFTER meuble');

  }

  if (!(await columnExists('biens', 'eau_puits'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN eau_puits TINYINT(1) NOT NULL DEFAULT 0 AFTER independant');

  }

  if (!(await columnExists('biens', 'eau_sonede'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN eau_sonede TINYINT(1) NOT NULL DEFAULT 0 AFTER eau_puits');

  }

  if (!(await columnExists('biens', 'electricite_steg'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN electricite_steg TINYINT(1) NOT NULL DEFAULT 0 AFTER eau_sonede');

  }

  if (!(await columnExists('biens', 'surface_local_m2'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN surface_local_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER electricite_steg');

  }

  if (!(await columnExists('biens', 'facade_m'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN facade_m DECIMAL(10,2) NULL DEFAULT NULL AFTER surface_local_m2');

  }

  if (!(await columnExists('biens', 'hauteur_plafond_m'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN hauteur_plafond_m DECIMAL(10,2) NULL DEFAULT NULL AFTER facade_m');

  }

  if (!(await columnExists('biens', 'activite_recommandee'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN activite_recommandee VARCHAR(255) NULL DEFAULT NULL AFTER hauteur_plafond_m');

  }

  if (!(await columnExists('biens', 'toilette'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN toilette TINYINT(1) NOT NULL DEFAULT 0 AFTER activite_recommandee');

  }

  if (!(await columnExists('biens', 'reserve_local'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN reserve_local TINYINT(1) NOT NULL DEFAULT 0 AFTER toilette');

  }

  if (!(await columnExists('biens', 'vitrine'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN vitrine TINYINT(1) NOT NULL DEFAULT 0 AFTER reserve_local');

  }

  if (!(await columnExists('biens', 'coin_angle'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN coin_angle TINYINT(1) NOT NULL DEFAULT 0 AFTER vitrine');

  }

  if (!(await columnExists('biens', 'electricite_3_phases'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN electricite_3_phases TINYINT(1) NOT NULL DEFAULT 0 AFTER coin_angle');

  }

  if (!(await columnExists('biens', 'alarme'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN alarme TINYINT(1) NOT NULL DEFAULT 0 AFTER electricite_3_phases');

  }

  if (!(await columnExists('biens', 'type_terrain'))) {

    await pool.query("ALTER TABLE biens ADD COLUMN type_terrain ENUM('agricole','habitation','industrielle','loisir') NULL DEFAULT NULL AFTER alarme");

  }

  if (!(await columnExists('biens', 'terrain_facade_m'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_facade_m DECIMAL(10,2) NULL DEFAULT NULL AFTER type_terrain');

  }

  if (!(await columnExists('biens', 'terrain_surface_m2'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_surface_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER terrain_facade_m');

  }

  if (!(await columnExists('biens', 'terrain_distance_plage_m'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_distance_plage_m INT NULL DEFAULT NULL AFTER terrain_surface_m2');

  }

  if (!(await columnExists('biens', 'terrain_zone'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_zone VARCHAR(255) NULL DEFAULT NULL AFTER terrain_distance_plage_m');

  }

  if (!(await columnExists('biens', 'terrain_constructible'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_constructible TINYINT(1) NOT NULL DEFAULT 0 AFTER terrain_zone');

  }

  if (!(await columnExists('biens', 'terrain_angle'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_angle TINYINT(1) NOT NULL DEFAULT 0 AFTER terrain_constructible');

  }

  if (!(await columnExists('biens', 'terrain_prix_affiche_total'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_prix_affiche_total DECIMAL(12,2) NULL DEFAULT NULL AFTER terrain_angle');

  }

  if (!(await columnExists('biens', 'terrain_prix_affiche_par_m2'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_prix_affiche_par_m2 DECIMAL(12,2) NULL DEFAULT NULL AFTER terrain_prix_affiche_total');

  }

  if (!(await columnExists('biens', 'terrain_mode_affichage_prix'))) {

    await pool.query("ALTER TABLE biens ADD COLUMN terrain_mode_affichage_prix ENUM('total_uniquement','m2_uniquement','total_et_m2') NULL DEFAULT NULL AFTER terrain_prix_affiche_par_m2");

  }

  if (!(await columnExists('biens', 'terrain_details_json'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN terrain_details_json LONGTEXT NULL AFTER terrain_mode_affichage_prix');

  }

  if (!(await columnExists('biens', 'lotissement_nb_terrains'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_nb_terrains INT NULL DEFAULT NULL AFTER terrain_details_json');

  }

  if (!(await columnExists('biens', 'lotissement_prix_total'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_prix_total DECIMAL(12,2) NULL DEFAULT NULL AFTER lotissement_nb_terrains');

  }

  if (!(await columnExists('biens', 'lotissement_mode_prix_m2'))) {

    await pool.query("ALTER TABLE biens ADD COLUMN lotissement_mode_prix_m2 ENUM('m2_unique','paliers') NULL DEFAULT NULL AFTER lotissement_prix_total");

  }

  if (!(await columnExists('biens', 'lotissement_prix_m2_unique'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_prix_m2_unique DECIMAL(12,2) NULL DEFAULT NULL AFTER lotissement_mode_prix_m2');

  }

  if (!(await columnExists('biens', 'lotissement_terrains_json'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_terrains_json LONGTEXT NULL AFTER lotissement_prix_m2_unique');

  }

  if (!(await columnExists('biens', 'lotissement_paliers_prix_m2_json'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_paliers_prix_m2_json LONGTEXT NULL AFTER lotissement_terrains_json');

  }

  if (!(await columnExists('biens', 'immeuble_details_json'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN immeuble_details_json LONGTEXT NULL AFTER terrain_angle');

  }

  if (!(await columnExists('biens', 'immeuble_appartements_json'))) {

    await pool.query('ALTER TABLE biens ADD COLUMN immeuble_appartements_json LONGTEXT NULL AFTER immeuble_details_json');

  }



  await pool.query(

    "ALTER TABLE biens MODIFY COLUMN type ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL"

  );



  if (!(await indexExists('biens', 'idx_biens_mode_type'))) {

    const modeColumn = (await columnExists('biens', 'mode')) ? 'mode' : 'mode_bien';

    await pool.query(`CREATE INDEX idx_biens_mode_type ON biens (${modeColumn}, type)`);

  }



  await pool.query(`

    CREATE TABLE IF NOT EXISTS caracteristiques (

      id VARCHAR(50) PRIMARY KEY,

      nom VARCHAR(100) NOT NULL UNIQUE,

      type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NOT NULL DEFAULT 'simple',

      choix_json LONGTEXT NULL,

      unite VARCHAR(50) NULL,

      icon_name VARCHAR(50) NULL,

      visibilite_client TINYINT(1) NOT NULL DEFAULT 1,

      INDEX idx_nom (nom)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

  if (!(await columnExists('caracteristiques', 'type_caracteristique'))) {

    await pool.query("ALTER TABLE caracteristiques ADD COLUMN type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NOT NULL DEFAULT 'simple' AFTER nom");

  }

  await pool.query("ALTER TABLE caracteristiques MODIFY COLUMN type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NOT NULL DEFAULT 'simple'");

  if (!(await columnExists('caracteristiques', 'choix_json'))) {

    await pool.query('ALTER TABLE caracteristiques ADD COLUMN choix_json LONGTEXT NULL AFTER type_caracteristique');

  }

  if (!(await columnExists('caracteristiques', 'unite'))) {

    await pool.query('ALTER TABLE caracteristiques ADD COLUMN unite VARCHAR(50) NULL AFTER choix_json');

  }

  if (!(await columnExists('caracteristiques', 'icon_name'))) {

    await pool.query('ALTER TABLE caracteristiques ADD COLUMN icon_name VARCHAR(50) NULL AFTER unite');

  }

  if (!(await columnExists('caracteristiques', 'visibilite_client'))) {

    await pool.query('ALTER TABLE caracteristiques ADD COLUMN visibilite_client TINYINT(1) NOT NULL DEFAULT 1 AFTER icon_name');

  }



  await pool.query(`

    CREATE TABLE IF NOT EXISTS bien_caracteristiques (

      bien_id VARCHAR(50) NOT NULL,

      caracteristique_id VARCHAR(50) NOT NULL,

      visibilite_client TINYINT(1) NULL DEFAULT NULL,

      override_nom VARCHAR(100) NULL,

      override_type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NULL DEFAULT NULL,

      override_unite VARCHAR(50) NULL,

      override_onglet_id VARCHAR(50) NULL,

      override_valeur_json LONGTEXT NULL,

      PRIMARY KEY (bien_id, caracteristique_id),

      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE CASCADE,

      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE,

      INDEX idx_caracteristique_id (caracteristique_id)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

  if (!(await columnExists('bien_caracteristiques', 'visibilite_client'))) {

    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN visibilite_client TINYINT(1) NULL DEFAULT NULL AFTER caracteristique_id');

  }

  if (!(await columnExists('bien_caracteristiques', 'override_nom'))) {

    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_nom VARCHAR(100) NULL AFTER visibilite_client');

  }

  if (!(await columnExists('bien_caracteristiques', 'override_type_caracteristique'))) {

    await pool.query("ALTER TABLE bien_caracteristiques ADD COLUMN override_type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NULL DEFAULT NULL AFTER override_nom");

  }

  await pool.query("ALTER TABLE bien_caracteristiques MODIFY COLUMN override_type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NULL DEFAULT NULL");

  if (!(await columnExists('bien_caracteristiques', 'override_unite'))) {

    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_unite VARCHAR(50) NULL AFTER override_type_caracteristique');

  }

  if (!(await columnExists('bien_caracteristiques', 'override_onglet_id'))) {

    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_onglet_id VARCHAR(50) NULL AFTER override_unite');

  }

  if (!(await columnExists('bien_caracteristiques', 'override_valeur_json'))) {

    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_valeur_json LONGTEXT NULL AFTER override_onglet_id');

  }



  await pool.query(`

    CREATE TABLE IF NOT EXISTS caracteristique_contextes (

      id VARCHAR(50) PRIMARY KEY,

      caracteristique_id VARCHAR(50) NOT NULL,

      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,

      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL,

      onglet_id VARCHAR(50) NULL,

      UNIQUE KEY uq_car_context (caracteristique_id, mode_bien, type_bien),

      INDEX idx_mode_type (mode_bien, type_bien),

      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

  await pool.query(

    "ALTER TABLE caracteristique_contextes MODIFY COLUMN type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL"

  );

  if (!(await columnExists('caracteristique_contextes', 'onglet_id'))) {

    await pool.query('ALTER TABLE caracteristique_contextes ADD COLUMN onglet_id VARCHAR(50) NULL AFTER type_bien');

  }



  await pool.query(`

    CREATE TABLE IF NOT EXISTS caracteristique_onglets (

      id VARCHAR(50) PRIMARY KEY,

      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,

      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL,

      nom VARCHAR(120) NOT NULL,

      ordre INT NOT NULL DEFAULT 0,

      is_system TINYINT(1) NOT NULL DEFAULT 0,

      UNIQUE KEY uq_mode_type_nom (mode_bien, type_bien, nom),

      INDEX idx_mode_type_ordre (mode_bien, type_bien, ordre)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

  await pool.query(

    "ALTER TABLE caracteristique_onglets MODIFY COLUMN type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL"

  );



  await pool.query(`

    CREATE TABLE IF NOT EXISTS modifier_onglets (

      id VARCHAR(50) PRIMARY KEY,

      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,

      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL,

      onglet_id VARCHAR(50) NOT NULL,

      caracteristique_id VARCHAR(50) NOT NULL,

      ordre INT NOT NULL DEFAULT 0,

      UNIQUE KEY uq_modif_onglet_car (mode_bien, type_bien, caracteristique_id),

      INDEX idx_modif_onglet (mode_bien, type_bien, onglet_id, ordre),

      FOREIGN KEY (onglet_id) REFERENCES caracteristique_onglets(id) ON DELETE CASCADE,

      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

  await pool.query(

    "ALTER TABLE modifier_onglets MODIFY COLUMN type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL"

  );



  await pool.query(

    `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)

     SELECT CONCAT('mo_', REPLACE(UUID(), '-', '')), cc.mode_bien, cc.type_bien, cc.onglet_id, cc.caracteristique_id, 0

     FROM caracteristique_contextes cc

     WHERE cc.onglet_id IS NOT NULL AND cc.onglet_id <> ''

     ON DUPLICATE KEY UPDATE onglet_id = VALUES(onglet_id), ordre = VALUES(ordre)`

  );



  const terrainTabsSeeds = [

    ['informations_generales', 'vente', 'terrain', '1. Informations generales', 1, 1],

    ['dimensions_forme', 'vente', 'terrain', '2. Dimensions & forme', 2, 1],

    ['situation_juridique', 'vente', 'terrain', '3. Situation juridique', 3, 1],

    ['acces_environnement', 'vente', 'terrain', '4. Acces & environnement', 4, 1],

    ['viabilisation', 'vente', 'terrain', '5. Viabilisation', 5, 1],

    ['environnement_naturel', 'vente', 'terrain', '6. Environnement naturel', 6, 1],

    ['ideal_utilisation', 'vente', 'terrain', '7. Ideal pour', 7, 1],

    ['documents_disponibles', 'vente', 'terrain', '8. Documents disponibles', 8, 1],

  ];

  for (const [id, mode_bien, type_bien, nom, ordre, is_system] of terrainTabsSeeds) {

    await pool.query(

      `INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)

       VALUES (?, ?, ?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE nom = VALUES(nom), ordre = VALUES(ordre), is_system = VALUES(is_system)`,

      [id, mode_bien, type_bien, nom, ordre, is_system]

    );

  }



  if (!isSiteDbSource) {

    const locationTypesForTabs = ['appartement', 'villa_maison', 'studio', 'bungalow'];

    const locationSeasonTabs = [

      ['informations_generales', 'Informations generales', 20],

      ['localisation_acces', 'Localisation & acces', 30],

      ['caracteristiques', 'Caracteristiques', 40],

      ['lits_couchage', 'Lits & couchage', 50],

      ['confort_equipements_interieurs', 'Conforts & equipements interieurs', 60],

      ['securite_reglement', 'Securite & reglement', 70],

      ['conditions_reservation', 'Conditions de reservation', 80],

      ['accessibilite', 'Accessibilite', 90],

      ['capacite_configuration', 'Capacite & configuration', 100],

      ['cuisine_repas', 'Cuisine & repas', 110],

    ];

    for (const type_bien of locationTypesForTabs) {

      for (const [tabSuffix, tabName, tabOrder] of locationSeasonTabs) {

        const tabId = `ls_${type_bien}_${tabSuffix}`;

        await pool.query(

          `INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)

           VALUES (?, 'location_saisonniere', ?, ?, ?, 1)

           ON DUPLICATE KEY UPDATE nom = VALUES(nom), ordre = VALUES(ordre), is_system = VALUES(is_system)`,

          [tabId, type_bien, tabName, tabOrder]

        );

      }

    }

  }



  await pool.query(`

    INSERT INTO caracteristiques (id, nom) VALUES

      ('car1', 'Piscine'),

      ('car2', 'Garage'),

      ('car3', 'Climatisation'),

      ('car4', 'Vue sur mer'),

      ('car5', 'Jardin'),

      ('car6', 'Wifi'),

      ('car7', 'Ascenseur'),

      ('car8', 'Parking'),

      ('car9', 'Cuisine equipee'),

      ('car10', 'Terrasse'),

      ('car11', 'Proche de la plage'),

      ('car12', 'Chauffage central'),

      ('car13', 'Balcon'),

      ('car14', 'Gaz de ville'),

      ('car15', 'Place parking'),

      ('car16', 'Syndic'),

      ('car17', 'Meuble'),

      ('car18', 'Independant'),

      ('car19', 'Eau puits'),

      ('car20', 'Eau Sonede'),

      ('car21', 'Electricite STEG'),

      ('car22', 'Toilette'),

      ('car23', 'Reserve'),

      ('car24', 'Vitrine'),

      ('car25', 'Coin d angle'),

      ('car26', 'Electricite 3 phases'),

      ('car27', 'Alarme'),

      ('car28', 'Constructible'),

      ('car29', 'Terrain d angle'),

      ('car30', 'Terrain agricole'),

      ('car31', 'Terrain habitation'),

      ('car32', 'Terrain industrielle'),

      ('car33', 'Terrain loisir'),

      ('car34', 'Parking sous-sol'),

      ('car35', 'Parking extÃ©rieur')

    ON DUPLICATE KEY UPDATE nom = VALUES(nom)

  `);



  const contextSeeds = [

    ['ctx1', 'car6', 'vente', 'appartement'],

    ['ctx2', 'car7', 'vente', 'appartement'],

    ['ctx13', 'car3', 'vente', 'appartement'],

    ['ctx14', 'car4', 'vente', 'appartement'],

    ['ctx15', 'car9', 'vente', 'appartement'],

    ['ctx16', 'car10', 'vente', 'appartement'],

    ['ctx17', 'car11', 'vente', 'appartement'],

    ['ctx18', 'car12', 'vente', 'appartement'],

    ['ctx19', 'car13', 'vente', 'appartement'],

    ['ctx20', 'car14', 'vente', 'appartement'],

    ['ctx21', 'car15', 'vente', 'appartement'],

    ['ctx22', 'car16', 'vente', 'appartement'],

    ['ctx23', 'car17', 'vente', 'appartement'],

    ['ctx24', 'car18', 'vente', 'appartement'],

    ['ctx25', 'car19', 'vente', 'appartement'],

    ['ctx26', 'car20', 'vente', 'appartement'],

    ['ctx27', 'car21', 'vente', 'appartement'],

    ['ctx28', 'car14', 'vente', 'local_commercial'],

    ['ctx29', 'car19', 'vente', 'local_commercial'],

    ['ctx30', 'car20', 'vente', 'local_commercial'],

    ['ctx31', 'car21', 'vente', 'local_commercial'],

    ['ctx32', 'car22', 'vente', 'local_commercial'],

    ['ctx33', 'car23', 'vente', 'local_commercial'],

    ['ctx34', 'car24', 'vente', 'local_commercial'],

    ['ctx35', 'car25', 'vente', 'local_commercial'],

    ['ctx36', 'car26', 'vente', 'local_commercial'],

    ['ctx37', 'car27', 'vente', 'local_commercial'],

    ['ctx47', 'car7', 'vente', 'immeuble'],

    ['ctx48', 'car34', 'vente', 'immeuble'],

    ['ctx49', 'car35', 'vente', 'immeuble'],

    ['ctx50', 'car16', 'vente', 'immeuble'],

    ['ctx51', 'car4', 'vente', 'immeuble'],

    ['ctx52', 'car11', 'vente', 'immeuble'],

    ['ctx53', 'car19', 'vente', 'immeuble'],

    ['ctx54', 'car20', 'vente', 'immeuble'],

    ['ctx55', 'car21', 'vente', 'immeuble'],

    ['ctx3', 'car8', 'vente', 'villa_maison'],

    ['ctx4', 'car5', 'vente', 'villa_maison'],

    ['ctx5', 'car6', 'location_saisonniere', 'appartement'],

    ['ctx6', 'car3', 'location_saisonniere', 'appartement'],

    ['ctx7', 'car1', 'location_saisonniere', 'villa_maison'],

    ['ctx8', 'car4', 'location_saisonniere', 'villa_maison'],

    ['ctx9', 'car10', 'location_saisonniere', 'bungalow'],

    ['ctx10', 'car9', 'location_annuelle', 'appartement'],

    ['ctx11', 'car8', 'location_annuelle', 'local_commercial'],

    ['ctx12', 'car3', 'location_annuelle', 'villa_maison'],

  ];



  for (const [id, caracteristiqueId, mode, type] of contextSeeds) {

    await pool.query(

      `INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien)

       VALUES (?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien)`,

      [id, caracteristiqueId, mode, type]

    );

  }



  await pool.query(`

    CREATE TABLE IF NOT EXISTS site_mode_priorities (

      mode ENUM('vente','location_annuelle','location_saisonniere') PRIMARY KEY,

      priority_order INT NOT NULL,

      updated_at DATETIME NOT NULL

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);



  const now = getAgencySqlDateTime();

  await pool.query(

    `INSERT INTO site_mode_priorities (mode, priority_order, updated_at)

     VALUES

       ('location_saisonniere', 1, ?),

       ('vente', 2, ?),

       ('location_annuelle', 3, ?)

     ON DUPLICATE KEY UPDATE

       priority_order = priority_order,

       updated_at = updated_at`,

    [now, now, now]

  );

}



async function readSiteModePriorities() {

  const [rows] = await pool.query(

    'SELECT mode, priority_order FROM site_mode_priorities ORDER BY priority_order ASC, mode ASC'

  );

  const defaults = {

    location_saisonniere: 1,

    vente: 2,

    location_annuelle: 3,

  };

  for (const row of rows || []) {

    const mode = String(row.mode || '').trim();

    const priority = Number(row.priority_order || 0);

    if ((mode === 'vente' || mode === 'location_annuelle' || mode === 'location_saisonniere') && priority > 0) {

      defaults[mode] = priority;

    }

  }

  return defaults;

}



function normalizeSiteModePriorities(input = {}) {

  const modes = ['location_saisonniere', 'vente', 'location_annuelle'];

  const normalized = {};

  for (const mode of modes) {

    normalized[mode] = Number(input?.[mode]);

  }

  const values = modes.map((mode) => normalized[mode]);

  const uniqueValues = new Set(values);

  const isValid = values.every((value) => Number.isInteger(value) && value >= 1 && value <= 3) && uniqueValues.size === 3;

  if (!isValid) {

    return { error: 'Les priorites doivent etre 1, 2 et 3, sans doublon.' };

  }

  return { values: normalized };

}



async function ensureZonesSchema() {

  const hasColumn = async (columnName) => {

    const [rows] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM information_schema.COLUMNS

       WHERE TABLE_SCHEMA = DATABASE()

         AND TABLE_NAME = 'zones'

         AND COLUMN_NAME = ?`,

      [columnName]

    );

    return Number(rows[0]?.total || 0) > 0;

  };

  if (!(await hasColumn('google_maps_url'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN google_maps_url VARCHAR(500) NULL AFTER description');

  }

  if (!(await hasColumn('pays'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN pays VARCHAR(120) NULL AFTER description');

  }

  if (!(await hasColumn('gouvernerat'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN gouvernerat VARCHAR(120) NULL AFTER pays');

  }

  if (!(await hasColumn('region'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN region VARCHAR(120) NULL AFTER gouvernerat');

  }

  if (!(await hasColumn('quartier'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN quartier VARCHAR(160) NULL AFTER region');

  }

  if (!(await hasColumn('image_url'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN image_url VARCHAR(800) NULL AFTER google_maps_url');

  }

  if (!(await hasColumn('pays_image_url'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN pays_image_url VARCHAR(800) NULL AFTER image_url');

  }

  if (!(await hasColumn('gouvernerat_image_url'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN gouvernerat_image_url VARCHAR(800) NULL AFTER pays_image_url');

  }

  if (!(await hasColumn('region_image_url'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN region_image_url VARCHAR(800) NULL AFTER gouvernerat_image_url');

  }

  if (!(await hasColumn('quartier_image_url'))) {

    await pool.query('ALTER TABLE zones ADD COLUMN quartier_image_url VARCHAR(800) NULL AFTER region_image_url');

  }

}



async function ensureProprietairesSchema() {

  const columnExistsLocal = async (tableName, columnName) => {

    const [rows] = await pool.query(

      `

      SELECT 1

      FROM information_schema.COLUMNS

      WHERE TABLE_SCHEMA = DATABASE()

        AND TABLE_NAME = ?

        AND COLUMN_NAME = ?

      LIMIT 1

      `,

      [tableName, columnName]

    );

    return rows.length > 0;

  };



  if (!(await columnExistsLocal('proprietaires', 'email'))) {

    await pool.query('ALTER TABLE proprietaires ADD COLUMN email VARCHAR(100) NULL');

  }



  if (!(await columnExistsLocal('proprietaires', 'cin'))) {

    await pool.query('ALTER TABLE proprietaires ADD COLUMN cin VARCHAR(20) NULL');

  }

}



async function ensurePasskeySchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS user_devices (

      id VARCHAR(80) PRIMARY KEY,

      user_id VARCHAR(50) NOT NULL,

      device_id VARCHAR(120) NOT NULL,

      first_seen_at DATETIME NOT NULL,

      last_seen_at DATETIME NOT NULL,

      user_agent VARCHAR(500) NULL,

      ip VARCHAR(80) NULL,

      metadata_json LONGTEXT NULL,

      UNIQUE KEY uq_user_device (user_id, device_id),

      INDEX idx_user_devices_device (device_id),

      INDEX idx_user_devices_user (user_id)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);



  await pool.query(`

    CREATE TABLE IF NOT EXISTS passkey_credentials (

      id VARCHAR(80) PRIMARY KEY,

      user_id VARCHAR(50) NOT NULL,

      credential_id VARCHAR(255) NOT NULL,

      public_key_base64 LONGTEXT NOT NULL,

      counter BIGINT NOT NULL DEFAULT 0,

      transports_json VARCHAR(255) NULL,

      device_type VARCHAR(30) NULL,

      backed_up TINYINT(1) NOT NULL DEFAULT 0,

      disabled TINYINT(1) NOT NULL DEFAULT 0,

      friendly_name VARCHAR(120) NULL,

      created_at DATETIME NOT NULL,

      last_used_at DATETIME NOT NULL,

      UNIQUE KEY uq_passkey_credential_id (credential_id),

      INDEX idx_passkey_user (user_id),

      INDEX idx_passkey_last_used (last_used_at)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

}



async function bindDeviceToUser(req, userId, metadata = null) {

  const deviceId = String(req?.deviceId || '').trim();

  const normalizedUserId = String(userId || '').trim();

  if (!deviceId || !normalizedUserId) return;

  const now = getAgencySqlDateTime();

  const metadataJson = metadata && typeof metadata === 'object'

    ? JSON.stringify(metadata).slice(0, 5000)

    : null;

  await pool.query(

    `INSERT INTO user_devices (id, user_id, device_id, first_seen_at, last_seen_at, user_agent, ip, metadata_json)

     VALUES (?, ?, ?, ?, ?, ?, ?, ?)

     ON DUPLICATE KEY UPDATE

       last_seen_at = VALUES(last_seen_at),

       user_agent = VALUES(user_agent),

       ip = VALUES(ip),

       metadata_json = VALUES(metadata_json)`,

    [

      `ud_${normalizedUserId}_${deviceId}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80),

      normalizedUserId,

      deviceId,

      now,

      now,

      String(req?.headers?.['user-agent'] || '').trim().slice(0, 500) || null,

      getClientIp(req).slice(0, 80),

      metadataJson,

    ]

  );

}



async function assignAnonymousInteractionsToUser(req, user) {

  const normalizedUserId = String(user?.id || '').trim();

  if (!normalizedUserId) return 0;

  const deviceId = String(req?.deviceId || '').trim();

  const normalizedEmail = normalizeEmailForCompare(user?.email);

  const normalizedName = String(user?.name || '').trim();

  if (!deviceId && !normalizedEmail) return 0;



  const [result] = await pool.query(

    `UPDATE client_interactions

     SET client_user_id = ?,

         client_email = COALESCE(NULLIF(client_email, ''), ?),

         client_name = COALESCE(NULLIF(client_name, ''), ?)

     WHERE source = 'site_public'

       AND (client_user_id IS NULL OR client_user_id = '')

       AND (

         (device_id = ? AND ? <> '')

         OR (LOWER(TRIM(client_email)) = ? AND ? <> '')

       )`,

    [

      normalizedUserId,

      normalizedEmail || null,

      normalizedName || null,

      deviceId || null,

      deviceId || '',

      normalizedEmail || '',

      normalizedEmail || '',

    ]

  );

  return Number(result?.affectedRows || 0);

}



async function getPasskeyRowsForUser(userId) {

  const normalizedUserId = String(userId || '').trim();

  if (!normalizedUserId) return [];

  const [rows] = await pool.query(

    `SELECT id, user_id, credential_id, public_key_base64, counter, transports_json, device_type, backed_up, disabled, friendly_name

     FROM passkey_credentials

     WHERE user_id = ? AND disabled = 0`,

    [normalizedUserId]

  );

  return Array.isArray(rows) ? rows : [];

}



async function getPasskeyRowsForDevice(deviceId) {

  const normalizedDeviceId = String(deviceId || '').trim();

  if (!normalizedDeviceId) return [];

  const [rows] = await pool.query(

    `SELECT

       pc.id,

       pc.user_id,

       pc.credential_id,

       pc.public_key_base64,

       pc.counter,

       pc.transports_json,

       pc.device_type,

       pc.backed_up,

       pc.disabled,

       pc.friendly_name

     FROM passkey_credentials pc

     INNER JOIN user_devices ud ON ud.user_id = pc.user_id

     WHERE ud.device_id = ?

       AND pc.disabled = 0`,

    [normalizedDeviceId]

  );

  return Array.isArray(rows) ? rows : [];

}



async function enrichBiensWithCaracteristiques(rows) {

  const baseRows = Array.isArray(rows) ? rows : [];

  if (baseRows.length === 0) return baseRows;



  const bienIds = baseRows

    .map((row) => String(row?.id || '').trim())

    .filter(Boolean);

  if (bienIds.length === 0) return baseRows;



  const placeholders = bienIds.map(() => '?').join(',');

  const [featureRows] = await pool.query(

    `SELECT

       bc.bien_id,

       bc.caracteristique_id,

       COALESCE(bc.override_nom, c.nom) AS nom_affiche,

       COALESCE(bc.visibilite_client, c.visibilite_client, 1) AS visibilite_client,

       bc.override_valeur_json

     FROM bien_caracteristiques bc

     LEFT JOIN caracteristiques c ON c.id = bc.caracteristique_id

     WHERE bc.bien_id IN (${placeholders})

     ORDER BY bc.bien_id, bc.caracteristique_id`,

    bienIds

  );



  const byBienId = new Map();

  for (const featureRow of Array.isArray(featureRows) ? featureRows : []) {

    const bienId = String(featureRow?.bien_id || '').trim();

    const caracteristiqueId = String(featureRow?.caracteristique_id || '').trim();

    if (!bienId || !caracteristiqueId) continue;

    const current = byBienId.get(bienId) || {

      ids: [],

      idsSet: new Set(),

      noms: [],

      nomsAvecValeurs: [],

      valeurs: {},

    };

    if (!current.idsSet.has(caracteristiqueId)) {

      current.idsSet.add(caracteristiqueId);

      current.ids.push(caracteristiqueId);

    }



    const visibleClient = Number(featureRow?.visibilite_client ?? 1) !== 0;

    const nomAffiche = String(featureRow?.nom_affiche || '').trim();

    let parsedValue = null;

    let hasParsedValue = false;

    const rawValue = featureRow?.override_valeur_json;

    if (rawValue !== null && rawValue !== undefined && String(rawValue).trim().length > 0) {

      try {

        parsedValue = JSON.parse(String(rawValue));

        hasParsedValue = true;

        current.valeurs[caracteristiqueId] = parsedValue;

      } catch {

        // ignore malformed persisted value

      }

    }



    if (visibleClient && nomAffiche) {

      current.noms.push(nomAffiche);

      if (hasParsedValue) {

        if (Array.isArray(parsedValue)) {

          const normalized = parsedValue.map((item) => String(item || '').trim()).filter(Boolean);

          if (normalized.length > 0) {

            current.nomsAvecValeurs.push(`${nomAffiche}: ${normalized.join(', ')}`);

          } else {

            current.nomsAvecValeurs.push(nomAffiche);

          }

        } else {

          const normalized = String(parsedValue ?? '').trim();

          current.nomsAvecValeurs.push(normalized ? `${nomAffiche}: ${normalized}` : nomAffiche);

        }

      } else {

        current.nomsAvecValeurs.push(nomAffiche);

      }

    }



    byBienId.set(bienId, current);

  }



  return baseRows.map((row) => {

    const bienId = String(row?.id || '').trim();

    const data = byBienId.get(bienId);

    if (!data) {

      return {

        ...row,

        caracteristique_ids_list: null,

        caracteristiques_list: null,

        caracteristiques_with_values_list: null,

        caracteristique_valeurs_json: null,

      };

    }

    return {

      ...row,

      caracteristique_ids_list: data.ids.length > 0 ? data.ids.join('||') : null,

      caracteristiques_list: data.noms.length > 0 ? data.noms.join('||') : null,

      caracteristiques_with_values_list: data.nomsAvecValeurs.length > 0 ? data.nomsAvecValeurs.join('||') : null,

      caracteristique_valeurs_json: Object.keys(data.valeurs).length > 0 ? JSON.stringify(data.valeurs) : null,

    };

  });

}



async function ensureMessengerSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS messenger_contacts (

      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

      page_psid VARCHAR(64) NOT NULL,

      page_id VARCHAR(64) NULL,

      last_ref VARCHAR(512) NULL,

      last_property_url VARCHAR(500) NULL,

      last_property_title VARCHAR(255) NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      PRIMARY KEY (id),

      UNIQUE KEY uniq_messenger_psid (page_psid),

      KEY idx_messenger_updated_at (updated_at)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

}



async function upsertSocialUser({ email, name, avatar, provider, providerUserId }) {

  const userId = `u${Date.now()}`;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const safeAvatar = resolveSocialAvatarUrl({ provider, providerUserId, avatar });



  await pool.query(

    `INSERT INTO utilisateurs (id, nom, email, role, avatar, created_at, auth_provider, provider_user_id, last_login_at, updated_at)

     VALUES (?, ?, ?, 'user', ?, CURDATE(), ?, ?, ?, ?) AS new_user

     ON DUPLICATE KEY UPDATE

       nom = new_user.nom,

       avatar = new_user.avatar,

       auth_provider = new_user.auth_provider,

       provider_user_id = new_user.provider_user_id,

       last_login_at = new_user.last_login_at,

       updated_at = new_user.updated_at`,

    [userId, name, email.toLowerCase(), safeAvatar, provider, providerUserId || null, now, now]

  );



  const [rows] = await pool.query(

    `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type,

            auth_provider, provider_user_id, last_login_at, updated_at

     FROM utilisateurs

     WHERE email = ? LIMIT 1`,

    [email.toLowerCase()]

  );

  if (!rows[0]) return null;

  return {

    id: rows[0].id,

    email: rows[0].email,

    name: rows[0].nom,

    role: rows[0].role,

    avatar: rows[0].avatar || null,

    clientType: rows[0].client_type || null,

    telephone: rows[0].telephone || null,

    cin: rows[0].cin || null,

    cinImageUrl: rows[0].cin_image_url || null,

    authProvider: rows[0].auth_provider,

    providerUserId: rows[0].provider_user_id || null,

    lastLoginAt: rows[0].last_login_at || null,

    updatedAt: rows[0].updated_at || null,

    profileCompleted: isLegalIdentityProfileCompleted(rows[0]),

  };

}



function normalizePhoneNumber(value) {

  const raw = String(value || '').trim();

  if (!raw) return '';

  const hasPlus = raw.startsWith('+');

  const digits = raw.replace(/\D/g, '');

  if (!digits) return '';

  return `${hasPlus ? '+' : ''}${digits}`;

}



function splitFullName(fullName) {

  const normalized = String(fullName || '').replace(/\s+/g, ' ').trim();

  if (!normalized) return { firstName: '', lastName: '' };

  const parts = normalized.split(' ');

  if (parts.length === 1) return { firstName: parts[0], lastName: '' };

  return {

    firstName: parts.slice(0, -1).join(' '),

    lastName: parts.slice(-1).join(''),

  };

}



function normalizeAvatarUrl(rawAvatar, maxLength = 1024) {

  const value = String(rawAvatar || '').trim();

  if (!value) return null;

  return value.length > maxLength ? value.slice(0, maxLength) : value;

}



function resolveSocialAvatarUrl({ provider, providerUserId, avatar }) {

  const normalizedProvider = String(provider || '').trim().toLowerCase();

  const socialId = String(providerUserId || '').trim();

  if (normalizedProvider === 'facebook' && socialId) {

    // Stable URL that avoids signed CDN links expiring or returning 403.

    return `https://graph.facebook.com/${encodeURIComponent(socialId)}/picture?type=large`;

  }

  return normalizeAvatarUrl(avatar);

}



function isLegalIdentityProfileCompleted(user) {

  const fullName = String(user?.nom || user?.name || '').trim();

  const phone = String(user?.telephone || '').trim();

  const clientType = String(user?.client_type || user?.clientType || '').trim().toLowerCase();

  const profileCompletedAt = String(user?.profile_completed_at || '').trim();

  const hasValidClientType = ['proprietaire', 'locataire', 'acheteur'].includes(clientType);

  return Boolean(fullName && phone && hasValidClientType && profileCompletedAt);

}



function buildPhonePlaceholderEmail(phone) {

  const digits = String(phone || '').replace(/\D/g, '');

  return `phone_${digits || Date.now()}@phone.dwira.local`;

}



function maskPhone(phone) {

  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length <= 4) return digits;

  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;

}



async function upsertPhoneUser({ telephone }) {

  const normalizedPhone = normalizePhoneNumber(telephone);

  const now = getAgencySqlDateTime();

  const [existingRows] = await pool.query(

    `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type,

            auth_provider, provider_user_id, last_login_at, updated_at

     FROM utilisateurs

     WHERE telephone = ?

     LIMIT 1`,

    [normalizedPhone]

  );



  if (existingRows[0]) {

    await pool.query(

      `UPDATE utilisateurs

       SET auth_provider = 'phone',

           provider_user_id = ?,

           last_login_at = ?,

           updated_at = ?

       WHERE id = ?`,

      [normalizedPhone.replace(/\D/g, ''), now, now, existingRows[0].id]

    );

    return {

      id: existingRows[0].id,

      email: existingRows[0].email,

      name: existingRows[0].nom,

      role: existingRows[0].role,

      avatar: existingRows[0].avatar || null,

      clientType: existingRows[0].client_type || null,

      telephone: existingRows[0].telephone || null,

      cin: existingRows[0].cin || null,

      cinImageUrl: existingRows[0].cin_image_url || null,

      profileCompleted: isLegalIdentityProfileCompleted(existingRows[0]),

    };

  }



  const userId = `u${Date.now()}`;

  const placeholderEmail = buildPhonePlaceholderEmail(normalizedPhone);

  const displayName = `Client ${maskPhone(normalizedPhone)}`;

  await pool.query(

    `INSERT INTO utilisateurs (

      id, nom, email, role, avatar, telephone, created_at, auth_provider, provider_user_id, last_login_at, updated_at

    ) VALUES (?, ?, ?, 'user', NULL, ?, CURDATE(), 'phone', ?, ?, ?)`,

    [userId, displayName, placeholderEmail, normalizedPhone, normalizedPhone.replace(/\D/g, ''), now, now]

  );



  return {

    id: userId,

    email: placeholderEmail,

    name: displayName,

    role: 'user',

    avatar: null,

    clientType: null,

    telephone: normalizedPhone,

    cin: null,

    cinImageUrl: null,

    profileCompleted: false,

  };

}



async function upsertEmailOtpUser({ email }) {

  const normalizedEmail = String(email || '').trim().toLowerCase();

  const now = getAgencySqlDateTime();

  const [existingRows] = await pool.query(

    `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type

     FROM utilisateurs

     WHERE email = ?

     LIMIT 1`,

    [normalizedEmail]

  );



  if (existingRows[0]) {

    await pool.query(

      `UPDATE utilisateurs

       SET auth_provider = 'email',

           provider_user_id = ?,

           last_login_at = ?,

           updated_at = ?

       WHERE id = ?`,

      [normalizedEmail, now, now, existingRows[0].id]

    );

    return {

      id: existingRows[0].id,

      email: existingRows[0].email,

      name: existingRows[0].nom,

      role: existingRows[0].role,

      avatar: existingRows[0].avatar || null,

      clientType: existingRows[0].client_type || null,

      telephone: existingRows[0].telephone || null,

      cin: existingRows[0].cin || null,

      cinImageUrl: existingRows[0].cin_image_url || null,

      profileCompleted: isLegalIdentityProfileCompleted(existingRows[0]),

    };

  }



  const userId = `u${Date.now()}`;

  const displayName = normalizedEmail.split('@')[0] || 'Client';

  await pool.query(

    `INSERT INTO utilisateurs (

      id, nom, email, role, avatar, created_at, auth_provider, provider_user_id, last_login_at, updated_at

    ) VALUES (?, ?, ?, 'user', NULL, CURDATE(), 'email', ?, ?, ?)`,

    [userId, displayName, normalizedEmail, normalizedEmail, now, now]

  );



  return {

    id: userId,

    email: normalizedEmail,

    name: displayName,

    role: 'user',

    avatar: null,

    clientType: null,

    telephone: null,

    cin: null,

    cinImageUrl: null,

    profileCompleted: false,

  };

}



function createSmtpTransporter() {

  const host = String(process.env.SMTP_HOST || '').trim();

  const port = Number(process.env.SMTP_PORT || 587);

  const user = String(process.env.SMTP_USER || '').trim();

  const pass = String(process.env.SMTP_PASS || '').trim();

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({

    host,

    port,

    secure: port === 465,

    auth: { user, pass },

  });

}



async function deliverEmailOtp({ email, code }) {

  const transporter = createSmtpTransporter();

  const fromAddress = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();

  if (transporter && fromAddress) {

    await transporter.sendMail({

      from: fromAddress,

      to: email,

      subject: 'Code OTP Dwira Immobilier',

      text: `Votre code OTP Dwira Immobilier est ${code}. Il expire dans 5 minutes.`,

      html: `<div style="font-family:Arial,sans-serif;line-height:1.5">

        <h2>Dwira Immobilier</h2>

        <p>Votre code OTP est :</p>

        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>

        <p>Ce code expire dans 5 minutes.</p>

      </div>`,

    });

    return { delivered: true, debugCode: null };

  }

  if (process.env.ALLOW_EMAIL_OTP_IN_RESPONSE === '1') {

    console.log(`Email OTP fallback for ${email}: ${code}`);

    return { delivered: false, debugCode: code };

  }

  throw new Error('email_otp_provider_missing');

}



async function deliverReservationClientUpdateEmail({

  toEmail,

  clientName,

  demandId,

  bienTitle,

  startDate,

  endDate,

  decisionLabel,

  note,

}) {

  const email = String(toEmail || '').trim().toLowerCase();

  if (!email) return { delivered: false, reason: 'missing_email' };

  const transporter = createSmtpTransporter();

  const fromAddress = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();

  if (!transporter || !fromAddress) return { delivered: false, reason: 'smtp_missing' };



  const safeClient = String(clientName || '').trim() || 'Client';

  const safeBien = String(bienTitle || 'votre demande').trim();

  const safeStart = String(startDate || '').trim();

  const safeEnd = String(endDate || '').trim();

  const safeDecision = String(decisionLabel || 'Mise a jour').trim();

  const safeNote = String(note || '').trim();



  await transporter.sendMail({

    from: fromAddress,

    to: email,

    subject: `Dwira Immobilier - ${safeDecision}`,

    text: [

      `Bonjour ${safeClient},`,

      '',

      `Votre demande (${demandId}) concernant ${safeBien} a ete mise a jour: ${safeDecision}.`,

      safeStart && safeEnd ? `Periode: ${safeStart} -> ${safeEnd}` : '',

      safeNote ? `Message admin: ${safeNote}` : '',

      '',

      'Connectez-vous a votre espace Dwira pour les details.',

    ].filter(Boolean).join('\n'),

    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">

      <h2 style="margin:0 0 10px 0">Dwira Immobilier</h2>

      <p>Bonjour <strong>${escapeHtml(safeClient)}</strong>,</p>

      <p>Votre demande <strong>${escapeHtml(demandId)}</strong> concernant <strong>${escapeHtml(safeBien)}</strong> a ete mise a jour:</p>

      <p style="font-size:16px"><strong>${escapeHtml(safeDecision)}</strong></p>

      ${safeStart && safeEnd ? `<p>Periode: ${escapeHtml(safeStart)} -> ${escapeHtml(safeEnd)}</p>` : ''}

      ${safeNote ? `<p>Message admin: ${escapeHtml(safeNote)}</p>` : ''}

      <p>Connectez-vous a votre espace Dwira pour plus de details.</p>

    </div>`,

  });

  return { delivered: true, reason: null };

}



async function deliverPhoneOtp({ telephone, code }) {

  const webhookUrl = String(process.env.OTP_PROVIDER_WEBHOOK_URL || '').trim();

  if (webhookUrl) {

    const webhookSecret = String(process.env.OTP_PROVIDER_WEBHOOK_SECRET || '').trim();

    const response = await fetch(webhookUrl, {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

        ...(webhookSecret ? { 'x-webhook-secret': webhookSecret } : {}),

      },

      body: JSON.stringify({

        telephone,

        code,

        brand: 'Dwira Immobilier',

        message: `Votre code OTP Dwira Immobilier est ${code}. Il expire dans 5 minutes.`,

      }),

    });

    if (!response.ok) {

      throw new Error('OTP provider request failed');

    }

    return { delivered: true, debugCode: null };

  }



  if (process.env.ALLOW_OTP_IN_RESPONSE === '1') {

    console.log(`OTP fallback for ${telephone}: ${code}`);

    return { delivered: false, debugCode: code };

  }



  throw new Error('otp_provider_missing');

}



async function ensureClientInteractionsSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS client_interactions (

      id VARCHAR(80) PRIMARY KEY,

      client_user_id VARCHAR(50) NULL,

      client_email VARCHAR(100) NULL,

      client_name VARCHAR(150) NULL,

      type VARCHAR(40) NOT NULL,

      bien_id VARCHAR(50) NULL,

      property_title VARCHAR(255) NULL,

      source ENUM('site_public', 'admin') NOT NULL DEFAULT 'site_public',

      device_id VARCHAR(120) NULL,

      session_id VARCHAR(120) NULL,

      path VARCHAR(500) NULL,

      metadata_json LONGTEXT NULL,

      event_at DATETIME NOT NULL,

      created_at DATETIME NOT NULL,

      INDEX idx_client_interactions_user (client_user_id),

      INDEX idx_client_interactions_email (client_email),

      INDEX idx_client_interactions_bien (bien_id),

      INDEX idx_client_interactions_device (device_id),

      INDEX idx_client_interactions_type (type),

      INDEX idx_client_interactions_event_at (event_at)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);



  const [typeColumnRows] = await pool.query(

    `SELECT COLUMN_TYPE AS column_type

     FROM information_schema.COLUMNS

     WHERE TABLE_SCHEMA = DATABASE()

       AND TABLE_NAME = 'client_interactions'

       AND COLUMN_NAME = 'type'

     LIMIT 1`

  );

  const typeColumnType = String(typeColumnRows?.[0]?.column_type || '').toLowerCase();

  if (typeColumnType.includes('enum(')) {

    await pool.query('ALTER TABLE client_interactions MODIFY COLUMN type VARCHAR(40) NOT NULL');

  }



  const [bienNullableRows] = await pool.query(

    `SELECT IS_NULLABLE AS is_nullable

     FROM information_schema.COLUMNS

     WHERE TABLE_SCHEMA = DATABASE()

       AND TABLE_NAME = 'client_interactions'

       AND COLUMN_NAME = 'bien_id'

     LIMIT 1`

  );

  if (String(bienNullableRows?.[0]?.is_nullable || '').toUpperCase() !== 'YES') {

    await pool.query('ALTER TABLE client_interactions MODIFY COLUMN bien_id VARCHAR(50) NULL');

  }



  const ensureColumn = async (columnName, ddl) => {

    const [rows] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM information_schema.COLUMNS

       WHERE TABLE_SCHEMA = DATABASE()

         AND TABLE_NAME = 'client_interactions'

         AND COLUMN_NAME = ?`,

      [columnName]

    );

    if (Number(rows?.[0]?.total || 0) > 0) return;

    await pool.query(`ALTER TABLE client_interactions ADD COLUMN ${ddl}`);

  };



  await ensureColumn('device_id', 'device_id VARCHAR(120) NULL AFTER source');

  await ensureColumn('session_id', 'session_id VARCHAR(120) NULL AFTER device_id');

  await ensureColumn('path', 'path VARCHAR(500) NULL AFTER session_id');

  await ensureColumn('metadata_json', 'metadata_json LONGTEXT NULL AFTER path');



  const ensureIndex = async (indexName, ddl) => {

    const [rows] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM information_schema.STATISTICS

       WHERE TABLE_SCHEMA = DATABASE()

         AND TABLE_NAME = 'client_interactions'

         AND INDEX_NAME = ?`,

      [indexName]

    );

    if (Number(rows?.[0]?.total || 0) > 0) return;

    await pool.query(`CREATE INDEX ${indexName} ON client_interactions (${ddl})`);

  };

  await ensureIndex('idx_client_interactions_device', 'device_id');

  await ensureIndex('idx_client_interactions_type', 'type');

}



async function ensureClientelesSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS clienteles_profiles (

      id VARCHAR(80) PRIMARY KEY,

      source_table ENUM('utilisateurs', 'locataires', 'proprietaires') NOT NULL,

      source_id VARCHAR(50) NOT NULL,

      linked_user_id VARCHAR(50) NULL,

      email VARCHAR(100) NULL,

      global_status ENUM('prospect', 'actif', 'inactif', 'blackliste') NOT NULL DEFAULT 'prospect',

      score_override INT NULL,

      canal_entree ENUM('facebook', 'site_web', 'whatsapp', 'visite_agence', 'recommandation', 'google', 'autre') NULL,

      last_interaction_at DATETIME NULL,

      last_interaction_note TEXT NULL,

      active_roles_json LONGTEXT NULL,

      vip TINYINT(1) NOT NULL DEFAULT 0,

      blacklist_reason TEXT NULL,

      locataire_status ENUM('prospect', 'verification', 'actif', 'incident', 'archive', 'blackliste') NULL,

      loc_cin_validee TINYINT(1) NOT NULL DEFAULT 0,

      loc_contrat_signe TINYINT(1) NOT NULL DEFAULT 0,

      loc_depot_encaisse TINYINT(1) NOT NULL DEFAULT 0,

      loc_justificatif_revenus TINYINT(1) NOT NULL DEFAULT 0,

      loc_attestation_travail TINYINT(1) NOT NULL DEFAULT 0,

      loc_nb_personnes INT NULL,

      loc_jour_echeance INT NULL,

      loc_penalite_mode ENUM('jour', 'mois') NULL,

      loc_penalite_valeur DECIMAL(10,2) NULL,

      saison_min_nuits INT NULL,

      saison_max_nuits INT NULL,

      saison_capacite_max INT NULL,

      saison_jours_arrivee_json LONGTEXT NULL,

      saison_jours_depart_json LONGTEXT NULL,

      saison_acompte_pourcentage DECIMAL(5,2) NULL,

      saison_documents_recus TINYINT(1) NOT NULL DEFAULT 0,

      saison_depot_bloque TINYINT(1) NOT NULL DEFAULT 0,

      saison_depot_retenu_montant DECIMAL(10,2) NULL,

      saison_depot_retenu_motif TEXT NULL,

      acheteur_status ENUM('lead_brut', 'qualifie', 'recherche', 'visite_planifiee', 'offre_en_cours', 'compromis_signe', 'vendu', 'perdu') NULL,

      acheteur_zones_json LONGTEXT NULL,

      acheteur_types_json LONGTEXT NULL,

      acheteur_budget_min DECIMAL(12,2) NULL,

      acheteur_budget_max DECIMAL(12,2) NULL,

      acheteur_surface_min DECIMAL(10,2) NULL,

      acheteur_distance_plage_max INT NULL,

      acheteur_financement_mode VARCHAR(120) NULL,

      acheteur_next_action ENUM('rappeler', 'envoyer_offres', 'programmer_visite') NULL,

      acheteur_action_due_at DATETIME NULL,

      proprietaire_status ENUM('prospect', 'mandat_location', 'mandat_vente', 'actif', 'inactif', 'blackliste') NULL,

      proprietaire_mandat_type ENUM('gestion_locative', 'vente') NULL,

      proprietaire_mandat_start DATE NULL,

      proprietaire_mandat_end DATE NULL,

      proprietaire_reversement_frequence ENUM('mensuel', 'trimestriel') NULL,

      proprietaire_mode_paiement ENUM('virement', 'especes', 'cheque') NULL,

      proprietaire_commission_percent DECIMAL(5,2) NULL DEFAULT 10.00,

      proprietaire_plafond_travaux DECIMAL(10,2) NULL DEFAULT 200.00,

      proprietaire_last_statement_at DATE NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      UNIQUE KEY uq_clienteles_source (source_table, source_id),

      INDEX idx_clienteles_email (email),

      INDEX idx_clienteles_linked_user (linked_user_id),

      INDEX idx_clienteles_global_status (global_status)

    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

  `);

}



function parseJsonArrayField(value) {

  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);

  if (typeof value !== 'string' || !value.trim()) return [];

  try {

    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];

  } catch {

    return [];

  }

}



function parseBooleanFlag(value) {

  return value === true || value === 1 || value === '1';

}



function normalizeClienteleProfileRow(row) {

  if (!row) return null;

  return {

    id: row.id,

    sourceTable: row.source_table,

    sourceId: row.source_id,

    linkedUserId: row.linked_user_id || null,

    email: row.email || '',

    globalStatus: row.global_status || 'prospect',

    scoreOverride: row.score_override === null || row.score_override === undefined ? null : Number(row.score_override),

    canalEntree: row.canal_entree || null,

    lastInteractionAt: row.last_interaction_at || null,

    lastInteractionNote: row.last_interaction_note || '',

    activeRoles: parseJsonArrayField(row.active_roles_json),

    vip: parseBooleanFlag(row.vip),

    blacklistReason: row.blacklist_reason || '',

    locataireStatus: row.locataire_status || null,

    locCinValidee: parseBooleanFlag(row.loc_cin_validee),

    locContratSigne: parseBooleanFlag(row.loc_contrat_signe),

    locDepotEncaisse: parseBooleanFlag(row.loc_depot_encaisse),

    locJustificatifRevenus: parseBooleanFlag(row.loc_justificatif_revenus),

    locAttestationTravail: parseBooleanFlag(row.loc_attestation_travail),

    locNbPersonnes: row.loc_nb_personnes === null || row.loc_nb_personnes === undefined ? null : Number(row.loc_nb_personnes),

    locJourEcheance: row.loc_jour_echeance === null || row.loc_jour_echeance === undefined ? null : Number(row.loc_jour_echeance),

    locPenaliteMode: row.loc_penalite_mode || null,

    locPenaliteValeur: row.loc_penalite_valeur === null || row.loc_penalite_valeur === undefined ? null : Number(row.loc_penalite_valeur),

    saisonMinNuits: row.saison_min_nuits === null || row.saison_min_nuits === undefined ? null : Number(row.saison_min_nuits),

    saisonMaxNuits: row.saison_max_nuits === null || row.saison_max_nuits === undefined ? null : Number(row.saison_max_nuits),

    saisonCapaciteMax: row.saison_capacite_max === null || row.saison_capacite_max === undefined ? null : Number(row.saison_capacite_max),

    saisonJoursArrivee: parseJsonArrayField(row.saison_jours_arrivee_json),

    saisonJoursDepart: parseJsonArrayField(row.saison_jours_depart_json),

    saisonAcomptePourcentage: row.saison_acompte_pourcentage === null || row.saison_acompte_pourcentage === undefined ? null : Number(row.saison_acompte_pourcentage),

    saisonDocumentsRecus: parseBooleanFlag(row.saison_documents_recus),

    saisonDepotBloque: parseBooleanFlag(row.saison_depot_bloque),

    saisonDepotRetenuMontant: row.saison_depot_retenu_montant === null || row.saison_depot_retenu_montant === undefined ? null : Number(row.saison_depot_retenu_montant),

    saisonDepotRetenuMotif: row.saison_depot_retenu_motif || '',

    acheteurStatus: row.acheteur_status || null,

    acheteurZones: parseJsonArrayField(row.acheteur_zones_json),

    acheteurTypes: parseJsonArrayField(row.acheteur_types_json),

    acheteurBudgetMin: row.acheteur_budget_min === null || row.acheteur_budget_min === undefined ? null : Number(row.acheteur_budget_min),

    acheteurBudgetMax: row.acheteur_budget_max === null || row.acheteur_budget_max === undefined ? null : Number(row.acheteur_budget_max),

    acheteurSurfaceMin: row.acheteur_surface_min === null || row.acheteur_surface_min === undefined ? null : Number(row.acheteur_surface_min),

    acheteurDistancePlageMax: row.acheteur_distance_plage_max === null || row.acheteur_distance_plage_max === undefined ? null : Number(row.acheteur_distance_plage_max),

    acheteurFinancementMode: row.acheteur_financement_mode || '',

    acheteurNextAction: row.acheteur_next_action || null,

    acheteurActionDueAt: row.acheteur_action_due_at || null,

    proprietaireStatus: row.proprietaire_status || null,

    proprietaireMandatType: row.proprietaire_mandat_type || null,

    proprietaireMandatStart: row.proprietaire_mandat_start || null,

    proprietaireMandatEnd: row.proprietaire_mandat_end || null,

    proprietaireReversementFrequence: row.proprietaire_reversement_frequence || null,

    proprietaireModePaiement: row.proprietaire_mode_paiement || null,

    proprietaireCommissionPercent: row.proprietaire_commission_percent === null || row.proprietaire_commission_percent === undefined ? null : Number(row.proprietaire_commission_percent),

    proprietairePlafondTravaux: row.proprietaire_plafond_travaux === null || row.proprietaire_plafond_travaux === undefined ? null : Number(row.proprietaire_plafond_travaux),

    proprietaireLastStatementAt: row.proprietaire_last_statement_at || null,

    createdAt: row.created_at,

    updatedAt: row.updated_at,

  };

}



async function fetchClienteleProfileBySource(sourceTable, sourceId) {

  const [rows] = await pool.query(

    'SELECT * FROM clienteles_profiles WHERE source_table = ? AND source_id = ? LIMIT 1',

    [sourceTable, String(sourceId || '').trim()]

  );

  return normalizeClienteleProfileRow(rows?.[0] || null);

}



async function resolvePublicationVisibilityFromOwner(resolvedVisibleSurSite, proprietaireId, mode) {

  if (resolvedVisibleSurSite !== 1) return 0;

  const normalizedProprietaireId = String(proprietaireId || '').trim();

  if (!normalizedProprietaireId) return resolvedVisibleSurSite;

  try {

    const ownerProfile = await fetchClienteleProfileBySource('proprietaires', normalizedProprietaireId);

    return isMandatValidForMode(ownerProfile, mode) ? 1 : 0;

  } catch (error) {

    console.warn('Failed to validate proprietor mandat for publish, keeping bien hidden:', error?.message || error);

    return 0;

  }

}



function isMandatValidForMode(profile, mode) {

  if (!profile) return false;

  const now = new Date().toISOString().split('T')[0];

  const start = profile.proprietaireMandatStart || null;

  const end = profile.proprietaireMandatEnd || null;

  const mandatType = profile.proprietaireMandatType || null;

  const typeMatches = mode === 'vente' ? mandatType === 'vente' : mandatType === 'gestion_locative';

  if (!typeMatches) return false;

  if (!start || start > now) return false;

  if (end && end < now) return false;

  return true;

}



function scoreBuyerMatch(profile, bien) {

  if (!profile || !bien) return { score: 0, reasons: [] };

  let score = 0;

  const reasons = [];

  const budgetMin = profile.acheteurBudgetMin == null ? null : Number(profile.acheteurBudgetMin);

  const budgetMax = profile.acheteurBudgetMax == null ? null : Number(profile.acheteurBudgetMax);

  const surfaceMin = profile.acheteurSurfaceMin == null ? null : Number(profile.acheteurSurfaceMin);

  const distancePlageMax = profile.acheteurDistancePlageMax == null ? null : Number(profile.acheteurDistancePlageMax);

  const wantedTypes = Array.isArray(profile.acheteurTypes) ? profile.acheteurTypes.map((item) => String(item).trim()).filter(Boolean) : [];

  const wantedZones = Array.isArray(profile.acheteurZones) ? profile.acheteurZones.map((item) => normalizeText(item)).filter(Boolean) : [];

  const bienTitle = String(bien.titre || '');

  const bienType = String(bien.type || '');

  const bienZone = normalizeText(bien.zone_nom || '');

  const bienPrice = Number(bien.prix_nuitee || 0);

  const bienSurface = bien.superficie_m2 == null ? null : Number(bien.superficie_m2);

  const bienDistancePlage = bien.distance_plage_m == null ? null : Number(bien.distance_plage_m);



  if (wantedTypes.length === 0 || wantedTypes.includes(bienType)) {

    score += wantedTypes.length > 0 ? 30 : 10;

    reasons.push(`Type ${bienType || bienTitle}`);

  }

  if (wantedZones.length === 0 || wantedZones.includes(bienZone)) {

    score += wantedZones.length > 0 ? 25 : 10;

    reasons.push(`Zone ${bien.zone_nom || 'compatible'}`);

  }

  if ((budgetMin === null || bienPrice >= budgetMin) && (budgetMax === null || bienPrice <= budgetMax)) {

    score += 25;

    reasons.push('Budget compatible');

  }

  if (surfaceMin === null || (bienSurface !== null && bienSurface >= surfaceMin)) {

    score += 10;

    reasons.push('Surface compatible');

  }

  if (distancePlageMax === null || (bienDistancePlage !== null && bienDistancePlage <= distancePlageMax)) {

    score += 10;

    reasons.push('Distance plage compatible');

  }



  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };

}



const RESERVATION_DEMAND_STATUSES = new Set([

  'en_attente_reponse_proprietaire',

  'pas_de_reponse_proprietaire',

  'reponse_positive_attente_confirmation_client',

  'client_procede_vers_paiement_en_cours',

  'reponse_negative_autre_proposition_meme_bien',

  'reponse_negative_autre_proposition_bien_similaire',

  'attente_validation_amicale',

  'attente_validation_par_agence',

  'voucher_en_cours',

  'rejete_par_amicale',

  'rejete_par_agence',

  'demande_rejetee_admin',

  'demande_annulee_client',

  'attente_envoi_coordonnees_contrat',

  'demande_recu_paiement',

  'recu_paiement_envoye',

  'contrat_realise',

  'succes_paiement',

]);



function normalizeReservationDemandStatus(value) {

  const normalized = String(value || '').trim();

  return RESERVATION_DEMAND_STATUSES.has(normalized) ? normalized : 'en_attente_reponse_proprietaire';

}



function normalizePaymentMode(value, fallback = 'avance') {

  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'totalite' || normalized === 'avance' || normalized === 'amicale') return normalized;

  return fallback;

}



async function appendClientInteraction({

  req,

  clientUserId = null,

  clientEmail = null,

  clientName = null,

  type,

  bienId = null,

  propertyTitle = null,

  source = 'site_public',

  sessionId = null,

  routePath = null,

  metadata = null,

}) {

  const normalizedType = String(type || '').trim().toLowerCase();

  if (!normalizedType) return null;

  const id = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const nowSql = getAgencySqlDateTime();

  const metadataJson = metadata && typeof metadata === 'object' ? JSON.stringify(metadata).slice(0, 10000) : null;

  const normalizedEmail = normalizeEmailForCompare(clientEmail);

  await pool.query(

    `INSERT INTO client_interactions

     (id, client_user_id, client_email, client_name, type, bien_id, property_title, source, device_id, session_id, path, metadata_json, event_at, created_at)

     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

    [

      id,

      clientUserId ? String(clientUserId).trim() : null,

      normalizedEmail || null,

      clientName ? String(clientName).trim() : null,

      normalizedType.slice(0, 40),

      bienId ? String(bienId).trim() : null,

      propertyTitle ? String(propertyTitle).trim() : null,

      source === 'admin' ? 'admin' : 'site_public',

      String(req?.deviceId || '').trim() || null,

      sessionId ? String(sessionId).trim().slice(0, 120) : null,

      routePath ? String(routePath).trim().slice(0, 500) : null,

      metadataJson,

      nowSql,

      nowSql,

    ]

  );

  return {

    id,

    clientUserId: clientUserId ? String(clientUserId).trim() : undefined,

    clientEmail: normalizedEmail || '',

    clientName: clientName ? String(clientName).trim() : undefined,

    type: normalizedType.slice(0, 40),

    bienId: bienId ? String(bienId).trim() : '',

    propertyTitle: propertyTitle ? String(propertyTitle).trim() : '',

    source: source === 'admin' ? 'admin' : 'site_public',

    deviceId: String(req?.deviceId || '').trim() || undefined,

    sessionId: sessionId ? String(sessionId).trim() : undefined,

    path: routePath ? String(routePath).trim() : undefined,

    metadata: metadata && typeof metadata === 'object' ? metadata : undefined,

    dateTime: nowSql,

  };

}



async function upsertLocataireFromReservationProfile({ userId, name, email, telephone, cin }) {

  const normalizedUserId = String(userId || '').trim();

  const normalizedEmail = normalizeEmailForCompare(email);

  const normalizedPhone = normalizePhoneNumber(telephone || '');

  const normalizedName = String(name || '').trim();

  const normalizedCin = String(cin || '').trim();

  if (!normalizedUserId && !normalizedEmail && !normalizedPhone) return null;



  let existingRows = [];

  if (normalizedUserId) {

    const [rowsById] = await pool.query(

      `SELECT id, nom, telephone, email, cin

       FROM locataires

       WHERE id = ?

       LIMIT 1`,

      [normalizedUserId]

    );

    existingRows = rowsById || [];

  }

  if (!existingRows[0]) {

    const [rowsByIdentity] = await pool.query(

      `SELECT id, nom, telephone, email, cin

       FROM locataires

       WHERE (email = ? AND ? <> '') OR (telephone = ? AND ? <> '')

       LIMIT 1`,

      [normalizedEmail, normalizedEmail, normalizedPhone, normalizedPhone]

    );

    existingRows = rowsByIdentity || [];

  }



  if (existingRows[0]) {

    const row = existingRows[0];

    await pool.query(

      `UPDATE locataires

       SET nom = ?, telephone = ?, email = ?, cin = ?

       WHERE id = ?`,

      [

        normalizedName || row.nom || 'Client',

        normalizedPhone || row.telephone || null,

        normalizedEmail || row.email || null,

        normalizedCin || row.cin || null,

        row.id,

      ]

    );

    return row.id;

  }



  const id = (normalizedUserId || `l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).slice(0, 40);

  await pool.query(

    `INSERT INTO locataires (id, nom, telephone, email, cin, score_fiabilite, created_at)

     VALUES (?, ?, ?, ?, ?, ?, ?)`,

    [

      id,

      normalizedName || 'Client',

      normalizedPhone || null,

      normalizedEmail || null,

      normalizedCin || null,

      5,

      getAgencySqlDateTime(),

    ]

  );

  return id;

}



async function ensureAutoContractForDemand(current, actorId = 'client') {

  if (!current || current.contract_id) {

    return { contractId: String(current?.contract_id || '').trim() || null };

  }

  const demandId = String(current.id || '').trim();

  if (!demandId) return { contractId: null };



  const [bienRows] = await pool.query(

    `SELECT b.*, p.nom AS proprietaire_nom, p.email AS proprietaire_email

     FROM biens b

     LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

     WHERE b.id = ? LIMIT 1`,

    [current.bien_id]

  );

  const bien = bienRows?.[0];

  if (!bien) throw new Error('Bien introuvable pour generation automatique du contrat');



  const rawName = String(current.client_name || '').trim();

  const nameParts = rawName.split(/\s+/).filter(Boolean);

  const identityLastName = String(current.identity_last_name || nameParts[0] || 'Client').trim();

  const identityFirstName = String(current.identity_first_name || nameParts.slice(1).join(' ') || 'Dwira').trim();

  const identityDocumentType = String(current.identity_document_type || 'cin_tn').trim();

  const identityDocumentNumber = String(current.identity_document_number || 'N/A').trim();

  const clientEmail = normalizeEmailForCompare(current.client_email || '') || `${demandId}@dwira.local`;



  const locataireId = await upsertLocataireFromReservationProfile({

    userId: current.client_user_id ? String(current.client_user_id).trim() : null,

    name: `${identityLastName} ${identityFirstName}`.trim(),

    email: clientEmail,

    telephone: String(current.amicale_phone || '').trim(),

    cin: identityDocumentType === 'cin_tn' ? identityDocumentNumber : '',

  });



  const now = getAgencySqlDateTime();

  const contractId = `c${Date.now()}`;

  const nights = computeNights(current.start_date, current.end_date);

  const totalAmount = Number.isFinite(Number(current.total_amount)) && Number(current.total_amount) > 0

    ? Number(current.total_amount)

    : (Number(bien.prix_nuitee || 0) * nights);

  const paymentMode = normalizePaymentMode(current.payment_mode, 'avance');

  const amountDueNow = Number.isFinite(Number(current.amount_due_now)) && Number(current.amount_due_now) >= 0

    ? Number(current.amount_due_now)

    : (paymentMode === 'totalite' ? totalAmount : Math.min(totalAmount, Number(bien.avance || 0)));



  const [contractUrl, ownerContractUrl] = await Promise.all([

    generateReservationClientContractHtml({

      demand: current,

      bien,

      contractId,

      contractCreatedAt: now,

      totalAmount,

      amountDueNow,

      paymentMode,

      identityNumber: identityDocumentNumber,

      identityDocumentType,

      identityFirstName,

      identityLastName,

    }),

    generateReservationOwnerContractHtml({

      demand: current,

      bien,

      owner: { nom: bien.proprietaire_nom, email: bien.proprietaire_email },

      contractId,

      contractCreatedAt: now,

      totalAmount,

      amountDueNow,

      paymentMode,

    }),

  ]);



  await pool.query(

    `INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, owner_url_pdf, origine, statut, created_at)

     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

    [contractId, current.bien_id, locataireId, current.start_date, current.end_date, amountDueNow, contractUrl, ownerContractUrl, 'automatique', 'actif', now]

  );



  await pool.query(

    `UPDATE reservation_demands

     SET status = 'contrat_realise',

         contract_id = ?,

         contract_generated_at = ?,

         client_confirmation_clicked_at = COALESCE(client_confirmation_clicked_at, ?),

         identity_document_type = COALESCE(identity_document_type, ?),

         identity_document_number = COALESCE(identity_document_number, ?),

         identity_first_name = COALESCE(identity_first_name, ?),

         identity_last_name = COALESCE(identity_last_name, ?),

         updated_at = ?

     WHERE id = ?`,

    [contractId, now, now, identityDocumentType, identityDocumentNumber, identityFirstName, identityLastName, now, demandId]

  );



  await appendReservationDemandHistory(

    demandId,

    'contrat_realise',

    'client',

    String(actorId || current.client_user_id || current.client_email || 'client'),

    `Contrat ${contractId} genere automatiquement avant paiement`,

    now

  );

  await createAdminNotification(

    'success',

    `Contrat ${contractId} realise pour la demande ${demandId}`,

    now

  );

  return { contractId };

}



async function upsertPasskeyUser({ email, name }) {

  const normalizedEmail = String(email || '').trim().toLowerCase();

  const normalizedName = String(name || '').trim() || normalizedEmail.split('@')[0] || 'Client';

  const now = getAgencySqlDateTime();

  const [existingRows] = await pool.query(

    `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type

     FROM utilisateurs

     WHERE email = ?

     LIMIT 1`,

    [normalizedEmail]

  );



  if (existingRows[0]) {

    await pool.query(

      `UPDATE utilisateurs

       SET auth_provider = 'passkey',

           provider_user_id = ?,

           nom = ?,

           last_login_at = ?,

           updated_at = ?

       WHERE id = ?`,

      [normalizedEmail, normalizedName, now, now, existingRows[0].id]

    );

    return {

      id: existingRows[0].id,

      email: existingRows[0].email,

      name: normalizedName || existingRows[0].nom,

      role: existingRows[0].role,

      avatar: existingRows[0].avatar || null,

      clientType: existingRows[0].client_type || null,

      telephone: existingRows[0].telephone || null,

      cin: existingRows[0].cin || null,

      cinImageUrl: existingRows[0].cin_image_url || null,

      profileCompleted: isLegalIdentityProfileCompleted(existingRows[0]),

    };

  }



  const userId = `u${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await pool.query(

    `INSERT INTO utilisateurs (

      id, nom, email, role, avatar, created_at, auth_provider, provider_user_id, last_login_at, updated_at

    ) VALUES (?, ?, ?, 'user', NULL, CURDATE(), 'passkey', ?, ?, ?)`,

    [userId, normalizedName, normalizedEmail, normalizedEmail, now, now]

  );



  return {

    id: userId,

    email: normalizedEmail,

    name: normalizedName,

    role: 'user',

    avatar: null,

    clientType: null,

    telephone: null,

    cin: null,

    cinImageUrl: null,

    profileCompleted: false,

  };

}



function parseJsonArray(value) {

  if (!value) return [];

  try {

    const parsed = typeof value === 'string' ? JSON.parse(value) : value;

    return Array.isArray(parsed) ? parsed : [];

  } catch {

    return [];

  }

}



const LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FILE = path.resolve(__dirname, '../src/app/data/locationSaisonniereServices.json');



function readSeededPaidServicesCatalogue() {

  try {

    const raw = fs.readFileSync(LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FILE, 'utf8');

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];

  } catch (error) {

    console.warn('Unable to read paid services catalogue seed file:', error.message);

    return [];

  }

}



function normalizePaidServiceTarification(value) {

  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'sur_demande') return 'sur_demande';

  if (normalized === 'a_partir_de') return 'a_partir_de';

  return 'fixe';

}



function parsePaidServiceBasePrice(value) {

  if (typeof value === 'number') return Math.max(0, value);

  const text = String(value || '').replace(',', '.').trim();

  const match = text.match(/(\d+(?:\.\d+)?)/);

  return match ? Math.max(0, Number(match[1])) : 0;

}



function normalizePaidServiceRecord(service, defaults = {}) {

  const label = String(service?.label || defaults.label || '').trim();

  const prixAffiche = String(service?.prix_affiche || defaults.prix_affiche || '').trim();

  return {

    id: String(service?.id || defaults.id || `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),

    categorie: String(service?.categorie || defaults.categorie || 'Services client').trim() || 'Services client',

    label,

    description_courte: String(service?.description_courte || defaults.description_courte || '').trim(),

    prix_affiche: prixAffiche,

    prix: Math.max(0, Number(service?.prix ?? defaults.prix ?? parsePaidServiceBasePrice(prixAffiche))),

    type_tarification: normalizePaidServiceTarification(service?.type_tarification ?? defaults.type_tarification),

    enabled: service?.enabled === undefined ? (defaults.enabled === undefined ? true : defaults.enabled !== false) : service.enabled !== false,

  };

}



let ensurePaidServicesSchemaPromise = null;



async function ensurePaidServicesSchema() {

  if (!ensurePaidServicesSchemaPromise) {

    ensurePaidServicesSchemaPromise = (async () => {

      await pool.query(`

    CREATE TABLE IF NOT EXISTS services_payants_catalogue (

      id VARCHAR(120) NOT NULL PRIMARY KEY,

      categorie VARCHAR(255) NOT NULL,

      label VARCHAR(255) NOT NULL,

      description_courte VARCHAR(500) NULL,

      prix_affiche VARCHAR(255) NULL,

      prix_base DECIMAL(12,2) NOT NULL DEFAULT 0,

      type_tarification ENUM('fixe','sur_demande','a_partir_de') NOT NULL DEFAULT 'fixe',

      enabled TINYINT(1) NOT NULL DEFAULT 1,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL

    )

  `);



      await pool.query(`

    CREATE TABLE IF NOT EXISTS bien_services_payants (

      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,

      bien_id VARCHAR(120) NOT NULL,

      service_catalogue_id VARCHAR(120) NOT NULL,

      categorie_override VARCHAR(255) NULL,

      label_override VARCHAR(255) NULL,

      description_courte_override VARCHAR(500) NULL,

      prix_affiche_override VARCHAR(255) NULL,

      prix_override DECIMAL(12,2) NULL,

      type_tarification_override ENUM('fixe','sur_demande','a_partir_de') NULL,

      enabled TINYINT(1) NOT NULL DEFAULT 1,

      ordre_affichage INT NOT NULL DEFAULT 0,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      UNIQUE KEY uq_bien_service_catalogue (bien_id, service_catalogue_id),

      KEY idx_bien_services_bien (bien_id),

      KEY idx_bien_services_catalogue (service_catalogue_id)

    )

  `);



      const now = getAgencySqlDateTime();

      const seededServices = readSeededPaidServicesCatalogue().map((service) => normalizePaidServiceRecord(service));

      for (const service of seededServices) {

        await pool.query(

      `INSERT INTO services_payants_catalogue (

         id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled, created_at, updated_at

       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE id = id`,

      [service.id, service.categorie, service.label, service.description_courte || null, service.prix_affiche || null, service.prix, service.type_tarification, service.enabled ? 1 : 0, now, now]

    );

      }



      const [bienRows] = await pool.query(

    `SELECT id, location_saisonniere_config_json

     FROM biens

     WHERE mode = 'location_saisonniere'`

  );

      for (const row of bienRows || []) {

        let config = null;

        try {

          config = row.location_saisonniere_config_json

            ? (typeof row.location_saisonniere_config_json === 'string'

              ? JSON.parse(row.location_saisonniere_config_json)

              : row.location_saisonniere_config_json)

            : null;

        } catch {

          config = null;

        }

        const services = Array.isArray(config?.services_payants) ? config.services_payants : [];

        if (services.length === 0) continue;

        for (let index = 0; index < services.length; index += 1) {

          const service = normalizePaidServiceRecord(services[index]);

          await pool.query(

        `INSERT INTO services_payants_catalogue (

           id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled, created_at, updated_at

         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE id = id`,

        [service.id, service.categorie, service.label, service.description_courte || null, service.prix_affiche || null, service.prix, service.type_tarification, service.enabled ? 1 : 0, now, now]

      );

          await pool.query(

        `INSERT INTO bien_services_payants (

           bien_id, service_catalogue_id, categorie_override, label_override, description_courte_override,

           prix_affiche_override, prix_override, type_tarification_override, enabled, ordre_affichage, created_at, updated_at

         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE

           categorie_override = VALUES(categorie_override),

           label_override = VALUES(label_override),

           description_courte_override = VALUES(description_courte_override),

           prix_affiche_override = VALUES(prix_affiche_override),

           prix_override = VALUES(prix_override),

           type_tarification_override = VALUES(type_tarification_override),

           enabled = VALUES(enabled),

           ordre_affichage = VALUES(ordre_affichage),

           updated_at = VALUES(updated_at)`,

        [row.id, service.id, service.categorie, service.label, service.description_courte || null, service.prix_affiche || null, service.prix, service.type_tarification, service.enabled ? 1 : 0, index, now, now]

      );

        }

      }

    })().catch((error) => {

      ensurePaidServicesSchemaPromise = null;

      throw error;

    });

  }

  await ensurePaidServicesSchemaPromise;

}



let ensureBiensWorkflowSchemaSafePromise = null;

async function ensureBiensWorkflowSchemaSafe() {

  if (!ensureBiensWorkflowSchemaSafePromise) {

    ensureBiensWorkflowSchemaSafePromise = (async () => {

      let lastError = null;

      for (let attempt = 1; attempt <= 4; attempt += 1) {

        try {

          await ensureBiensWorkflowSchema();

          return;

        } catch (error) {

          lastError = error;

          const code = String(error?.code || '').trim();

          const message = String(error?.message || '').toLowerCase();

          const retryable = code === 'ER_LOCK_DEADLOCK' || message.includes('deadlock found');

          if (!retryable || attempt === 4) throw error;

          await delay(150 * attempt);

        }

      }

      if (lastError) throw lastError;

    })().finally(() => {

      ensureBiensWorkflowSchemaSafePromise = null;

    });

  }

  return ensureBiensWorkflowSchemaSafePromise;

}



app.use((req, _res, next) => {

  if (MOBILE_FLOW_DEBUG) {

    const path = String(req.originalUrl || req.url || '');

    if (

      path.startsWith('/api/auth/') ||

      path.startsWith('/api/reservation-demands') ||

      path.includes('/flouci/')

    ) {

      logMobileFlow('api_request_in', req, {

        query: req.query || {},

      });

    }

  }

  next();

});



let ensureSeasonalPricingSchemaPromise = null;



async function ensureSeasonalPricingSchema() {

  if (!ensureSeasonalPricingSchemaPromise) {

    ensureSeasonalPricingSchemaPromise = (async () => {

      await ensureBiensWorkflowSchemaSafe();

      const indexExists = async (tableName, indexName) => {

        const [rows] = await pool.query(

          `SELECT COUNT(*) AS total

           FROM information_schema.STATISTICS

           WHERE TABLE_SCHEMA = DATABASE()

             AND TABLE_NAME = ?

             AND INDEX_NAME = ?`,

          [tableName, indexName]

        );

        return Number(rows?.[0]?.total || 0) > 0;

      };

      await pool.query(`

    CREATE TABLE IF NOT EXISTS bien_pricing_periods (

      id VARCHAR(120) NOT NULL PRIMARY KEY,

      bien_id VARCHAR(120) NOT NULL,

      scope VARCHAR(24) NOT NULL DEFAULT 'global',

      amicale_id VARCHAR(64) NULL,

      start_date DATE NOT NULL,

      end_date DATE NOT NULL,

      prix_nuitee DECIMAL(12,2) NOT NULL,

      prix_semaine DECIMAL(12,2) NULL,

      minimum_nuitees INT NULL,

      checkin_jour VARCHAR(20) NULL,

      checkout_jour VARCHAR(20) NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      KEY idx_bien_pricing_periods_bien (bien_id),

      KEY idx_bien_pricing_periods_amicale (amicale_id),

      KEY idx_bien_pricing_periods_dates (start_date, end_date)

    )

  `);

      const [columnRows] = await pool.query(

        `SELECT COUNT(*) AS total

     FROM information_schema.COLUMNS

     WHERE TABLE_SCHEMA = DATABASE()

       AND TABLE_NAME = 'biens'

       AND COLUMN_NAME = 'prix_semaine'`

      );

      if (Number(columnRows?.[0]?.total || 0) === 0) {

        await pool.query('ALTER TABLE biens ADD COLUMN prix_semaine DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_nuitee');

      }

      if (!(await columnExists('bien_pricing_periods', 'minimum_nuitees'))) {

        await pool.query('ALTER TABLE bien_pricing_periods ADD COLUMN minimum_nuitees INT NULL DEFAULT NULL AFTER prix_semaine');

      }

      if (!(await columnExists('bien_pricing_periods', 'amicale_id'))) {

        await pool.query('ALTER TABLE bien_pricing_periods ADD COLUMN amicale_id VARCHAR(64) NULL DEFAULT NULL AFTER bien_id');

      }

      if (!(await columnExists('bien_pricing_periods', 'scope'))) {

        await pool.query("ALTER TABLE bien_pricing_periods ADD COLUMN scope VARCHAR(24) NOT NULL DEFAULT 'global' AFTER bien_id");

      }

      if (!(await columnExists('bien_pricing_periods', 'checkin_jour'))) {

        await pool.query('ALTER TABLE bien_pricing_periods ADD COLUMN checkin_jour VARCHAR(20) NULL DEFAULT NULL AFTER minimum_nuitees');

      }

      if (!(await columnExists('bien_pricing_periods', 'checkout_jour'))) {

        await pool.query('ALTER TABLE bien_pricing_periods ADD COLUMN checkout_jour VARCHAR(20) NULL DEFAULT NULL AFTER checkin_jour');

      }

      if (!(await indexExists('bien_pricing_periods', 'idx_bien_pricing_periods_amicale'))) {

        await pool.query('ALTER TABLE bien_pricing_periods ADD KEY idx_bien_pricing_periods_amicale (amicale_id)');

      }

    })().catch((error) => {

      ensureSeasonalPricingSchemaPromise = null;

      throw error;

    });

  }

  await ensureSeasonalPricingSchemaPromise;

}



async function ensureTypeFilterImagesSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS type_filter_images (

      id VARCHAR(190) NOT NULL PRIMARY KEY,

      mode_bien ENUM('vente', 'location_annuelle', 'location_saisonniere') NOT NULL,

      main_type VARCHAR(80) NOT NULL,

      sub_type VARCHAR(120) NULL,

      image_url VARCHAR(1000) NOT NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      UNIQUE KEY uq_type_filter_scope (mode_bien, main_type, sub_type)

    )

  `);

}



async function ensureHomeFilterOptionImagesSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS home_filter_option_images (

      id VARCHAR(220) NOT NULL PRIMARY KEY,

      mode_bien ENUM('vente', 'location_annuelle', 'location_saisonniere') NOT NULL,

      filter_group VARCHAR(80) NOT NULL,

      option_key VARCHAR(120) NOT NULL,

      image_url VARCHAR(1000) NOT NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      UNIQUE KEY uq_home_filter_option_scope (mode_bien, filter_group, option_key)

    )

  `);

}



async function listPaidServicesCatalogue() {

  await ensurePaidServicesSchema();

  const [rows] = await pool.query(

    `SELECT id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled

     FROM services_payants_catalogue

     ORDER BY categorie ASC, label ASC`

  );

  return (rows || []).map((row) => normalizePaidServiceRecord({

    id: row.id,

    categorie: row.categorie,

    label: row.label,

    description_courte: row.description_courte,

    prix_affiche: row.prix_affiche,

    prix: row.prix_base,

    type_tarification: row.type_tarification,

    enabled: row.enabled === 1 || row.enabled === true,

  }));

}



async function listPaidServicesForBienIds(bienIds) {

  await ensurePaidServicesSchema();

  const ids = Array.from(new Set((Array.isArray(bienIds) ? bienIds : []).map((id) => String(id || '').trim()).filter(Boolean)));

  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => '?').join(', ');

  const [rows] = await pool.query(

    `SELECT

       bsp.bien_id,

       bsp.service_catalogue_id,

       bsp.categorie_override,

       bsp.label_override,

       bsp.description_courte_override,

       bsp.prix_affiche_override,

       bsp.prix_override,

       bsp.type_tarification_override,

       bsp.enabled AS bien_enabled,

       bsp.ordre_affichage,

       c.categorie,

       c.label,

       c.description_courte,

       c.prix_affiche,

       c.prix_base,

       c.type_tarification,

       c.enabled AS catalogue_enabled

     FROM bien_services_payants bsp

     INNER JOIN services_payants_catalogue c ON c.id = bsp.service_catalogue_id

     WHERE bsp.bien_id IN (${placeholders})

     ORDER BY bsp.bien_id ASC, bsp.ordre_affichage ASC, c.categorie ASC, c.label ASC`,

    ids

  );

  const byBienId = new Map();

  for (const row of rows || []) {

    const service = normalizePaidServiceRecord({

      id: row.service_catalogue_id,

      categorie: row.categorie_override || row.categorie,

      label: row.label_override || row.label,

      description_courte: row.description_courte_override || row.description_courte,

      prix_affiche: row.prix_affiche_override || row.prix_affiche,

      prix: row.prix_override ?? row.prix_base,

      type_tarification: row.type_tarification_override || row.type_tarification,

      enabled: (row.bien_enabled === 1 || row.bien_enabled === true) && (row.catalogue_enabled === 1 || row.catalogue_enabled === true),

    });

    if (!byBienId.has(row.bien_id)) byBienId.set(row.bien_id, []);

    byBienId.get(row.bien_id).push(service);

  }

  return byBienId;

}



async function syncBienPaidServices(bienId, services) {

  await ensurePaidServicesSchema();

  const normalizedBienId = String(bienId || '').trim();

  if (!normalizedBienId) return;

  const list = Array.isArray(services) ? services.map((service) => normalizePaidServiceRecord(service)).filter((service) => service.label) : [];

  const now = getAgencySqlDateTime();

  await pool.query('DELETE FROM bien_services_payants WHERE bien_id = ?', [normalizedBienId]);

  for (let index = 0; index < list.length; index += 1) {

    const service = list[index];

    await pool.query(

      `INSERT INTO services_payants_catalogue (

         id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled, created_at, updated_at

       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE id = id`,

      [service.id, service.categorie, service.label, service.description_courte || null, service.prix_affiche || null, service.prix, service.type_tarification, service.enabled ? 1 : 0, now, now]

    );

    await pool.query(

      `INSERT INTO bien_services_payants (

         bien_id, service_catalogue_id, categorie_override, label_override, description_courte_override,

         prix_affiche_override, prix_override, type_tarification_override, enabled, ordre_affichage, created_at, updated_at

       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [normalizedBienId, service.id, service.categorie, service.label, service.description_courte || null, service.prix_affiche || null, service.prix, service.type_tarification, service.enabled ? 1 : 0, index, now, now]

    );

  }

}



function injectPaidServicesIntoConfig(rawConfig, services) {

  const baseConfig = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? { ...rawConfig } : {};

  baseConfig.services_payants = Array.isArray(services) ? services : [];

  return baseConfig;

}



function toSqlDateOnly(value) {

  if (!value) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {

    const yyyy = value.getFullYear();

    const mm = String(value.getMonth() + 1).padStart(2, '0');

    const dd = String(value.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;

  }

  const text = String(value).trim();

  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);

  if (direct) return direct[1];

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {

    const yyyy = parsed.getFullYear();

    const mm = String(parsed.getMonth() + 1).padStart(2, '0');

    const dd = String(parsed.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;

  }

  return '';

}



function normalizeSeasonalPricingPeriod(period, index = 0) {

  const start = toSqlDateOnly(period?.start || period?.start_date || '');

  const end = toSqlDateOnly(period?.end || period?.end_date || '');

  const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime());

  const nightlyRaw = Number(period?.prix_nuitee);

  const weeklyRaw = period?.prix_semaine === null || period?.prix_semaine === undefined ? null : Number(period?.prix_semaine);

  const minimumNightsRaw = period?.minimum_nuitees === null || period?.minimum_nuitees === undefined ? null : Number(period?.minimum_nuitees);

  const normalizeWeekday = (value) => {

    const normalized = String(value || '').trim().toLowerCase();

    return ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].includes(normalized) ? normalized : null;

  };

  const nightly = Number.isFinite(nightlyRaw) && nightlyRaw > 0 ? nightlyRaw : 0;

  const weekly = weeklyRaw === null ? null : (Number.isFinite(weeklyRaw) && weeklyRaw > 0 ? weeklyRaw : null);

  const minimumNights = minimumNightsRaw === null ? null : (Number.isFinite(minimumNightsRaw) && minimumNightsRaw > 0 ? Math.max(1, Math.floor(minimumNightsRaw)) : null);

  const checkinDay = normalizeWeekday(period?.checkin_jour);

  const checkoutDay = normalizeWeekday(period?.checkout_jour);

  const amicaleId = String(period?.amicale_id || period?.amicaleId || '').trim() || null;

  const normalizePricingScope = (value) => {

    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === 'amicales' || normalized === 'amicale' || normalized === 'global') return normalized;

    if (normalized === 'all_amicales' || normalized === 'toutes_amicales' || normalized === 'toutes les amicales') return 'amicales';

    return null;

  };

  let scope = normalizePricingScope(period?.scope);

  if (!scope) {

    scope = amicaleId ? 'amicale' : 'global';

  }

  if (scope === 'amicale' && !amicaleId) return null;

  if (!start || !end || !isValidIsoDate(start) || !isValidIsoDate(end) || end < start || nightly <= 0) return null;

  return {

    id: String(period?.id || `pp_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`),

    start,

    end,

    prix_nuitee: nightly,

    prix_semaine: weekly,

    minimum_nuitees: minimumNights,

    checkin_jour: checkinDay,

    checkout_jour: checkoutDay,

    scope,

    amicale_id: amicaleId,

  };

}



function readEffectivePricingPeriods(payload, locationSaisonniereConfig) {

  const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

  const hasRootSnake = hasOwn(payload, 'pricing_periods');

  const hasRootCamel = hasOwn(payload, 'pricingPeriods');

  const hasConfigPeriods = !!locationSaisonniereConfig

    && typeof locationSaisonniereConfig === 'object'

    && hasOwn(locationSaisonniereConfig, 'pricing_periods');

  const hasExplicitPayload = hasRootSnake || hasRootCamel || hasConfigPeriods;



  let rawPeriods = [];

  if (Array.isArray(payload?.pricing_periods)) {

    rawPeriods = payload.pricing_periods;

  } else if (Array.isArray(payload?.pricingPeriods)) {

    rawPeriods = payload.pricingPeriods;

  } else if (Array.isArray(locationSaisonniereConfig?.pricing_periods)) {

    rawPeriods = locationSaisonniereConfig.pricing_periods;

  }



  return {

    hasExplicitPayload,

    periods: rawPeriods,

    hasConfigPeriods,

  };

}





async function listPricingPeriodsForBienIds(bienIds) {

  await ensureSeasonalPricingSchema();

  const ids = Array.from(new Set((Array.isArray(bienIds) ? bienIds : []).map((id) => String(id || '').trim()).filter(Boolean)));

  const byBienId = new Map();

  if (ids.length === 0) return byBienId;

  const placeholders = ids.map(() => '?').join(', ');

  const [rows] = await pool.query(

    `SELECT id, bien_id, scope, amicale_id,

            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,

            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,

            prix_nuitee, prix_semaine, minimum_nuitees, checkin_jour, checkout_jour

     FROM bien_pricing_periods

     WHERE bien_id IN (${placeholders})

     ORDER BY start_date ASC, end_date ASC`,

    ids

  );

  for (const row of rows || []) {

    const item = {

      id: String(row.id),

      start: toSqlDateOnly(row.start_date),

      end: toSqlDateOnly(row.end_date),

      prix_nuitee: Number(row.prix_nuitee || 0),

      prix_semaine: row.prix_semaine === null || row.prix_semaine === undefined ? null : Number(row.prix_semaine || 0),

      minimum_nuitees: row.minimum_nuitees === null || row.minimum_nuitees === undefined ? null : Math.max(1, Math.floor(Number(row.minimum_nuitees || 0))),

      checkin_jour: row.checkin_jour ? String(row.checkin_jour).toLowerCase() : null,

      checkout_jour: row.checkout_jour ? String(row.checkout_jour).toLowerCase() : null,

      scope: String(row.scope || '').trim().toLowerCase() || (row.amicale_id ? 'amicale' : 'global'),

      amicale_id: row.amicale_id ? String(row.amicale_id).trim() : null,

    };

    if (!byBienId.has(row.bien_id)) byBienId.set(row.bien_id, []);

    byBienId.get(row.bien_id).push(item);

  }

  return byBienId;

}



async function syncBienPricingPeriods(bienId, periods) {

  await ensureSeasonalPricingSchema();

  const normalizedBienId = String(bienId || '').trim();

  if (!normalizedBienId) return;

  const now = getAgencySqlDateTime();

  const normalized = (Array.isArray(periods) ? periods : [])

    .map((period, index) => normalizeSeasonalPricingPeriod(period, index))

    .filter(Boolean);

  const uniquePeriods = normalized.map((period, index) => ({

    ...period,

    // Do not trust client-provided IDs here: they can collide with stale or copied rows

    // from other biens and break the whole save operation.

    id: `pp_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,

  }));

  await pool.query('DELETE FROM bien_pricing_periods WHERE bien_id = ?', [normalizedBienId]);

  for (const period of uniquePeriods) {

    await pool.query(

      `INSERT INTO bien_pricing_periods (

         id, bien_id, scope, amicale_id, start_date, end_date, prix_nuitee, prix_semaine, minimum_nuitees, checkin_jour, checkout_jour, created_at, updated_at

       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [period.id, normalizedBienId, period.scope || 'global', period.amicale_id || null, period.start, period.end, period.prix_nuitee, period.prix_semaine, period.minimum_nuitees, period.checkin_jour, period.checkout_jour, now, now]

    );

  }

}



function formatReservationDemandRow(row) {

  if (!row) return null;

  return {

    ...row,

    request_type: row.request_type === 'visite' ? 'visite' : 'reservation',

    payment_mode: normalizePaymentMode(row.payment_mode, 'avance'),

    pricing_amicale_id: row.pricing_amicale_id || null,

    amicale_matricule: row.amicale_matricule || null,

    amicale_phone: row.amicale_phone || null,

    amicale_code: row.amicale_code || null,

    amicale_validation_at: row.amicale_validation_at || null,

    agency_validation_at: row.agency_validation_at || null,

    voucher_id: row.voucher_id || null,

    voucher_number: row.voucher_number || null,

    voucher_url: row.voucher_url || null,

    voucher_generated_at: row.voucher_generated_at || null,

    guests: Number(row.guests || 1),

    adult_guests: Number(row.adult_guests || row.guests || 1),

    child_guests: Number(row.child_guests || 0),

    total_amount: row.total_amount === null || row.total_amount === undefined ? null : Number(row.total_amount),

    amount_due_now: row.amount_due_now === null || row.amount_due_now === undefined ? null : Number(row.amount_due_now),

    selected_fixed_services: parseJsonArray(row.selected_fixed_services_json),

    selected_variable_services: parseJsonArray(row.selected_variable_services_json),

    variable_services_quote: parseJsonArray(row.variable_services_quote_json),

    variable_services_quote_total: row.variable_services_quote_total === null || row.variable_services_quote_total === undefined ? null : Number(row.variable_services_quote_total),

    variable_services_quote_status: row.variable_services_quote_status || null,

    reservation_payment_id: row.reservation_payment_id || null,

    reservation_payment_paid_at: row.reservation_payment_paid_at || null,

    services_payment_id: row.services_payment_id || null,

    services_payment_paid_at: row.services_payment_paid_at || null,

    flouci_checkout_id: row.flouci_checkout_id || null,

    flouci_scope: row.flouci_scope || null,

    flouci_status: row.flouci_status || null,

    flouci_checkout_url: row.flouci_checkout_url || null,

    flouci_verified_at: row.flouci_verified_at || null,

    payment_receipt_image_url: row.payment_receipt_image_url || null,

    payment_receipt_uploaded_at: row.payment_receipt_uploaded_at || null,

    payment_receipt_note: row.payment_receipt_note || null,

    owner_notified_at: row.owner_notified_at || null,

    owner_response_at: row.owner_response_at || null,

    client_confirmation_clicked_at: row.client_confirmation_clicked_at || null,

    identity_first_name: row.identity_first_name || null,

    identity_last_name: row.identity_last_name || null,

    identity_submitted_at: row.identity_submitted_at || null,

    contract_generated_at: row.contract_generated_at || null,

    finalization_due_at: row.finalization_due_at || null,

    created_at: row.created_at || null,

    updated_at: row.updated_at || null,

  };

}



async function fetchReservationDemandDetailsById(demandId) {

  const normalizedId = String(demandId || '').trim();

  if (!normalizedId) return null;

  const [rows] = await pool.query(

    `SELECT

       d.*,

       b.titre AS bien_titre,

       b.reference AS bien_reference,

       b.mode AS bien_mode,

       p.nom AS proprietaire_nom,

       a.name AS amicale_name,

       a.logo_url AS amicale_logo_url,

       DATE_FORMAT(d.amicale_validation_at, '%Y-%m-%d %H:%i:%s') AS amicale_validation_at,

       DATE_FORMAT(d.agency_validation_at, '%Y-%m-%d %H:%i:%s') AS agency_validation_at,

       DATE_FORMAT(d.voucher_generated_at, '%Y-%m-%d %H:%i:%s') AS voucher_generated_at,

       DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

       DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

       DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

       DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

       DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

       DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

       DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

       DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at,

       DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at,

       DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

       DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

     FROM reservation_demands d

     LEFT JOIN biens b ON b.id = d.bien_id

     LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

     LEFT JOIN amicales a ON a.id = d.pricing_amicale_id

     WHERE d.id = ?

     LIMIT 1`,

    [normalizedId]

  );

  return formatReservationDemandRow(rows?.[0] || null);

}



async function deleteLocalFileFromPublicUrl(fileUrl, subdirectory = '') {

  const normalizedUrl = String(fileUrl || '').trim();

  if (!normalizedUrl) return;

  try {

    const parsed = /^https?:\/\//i.test(normalizedUrl) ? new URL(normalizedUrl) : null;

    const pathname = parsed ? parsed.pathname : normalizedUrl;

    const fileName = path.basename(String(pathname || '').trim());

    if (!fileName) return;

    const targetDir = subdirectory ? path.join(__dirname, subdirectory) : __dirname;

    const filePath = path.join(targetDir, fileName);

    if (fs.existsSync(filePath)) {

      await fs.promises.unlink(filePath);

    }

  } catch (error) {

    console.warn('Failed to delete local file:', error?.message || error);

  }

}



async function deleteReservationDemandArtifacts(connection, demandRow) {

  const demandId = String(demandRow?.id || '').trim();

  if (!demandId) return false;



  const contractId = String(demandRow?.contract_id || '').trim();

  const unavailableDateId = String(demandRow?.unavailable_date_id || '').trim();

  const paymentIds = [

    demandRow?.payment_id,

    demandRow?.reservation_payment_id,

    demandRow?.services_payment_id,

  ]

    .map((value) => String(value || '').trim())

    .filter(Boolean);

  const uniquePaymentIds = Array.from(new Set(paymentIds));



  if (uniquePaymentIds.length > 0) {

    await connection.query(

      `DELETE FROM paiements WHERE id IN (${uniquePaymentIds.map(() => '?').join(', ')})`,

      uniquePaymentIds

    );

  }

  if (contractId) {

    await connection.query('DELETE FROM paiements WHERE contrat_id = ?', [contractId]);

    await connection.query('DELETE FROM contrats WHERE id = ?', [contractId]);

  }



  await connection.query('DELETE FROM reservation_demand_history WHERE demand_id = ?', [demandId]);

  await connection.query('DELETE FROM unavailable_dates WHERE reservation_demand_id = ?', [demandId]);

  if (unavailableDateId) {

    await connection.query('DELETE FROM unavailable_dates WHERE id = ?', [unavailableDateId]);

  }

  await connection.query('DELETE FROM reservation_demands WHERE id = ?', [demandId]);



  await deleteLocalFileFromPublicUrl(demandRow?.voucher_url, path.join('contracts', 'amicale-vouchers'));

  await deleteLocalFileFromPublicUrl(demandRow?.payment_receipt_image_url, 'uploads');

  await deleteLocalFileFromPublicUrl(demandRow?.identity_document_image_url, 'uploads');

  return true;

}



async function cleanupNamelessAmicalesAndTheirDemands() {

  const [amicaleRows] = await pool.query(

    `SELECT id

     FROM amicales

     WHERE name IS NULL OR TRIM(name) = ''`

  );

  const namelessAmicaleIds = (amicaleRows || [])

    .map((row) => String(row?.id || '').trim())

    .filter(Boolean);

  if (namelessAmicaleIds.length === 0) {

    return { amicalesDeleted: 0, demandsDeleted: 0 };

  }



  const [demandRows] = await pool.query(

    `SELECT *

     FROM reservation_demands

     WHERE pricing_amicale_id IN (${namelessAmicaleIds.map(() => '?').join(', ')})`,

    namelessAmicaleIds

  );



  const connection = await pool.getConnection();

  let deletedDemands = 0;

  try {

    await connection.beginTransaction();

    for (const demandRow of demandRows || []) {

      const deleted = await deleteReservationDemandArtifacts(connection, demandRow);

      if (deleted) deletedDemands += 1;

    }

    await connection.query(

      `DELETE FROM agent_amicale_profiles

       WHERE amicale_id IN (${namelessAmicaleIds.map(() => '?').join(', ')})`,

      namelessAmicaleIds

    );

    await connection.query(

      `DELETE FROM amicales

       WHERE id IN (${namelessAmicaleIds.map(() => '?').join(', ')})`,

      namelessAmicaleIds

    );

    await connection.commit();

  } catch (error) {

    await connection.rollback();

    throw error;

  } finally {

    connection.release();

  }



  console.log(

    `[Amicales] Cleaned ${namelessAmicaleIds.length} amicale(s) without name and ${deletedDemands} related demand(s).`

  );

  return { amicalesDeleted: namelessAmicaleIds.length, demandsDeleted: deletedDemands };

}



function normalizeIdentityDocumentType(value, fallback = 'cin_tn') {

  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'passport_tn' || normalized === 'passport_foreign' || normalized === 'cin_tn') {

    return normalized;

  }

  return fallback;

}



function normalizeIdentityNumber(value) {

  return String(value || '')

    .trim()

    .toUpperCase()

    .replace(/[^A-Z0-9]/g, '');

}



function normalizePersonName(value) {

  return String(value || '')

    .replace(/\s+/g, ' ')

    .trim();

}



function escapeHtml(value) {

  return String(value ?? '')

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#039;');

}



function formatCurrency(value) {

  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'TND', maximumFractionDigits: 2 }).format(Number(value || 0));

}



function formatDateFr(value) {

  if (!value) return '-';

  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString('fr-FR', { timeZone: AGENCY_TIME_ZONE });

}



function computeNights(startDate, endDate) {

  const startSql = toSqlDateOnly(startDate);

  const endSql = toSqlDateOnly(endDate);

  const start = new Date(`${startSql}T00:00:00`);

  const end = new Date(`${endSql}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));

}



function getWeekdayFrFromSqlDate(value) {

  const sql = toSqlDateOnly(value);

  const parsed = new Date(`${sql}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return null;

  const day = parsed.getDay(); // 0=dimanche

  if (day === 0) return 'dimanche';

  if (day === 1) return 'lundi';

  if (day === 2) return 'mardi';

  if (day === 3) return 'mercredi';

  if (day === 4) return 'jeudi';

  if (day === 5) return 'vendredi';

  return 'samedi';

}



function formatStayPeriodFr(startDate, endDate) {

  const startSql = toSqlDateOnly(startDate);

  const endSql = toSqlDateOnly(endDate);

  if (!startSql || !endSql) return `${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;

  const nights = computeNights(startSql, endSql);

  return `${formatDateFr(startSql)} au ${formatDateFr(endSql)} (${nights} nuit${nights > 1 ? 's' : ''})`;

}



function parseSqlDateParts(value) {

  const sql = toSqlDateOnly(value);

  if (!sql) return { dd: '', mm: '', yyyy: '', iso: '' };

  const [yyyy, mm, dd] = sql.split('-');

  return { dd: dd || '', mm: mm || '', yyyy: yyyy || '', iso: sql };

}



function parseSqlDateTimeParts(value) {

  if (!value) return { date: parseSqlDateParts(''), hh: '', min: '' };

  const text = String(value).trim();

  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));

  if (!Number.isNaN(parsed.getTime())) {

    const dateIso = parsed.toISOString().slice(0, 10);

    return {

      date: parseSqlDateParts(dateIso),

      hh: String(parsed.getHours()).padStart(2, '0'),

      min: String(parsed.getMinutes()).padStart(2, '0'),

    };

  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);

  return {

    date: parseSqlDateParts(match ? `${match[1]}-${match[2]}-${match[3]}` : ''),

    hh: match?.[4] || '',

    min: match?.[5] || '',

  };

}



function formatAmountTndRaw(value) {

  const num = Number(value);

  if (!Number.isFinite(num)) return '';

  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

}



function normalizePaymentModeForTemplate(paymentMode, paymentMethod) {

  const method = String(paymentMethod || '').trim().toLowerCase();

  if (method === 'especes') return 'Especes';

  if (method === 'carte') return 'Carte';

  if (method === 'cheque') return 'Cheque';

  if (method === 'virement') return 'Virement';

  if (paymentMode === 'amicale') return 'Amicale';

  if (paymentMode === 'totalite') return 'Carte';

  return 'Virement';

}



function parseDemandVariableServices(demand) {

  if (Array.isArray(demand?.variable_services_quote)) return demand.variable_services_quote;

  const raw = demand?.variable_services_quote_json;

  if (!raw) return [];

  if (Array.isArray(raw)) return raw;

  try {

    const parsed = JSON.parse(String(raw));

    return Array.isArray(parsed) ? parsed : [];

  } catch {

    return [];

  }

}



function sanitizePdfWinAnsiText(value) {

  return String(value || '')

    .replace(/\u202f/g, ' ')

    .replace(/\u00a0/g, ' ')

    .replace(/\u2019/g, "'")

    .replace(/\u2018/g, "'")

    .replace(/\u2013/g, '-')

    .replace(/\u2014/g, '-');

}



function fitPdfTextToWidth(font, text, size, maxWidth) {

  const normalized = sanitizePdfWinAnsiText(text).replace(/\s+/g, ' ').trim();

  if (!normalized) return '';

  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return normalized;

  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;



  const ellipsis = '...';

  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, size);

  const room = Math.max(0, maxWidth - ellipsisWidth);

  let out = '';

  for (const ch of normalized) {

    const next = out + ch;

    if (font.widthOfTextAtSize(next, size) > room) break;

    out = next;

  }

  return `${out.trimEnd()}${ellipsis}`;

}



function splitPdfTextByWidth(font, text, size, maxWidth) {

  const normalized = sanitizePdfWinAnsiText(text).replace(/\s+/g, ' ').trim();

  if (!normalized) return { line: '', remainder: '' };

  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return { line: normalized, remainder: '' };

  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return { line: normalized, remainder: '' };



  const words = normalized.split(' ');

  let line = '';

  let idx = 0;

  for (; idx < words.length; idx += 1) {

    const candidate = line ? `${line} ${words[idx]}` : words[idx];

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {

      line = candidate;

      continue;

    }

    if (!line) {

      // Single word longer than the zone.

      line = fitPdfTextToWidth(font, words[idx], size, maxWidth);

      idx += 1;

    }

    break;

  }

  const remainder = words.slice(idx).join(' ').trim();

  return { line, remainder };

}



function drawPdfLineValue(page, font, text, x, y, width, size = 10.5) {

  const content = fitPdfTextToWidth(font, text, size, width);

  if (!content) return;

  page.drawRectangle({

    x: x - 1.5,

    y: y - 1.5,

    width,

    height: size + 4,

    color: rgb(1, 1, 1),

  });

  page.drawText(content, { x, y, size, font, color: rgb(0, 0, 0) });

}



function extractIdentityNumberFromText(rawText, documentType) {

  const text = String(rawText || '').toUpperCase();

  const compact = text.replace(/\s+/g, ' ').trim();

  if (!compact) return '';



  if (documentType === 'cin_tn') {

    const cinMatch = compact.match(/\b\d{8}\b/);

    return cinMatch ? cinMatch[0] : '';

  }



  const mrzLineMatch = compact.match(/P<[A-Z<]{3}[A-Z<]+[\r\n ]+[A-Z0-9<]{6,9}/);

  if (mrzLineMatch) {

    const mrzNumber = mrzLineMatch[0].split(/[\r\n ]+/).pop()?.replace(/</g, '') || '';

    if (mrzNumber) return mrzNumber;

  }



  const passportMatch = compact.match(/\b[A-Z0-9]{6,9}\b/g);

  if (!passportMatch) return '';

  const filtered = passportMatch.find((item) => /[A-Z]/.test(item) || item.length >= 7);

  return filtered || passportMatch[0] || '';

}



function extractIdentityNamesFromText(rawText, documentType) {

  const text = String(rawText || '');

  if (!text.trim()) {

    return { firstName: '', lastName: '' };

  }



  const compact = text.replace(/\r/g, '\n');

  const clean = compact.replace(/[^\S\n]+/g, ' ');

  const lines = clean

    .split('\n')

    .map((line) => line.trim())

    .filter(Boolean);



  const blockedNameTokens = new Set([

    'REPUBLIQUE',

    'TUNISIENNE',

    'TUNISIE',

    'CARTE',

    'IDENTITE',

    'NATIONALE',

    'NATIONALITE',

    'DATE',

    'NAISSANCE',

    'LIEU',

    'DELIVRANCE',

    'SEXE',

    'SIGNATURE',

    'PASSEPORT',

    'PASSPORT',

  ]);



  const arabicHeaderPattern = /(\u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629|\u0627\u0644\u062A\u0648\u0646\u0633\u064A\u0629|\u0628\u0637\u0627\u0642\u0629|\u0627\u0644\u062A\u0639\u0631\u064A\u0641|\u0627\u0644\u0648\u0637\u0646\u064A\u0629|\u062A\u0627\u0631\u064A\u062E|\u0627\u0644\u0648\u0644\u0627\u062F\u0629|\u0627\u0644\u0645\u0647\u0646\u0629|\u0627\u0644\u062C\u0646\u0633|\u0627\u0644\u0639\u0646\u0648\u0627\u0646)/i;



  const normalizeNameCandidate = (value) => normalizePersonName(

    String(value || '')

      .replace(/[_<>]/g, ' ')

      .replace(/[|`~]/g, ' ')

      .replace(/\d/g, ' ')

      .replace(/[^A-Za-z\u00C0-\u017F\u0600-\u06FF' -]/g, ' ')

  );



  const arabicWords = (value) => String(value || '')

    .match(/[\u0600-\u06FF]{2,}/g) || [];



  const cleanupArabicIdentityName = (value, mode) => {

    const words = arabicWords(value)

      .map((w) => w.replace(/^\u0627\u0644(?=\u0644\u0642\u0628|\u0627\u0633\u0645)/, ''))

      .filter((w) => !arabicHeaderPattern.test(w));



    const filtered = words.filter((w) => !/^(\u0628\u0646|\u0628\u0646\u062A)$/.test(w));

    if (filtered.length === 0) return '';



    if (mode === 'last') {

      if (filtered.length === 1) return normalizePersonName(filtered[0]);

      if (filtered.length >= 2 && /^(\u0627\u0644\u062F\u064A\u0646|\u0627\u0644\u0644\u0647)$/.test(filtered[1])) {

        return normalizePersonName(filtered.slice(0, 2).join(' '));

      }

      return normalizePersonName(filtered[0]);

    }



    const picked = filtered.slice(0, 2).join(' ');

    return normalizePersonName(picked);

  };



  const isPlausibleArabicName = (value, mode) => {

    const normalized = normalizePersonName(value);

    if (!normalized) return false;

    if (/[A-Za-z]/.test(normalized)) return false;

    const tokens = arabicWords(normalized);

    if (tokens.length === 0) return false;

    const totalChars = tokens.join('').length;

    const maxToken = Math.max(...tokens.map((t) => t.length));

    if (maxToken < 4) return false;



    if (mode === 'last') {

      if (tokens.length > 2) return false;

      if (/^(\u0627\u0644\u062F\u064A\u0646|\u0627\u0644\u0644\u0647)$/.test(tokens[0])) return false;

      return totalChars >= 4;

    }



    if (tokens.length > 3) return false;

    return totalChars >= 5;

  };



  const isLikelyNameLine = (value) => {

    const candidate = normalizeNameCandidate(value);

    if (!candidate || candidate.length < 2) return false;

    if (!/[A-Za-z\u00C0-\u017F\u0600-\u06FF]/.test(candidate)) return false;

    const words = candidate.split(' ').filter(Boolean);

    if (words.length === 0 || words.length > 5) return false;

    const upperWords = words.map((word) => word.toUpperCase());

    if (upperWords.some((word) => blockedNameTokens.has(word))) return false;

    if (arabicHeaderPattern.test(candidate)) return false;

    return true;

  };



  const scoreCinArabicNameLine = (value) => {

    const candidate = normalizeNameCandidate(value);

    if (!isLikelyNameLine(candidate)) return -1;

    if (/\b(?:\u0628\u0646|\u0628\u0646\u062A)\b/.test(candidate)) return -1;

    const cleaned = cleanupArabicIdentityName(candidate, 'first');

    if (!cleaned) return -1;

    const words = cleaned.split(' ').filter(Boolean).length;

    let score = (arabicWords(cleaned).join('').length * 2);

    if (words >= 1 && words <= 2) score += 8;

    if (words >= 3) score -= 6;

    return score;

  };



  const pickByLabel = (patterns, mode = 'first') => {

    for (const pattern of patterns) {

      const match = clean.match(pattern);

      if (match && match[1]) {

        const candidate = normalizeNameCandidate(match[1]);

        if (!isLikelyNameLine(candidate)) continue;

        if (documentType === 'cin_tn') {

          const cleanedArabic = cleanupArabicIdentityName(candidate, mode);

          if (cleanedArabic) return cleanedArabic;

        }

        return candidate;

      }

    }

    return '';

  };



  const lastName = pickByLabel([

    /(?:\bnom\b|\bsurname\b|\bfamily\s*name\b|\blast\s*name\b)\s*[:\-]?\s*([^\n]{1,80})/i,

    /(?:\u0627\u0644\u0644\u0642\u0628)\s*[:\-]?\s*([\u0600-\u06FF][\u0600-\u06FF\s]{1,80})/i,

    /([\u0600-\u06FF][\u0600-\u06FF\s]{1,80})\s*(?:\u0627\u0644\u0644\u0642\u0628)/i,

  ], 'last');

  const firstName = pickByLabel([

    /(?:\bpr.?nom(?:s)?\b|\bgiven\s*name(?:s)?\b|\bfirst\s*name\b|\bforename\b)\s*[:\-]?\s*([^\n]{1,80})/i,

    /(?:\u0627\u0644\u0627\u0633\u0645)\s*[:\-]?\s*([\u0600-\u06FF][\u0600-\u06FF\s]{1,80})/i,

    /([\u0600-\u06FF][\u0600-\u06FF\s]{1,80})\s*(?:\u0627\u0644\u0627\u0633\u0645)/i,

  ], 'first');



  if (firstName || lastName) {

    if (documentType === 'cin_tn') {

      const cleanFirst = cleanupArabicIdentityName(firstName, 'first');

      const cleanLast = cleanupArabicIdentityName(lastName, 'last');

      if (isPlausibleArabicName(cleanFirst, 'first') || isPlausibleArabicName(cleanLast, 'last')) {

        return {

          firstName: isPlausibleArabicName(cleanFirst, 'first') ? cleanFirst : '',

          lastName: isPlausibleArabicName(cleanLast, 'last') ? cleanLast : '',

        };

      }

    }

    return { firstName, lastName };

  }



  if (documentType === 'cin_tn') {

    const idLineIndex = lines.findIndex((line) => /\b\d{8}\b/.test(line));

    if (idLineIndex >= 0) {

      const windowCandidates = [];

      for (let i = idLineIndex + 1; i <= Math.min(idLineIndex + 4, lines.length - 1); i += 1) {

        const normalized = normalizeNameCandidate(lines[i]);

        const score = scoreCinArabicNameLine(normalized);

        if (score >= 0) {

          windowCandidates.push({ normalized, score, index: i });

        }

      }



      if (windowCandidates.length >= 2) {

        windowCandidates.sort((a, b) => {

          if (b.score !== a.score) return b.score - a.score;

          return a.index - b.index;

        });

        const topTwo = windowCandidates.slice(0, 2).sort((a, b) => a.index - b.index);

        const topA = cleanupArabicIdentityName(topTwo[0].normalized, 'first');

        const topB = cleanupArabicIdentityName(topTwo[1].normalized, 'last');

        if (isPlausibleArabicName(topA, 'first') || isPlausibleArabicName(topB, 'last')) {

          return {

            firstName: isPlausibleArabicName(topA, 'first') ? normalizePersonName(topA) : '',

            lastName: isPlausibleArabicName(topB, 'last') ? normalizePersonName(topB) : '',

          };

        }

      }



      if (windowCandidates.length === 1) {

        const single = cleanupArabicIdentityName(windowCandidates[0].normalized, 'first');

        const parts = single.split(' ').filter(Boolean);

        if (parts.length >= 2) {

          const guessLast = normalizePersonName(parts[0]);

          const guessFirst = normalizePersonName(parts.slice(1).join(' '));

          if (isPlausibleArabicName(guessFirst, 'first') || isPlausibleArabicName(guessLast, 'last')) {

            return {

              lastName: isPlausibleArabicName(guessLast, 'last') ? guessLast : '',

              firstName: isPlausibleArabicName(guessFirst, 'first') ? guessFirst : '',

            };

          }

        }

      }

    }

  }



  const pickFromLabelledLines = (labelRegexList, mode = 'first') => {

    for (let i = 0; i < lines.length; i += 1) {

      const line = lines[i];

      const matchedRegex = labelRegexList.find((regex) => regex.test(line));

      if (!matchedRegex) continue;



      const inlineCandidate = normalizeNameCandidate(

        line.replace(matchedRegex, '').replace(/^[:\- ]+/, '')

      );

      if (isLikelyNameLine(inlineCandidate)) {

        if (documentType === 'cin_tn') {

          const cleaned = cleanupArabicIdentityName(inlineCandidate, mode);

          if (cleaned) return cleaned;

        }

        return inlineCandidate;

      }



      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j += 1) {

        if (isLikelyNameLine(lines[j])) {

          const normalized = normalizeNameCandidate(lines[j]);

          if (documentType === 'cin_tn') {

            const cleaned = cleanupArabicIdentityName(normalized, mode);

            if (cleaned) return cleaned;

          }

          return normalized;

        }

      }

    }

    return '';

  };



  const labelledLastName = pickFromLabelledLines([

    /\bnom\b/i,

    /\bsurname\b/i,

    /\bfamily\s*name\b/i,

    /\blast\s*name\b/i,

    /\u0627\u0644\u0644\u0642\u0628/i,

  ], 'last');

  const labelledFirstName = pickFromLabelledLines([

    /\bpr.?nom(?:s)?\b/i,

    /\bgiven\s*name(?:s)?\b/i,

    /\bfirst\s*name\b/i,

    /\bforename\b/i,

    /\u0627\u0644\u0627\u0633\u0645/i,

  ], 'first');

  if (labelledFirstName || labelledLastName) {

    return { firstName: labelledFirstName, lastName: labelledLastName };

  }



  const mrz = clean.toUpperCase().match(/P<([A-Z<]{3})([A-Z<]+)<<([A-Z<]+)/);

  if (mrz) {

    return {

      firstName: normalizePersonName((mrz[3] || '').replace(/</g, ' ')),

      lastName: normalizePersonName((mrz[2] || '').replace(/</g, ' ')),

    };

  }



  const candidateLines = lines

    .map((line) => normalizeNameCandidate(line))

    .filter((line) => isLikelyNameLine(line));



  if ((documentType === 'cin_tn' || documentType === 'passport_tn' || documentType === 'passport_foreign') && candidateLines.length > 0) {

    if (candidateLines.length >= 2) {

      return {

        firstName: documentType === 'cin_tn' ? cleanupArabicIdentityName(candidateLines[1], 'first') || normalizePersonName(candidateLines[1]) : normalizePersonName(candidateLines[1]),

        lastName: documentType === 'cin_tn' ? cleanupArabicIdentityName(candidateLines[0], 'last') || normalizePersonName(candidateLines[0]) : normalizePersonName(candidateLines[0]),

      };

    }



    const parts = candidateLines[0].split(' ').filter(Boolean);

    if (parts.length >= 2) {

      const guessLast = normalizePersonName(parts[0]);

      const guessFirst = normalizePersonName(parts.slice(1).join(' '));

      if (isPlausibleArabicName(guessFirst, 'first') || isPlausibleArabicName(guessLast, 'last')) {

        return {

          lastName: isPlausibleArabicName(guessLast, 'last') ? guessLast : '',

          firstName: isPlausibleArabicName(guessFirst, 'first') ? guessFirst : '',

        };

      }

    }

  }



  return { firstName: '', lastName: '' };

}

async function extractIdentityDataFromImage(imageAbsolutePath, documentType, options = {}) {

  const { maxSizeBytes = 4 * 1024 * 1024, fileSize = 0 } = options;

  if (fileSize > maxSizeBytes) {

    return {

      ocrText: '',

      extractedNumber: '',

      skipped: true,

      reason: 'file_too_large',

    };

  }



  const containsArabicLetters = (value) => /[\u0600-\u06FF]/.test(String(value || ''));



  const normalizeArabicCandidate = (value) => normalizePersonName(String(value || '')

    .replace(/[^\u0600-\u06FF\s]/g, ' ')

    .replace(/\s+/g, ' ')

    .trim());



    const cleanIdentityName = (value, mode) => {

    const blockedPattern = /^(?:\u0627\u0644\u0644\u0642\u0628|\u0627\u0644\u0627\u0633\u0645|\u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629|\u0627\u0644\u062A\u0648\u0646\u0633\u064A\u0629|\u0628\u0637\u0627\u0642\u0629|\u0627\u0644\u062A\u0639\u0631\u064A\u0641|\u0627\u0644\u0648\u0637\u0646\u064A\u0629|\u062A\u0627\u0631\u064A\u062E|\u0627\u0644\u0648\u0644\u0627\u062F\u0629|\u0627\u0644\u0639\u0646\u0648\u0627\u0646|\u0627\u0644\u062C\u0646\u0633|\u0627\u0644\u0645\u0647\u0646\u0629)$/;

    const tokens = String(value || '').match(/[\u0600-\u06FF]{2,}/g) || [];

    const filtered = tokens.filter((t) => !blockedPattern.test(t) && t !== '\u0628\u0646' && t !== '\u0628\u0646\u062A');

    if (filtered.length === 0) return '';

    if (mode === 'last') return normalizePersonName(filtered[0]);

    return normalizePersonName(filtered.slice(0, 2).join(' '));

  };



  const isPlausibleArabicName = (value, mode) => {

    const v = normalizeArabicCandidate(value);

    if (!v || !containsArabicLetters(v)) return false;

    const tokens = v.split(' ').filter(Boolean);

    if (tokens.length === 0 || tokens.length > 3) return false;

    const maxToken = Math.max(...tokens.map((t) => t.length));

    if (maxToken < 3) return false;

    if (mode === 'last' && /^(\u0627\u0644\u062F\u064A\u0646|\u0627\u0644\u0644\u0647)$/.test(tokens[0])) return false;

    return true;

  };



  const extractNamesFromLines = (lines) => {

    const normalizedLines = (lines || []).map((line) => String(line || '').trim()).filter(Boolean);

    let firstName = '';

    let lastName = '';



    for (let i = 0; i < normalizedLines.length; i += 1) {

      const line = normalizedLines[i];

      if (!lastName && /(?:\u0627?\u0644?\u0644\u0642\u0628)/.test(line)) {

        const inline = cleanIdentityName(line.replace(/\u0627\u0644\u0644\u0642\u0628/g, ' '), 'last');

        if (isPlausibleArabicName(inline, 'last')) {

          lastName = inline;

        } else {

          const next = cleanIdentityName(normalizedLines[i + 1] || '', 'last');

          if (isPlausibleArabicName(next, 'last')) lastName = next;

        }

      }

      if (!firstName && /(?:\u0627?\u0644?\u0627\u0633\u0645)/.test(line)) {

        const inline = cleanIdentityName(line.replace(/\u0627\u0644\u0627\u0633\u0645/g, ' '), 'first');

        if (isPlausibleArabicName(inline, 'first')) {

          firstName = inline;

        } else {

          const next = cleanIdentityName(normalizedLines[i + 1] || '', 'first');

          if (isPlausibleArabicName(next, 'first')) firstName = next;

        }

      }

    }



    if (!firstName || !lastName) {

      const plain = normalizedLines

        .map((line) => cleanIdentityName(line, 'first'))

        .filter((line) => isPlausibleArabicName(line, 'first') && !/\b(?:\u0628\u0646|\u0628\u0646\u062A)\b/.test(line));



      const kinshipIndex = normalizedLines.findIndex((line) => /\b(?:\u0628\u0646|\u0628\u0646\u062A)\b/.test(line));

      if (!firstName && kinshipIndex > 0) {

        const beforeKinship = cleanIdentityName(normalizedLines[kinshipIndex - 1] || '', 'first');

        if (isPlausibleArabicName(beforeKinship, 'first') && (!lastName || beforeKinship !== lastName)) {

          firstName = beforeKinship;

        }

      }



      if (!firstName && plain.length > 0) {

        firstName = plain.find((item) => !lastName || item !== lastName) || plain[0] || '';

      }



      if (!lastName && plain.length > 0) {

        const lastCandidate = plain.find((item) => !firstName || item !== firstName) || plain[0] || '';

        const normalizedLast = cleanIdentityName(lastCandidate, 'last');

        if (isPlausibleArabicName(normalizedLast, 'last')) {

          lastName = normalizedLast;

        }

      }

    }



    return {

      firstName: isPlausibleArabicName(firstName, 'first') ? firstName : '',

      lastName: isPlausibleArabicName(lastName, 'last') ? lastName : '',

    };

  };

  const extractNamesFromWordBoxes = (wordBoxes) => {

    if (!Array.isArray(wordBoxes) || wordBoxes.length === 0) return { firstName: '', lastName: '' };



    const boxes = wordBoxes

      .map((w) => ({

        text: String(w.text || '').trim(),

        x0: Number(w.x0 || 0),

        y0: Number(w.y0 || 0),

        x1: Number(w.x1 || 0),

        y1: Number(w.y1 || 0),

      }))

      .filter((w) => w.text && Number.isFinite(w.x0) && Number.isFinite(w.y0) && Number.isFinite(w.x1) && Number.isFinite(w.y1));



    if (boxes.length === 0) return { firstName: '', lastName: '' };



    const maxX = Math.max(...boxes.map((w) => w.x1));

    const maxY = Math.max(...boxes.map((w) => w.y1));

    if (!Number.isFinite(maxX) || !Number.isFinite(maxY) || maxX <= 0 || maxY <= 0) return { firstName: '', lastName: '' };



    const xMin = maxX * 0.48;

    const yMin = maxY * 0.18;

    const yMax = maxY * 0.72;



    const zone = boxes.filter((w) => w.x0 >= xMin && w.y0 >= yMin && w.y1 <= yMax && containsArabicLetters(w.text));

    if (zone.length === 0) return { firstName: '', lastName: '' };



    const sorted = zone.sort((a, b) => {

      const ay = (a.y0 + a.y1) / 2;

      const by = (b.y0 + b.y1) / 2;

      if (Math.abs(ay - by) > Math.max(10, maxY * 0.02)) return ay - by;

      return a.x0 - b.x0;

    });



    const lines = [];

    const threshold = Math.max(10, maxY * 0.025);

    for (const word of sorted) {

      const yc = (word.y0 + word.y1) / 2;

      const last = lines[lines.length - 1];

      if (!last || Math.abs(last.y - yc) > threshold) {

        lines.push({ y: yc, words: [word] });

      } else {

        last.words.push(word);

      }

    }



    const lineTexts = lines

      .map((line) => line.words.sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(' '))

      .map((txt) => txt.replace(/[|`~]/g, ' ').replace(/\s+/g, ' ').trim())

      .filter(Boolean);



    return extractNamesFromLines(lineTexts);

  };



  const namesQualityScore = (names) => {

    const f = String(names?.firstName || '').trim();

    const l = String(names?.lastName || '').trim();

    let score = 0;

    if (isPlausibleArabicName(f, 'first')) score += 3;

    if (isPlausibleArabicName(l, 'last')) score += 3;

    if (containsArabicLetters(f)) score += 1;

    if (containsArabicLetters(l)) score += 1;

    return score;

  };



  const runOcrWithTimeout = async (languages, config = {}) => {

    const recognitionPromise = Tesseract.recognize(imageAbsolutePath, languages, config);

    const timeoutPromise = new Promise((_, reject) => {

      setTimeout(() => reject(new Error(`OCR timeout (${languages})`)), 15000);

    });

    return Promise.race([recognitionPromise, timeoutPromise]);

  };



  const callOpenAiOcr = async () => {

    if (!OPENAI_API_KEY) return null;

    let timeoutId = null;

    try {

      const imageBuffer = fs.readFileSync(imageAbsolutePath);

      const imageBase64 = imageBuffer.toString('base64');

      const controller = new AbortController();

      timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('https://api.openai.com/v1/responses', {

        method: 'POST',

        headers: {

          Authorization: `Bearer ${OPENAI_API_KEY}`,

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          model: OPENAI_OCR_MODEL,

          input: [

            {

              role: 'user',

              content: [

                {

                  type: 'input_text',

                  text: 'Extract raw text from this identity document image. Return only plain text lines in reading order, with no explanation.',

                },

                {

                  type: 'input_image',

                  image_url: `data:image/jpeg;base64,${imageBase64}`,

                },

              ],

            },

          ],

        }),

        signal: controller.signal,

      });

      clearTimeout(timeoutId);

      timeoutId = null;



      if (!response.ok) {

        const detail = await response.text().catch(() => '');

        return {

          ok: false,

          status: response.status,

          reason: `openai_http_${response.status}`,

          detail: detail.slice(0, 200),

        };

      }



      const payload = await response.json().catch(() => null);

      const text = String(

        payload?.output_text

        || payload?.output?.map((item) => item?.content?.map((part) => part?.text || '').join('\n') || '').join('\n')

        || ''

      ).trim();



      if (!text) {

        return { ok: false, status: 500, reason: 'openai_empty_text', detail: '' };

      }

      return { ok: true, text };

    } catch (error) {

      if (String(error?.name || '').toLowerCase() === 'aborterror') {

        return { ok: false, status: 504, reason: 'openai_timeout', detail: '' };

      }

      return { ok: false, status: 500, reason: 'openai_exception', detail: String(error?.message || error) };

    } finally {

      if (timeoutId) clearTimeout(timeoutId);

    }

  };

  try {

    const openAiResult = await callOpenAiOcr();

    if (openAiResult?.ok && openAiResult.text) {

      const openAiText = String(openAiResult.text || '');

      const openAiNames = extractIdentityNamesFromText(openAiText, documentType);

      const openAiNumber = extractIdentityNumberFromText(openAiText, documentType);

      const hasUsefulOpenAiNames = !!(openAiNames.firstName || openAiNames.lastName);

      if (openAiNumber || hasUsefulOpenAiNames) {

        return {

          ocrText: `OCR_OPENAI:\n${openAiText}`,

          extractedNumber: openAiNumber || '',

          extractedFirstName: openAiNames.firstName || '',

          extractedLastName: openAiNames.lastName || '',

          skipped: false,

          reason: 'openai_primary',

        };

      }

    }



    const mixedResult = await runOcrWithTimeout('eng+fra+ara', {});

    const mixedText = String(mixedResult?.data?.text || '');



    let arabicResult = null;

    let arabicText = '';

    if (documentType === 'cin_tn') {

      try {

        arabicResult = await runOcrWithTimeout('ara', {

          tessedit_pageseg_mode: '6',

          preserve_interword_spaces: '1',

        });

        arabicText = String(arabicResult?.data?.text || '');

      } catch (arabicError) {

        console.warn('Arabic OCR pass failed, fallback to mixed OCR:', arabicError?.message || arabicError);

      }

    }



    const candidates = [];

    const namesFromMixedText = extractIdentityNamesFromText(mixedText, documentType);

    candidates.push({ source: 'mixed_text', names: namesFromMixedText });



    if (arabicText) {

      candidates.push({ source: 'ara_text', names: extractIdentityNamesFromText(arabicText, documentType) });

    }



    if (documentType === 'cin_tn') {

      const wordsArabic = (arabicResult?.data?.words || []).map((w) => ({ text: w.text, x0: w.bbox?.x0, y0: w.bbox?.y0, x1: w.bbox?.x1, y1: w.bbox?.y1 }));

      const wordsMixed = (mixedResult?.data?.words || []).map((w) => ({ text: w.text, x0: w.bbox?.x0, y0: w.bbox?.y0, x1: w.bbox?.x1, y1: w.bbox?.y1 }));

      if (wordsArabic.length > 0) candidates.push({ source: 'ara_zone', names: extractNamesFromWordBoxes(wordsArabic) });

      if (wordsMixed.length > 0) candidates.push({ source: 'mixed_zone', names: extractNamesFromWordBoxes(wordsMixed) });

    }





    const best = candidates

      .map((c) => ({ ...c, score: namesQualityScore(c.names) }))

      .sort((a, b) => b.score - a.score)[0] || { names: { firstName: '', lastName: '' }, score: 0, source: 'none' };



    const mixedNumber = extractIdentityNumberFromText(mixedText, documentType);

    const arabicNumber = arabicText ? extractIdentityNumberFromText(arabicText, documentType) : '';

    const finalNumber = mixedNumber || arabicNumber;



    const mergedText = arabicText

      ? `OCR_MIXED:\n${mixedText}\n\nOCR_ARA:\n${arabicText}`

      : mixedText;



    return {

      ocrText: mergedText,

      extractedNumber: finalNumber,

      extractedFirstName: best.names.firstName || '',

      extractedLastName: best.names.lastName || '',

      skipped: false,

      reason: openAiResult?.ok === false ? `${openAiResult.reason}|best_source:${best.source}` : `best_source:${best.source}`,

    };

  } catch (error) {

    console.warn('OCR extraction failed for reservation identity:', error?.message || error);

    return {

      ocrText: '',

      extractedNumber: '',

      extractedFirstName: '',

      extractedLastName: '',

      skipped: true,

      reason: String(error?.message || 'ocr_failed'),

    };

  }

}

async function generateReservationClientContractHtml({

  demand,

  bien,

  contractId,

  contractCreatedAt,

  totalAmount,

  amountDueNow,

  paymentMode,

  identityNumber,

  identityDocumentType,

  identityFirstName,

  identityLastName,

  cautionAmount,

}) {

  const contractsDir = path.join(__dirname, 'contracts');

  if (!fs.existsSync(contractsDir)) {

    fs.mkdirSync(contractsDir, { recursive: true });

  }

  const fileName = `contract-client-${contractId}.html`;

  const filePath = path.join(contractsDir, fileName);

  const adultGuests = Math.max(1, Number(demand.adult_guests || demand.guests || 1));

  const childGuests = Math.max(0, Number(demand.child_guests || 0));

  const totalGuests = Math.max(1, Number(demand.guests || (adultGuests + childGuests) || 1));

  const reservationTotal = Number(totalAmount || 0);

  const amountNow = Number(amountDueNow || 0);

  const balance = Math.max(0, reservationTotal - amountNow);

  const fullName = `${String(identityLastName || '').trim()} ${String(identityFirstName || '').trim()}`.trim() || String(demand?.client_name || demand?.client_email || '');

  const identityRef = identityDocumentType === 'cin_tn'

    ? `CIN ${String(identityNumber || '').trim()}`

    : `Passeport ${String(identityNumber || '').trim()}`;

  const start = parseSqlDateParts(demand.start_date);

  const end = parseSqlDateParts(demand.end_date);

  const finalization = parseSqlDateTimeParts(demand.payment_deadline_at || demand.finalization_due_at || contractCreatedAt);

  const modePaiement = normalizePaymentModeForTemplate(paymentMode, demand?.payment_method);

  const equipementsListe = Array.isArray(bien?.caracteristiques) ? bien.caracteristiques : [];

  const equipementsNormalises = equipementsListe

    .map((row) => {

      const text = String(row || '').trim();

      if (!text) return '';

      const idx = text.indexOf(':');

      return (idx >= 0 ? text.slice(0, idx) : text).trim();

    })

    .filter(Boolean);

  if (equipementsNormalises.length === 0) {

    equipementsNormalises.push(

      String(bien?.reference || '').trim() && `Ref ${String(bien.reference).trim()}`,

      String(bien?.titre || demand?.bien_titre || '').trim(),

      String(bien?.type || '').trim()

    );

  }

  const equipementsTitre = [

    String(bien?.reference || '').trim() ? `Ref ${String(bien.reference).trim()}` : '',

    String(bien?.titre || demand?.bien_titre || '').trim(),

    String(bien?.type || '').trim(),

  ].filter(Boolean).join(', ');

  const manualServices = [

    {

      label: String(demand?.service_1 || '').trim(),

      amount: String(demand?.prix_service_1 || '').trim(),

    },

    {

      label: String(demand?.service_2 || '').trim(),

      amount: String(demand?.prix_service_2 || '').trim(),

    },

    {

      label: String(demand?.service_3 || '').trim(),

      amount: String(demand?.prix_service_3 || '').trim(),

    },

  ].filter((row) => row.label);

  const services = manualServices.length > 0 ? manualServices : parseDemandVariableServices(demand).slice(0, 6);

  const signatureDate = parseSqlDateParts(contractCreatedAt);

  const caution = Number.isFinite(Number(cautionAmount))

    ? Number(cautionAmount)

    : (Number.isFinite(Number(bien?.caution)) ? Number(bien.caution) : 0);

  const phoneCandidate = String(demand?.client_phone || demand?.client_telephone || demand?.phone || '').trim();



  const esc = (value) => escapeHtml(String(value || ''));

  const representativeValue = String(demand?.contract_representative || process.env.CONTRACT_REPRESENTATIVE || 'ghaith').trim().toLowerCase();

  const checkboxChayma = representativeValue === 'chayma' ? '?' : '';

  const checkboxGhaith = representativeValue === 'ghaith' ? '?' : '';

  const startDay = String(start.dd || '');

  const startMonth = String(start.mm || '');

  const endDay = String(end.dd || '');

  const endMonth = String(end.mm || '');

  const finalDay = String(finalization.date.dd || '');

  const finalMonth = String(finalization.date.mm || '');

  const finalHour = String(finalization.hh || '');

  const finalMinute = String(finalization.min || '');

  const heureArrivee = String(demand?.arrival_time || '').trim();

  const heureDepart = String(demand?.departure_time || '').trim();

  const typeLogement = String(bien?.configuration || bien?.type || '');

  const adresseParts = [

    String(bien?.zone_nom || '').trim(),

    String(bien?.zone_quartier || '').trim(),

    String(bien?.zone_gouvernerat || '').trim(),

    String(bien?.zone_region || '').trim(),

    String(bien?.zone_pays || '').trim(),

  ].filter(Boolean);

  const adresseBien = adresseParts.join(', ');

  const saisonCfg = safeParseJson(bien?.location_saisonniere_config_json, {});

  const capaciteCfg = Number(

    saisonCfg?.limite_personnes_nuit

    ?? saisonCfg?.limitePersonnesNuit

    ?? saisonCfg?.limite_personne_nuit

  );

  const capaciteMax = String((Number.isFinite(capaciteCfg) && capaciteCfg > 0) ? Math.floor(capaciteCfg) : totalGuests || '');

  const repartitionVoyageurs = childGuests > 0

    ? `Adultes ${adultGuests} / Enfants ${childGuests}`

    : `Adultes ${adultGuests}`;

  const nights = computeNights(demand.start_date, demand.end_date);

  const loyerTotal = formatAmountTndRaw(reservationTotal);

  const acompteReservation = formatAmountTndRaw(amountNow);

  const soldeArrivee = formatAmountTndRaw(balance);

  const idPaiement = String(demand?.payment_id || demand?.reservation_payment_id || '').trim();

  const villeSignature = String(demand?.signature_city || bien?.ville || 'Kelibia').trim();

  const jourSignature = String(signatureDate.dd || '');

  const moisSignature = String(signatureDate.mm || '');

  const serviceRows = [];

  for (let i = 0; i < 3; i += 1) {

    const service = services[i];

    const label = String(service?.label || service?.name || service?.service || '').trim();

    const amount = Number.isFinite(Number(service?.amount ?? service?.prix ?? service?.price ?? service?.montant))

      ? formatAmountTndRaw(Number(service.amount ?? service.prix ?? service.price ?? service.montant))

      : String(service?.amount || '').trim();

    serviceRows.push({ label, amount });

  }



  const html = `<!DOCTYPE html>

<html lang="fr">

<head>

<meta charset="UTF-8" />

<title>Contrat de Location Saisonniere - DWIRA</title>

<style>

  body { margin:0; background:#e9e9e9; font-family:Arial, Helvetica, sans-serif; color:#000; font-size:16px; line-height:1.25; }

  .page { width:210mm; min-height:297mm; margin:0 auto 12px; background:#fff; padding:20mm 18mm; page-break-after:always; }

  .page:last-child { page-break-after:auto; }

  h1 { text-align:center; font-size:25px; margin:0 0 16px; font-weight:700; }

  h2 { font-size:18px; margin:14px 0 4px; font-weight:700; }

  p { margin:4px 0; }

  .intro-title { font-size:18px; font-weight:700; margin-bottom:10px; }

  .center { text-align:center; font-weight:700; margin:8px 0 10px; }

  .small-italic { font-size:15px; font-style:italic; margin:6px 0 8px; }

  table { width:100%; border-collapse:collapse; table-layout:fixed; }

  td, th { border:1px solid #cfcfcf; padding:7px 8px; vertical-align:middle; }

  .info-table td:first-child,.payment-table td:first-child { width:50%; font-weight:700; background:#f3f3f3; }

  .services-table th { background:#f3f3f3; font-weight:400; text-align:left; }

  .services-table th:nth-child(2),.services-table td:nth-child(2) { text-align:center; }

</style>

</head>

<body>

<section class="page">

  <h1>CONTRAT DE LOCATION SAISONNIERE</h1>

  <div class="intro-title">Entre les soussignes :</div>

  <table class="info-table">

    <tr><td>Le Bailleur :</td><td>Agence Dwira</td></tr>

    <tr><td>Adresse :</td><td>Rue Ibn Khaldoun, Kelibia 8090, Nabeul</td></tr>

    <tr><td>Tel :</td><td>29 879 227 / 52 080 695</td></tr>

    <tr><td>MF :</td><td>1919183/K/A/M/000</td></tr>

    <tr><td>Represente par :</td><td>${esc(checkboxChayma)} Lengliz Chayma, Gerante   ${esc(checkboxGhaith)} Hafsi Ghaith, Responsable commercial</td></tr>

  </table>

  <p class="small-italic">(ci-apres designe "le Bailleur")</p>

  <div class="center">Et</div>

  <table class="info-table">

    <tr><td>Le Locataire :</td><td></td></tr>

    <tr><td>Nom et prenom :</td><td>${esc(fullName)}</td></tr>

    <tr><td>N° CIN ou Passeport :</td><td>${esc(identityRef)}</td></tr>

    <tr><td>Adresse :</td><td>${esc(demand?.client_address || demand?.address || '')}</td></tr>

    <tr><td>Tel :</td><td>${esc(phoneCandidate)}</td></tr>

  </table>

  <p class="small-italic">(ci-apres designe "le Locataire")</p>

  <h2>1. Objet du contrat</h2>

  <p>Le present contrat a pour objet la location d'un bien immobilier meuble a usage exclusif d'habitation saisonniere.</p>

  <h2>2. Designation du bien loue</h2>

  <p>Type de logement : ${esc(typeLogement)}</p>

  <p>Adresse exacte du bien loue : ${esc(adresseBien)}</p>

  <p>Nombre totale de voyageurs : ${esc(totalGuests)}</p>

  <p>Repartition voyageurs : ${esc(repartitionVoyageurs)}</p>

  <p>Titre : ${esc(equipementsTitre)}</p>

  <h2>3. Duree de la location</h2>

  <p>Le present contrat est conclu pour une duree determinee : Du ${esc(startDay)} / ${esc(startMonth)} / ${esc(start.yyyy || '')} au ${esc(endDay)} / ${esc(endMonth)} / ${esc(end.yyyy || '')} (${esc(nights)} nuitee${nights > 1 ? 's' : ''})</p>

  <p>Heure d'arrivee : ${esc(heureArrivee)}</p>

  <p>Heure de depart : ${esc(heureDepart)}</p>

  <p><strong>NB : Le contrat ne pourra etre renouvele automatiquement.</strong></p>

</section>

<section class="page">

  <h2>4. Prix et modalites de paiement</h2>

  <table class="payment-table">

    <tr><td>Loyer total :</td><td>${esc(loyerTotal)} TND</td></tr>

    <tr><td>Acompte verse a la reservation :</td><td>${esc(acompteReservation)} TND</td></tr>

    <tr><td>Date limite paiement avance :</td><td>${esc(finalDay)} / ${esc(finalMonth)} / ${esc(finalization.date.yyyy || '')} a ${esc(finalHour)} h ${esc(finalMinute)}</td></tr>

    <tr><td>N° quittance / ID virement :</td><td>${esc(idPaiement)}</td></tr>

    <tr><td>Solde a regler a l'arrivee :</td><td>${esc(soldeArrivee)} TND</td></tr>

    <tr><td>Mode de paiement :</td><td>${esc(modePaiement)}</td></tr>

    <tr><td>Coordonnees pour le versement de l'avance :</td><td>Titulaire : DWIRA KELIBIA<br>Adresse : Rue Ibn Khaldoun, Kelibia 8090, Nabeul</td></tr>

    <tr><td>RIB / Compte N° :</td><td>14 069 0691017000664 77</td></tr>

    <tr><td>Contact de confirmation :</td><td>29 879 227 / 52 080 695</td></tr>

  </table>

  <p class="small-italic">A defaut de paiement de l'avance a la date d'echeance ci-dessus, le present contrat sera annule automatiquement de plein droit, sans autre formalite.</p>

  <h2>4.1 Services supplementaires payants</h2>

  <table class="services-table">

    <tr><th>Service</th><th>Prix (TND)</th></tr>

    <tr><td>${esc(serviceRows[0].label)}</td><td>${esc(serviceRows[0].amount)}</td></tr>

    <tr><td>${esc(serviceRows[1].label)}</td><td>${esc(serviceRows[1].amount)}</td></tr>

    <tr><td>${esc(serviceRows[2].label)}</td><td>${esc(serviceRows[2].amount)}</td></tr>

  </table>

  <h2>5. Depot de garantie</h2>

  <p>Un depot de garantie de ${esc(formatAmountTndRaw(caution))} TND est exige a la remise des cles.</p>

  <p>Il sera restitue apres etat des lieux de sortie, deduction faite des eventuelles degradations ou manquements constates.</p>

  <h2>6. Obligations du Locataire</h2>

  <ul>

    <li>Utiliser les lieux en "bon pere de famille"</li>

    <li>Respecter la capacite d'accueil autorisee</li>

    <li>Ne pas organiser de fetes ou evenements sans accord du Bailleur</li>

    <li>Respecter le voisinage</li>

    <li>Signaler toute degradation ou panne</li>

    <li>Ne pas sous-louer le logement</li>

    <li>Rendre le logement propre a la fin du sejour</li>

  </ul>

  <h2>7. Obligations du Bailleur</h2>

  <ul>

    <li>Fournir un logement propre, fonctionnel et conforme a la description</li>

    <li>Assurer l'entretien des equipements fournis</li>

    <li>Intervenir en cas de besoin technique ou panne grave</li>

  </ul>

</section>

<section class="page">

  <h2>8. Annulation</h2>

  <p>En cas d'annulation par le Locataire :</p>

  <ul>

    <li>Plus de 30 jours avant l'arrivee : remboursement total de l'acompte</li>

    <li>Moins de 30 jours : acompte non rembourse</li>

  </ul>

  <p>En cas d'annulation par le Bailleur, l'acompte sera restitue integralement.</p>

  <h2>9. Assurance</h2>

  <p>Le Locataire est responsable des dommages causes au logement ou a des tiers. Il est invite a souscrire une assurance "villegiature" (facultative).</p>

  <h2>10. Etat des lieux</h2>

  <p>Un etat des lieux d'entree et de sortie sera realise conjointement. Il servira de reference en cas de litige.</p>

  <h2>11. Litiges</h2>

  <p>Tout litige relatif a l'interpretation ou a l'execution du present contrat releve de la competence des tribunaux de Nabeul.</p>

  <p>Fait a ${esc(villeSignature)}, le ${esc(jourSignature)} / ${esc(moisSignature)} / ${esc(signatureDate.yyyy || '')}</p>

  <p>En deux exemplaires originaux, dont un remis a chaque partie.</p>

  <p><strong>Signature du Locataire</strong> (precedee de la mention "Lu et approuve")</p>

  <p><strong>Signature du Bailleur</strong> (precedee de la mention "Lu et approuve")</p>

  <p>${esc(checkboxChayma)} Lengliz Chayma, Gerante<br>${esc(checkboxGhaith)} Hafsi Ghaith, Responsable commercial</p>

</section>

</body>

</html>`;



  await fs.promises.writeFile(filePath, html, 'utf8');

  return `/contracts/${fileName}`;

}



async function generateReservationOwnerContractHtml({

  demand,

  bien,

  owner,

  contractId,

  contractCreatedAt,

  totalAmount,

  amountDueNow,

  paymentMode,

}) {

  const contractsDir = path.join(__dirname, 'contracts');

  if (!fs.existsSync(contractsDir)) {

    fs.mkdirSync(contractsDir, { recursive: true });

  }

  const fileName = `contract-owner-${contractId}.html`;

  const filePath = path.join(contractsDir, fileName);

  const nights = computeNights(demand.start_date, demand.end_date);

  const stayPeriodLabel = formatStayPeriodFr(demand.start_date, demand.end_date);

  const adultGuests = Math.max(1, Number(demand.adult_guests || demand.guests || 1));

  const childGuests = Math.max(0, Number(demand.child_guests || 0));

  const totalGuests = Math.max(1, Number(demand.guests || (adultGuests + childGuests) || 1));

  const reservationTotal = Number(totalAmount || 0);

  const servicesQuoteTotal = Number(demand?.variable_services_quote_total || 0);

  const hasServicesQuote = servicesQuoteTotal > 0;

  const globalTotal = reservationTotal + servicesQuoteTotal;

  const balance = Math.max(0, reservationTotal - Number(amountDueNow || 0));

  const nowDisplay = new Date(String(contractCreatedAt).replace(' ', 'T')).toLocaleString('fr-FR', { timeZone: AGENCY_TIME_ZONE, hour12: false });

  const paymentModeLabel = paymentMode === 'totalite' ? 'Totalite' : 'Avance';



  const html = `<!doctype html>

<html lang="fr">

<head>

  <meta charset="utf-8" />

  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>Contrat proprietaire ${escapeHtml(contractId)}</title>

  <style>

    body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; background: #f4f6f8; color: #0f172a; }

    .page { max-width: 980px; margin: 28px auto; background: #fff; border: 1px solid #d7dee5; border-radius: 14px; padding: 24px; }

    h1 { margin: 0; font-size: 28px; }

    h2 { margin: 20px 0 8px; font-size: 17px; color: #0b4f39; }

    .muted { color: #64748b; font-size: 13px; }

    .meta { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 14px; }

    .box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }

    .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }

    p { margin: 4px 0; line-height: 1.5; }

    ul { margin: 6px 0 0 20px; }

    .sign { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 20px; }

    .sign .box { min-height: 110px; }

    @media print { body { background: #fff; } .page { margin: 0; border: 0; border-radius: 0; } }

  </style>

</head>

<body>

  <main class="page">

    <h1>Contrat agence - proprietaire</h1>

    <p class="muted">Genere automatiquement le ${escapeHtml(nowDisplay)} - Ref contrat: ${escapeHtml(contractId)}</p>



    <div class="meta">

      <div class="box">

        <h2>Proprietaire</h2>

        <p><strong>Nom:</strong> ${escapeHtml(owner?.nom || '-')}</p>

        <p><strong>Email:</strong> ${escapeHtml(owner?.email || '-')}</p>

      </div>

      <div class="box">

        <h2>Agence</h2>

        <p><strong>Agence:</strong> Dwira Immobilier</p>

      </div>

    </div>



    <h2>Reservation associee</h2>

    <div class="box">

      <p><strong>Reference:</strong> ${escapeHtml(bien?.reference || demand.bien_id)}</p>

      <p><strong>Titre:</strong> ${escapeHtml(bien?.titre || demand.bien_titre || 'Bien')}</p>

      <p><strong>Periode:</strong> ${escapeHtml(stayPeriodLabel)}</p>

      <p><strong>Voyageurs:</strong> ${escapeHtml(String(totalGuests))} (Adultes: ${escapeHtml(String(adultGuests))}, Enfants: ${escapeHtml(String(childGuests))})</p>

    </div>



    <h2>Conditions financieres</h2>

    <div class="grid3">

      <div class="box"><p class="muted">Montant reservation</p><p><strong>${escapeHtml(formatCurrency(reservationTotal))}</strong></p></div>

      ${hasServicesQuote ? `<div class="box"><p class="muted">Devis services</p><p><strong>${escapeHtml(formatCurrency(servicesQuoteTotal))}</strong></p></div>` : ''}

      <div class="box"><p class="muted">Montant global</p><p><strong>${escapeHtml(formatCurrency(hasServicesQuote ? globalTotal : reservationTotal))}</strong></p></div>

      <div class="box"><p class="muted">Methode de paiement client</p><p><strong>${escapeHtml(paymentModeLabel)}</strong></p></div>

      <div class="box"><p class="muted">Reste client</p><p><strong>${escapeHtml(formatCurrency(balance))}</strong></p></div>

    </div>

    ${hasServicesQuote ? `

    <div class="box" style="margin-top: 10px;">

      <p><strong>Note services payants:</strong> le montant global inclut le devis des services additionnels confirmes pour cette reservation.</p>

    </div>` : ''}



    <div class="sign">

      <div class="box"><p><strong>Signature proprietaire</strong></p><p class="muted">Lu et approuve</p></div>

      <div class="box"><p><strong>Signature agence</strong></p><p class="muted">Cachet et signature</p></div>

    </div>

  </main>

</body>

</html>`;



  await fs.promises.writeFile(filePath, html, 'utf8');

  return `/contracts/${fileName}`;

}



async function generateAmicaleVoucherHtml({

  demand,

  bien,

  amicale,

  voucherNumber,

  generatedAt,

}) {

  const vouchersDir = path.join(__dirname, 'contracts', 'amicale-vouchers');

  if (!fs.existsSync(vouchersDir)) {

    fs.mkdirSync(vouchersDir, { recursive: true });

  }

  const safeVoucherNumber = String(voucherNumber || '').trim() || `VCH-${String(demand?.id || '').slice(-8).toUpperCase()}`;

  const safeDemandId = String(demand?.id || 'demand').replace(/[^a-zA-Z0-9_-]/g, '_');

  const fileName = `voucher-${safeDemandId}.html`;

  const pdfFileName = `voucher-${safeDemandId}.pdf`;

  const voucherRelativePath = `/contracts/amicale-vouchers/${fileName}`;

  const voucherPdfRelativePath = `/contracts/amicale-vouchers/${pdfFileName}`;

  const voucherPublicUrl = `${String(CANONICAL_FRONTEND_URL || '').replace(/\/+$/, '')}${voucherRelativePath}`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(voucherPublicUrl)}`;

  const filePath = path.join(vouchersDir, fileName);

  const pdfPath = path.join(vouchersDir, pdfFileName);

  const parseDayMonth = (value) => {

    if (value instanceof Date && !Number.isNaN(value.getTime())) {

      return {

        day: String(value.getDate()).padStart(2, '0'),

        month: String(value.getMonth() + 1).padStart(2, '0'),

      };

    }

    const raw = String(value || '').trim();

    if (!raw || raw === 'undefined' || raw === 'null') return { day: '--', month: '--' };

    const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoLike) return { day: isoLike[3], month: isoLike[2] };

    const frLike = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

    if (frLike) return { day: frLike[1], month: frLike[2] };

    const normalized = raw.replace(' ', 'T');

    const parsed = new Date(normalized);

    if (!Number.isNaN(parsed.getTime())) {

      return {

        day: String(parsed.getDate()).padStart(2, '0'),

        month: String(parsed.getMonth() + 1).padStart(2, '0'),

      };

    }

    return { day: '--', month: '--' };

  };

  const startCandidate = demand.start_date || demand.startDate || demand.date_debut || demand.start || null;

  const endCandidate = demand.end_date || demand.endDate || demand.date_fin || demand.end || null;

  let startDM = parseDayMonth(startCandidate);

  let endDM = parseDayMonth(endCandidate);

  if ((startDM.day === '--' || startDM.month === '--' || endDM.day === '--' || endDM.month === '--')) {

    const label = formatStayPeriodFr(startCandidate, endCandidate);

    const m = String(label || '').match(/(\d{2})\/(\d{2})\/\d{4}.*?(\d{2})\/(\d{2})\/\d{4}/);

    if (m) {

      startDM = { day: m[1], month: m[2] };

      endDM = { day: m[3], month: m[4] };

    }

  }

  const startDay = startDM.day;

  const startMonth = startDM.month;

  const endDay = endDM.day;

  const endMonth = endDM.month;

  const totalGuests = Math.max(1, Number(demand.guests || 1));

  const adultGuests = Math.max(1, Number(demand.adult_guests || demand.guests || 1));

  const childGuests = Math.max(0, Number(demand.child_guests || 0));

  const createdAtLabel = formatDateFr(generatedAt || demand.agency_validation_at || demand.updated_at || getAgencySqlDateTime());

  const backgroundUrl = `${String(CANONICAL_FRONTEND_URL || '').replace(/\/+$/, '')}/voucher-template/vide.jpg`;

  const amicaleLogoUrl = String(amicale?.logoUrl || demand?.amicale_logo_url || '').trim();

  const peopleText = `${totalGuests} (Adultes: ${adultGuests}, Enfants: ${childGuests})`;

  const voucherIdText = String(demand?.id || safeVoucherNumber).trim();

  const voucherIdUrl = `${String(CANONICAL_FRONTEND_URL || '').replace(/\/+$/, '')}${voucherPdfRelativePath}`;

  const qrCodePdfUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(voucherIdUrl)}`;



  const html = `<!doctype html>

<html lang="fr">

<head>

  <meta charset="utf-8" />

  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>Voucher amicale ${escapeHtml(safeVoucherNumber)}</title>

  <style>

    body { margin: 0; background: #f1f5f9; font-family: Arial, sans-serif; }

    .sheet { width: 1536px; height: 1024px; position: relative; margin: 0 auto; background: url('${escapeHtml(backgroundUrl)}') no-repeat center/cover; }

    .txt { position: absolute; color: #0f172a; font-weight: 600; font-size: 24px; line-height: 1.1; }

    .small { font-size: 20px; }

    .logo { position: absolute; left: 70px; top: 120px; width: 200px; height: 200px; border-radius: 999px; object-fit: contain; }

    .qr { position: absolute; left: 406px; top: 808px; width: 132px; height: 132px; object-fit: contain; }

    .id { position: absolute; left: 622px; top: 896px; width: 385px; font-size: 22px; font-weight: 700; color: #0f172a; }

    .meta { position: absolute; left: 430px; top: 26px; font-size: 20px; color: #0f766e; font-weight: 700; }

    @media print {

      body { background: #fff; }

      .sheet { margin: 0; }

    }

  </style>

</head>

<body>

  <main class="sheet">

    ${amicaleLogoUrl ? `<img class="logo" src="${escapeHtml(amicaleLogoUrl)}" alt="Logo amicale" />` : ''}

    <div class="meta">Voucher ${escapeHtml(safeVoucherNumber)} | Genere le ${escapeHtml(createdAtLabel)}</div>

    <div class="txt" style="left: 644px; top: 429px; width: 420px;">${escapeHtml(String(demand.client_name || '-'))}</div>

    <div class="txt" style="left: 596px; top: 504px; width: 430px;">${escapeHtml(String(demand.amicale_phone || '-'))}</div>

    <div class="txt" style="left: 654px; top: 573px; width: 390px;">${escapeHtml(String(bien?.reference || demand.bien_id || '-'))}</div>

    <div class="txt small" style="left: 638px; top: 647px; width: 48px; text-align:center;">${escapeHtml(startDay)}</div>

    <div class="txt small" style="left: 698px; top: 647px; width: 48px; text-align:center;">${escapeHtml(startMonth)}</div>

    <div class="txt small" style="left: 845px; top: 649px; width: 48px; text-align:center;">${escapeHtml(endDay)}</div>

    <div class="txt small" style="left: 909px; top: 648px; width: 48px; text-align:center;">${escapeHtml(endMonth)}</div>

    <div class="txt small" style="left: 675px; top: 719px; width: 390px;">${escapeHtml(peopleText)}</div>

    <img class="qr" src="${escapeHtml(qrCodeUrl)}" alt="QR Voucher" />

    <div class="id">${escapeHtml(voucherIdText)}</div>

  </main>

</body>

</html>`;



  await fs.promises.writeFile(filePath, html, 'utf8');



  const sheetWidth = 1536;

  const sheetHeight = 1024;



  const loadImageBuffer = async (urlValue) => {

    const raw = String(urlValue || '').trim();

    if (!raw) return null;

    if (raw.startsWith('data:')) {

      const idx = raw.indexOf('base64,');

      if (idx < 0) return null;

      return Buffer.from(raw.slice(idx + 7), 'base64');

    }

    try {

      const response = await fetch(raw);

      if (!response.ok) return null;

      const arr = await response.arrayBuffer();

      return Buffer.from(arr);

    } catch {

      return null;

    }

  };



  try {

    const pdfDoc = await PDFDocument.create();

    const page = pdfDoc.addPage([sheetWidth, sheetHeight]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);



    const bgLocalPath = path.resolve(__dirname, '../public/voucher-template/vide.jpg');

    if (fs.existsSync(bgLocalPath)) {

      const bgBytes = await fs.promises.readFile(bgLocalPath);

      const bgImage = await pdfDoc.embedJpg(bgBytes);

      page.drawImage(bgImage, { x: 0, y: 0, width: sheetWidth, height: sheetHeight });

    }



    if (amicaleLogoUrl) {

      const logoBytes = await loadImageBuffer(amicaleLogoUrl);

      if (logoBytes) {

        let logoImage = null;

        const lower = amicaleLogoUrl.toLowerCase();

        if (lower.includes('image/png') || lower.endsWith('.png')) {

          logoImage = await pdfDoc.embedPng(logoBytes).catch(() => null);

        }

        if (!logoImage) {

          logoImage = await pdfDoc.embedJpg(logoBytes).catch(() => null);

        }

        if (logoImage) {

          page.drawImage(logoImage, { x: 70, y: sheetHeight - 120 - 200, width: 200, height: 200 });

        }

      }

    }



    const qrBytes = await loadImageBuffer(qrCodePdfUrl);

    if (qrBytes) {

      const qrImage = await pdfDoc.embedPng(qrBytes).catch(() => null);

      if (qrImage) {

        page.drawImage(qrImage, { x: 406, y: sheetHeight - 808 - 132, width: 132, height: 132 });

      }

    }



    const drawTextTop = (text, left, top, size = 24, bold = true, color = rgb(0.06, 0.09, 0.16)) => {

      page.drawText(String(text || '-'), {

        x: left,

        y: sheetHeight - top - size,

        size,

        font: bold ? fontBold : fontRegular,

        color,

      });

    };



    drawTextTop(`Voucher ${safeVoucherNumber} | Genere le ${createdAtLabel}`, 430, 26, 20, true, rgb(0.05, 0.46, 0.43));

    drawTextTop(String(demand.client_name || '-'), 644, 429, 24);

    drawTextTop(String(demand.amicale_phone || '-'), 596, 504, 24);

    drawTextTop(String(bien?.reference || demand.bien_id || '-'), 654, 573, 24);

    drawTextTop(String(startDay || '--'), 638, 647, 20);

    drawTextTop(String(startMonth || '--'), 698, 647, 20);

    drawTextTop(String(endDay || '--'), 845, 649, 20);

    drawTextTop(String(endMonth || '--'), 909, 648, 20);

    drawTextTop(peopleText, 675, 719, 20);

    drawTextTop(voucherIdText, 622, 896, 22, true);



    const pdfBytes = await pdfDoc.save();

    await fs.promises.writeFile(pdfPath, Buffer.from(pdfBytes));

    return voucherPdfRelativePath;

  } catch (pdfError) {

    console.warn('Voucher PDF generation failed, fallback to HTML:', pdfError?.message || pdfError);

    return voucherRelativePath;

  }

}



async function appendReservationDemandHistory(demandId, status, actorType, actorId, note, createdAt = getAgencySqlDateTime()) {

  const historyId = `rdh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await pool.query(

    `INSERT INTO reservation_demand_history (id, demand_id, status, actor_type, actor_id, note, created_at)

     VALUES (?, ?, ?, ?, ?, ?, ?)`,

    [historyId, demandId, status, actorType, actorId || null, note || null, createdAt]

  );

}



async function createAdminNotification(type, message, createdAt = getAgencySqlDateTime()) {
  const notificationId = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    'INSERT INTO admin_notifications (id, type, message, lu, created_at) VALUES (?, ?, ?, 0, ?)',
    [notificationId, type || 'info', message, createdAt]
  );
  return notificationId;
}

async function createAdminNotificationWithPush(
  type,
  message,
  {
    title = 'Alerte admin',
    kind = 'admin_alert',
    data = {},
    createdAt = getAgencySqlDateTime(),
  } = {}
) {
  const notificationId = await createAdminNotification(type, message, createdAt);
  await pushToAdminDevices({
    title,
    body: message,
    data: {
      kind,
      notificationId,
      ...data,
    },
  }).catch((error) => {
    console.warn('[FCM] admin push failed:', error?.message || error);
  });
  return notificationId;
}


async function syncClienteleTasks(sourceTable, sourceId) {

  const profile = await fetchClienteleProfileBySource(sourceTable, sourceId);

  const now = new Date();

  const nowSql = getAgencySqlDateTime(now);

  const tasks = [];

  let clientEmail = profile?.email || null;



  if (sourceTable === 'locataires' && !clientEmail) {

    const [locataireRows] = await pool.query('SELECT email FROM locataires WHERE id = ? LIMIT 1', [sourceId]);

    clientEmail = locataireRows[0]?.email || null;

  }

  if (sourceTable === 'proprietaires' && !clientEmail) {

    const [ownerRows] = await pool.query('SELECT email FROM proprietaires WHERE id = ? LIMIT 1', [sourceId]);

    clientEmail = ownerRows[0]?.email || null;

  }



  if (sourceTable === 'locataires') {

    const [contracts] = await pool.query('SELECT * FROM contrats WHERE locataire_id = ?', [sourceId]);

    if (contracts.length > 0) {

      const contractIds = contracts.map((item) => item.id);

      const [payments] = await pool.query(

        `SELECT * FROM paiements WHERE contrat_id IN (${contractIds.map(() => '?').join(', ')})`,

        contractIds

      );



      payments

        .filter((payment) => payment.statut === 'retard')

        .forEach((payment) => {

          const paymentDate = new Date(payment.date_paiement);

          if (Number.isNaN(paymentDate.getTime())) return;

          const daysLate = Math.floor((now.getTime() - paymentDate.getTime()) / (24 * 60 * 60 * 1000));

          if (daysLate >= 7) {

            tasks.push({

              taskType: 'relance_retard_7j',

              severity: 'critical',

              title: 'Envoyer relance 1',

              detail: `Paiement ${payment.id} en retard depuis ${daysLate} jour(s).`,

              dueDate: payment.date_paiement,

              relatedEntityType: 'paiement',

              relatedEntityId: payment.id,

            });

          }

        });



      contracts.forEach((contrat) => {

        const contractEnd = new Date(contrat.date_fin);

        if (Number.isNaN(contractEnd.getTime())) return;

        const daysToEnd = Math.ceil((contractEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        if (daysToEnd >= 0 && daysToEnd <= 30) {

          tasks.push({

            taskType: 'renouvellement_contrat',

            severity: 'warning',

            title: 'Proposer renouvellement',

            detail: `Contrat ${contrat.id} arrive a echeance dans ${daysToEnd} jour(s).`,

            dueDate: contrat.date_fin,

            relatedEntityType: 'contrat',

            relatedEntityId: contrat.id,

          });

        }

      });

    }

  }



  if (sourceTable === 'utilisateurs') {

    const [userRows] = await pool.query('SELECT id, email FROM utilisateurs WHERE id = ? LIMIT 1', [sourceId]);

    const user = userRows[0];

    const profileStatus = String(profile?.acheteurStatus || '');

    if (user && profileStatus === 'recherche') {

      const [interactionRows] = await pool.query(

        `SELECT event_at

         FROM client_interactions

         WHERE client_user_id = ? OR (client_email IS NOT NULL AND client_email = ?)

         ORDER BY event_at DESC

         LIMIT 1`,

        [sourceId, user.email || '']

      );

      const lastInteractionAt = interactionRows[0]?.event_at || profile?.lastInteractionAt || null;

      const lastInteractionDate = lastInteractionAt ? new Date(String(lastInteractionAt).replace(' ', 'T')) : null;

      const inactiveDays = !lastInteractionDate || Number.isNaN(lastInteractionDate.getTime())

        ? 999

        : Math.floor((now.getTime() - lastInteractionDate.getTime()) / (24 * 60 * 60 * 1000));

      if (inactiveDays > 15) {

        tasks.push({

          taskType: 'relance_acheteur',

          severity: 'warning',

          title: 'Relancer l acheteur',

          detail: 'Aucun contact recent depuis plus de 15 jours.',

          dueDate: nowSql,

          relatedEntityType: 'utilisateur',

          relatedEntityId: sourceId,

        });

      }

    }



    if (profile) {

      const [saleBiens] = await pool.query(

        `SELECT b.id, b.reference, b.titre, b.type, b.prix_nuitee, b.superficie_m2, b.distance_plage_m, z.nom AS zone_nom

         FROM biens b

         LEFT JOIN zones z ON z.id = b.zone_id

         WHERE b.mode = 'vente'`

      );

      saleBiens

        .map((bien) => ({ bien, match: scoreBuyerMatch(profile, bien) }))

        .filter((item) => item.match.score >= 80)

        .sort((a, b) => b.match.score - a.match.score)

        .slice(0, 3)

        .forEach(({ bien, match }) => {

          tasks.push({

            taskType: 'nouvelle_offre',

            severity: 'info',

            title: 'Envoyer nouvelle offre',

            detail: `${bien.reference || bien.id} - ${bien.titre} correspond a ${match.score}%.`,

            relatedEntityType: 'bien',

            relatedEntityId: bien.id,

          });

        });

    }

  }



  if (sourceTable === 'proprietaires') {

    const plafond = Number(profile?.proprietairePlafondTravaux || 200);

    const lastStatementAt = profile?.proprietaireLastStatementAt ? new Date(String(profile.proprietaireLastStatementAt).replace(' ', 'T')) : null;

    const monthsWithoutStatement = !lastStatementAt || Number.isNaN(lastStatementAt.getTime())

      ? 999

      : (now.getTime() - lastStatementAt.getTime()) / (24 * 60 * 60 * 1000 * 30);

    if (monthsWithoutStatement >= 3) {

      tasks.push({

        taskType: 'releve_proprietaire',

        severity: 'warning',

        title: 'Preparer releve',

        detail: 'Aucun releve envoye depuis plusieurs mois.',

        relatedEntityType: 'proprietaire',

        relatedEntityId: sourceId,

      });

    }



    const [ownerBiens] = await pool.query('SELECT id FROM biens WHERE proprietaire_id = ?', [sourceId]);

    if (ownerBiens.length > 0) {

      const bienIds = ownerBiens.map((item) => item.id);

      const [maintenanceRows] = await pool.query(

        `SELECT id, cout FROM maintenance WHERE bien_id IN (${bienIds.map(() => '?').join(', ')})`,

        bienIds

      );

      maintenanceRows

        .filter((item) => Number(item.cout || 0) > plafond)

        .forEach((item) => {

          tasks.push({

            taskType: 'accord_travaux_proprietaire',

            severity: 'warning',

            title: 'Accord proprietaire requis',

            detail: `Maintenance ${item.id} depasse le plafond autorise (${plafond} DT).`,

            relatedEntityType: 'maintenance',

            relatedEntityId: item.id,

          });

        });

    }

  }



  if (sourceTable === 'utilisateurs' || sourceTable === 'locataires') {

    const reservationParams = [];

    const reservationWhere = [];

    if (sourceTable === 'utilisateurs') {

      reservationWhere.push('client_user_id = ?');

      reservationParams.push(sourceId);

    }

    if (clientEmail) {

      reservationWhere.push('client_email = ?');

      reservationParams.push(clientEmail);

    }

    if (reservationWhere.length > 0) {

      const [reservationRows] = await pool.query(

        `SELECT id, bien_id, start_date, end_date, status, request_type

         FROM reservation_demands

         WHERE ${reservationWhere.join(' OR ')}

           AND status IN (

             'en_attente_reponse_proprietaire',

             'pas_de_reponse_proprietaire',

             'reponse_positive_attente_confirmation_client',

             'reponse_negative_autre_proposition_meme_bien',

             'reponse_negative_autre_proposition_bien_similaire',

             'attente_envoi_coordonnees_contrat'

           )

         ORDER BY created_at DESC`,

        reservationParams

      );

      reservationRows.forEach((demand) => {

        const requestLabel = demand.request_type === 'visite' ? 'Demande de visite' : 'Demande de reservation';

        tasks.push({

          taskType: 'demande_reservation',

          severity: demand.status === 'en_attente_reponse_proprietaire' ? 'warning' : 'info',

          title: `${requestLabel} en attente`,

          detail: `Demande ${demand.id} pour le bien ${demand.bien_id} du ${demand.start_date} au ${demand.end_date}.`,

          dueDate: `${demand.start_date} 00:00:00`,

          relatedEntityType: 'reservation_demand',

          relatedEntityId: demand.id,

        });

      });

    }

  }



  if (sourceTable === 'proprietaires') {

    const [reservationRows] = await pool.query(

      `SELECT id, bien_id, start_date, end_date, status, request_type

       FROM reservation_demands

       WHERE proprietaire_id = ?

         AND status IN ('en_attente_reponse_proprietaire', 'pas_de_reponse_proprietaire')

       ORDER BY created_at DESC`,

      [sourceId]

    );

    reservationRows.forEach((demand) => {

      const requestLabel = demand.request_type === 'visite' ? 'visite' : 'reservation';

      tasks.push({

        taskType: 'demande_client_proprietaire',

        severity: 'warning',

        title: 'Reponse proprietaire attendue',

        detail: `Demande de ${requestLabel} ${demand.id} sur le bien ${demand.bien_id} attend une reponse proprietaire.`,

        dueDate: `${demand.start_date} 00:00:00`,

        relatedEntityType: 'reservation_demand',

        relatedEntityId: demand.id,

      });

    });

  }



  await pool.query('DELETE FROM clienteles_tasks WHERE source_table = ? AND source_id = ?', [sourceTable, sourceId]);



  for (const task of tasks) {

    const taskId = `ct_${sourceTable}_${sourceId}_${task.taskType}_${task.relatedEntityId || 'none'}`

      .replace(/[^a-zA-Z0-9_]/g, '_')

      .slice(0, 100);

    await pool.query(

      `INSERT INTO clienteles_tasks (

        id, source_table, source_id, task_type, severity, title, detail, due_date,

        related_entity_type, related_entity_id, status, created_at, updated_at

      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,

      [

        taskId,

        sourceTable,

        sourceId,

        task.taskType,

        task.severity,

        task.title,

        task.detail || null,

        task.dueDate || null,

        task.relatedEntityType || null,

        task.relatedEntityId || null,

        nowSql,

        nowSql,

      ]

    );

  }



  const [rows] = await pool.query(

    `SELECT

      id,

      source_table AS sourceTable,

      source_id AS sourceId,

      task_type AS taskType,

      severity,

      title,

      detail,

      DATE_FORMAT(due_date, '%Y-%m-%d %H:%i:%s') AS dueDate,

      related_entity_type AS relatedEntityType,

      related_entity_id AS relatedEntityId,

      status,

      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,

      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt

     FROM clienteles_tasks

     WHERE source_table = ? AND source_id = ?

     ORDER BY severity DESC, due_date IS NULL, due_date ASC, created_at DESC`,

    [sourceTable, sourceId]

  );



  return rows || [];

}



function isRetryableSchemaError(error) {

  const code = String(error?.code || '').trim().toUpperCase();

  const message = String(error?.message || '').toLowerCase();

  if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') return true;

  return message.includes('deadlock found') || message.includes('lock wait timeout');

}



async function runSchemaStepWithRetry(label, fn, maxAttempts = 5) {

  let attempt = 0;

  while (attempt < maxAttempts) {

    try {

      await fn();

      return;

    } catch (error) {

      attempt += 1;

      if (!isRetryableSchemaError(error) || attempt >= maxAttempts) {

        throw error;

      }

      const delayMs = Math.min(2500, 200 * (2 ** attempt));

      console.warn(

        '[Schema Retry] ' + label + ' failed (' + error.message + '). retry ' +

        attempt + '/' + maxAttempts + ' in ' + delayMs + 'ms'

      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));

    }

  }

}



async function initializeDatabaseSchema() {

  console.log('?? Connecting to database...');

  const conn = await pool.getConnection();

  console.log('? Database connected successfully');

  const lockName = 'dwira_schema_init_lock_v1';

  let hasLock = false;



  try {

    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 25) AS got_lock', [lockName]);

    hasLock = Number(lockRows?.[0]?.got_lock || 0) === 1;

    if (!hasLock) {

      console.warn('[Schema Init] lock unavailable, skipping schema bootstrap in this process');

      return;

    }



    const steps = [

      ['ensureAuthSchema', ensureAuthSchema],

      ['ensurePasskeySchema', ensurePasskeySchema],

      ['ensureSecurityAuditSchema', ensureSecurityAuditSchema],

      ['ensureAdminNotificationsSchema', ensureAdminNotificationsSchema],

      ['ensureOwnerMobileNotificationsSchema', ensureOwnerMobileNotificationsSchema],

      ['ensureOwnerPushTokensSchema', ensureOwnerPushTokensSchema],

      ['ensureOwnerCalendarPromptSchema', ensureOwnerCalendarPromptSchema],

      ['ensureClientInteractionsSchema', ensureClientInteractionsSchema],

      ['ensureClientelesSchema', ensureClientelesSchema],

      ['ensureMaintenanceWorkflowSchema', ensureMaintenanceWorkflowSchema],

      ['ensureClientelesTasksSchema', ensureClientelesTasksSchema],

      ['ensureReservationDemandSchema', ensureReservationDemandSchema],

      ['ensureContractsSchema', ensureContractsSchema],

      ['ensureZonesSchema', ensureZonesSchema],

      ['ensureProprietairesSchema', ensureProprietairesSchema],

      ['ensureMessengerSchema', ensureMessengerSchema],

      ['ensureBiensWorkflowSchema', ensureBiensWorkflowSchema],

      ['ensurePaidServicesSchema', ensurePaidServicesSchema],

      ['ensureSeasonalPricingSchema', ensureSeasonalPricingSchema],

      ['ensureTypeFilterImagesSchema', ensureTypeFilterImagesSchema],

      ['ensureHomeFilterOptionImagesSchema', ensureHomeFilterOptionImagesSchema],

    ];



    for (const [label, step] of steps) {

      await runSchemaStepWithRetry(label, step);

    }



    await runSchemaStepWithRetry('cleanupNamelessAmicalesAndTheirDemands', cleanupNamelessAmicalesAndTheirDemands);



    console.log('? Auth schema and bien workflow ready');

  } finally {

    if (hasLock) {

      try {

        await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);

      } catch (releaseError) {

        console.warn('[Schema Init] lock release failed:', releaseError.message);

      }

    }

    conn.release();

  }

}



initializeDatabaseSchema().catch((err) => {

  console.error('? Database connection failed:', err.message);

});

// ============================================

// BIENS (PROPERTIES) API

// ============================================



// GET all biens

app.get('/api/site-mode-priorities', async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const priorities = await readSiteModePriorities();

    res.json(priorities);

  } catch (error) {

    console.error('Error fetching site mode priorities:', error);

    res.status(500).json({ error: 'Impossible de charger les priorites des modes' });

  }

});



app.put('/api/site-mode-priorities', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const normalized = normalizeSiteModePriorities(req.body || {});

    if (normalized.error) {

      return res.status(400).json({ error: normalized.error });

    }

    const now = getAgencySqlDateTime();

    for (const [mode, priority] of Object.entries(normalized.values)) {

      await pool.query(

        `INSERT INTO site_mode_priorities (mode, priority_order, updated_at)

         VALUES (?, ?, ?)

         ON DUPLICATE KEY UPDATE priority_order = VALUES(priority_order), updated_at = VALUES(updated_at)`,

        [mode, priority, now]

      );

    }

    res.json(await readSiteModePriorities());

  } catch (error) {

    console.error('Error updating site mode priorities:', error);

    res.status(500).json({ error: 'Impossible de sauvegarder les priorites des modes' });

  }

});



app.get('/api/type-filter-images', async (req, res) => {

  try {

    await ensureTypeFilterImagesSchema();

    const mode = String(req.query?.mode || '').trim();

    const allowedModes = new Set(['vente', 'location_annuelle', 'location_saisonniere']);

    const params = [];

    let whereClause = '';

    if (mode) {

      if (!allowedModes.has(mode)) {

        return res.status(400).json({ error: 'mode invalide' });

      }

      whereClause = 'WHERE mode_bien = ?';

      params.push(mode);

    }

    const [rows] = await pool.query(

      `SELECT id, mode_bien, main_type, sub_type, image_url

       FROM type_filter_images

       ${whereClause}

       ORDER BY mode_bien ASC, main_type ASC, sub_type ASC`,

      params

    );

    res.json(rows || []);

  } catch (error) {

    console.error('Error fetching type filter images:', error);

    res.status(500).json({ error: "Impossible de charger les images des types de biens" });

  }

});



app.put('/api/type-filter-images', requireAdminSession, async (req, res) => {

  try {

    await ensureTypeFilterImagesSchema();

    const mode = String(req.body?.mode_bien || req.body?.mode || '').trim();

    const mainType = String(req.body?.main_type || '').trim().toLowerCase();

    const subTypeRaw = req.body?.sub_type;

    const imageUrl = String(req.body?.image_url || '').trim();

    const allowedModes = new Set(['vente', 'location_annuelle', 'location_saisonniere']);

    if (!allowedModes.has(mode)) {

      return res.status(400).json({ error: 'mode invalide' });

    }

    if (!mainType) {

      return res.status(400).json({ error: 'main_type requis' });

    }

    if (!imageUrl) {

      return res.status(400).json({ error: 'image_url requis' });

    }

    const subType = subTypeRaw === null || subTypeRaw === undefined || String(subTypeRaw).trim().length === 0

      ? null

      : String(subTypeRaw).trim();

    const id = `${mode}__${mainType}__${subType ? subType.toLowerCase() : '__main__'}`;

    const now = getAgencySqlDateTime();

    await pool.query(

      `INSERT INTO type_filter_images (id, mode_bien, main_type, sub_type, image_url, created_at, updated_at)

       VALUES (?, ?, ?, ?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), updated_at = VALUES(updated_at)`,

      [id, mode, mainType, subType, imageUrl, now, now]

    );

    const [rows] = await pool.query(

      `SELECT id, mode_bien, main_type, sub_type, image_url

       FROM type_filter_images

       WHERE id = ?

       LIMIT 1`,

      [id]

    );

    res.json(rows?.[0] || { id, mode_bien: mode, main_type: mainType, sub_type: subType, image_url: imageUrl });

  } catch (error) {

    console.error('Error upserting type filter image:', error);

    res.status(500).json({ error: "Impossible d'enregistrer l'image du type de bien" });

  }

});



app.delete('/api/type-filter-images/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureTypeFilterImagesSchema();

    const id = String(req.params.id || '').trim();

    if (!id) return res.status(400).json({ error: 'id image type requis' });

    const [result] = await pool.query('DELETE FROM type_filter_images WHERE id = ?', [id]);

    if (!result || Number(result.affectedRows || 0) === 0) {

      return res.status(404).json({ error: 'Image type introuvable' });

    }

    res.json({ ok: true, id });

  } catch (error) {

    console.error('Error deleting type filter image:', error);

    res.status(500).json({ error: "Impossible de supprimer l'image du type de bien" });

  }

});



app.get('/api/home-filter-option-images', async (req, res) => {

  try {

    await ensureHomeFilterOptionImagesSchema();

    const mode = String(req.query?.mode || '').trim();

    const allowedModes = new Set(['vente', 'location_annuelle', 'location_saisonniere']);

    const params = [];

    let whereClause = '';

    if (mode) {

      if (!allowedModes.has(mode)) {

        return res.status(400).json({ error: 'mode invalide' });

      }

      whereClause = 'WHERE mode_bien = ?';

      params.push(mode);

    }

    const [rows] = await pool.query(

      `SELECT id, mode_bien, filter_group, option_key, image_url

       FROM home_filter_option_images

       ${whereClause}

       ORDER BY mode_bien ASC, filter_group ASC, option_key ASC`,

      params

    );

    res.json(rows || []);

  } catch (error) {

    console.error('Error fetching home filter option images:', error);

    res.status(500).json({ error: "Impossible de charger les images des options de filtres" });

  }

});



app.put('/api/home-filter-option-images', requireAdminSession, async (req, res) => {

  try {

    await ensureHomeFilterOptionImagesSchema();

    const mode = String(req.body?.mode_bien || req.body?.mode || '').trim();

    const filterGroup = String(req.body?.filter_group || '').trim().toLowerCase();

    const optionKey = String(req.body?.option_key || '').trim().toLowerCase();

    const imageUrl = String(req.body?.image_url || '').trim();

    const allowedModes = new Set(['vente', 'location_annuelle', 'location_saisonniere']);

    const allowedFilterGroups = new Set(['seaside', 'comfort']);

    if (!allowedModes.has(mode)) {

      return res.status(400).json({ error: 'mode invalide' });

    }

    if (!allowedFilterGroups.has(filterGroup)) {

      return res.status(400).json({ error: 'filter_group invalide' });

    }

    if (!optionKey) {

      return res.status(400).json({ error: 'option_key requis' });

    }

    if (!imageUrl) {

      return res.status(400).json({ error: 'image_url requis' });

    }

    const id = `${mode}__${filterGroup}__${optionKey}`;

    const now = getAgencySqlDateTime();

    await pool.query(

      `INSERT INTO home_filter_option_images (id, mode_bien, filter_group, option_key, image_url, created_at, updated_at)

       VALUES (?, ?, ?, ?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), updated_at = VALUES(updated_at)`,

      [id, mode, filterGroup, optionKey, imageUrl, now, now]

    );

    const [rows] = await pool.query(

      `SELECT id, mode_bien, filter_group, option_key, image_url

       FROM home_filter_option_images

       WHERE id = ?

       LIMIT 1`,

      [id]

    );

    res.json(rows?.[0] || { id, mode_bien: mode, filter_group: filterGroup, option_key: optionKey, image_url: imageUrl });

  } catch (error) {

    console.error('Error upserting home filter option image:', error);

    res.status(500).json({ error: "Impossible d'enregistrer l'image de cette option de filtre" });

  }

});



app.delete('/api/home-filter-option-images/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureHomeFilterOptionImagesSchema();

    const id = String(req.params.id || '').trim();

    if (!id) return res.status(400).json({ error: 'id image option requis' });

    const [result] = await pool.query('DELETE FROM home_filter_option_images WHERE id = ?', [id]);

    if (!result || Number(result.affectedRows || 0) === 0) {

      return res.status(404).json({ error: 'Image option introuvable' });

    }

    res.json({ ok: true, id });

  } catch (error) {

    console.error('Error deleting home filter option image:', error);

    res.status(500).json({ error: "Impossible de supprimer l'image de cette option de filtre" });

  }

});



app.get('/api/services-payants/catalogue', async (req, res) => {

  try {

    const services = await listPaidServicesCatalogue();

    res.json(services);

  } catch (error) {

    console.error('Error fetching paid services catalogue:', error);

    res.status(500).json({ error: 'Impossible de charger le catalogue des services payants' });

  }

});



app.post('/api/services-payants/catalogue', requireAdminSession, async (req, res) => {

  try {

    await ensurePaidServicesSchema();

    const service = normalizePaidServiceRecord(req.body || {});

    if (!String(service.label || '').trim()) {

      return res.status(400).json({ error: 'Libelle service requis' });

    }

    const now = getAgencySqlDateTime();

    await pool.query(

      `INSERT INTO services_payants_catalogue (

         id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled, created_at, updated_at

       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [

        service.id,

        service.categorie,

        service.label,

        service.description_courte || null,

        service.prix_affiche || null,

        Number(service.prix || 0),

        service.type_tarification,

        service.enabled ? 1 : 0,

        now,

        now,

      ]

    );

    const [rows] = await pool.query(

      `SELECT id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled

       FROM services_payants_catalogue

       WHERE id = ?

       LIMIT 1`,

      [service.id]

    );

    const created = rows?.[0] || null;

    if (!created) return res.status(404).json({ error: 'Service catalogue introuvable apres creation' });

    res.status(201).json(normalizePaidServiceRecord({

      id: created.id,

      categorie: created.categorie,

      label: created.label,

      description_courte: created.description_courte,

      prix_affiche: created.prix_affiche,

      prix: created.prix_base,

      type_tarification: created.type_tarification,

      enabled: created.enabled === 1 || created.enabled === true,

    }));

  } catch (error) {

    console.error('Error creating paid service catalogue item:', error);

    res.status(500).json({ error: 'Impossible de creer le service payant du catalogue' });

  }

});



app.put('/api/services-payants/catalogue/:id', requireAdminSession, async (req, res) => {

  try {

    await ensurePaidServicesSchema();

    const serviceId = String(req.params.id || '').trim();

    if (!serviceId) return res.status(400).json({ error: 'id service requis' });

    const service = normalizePaidServiceRecord({ ...(req.body || {}), id: serviceId });

    if (!String(service.label || '').trim()) {

      return res.status(400).json({ error: 'Libelle service requis' });

    }

    const now = getAgencySqlDateTime();

    const [result] = await pool.query(

      `UPDATE services_payants_catalogue

       SET categorie = ?, label = ?, description_courte = ?, prix_affiche = ?, prix_base = ?, type_tarification = ?, enabled = ?, updated_at = ?

       WHERE id = ?`,

      [

        service.categorie,

        service.label,

        service.description_courte || null,

        service.prix_affiche || null,

        Number(service.prix || 0),

        service.type_tarification,

        service.enabled ? 1 : 0,

        now,

        serviceId,

      ]

    );

    if (!result || Number(result.affectedRows || 0) === 0) {

      return res.status(404).json({ error: 'Service catalogue introuvable' });

    }



    await pool.query(

      `UPDATE bien_services_payants

       SET enabled = ?, updated_at = ?

       WHERE service_catalogue_id = ?`,

      [service.enabled ? 1 : 0, now, serviceId]

    );



    const [rows] = await pool.query(

      `SELECT id, categorie, label, description_courte, prix_affiche, prix_base, type_tarification, enabled

       FROM services_payants_catalogue

       WHERE id = ?

       LIMIT 1`,

      [serviceId]

    );

    const updated = rows?.[0] || null;

    if (!updated) return res.status(404).json({ error: 'Service catalogue introuvable apres mise a jour' });

    res.json(normalizePaidServiceRecord({

      id: updated.id,

      categorie: updated.categorie,

      label: updated.label,

      description_courte: updated.description_courte,

      prix_affiche: updated.prix_affiche,

      prix: updated.prix_base,

      type_tarification: updated.type_tarification,

      enabled: updated.enabled === 1 || updated.enabled === true,

    }));

  } catch (error) {

    console.error('Error updating paid service catalogue item:', error);

    res.status(500).json({ error: 'Impossible de modifier le service payant du catalogue' });

  }

});



app.delete('/api/services-payants/catalogue/:id', requireAdminSession, async (req, res) => {

  try {

    await ensurePaidServicesSchema();

    const serviceId = String(req.params.id || '').trim();

    if (!serviceId) return res.status(400).json({ error: 'id service requis' });



    await pool.query('DELETE FROM bien_services_payants WHERE service_catalogue_id = ?', [serviceId]);

    const [result] = await pool.query('DELETE FROM services_payants_catalogue WHERE id = ?', [serviceId]);

    if (!result || Number(result.affectedRows || 0) === 0) {

      return res.status(404).json({ error: 'Service catalogue introuvable' });

    }

    res.json({ ok: true, id: serviceId });

  } catch (error) {

    console.error('Error deleting paid service catalogue item:', error);

    res.status(500).json({ error: 'Impossible de supprimer le service payant du catalogue' });

  }

});



app.get('/api/biens', async (req, res) => {

  try {

    await ensurePaidServicesSchema();

    await ensureSeasonalPricingSchema();

    const [rows] = await pool.query(`

      SELECT b.*, z.nom as zone_nom, p.nom as proprietaire_nom, p.telephone as proprietaire_telephone

      FROM biens b 

      LEFT JOIN zones z ON b.zone_id = z.id 

      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id

      ORDER BY b.created_at DESC

    `);

    const rowsWithCaracteristiques = await enrichBiensWithCaracteristiques(rows || []);

    const servicesByBienId = await listPaidServicesForBienIds((rowsWithCaracteristiques || []).map((row) => row.id));

    const pricingPeriodsByBienId = await listPricingPeriodsForBienIds((rowsWithCaracteristiques || []).map((row) => row.id));

    const enrichedRows = (rowsWithCaracteristiques || []).map((row) => {

      let config = null;

      try {

        config = row.location_saisonniere_config_json

          ? (typeof row.location_saisonniere_config_json === 'string'

            ? JSON.parse(row.location_saisonniere_config_json)

            : row.location_saisonniere_config_json)

          : null;

      } catch {

        config = null;

      }

      const nextConfig = injectPaidServicesIntoConfig(config, servicesByBienId.get(row.id) || []);

      return {

        ...row,

        nom_bien_mobile: String(nextConfig?.nom_bien_mobile || '').trim() || null,

        location_saisonniere_config_json: JSON.stringify(nextConfig),

        pricing_periods_json: JSON.stringify(pricingPeriodsByBienId.get(row.id) || []),

      };

    });

    res.json(enrichedRows);

  } catch (error) {

    console.error('Error fetching biens:', error);

    res.status(500).json({ error: 'Failed to fetch biens' });

  }

});



// GET single bien

app.get('/api/biens/:id', async (req, res) => {

  try {

    await ensurePaidServicesSchema();

    await ensureSeasonalPricingSchema();

    const [rows] = await pool.query(`

      SELECT b.*, z.nom as zone_nom, p.nom as proprietaire_nom, p.telephone as proprietaire_telephone

      FROM biens b

      LEFT JOIN zones z ON b.zone_id = z.id

      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

      WHERE b.id = ?

    `, [req.params.id]);

    if (rows.length === 0) {

      return res.status(404).json({ error: 'Bien not found' });

    }

    const row = (await enrichBiensWithCaracteristiques(rows))[0];

    const servicesByBienId = await listPaidServicesForBienIds([row.id]);

    const pricingPeriodsByBienId = await listPricingPeriodsForBienIds([row.id]);

    let config = null;

    try {

      config = row.location_saisonniere_config_json

        ? (typeof row.location_saisonniere_config_json === 'string'

          ? JSON.parse(row.location_saisonniere_config_json)

          : row.location_saisonniere_config_json)

        : null;

    } catch {

      config = null;

    }

    const nextConfig = injectPaidServicesIntoConfig(config, servicesByBienId.get(row.id) || []);

    res.json({

      ...row,

      nom_bien_mobile: String(nextConfig?.nom_bien_mobile || '').trim() || null,

      location_saisonniere_config_json: JSON.stringify(nextConfig),

      pricing_periods_json: JSON.stringify(pricingPeriodsByBienId.get(row.id) || []),

    });

  } catch (error) {

    console.error('Error fetching bien:', error);

    res.status(500).json({ error: 'Failed to fetch bien' });

  }

});



// POST create bien

app.post('/api/biens', requireAdminSession, async (req, res) => {

  try {

    await ensureSeasonalPricingSchema();

    const {

      id,

      reference, titre, description, type, type_bien, mode, mode_bien, nb_chambres, nb_salle_bain,

      prix_nuitee, prix_semaine, avance, caution, statut, visible_sur_site, is_featured, ui_config, location_saisonniere_config, pricing_periods, menage_en_cours, zone_id, proprietaire_id, caracteristique_ids, caracteristique_valeurs,

      tarification_methode, prix_affiche_client, prix_fixe_proprietaire, prix_proprietaire, commission_pourcentage_proprietaire, commission_pourcentage_client, montant_max_reduction_negociation,

      modalite_paiement_vente, pourcentage_premiere_partie_promesse, nombre_tranches, periode_tranches_mois,

      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,

      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,

      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg,

      surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,

      type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,

      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,

      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,

      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,

      terrain_proximites_commodites, terrain_proximites_commodites_autres,

      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,

      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,

      terrain_ideal_utilisations, terrain_documents_disponibles,

      lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2,

      nom_bien_mobile,

      immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements, immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m,

      immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur, immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux

    } = req.body;



    const resolvedMode = normalizeBienMode(mode ?? mode_bien);

    const resolvedType = normalizeBienType(type_bien ?? type);

    const validation = validateModeAndType(resolvedMode, resolvedType);

    if (!validation.valid) {

      return res.status(400).json({ error: validation.error });

    }

    const details = normalizeAppartementVenteDetails(resolvedMode, resolvedType, {

      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,

      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,

      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg

    });

    if (details.error) {

      return res.status(400).json({ error: details.error });

    }

    const localDetails = normalizeLocalCommercialVenteDetails(resolvedMode, resolvedType, {

      type_rue, type_papier, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette,

      reserve_local, vitrine, coin_angle, electricite_3_phases, gaz_ville, alarme, eau_puits, eau_sonede, electricite_steg

    });

    if (localDetails.error) {

      return res.status(400).json({ error: localDetails.error });

    }



    const terrainDetails = normalizeTerrainVenteDetails(resolvedMode, resolvedType, {

      type_rue, type_papier, type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,

      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,

      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,

      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,

      terrain_proximites_commodites, terrain_proximites_commodites_autres,

      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,

      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,

      terrain_ideal_utilisations, terrain_documents_disponibles,

      eau_puits, eau_sonede, electricite_steg

    });

    if (terrainDetails.error) {

      return res.status(400).json({ error: terrainDetails.error });

    }

    const providedReference = String(reference || '').trim();

    const resolvedReference = providedReference || await generateStructuredBienReference({

          mode: resolvedMode,

          type: resolvedType,

          titre,

          zoneId: zone_id,

          proprietaireId: proprietaire_id,

        });



    const lotissementDetails = normalizeLotissementVenteDetails(resolvedMode, resolvedType, {

      reference: resolvedReference, titre, lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2

    });

    if (lotissementDetails.error) {

      return res.status(400).json({ error: lotissementDetails.error });

    }

    const immeubleDetails = normalizeImmeubleVenteDetails(resolvedMode, resolvedType, {

      reference: resolvedReference, titre, type_rue, type_papier, immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements,

      immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m, immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur,

      immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux

    });

    if (immeubleDetails.error) {

      return res.status(400).json({ error: immeubleDetails.error });

    }

    const venteTarification = normalizeVenteTarification(resolvedMode, resolvedType, {

      prix_nuitee,

      prix_affiche_client,

      terrain_surface_m2,

      terrain_prix_affiche_par_m2,

      lotissement_prix_total,

      prix_fixe_proprietaire,

      tarification_methode,

      commission_pourcentage_proprietaire,

      commission_pourcentage_client,

      montant_max_reduction_negociation,

    });

    if (venteTarification.error) {

      return res.status(400).json({ error: venteTarification.error });

    }



    let resolvedVisibleSurSite = visible_sur_site === false || Number(visible_sur_site) === 0 ? 0 : 1;

    const resolvedIsFeatured = is_featured === true || Number(is_featured) === 1 ? 1 : 0;

    resolvedVisibleSurSite = await resolvePublicationVisibilityFromOwner(resolvedVisibleSurSite, proprietaire_id, resolvedMode);



    const persistedConfiguration = (resolvedMode === 'vente' && resolvedType === 'appartement')

      ? details.configuration

      : ((configuration !== undefined && configuration !== null ? String(configuration) : '').trim() || null);

    const resolvedNbChambres = (resolvedMode === 'vente' && resolvedType === 'appartement')

      ? deriveBedroomsFromConfiguration(persistedConfiguration)

      : (resolvedMode === 'vente' && resolvedType === 'local_commercial')

        ? 0

        : (resolvedMode === 'vente' && (resolvedType === 'terrain' || resolvedType === 'lotissement'))

          ? 0

        : Math.max(Number(nb_chambres || 0), deriveBedroomsFromConfiguration(persistedConfiguration));

    const resolvedNbSalleBain = (resolvedMode === 'vente' && (resolvedType === 'local_commercial' || resolvedType === 'terrain' || resolvedType === 'lotissement'))

      ? 0

      : Number(nb_salle_bain || 0);



    const bienId = id || ('b' + Date.now());

    const created_at = getAgencySqlDateTime();

    const updated_at = created_at;

    const date_ajout = created_at.slice(0, 10);

    const resolvedPrixNuitee = resolvedMode === 'vente'

      ? Number(venteTarification.prixAfficheClient || 0)

      : Number(prix_nuitee || 0);

    const totalPrixClientVente = resolvedMode === 'vente'

      ? Number(venteTarification.prixFinal || 0)

      : 0;

    const paiementVente = normalizeVentePaiement(resolvedMode, totalPrixClientVente, {

      modalite_paiement_vente,

      pourcentage_premiere_partie_promesse,

      nombre_tranches,

      periode_tranches_mois,

    });

    if (paiementVente.error) {

      return res.status(400).json({ error: paiementVente.error });

    }

    const pricingPeriodsPayload = readEffectivePricingPeriods(req.body, location_saisonniere_config);

    const effectivePricingPeriods = pricingPeriodsPayload.periods;

    const normalizedNomBienMobile = String(nom_bien_mobile || '').trim();

    const effectiveLocationSaisonniereConfig = location_saisonniere_config && typeof location_saisonniere_config === 'object'

      ? {

          ...location_saisonniere_config,

          ...(normalizedNomBienMobile ? { nom_bien_mobile: normalizedNomBienMobile } : {}),

          ...(pricingPeriodsPayload.hasConfigPeriods || pricingPeriodsPayload.hasExplicitPayload

            ? { pricing_periods: effectivePricingPeriods }

            : {}),

        }

      : (normalizedNomBienMobile

          ? {

              nom_bien_mobile: normalizedNomBienMobile,

              ...(pricingPeriodsPayload.hasConfigPeriods || pricingPeriodsPayload.hasExplicitPayload

                ? { pricing_periods: effectivePricingPeriods }

                : {}),

            }

          : null);



    await pool.query(

      `INSERT INTO biens (id, reference, titre, description, mode, type, nb_chambres, nb_salle_bain, 

        prix_nuitee, avance, caution, type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,

        proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville, cuisine_equipee, place_parking,

        syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,

        type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle, immeuble_details_json, immeuble_appartements_json, statut, visible_sur_site, is_featured, ui_config_json, location_saisonniere_config_json, menage_en_cours, zone_id, proprietaire_id, 

        date_ajout, created_at, updated_at, admin_last_saved_at) 

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,

      [bienId, resolvedReference, titre, description || null, resolvedMode, resolvedType, resolvedNbChambres, resolvedNbSalleBain,

       resolvedPrixNuitee, avance || 0, caution || 0, details.typeRue, details.typePapier, details.superficieM2, details.etage, persistedConfiguration, details.anneeConstruction, details.distancePlageM,

       details.prochePlage ? 1 : 0, details.chauffageCentral ? 1 : 0, details.climatisation ? 1 : 0, details.balcon ? 1 : 0, details.terrasse ? 1 : 0, details.ascenseur ? 1 : 0, details.vueMer ? 1 : 0, details.gazVille ? 1 : 0, details.cuisineEquipee ? 1 : 0, details.placeParking ? 1 : 0,

       details.syndic ? 1 : 0, details.meuble ? 1 : 0, details.independant ? 1 : 0,

       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauPuits ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauPuits ? 1 : 0) : (details.eauPuits ? 1 : 0))),

       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauSonede ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauSonede ? 1 : 0) : (details.eauSonede ? 1 : 0))),

       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.electriciteSteg ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.electriciteSteg ? 1 : 0) : (details.electriciteSteg ? 1 : 0))),

       localDetails.surfaceM2, localDetails.facadeM, localDetails.hauteurPlafondM, localDetails.activiteRecommandee,

       localDetails.toilette ? 1 : 0, localDetails.reserveLocal ? 1 : 0, localDetails.vitrine ? 1 : 0, localDetails.coinAngle ? 1 : 0, localDetails.electricite3Phases ? 1 : 0, localDetails.alarme ? 1 : 0,

       terrainDetails.typeTerrain, terrainDetails.facadeM, terrainDetails.surfaceM2, terrainDetails.distancePlageM, terrainDetails.zoneTerrain, terrainDetails.constructible ? 1 : 0, terrainDetails.terrainAngle ? 1 : 0,

       immeubleDetails.detailsJson, immeubleDetails.appartementsJson,

       statut || 'disponible',

       resolvedVisibleSurSite,

       resolvedIsFeatured,

       ui_config && typeof ui_config === 'object' ? JSON.stringify(ui_config) : null,

       effectiveLocationSaisonniereConfig ? JSON.stringify(effectiveLocationSaisonniereConfig) : null,

       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,

       date_ajout, created_at, updated_at, updated_at]

    );



    await pool.query(

      `UPDATE biens

       SET tarification_methode = ?, prix_affiche_client = ?, prix_fixe_proprietaire = ?, prix_proprietaire = ?, prix_final = ?, revenu_agence = ?,

           commission_pourcentage_proprietaire = ?, commission_pourcentage_client = ?, montant_max_reduction_negociation = ?, prix_minimum_accepte = ?,

           modalite_paiement_vente = ?, pourcentage_premiere_partie_promesse = ?, montant_premiere_partie_promesse = ?, montant_deuxieme_partie = ?,

           nombre_tranches = ?, periode_tranches_mois = ?, montant_par_tranche = ?,

           terrain_prix_affiche_total = ?, terrain_prix_affiche_par_m2 = ?, terrain_mode_affichage_prix = ?, terrain_details_json = ?,

           lotissement_nb_terrains = ?, lotissement_prix_total = ?, lotissement_mode_prix_m2 = ?, lotissement_prix_m2_unique = ?, lotissement_terrains_json = ?, lotissement_paliers_prix_m2_json = ?

       WHERE id = ?`,

      [

        venteTarification.tarificationMethode,

        venteTarification.prixAfficheClient,

        venteTarification.prixFixeProprietaire,

        toNullableNumber(prix_proprietaire),

        venteTarification.prixFinal,

        venteTarification.revenuAgence,

        venteTarification.commissionPourcentageProprietaire,

        venteTarification.commissionPourcentageClient,

        venteTarification.montantMaxReductionNegociation,

        venteTarification.prixMinimumAccepte,

        paiementVente.modalitePaiementVente,

        paiementVente.pourcentagePremierePartiePromesse,

        paiementVente.montantPremierePartiePromesse,

        paiementVente.montantDeuxiemePartie,

        paiementVente.nombreTranches,

        paiementVente.periodeTranchesMois,

        paiementVente.montantParTranche,

        terrainDetails.prixAfficheTotal,

        terrainDetails.prixAfficheParM2,

        terrainDetails.modeAffichagePrix,

        terrainDetails.terrainDetailsJson,

        lotissementDetails.nbTerrains,

        lotissementDetails.prixTotal,

        lotissementDetails.modePrixM2,

        lotissementDetails.prixM2Unique,

        lotissementDetails.terrainsJson,

        lotissementDetails.paliersPrixM2Json,

        bienId,

      ]

    );

    if (Array.isArray(caracteristique_ids)) {

      await syncBienCaracteristiques(bienId, caracteristique_ids);

      await syncBienCaracteristiqueValeurs(bienId, caracteristique_ids, caracteristique_valeurs);

    }

    await syncBienPaidServices(bienId, effectiveLocationSaisonniereConfig?.services_payants || []);

    await pool.query('UPDATE biens SET prix_semaine = ? WHERE id = ?', [

      (resolvedMode === 'vente' || prix_semaine === undefined || prix_semaine === null || Number(prix_semaine) <= 0) ? null : Number(prix_semaine),

      bienId,

    ]);

    await syncBienPricingPeriods(bienId, effectivePricingPeriods || []);



    const [newBien] = await pool.query('SELECT * FROM biens WHERE id = ?', [bienId]);

    res.status(201).json(newBien[0]);

  } catch (error) {

    console.error('Error creating bien:', error);

    if (String(error?.message || '').includes('Invalid caracteristique_ids')) {

      return res.status(400).json({ error: error.message });

    }

    res.status(500).json({ error: 'Failed to create bien' });

  }

});





// PUT update bien

app.put('/api/biens/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureSeasonalPricingSchema();

    const {

      reference, titre, description, type, type_bien, mode, mode_bien, nb_chambres, nb_salle_bain,

      prix_nuitee, prix_semaine, avance, caution, statut, visible_sur_site, is_featured, ui_config, location_saisonniere_config, pricing_periods, menage_en_cours, zone_id, proprietaire_id, caracteristique_ids, caracteristique_valeurs,

      tarification_methode, prix_affiche_client, prix_fixe_proprietaire, prix_proprietaire, commission_pourcentage_proprietaire, commission_pourcentage_client, montant_max_reduction_negociation,

      modalite_paiement_vente, pourcentage_premiere_partie_promesse, nombre_tranches, periode_tranches_mois,

      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,

      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,

      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg,

      surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,

      type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,

      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,

      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,

      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,

      terrain_proximites_commodites, terrain_proximites_commodites_autres,

      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,

      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,

      terrain_ideal_utilisations, terrain_documents_disponibles,

      lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2,

      nom_bien_mobile,

      immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements, immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m,

      immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur, immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux

    } = req.body;



    const resolvedMode = normalizeBienMode(mode ?? mode_bien);

    const resolvedType = normalizeBienType(type_bien ?? type);

    const validation = validateModeAndType(resolvedMode, resolvedType);

    if (!validation.valid) {

      return res.status(400).json({ error: validation.error });

    }

    const details = normalizeAppartementVenteDetails(resolvedMode, resolvedType, {

      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,

      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,

      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg

    });

    if (details.error) {

      return res.status(400).json({ error: details.error });

    }

    const localDetails = normalizeLocalCommercialVenteDetails(resolvedMode, resolvedType, {

      type_rue, type_papier, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette,

      reserve_local, vitrine, coin_angle, electricite_3_phases, gaz_ville, alarme, eau_puits, eau_sonede, electricite_steg

    });

    if (localDetails.error) {

      return res.status(400).json({ error: localDetails.error });

    }



    const terrainDetails = normalizeTerrainVenteDetails(resolvedMode, resolvedType, {

      type_rue, type_papier, type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,

      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,

      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,

      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,

      terrain_proximites_commodites, terrain_proximites_commodites_autres,

      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,

      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,

      terrain_ideal_utilisations, terrain_documents_disponibles,

      eau_puits, eau_sonede, electricite_steg

    });

    if (terrainDetails.error) {

      return res.status(400).json({ error: terrainDetails.error });

    }

    const currentId = req.params.id;

    const providedReference = String(reference || '').trim();

    const resolvedReference = providedReference || await generateStructuredBienReference({

          mode: resolvedMode,

          type: resolvedType,

          titre,

          zoneId: zone_id,

          proprietaireId: proprietaire_id,

          excludeId: currentId,

        });



    const lotissementDetails = normalizeLotissementVenteDetails(resolvedMode, resolvedType, {

      reference: resolvedReference, titre, lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2

    });

    if (lotissementDetails.error) {

      return res.status(400).json({ error: lotissementDetails.error });

    }

    const immeubleDetails = normalizeImmeubleVenteDetails(resolvedMode, resolvedType, {

      reference: resolvedReference, titre, type_rue, type_papier, immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements,

      immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m, immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur,

      immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux

    });

    if (immeubleDetails.error) {

      return res.status(400).json({ error: immeubleDetails.error });

    }

    const venteTarification = normalizeVenteTarification(resolvedMode, resolvedType, {

      prix_nuitee,

      prix_affiche_client,

      terrain_surface_m2,

      terrain_prix_affiche_par_m2,

      lotissement_prix_total,

      prix_fixe_proprietaire,

      tarification_methode,

      commission_pourcentage_proprietaire,

      commission_pourcentage_client,

      montant_max_reduction_negociation,

    });

    if (venteTarification.error) {

      return res.status(400).json({ error: venteTarification.error });

    }



    let resolvedVisibleSurSite = visible_sur_site === false || Number(visible_sur_site) === 0 ? 0 : 1;

    const resolvedIsFeatured = is_featured === true || Number(is_featured) === 1 ? 1 : 0;

    resolvedVisibleSurSite = await resolvePublicationVisibilityFromOwner(resolvedVisibleSurSite, proprietaire_id, resolvedMode);



    const persistedConfiguration = (resolvedMode === 'vente' && resolvedType === 'appartement')

      ? details.configuration

      : ((configuration !== undefined && configuration !== null ? String(configuration) : '').trim() || null);

    const resolvedNbChambres = (resolvedMode === 'vente' && resolvedType === 'appartement')

      ? deriveBedroomsFromConfiguration(persistedConfiguration)

      : (resolvedMode === 'vente' && resolvedType === 'local_commercial')

        ? 0

        : (resolvedMode === 'vente' && (resolvedType === 'terrain' || resolvedType === 'lotissement'))

          ? 0

        : Math.max(Number(nb_chambres || 0), deriveBedroomsFromConfiguration(persistedConfiguration));

    const resolvedNbSalleBain = (resolvedMode === 'vente' && (resolvedType === 'local_commercial' || resolvedType === 'terrain' || resolvedType === 'lotissement'))

      ? 0

      : Number(nb_salle_bain || 0);



    const updated_at = getAgencySqlDateTime();

    const resolvedPrixNuitee = resolvedMode === 'vente'

      ? Number(venteTarification.prixAfficheClient || 0)

      : Number(prix_nuitee || 0);

    const totalPrixClientVente = resolvedMode === 'vente'

      ? Number(venteTarification.prixFinal || 0)

      : 0;

    const paiementVente = normalizeVentePaiement(resolvedMode, totalPrixClientVente, {

      modalite_paiement_vente,

      pourcentage_premiere_partie_promesse,

      nombre_tranches,

      periode_tranches_mois,

    });

    if (paiementVente.error) {

      return res.status(400).json({ error: paiementVente.error });

    }

    const pricingPeriodsPayload = readEffectivePricingPeriods(req.body, location_saisonniere_config);

    const effectivePricingPeriods = pricingPeriodsPayload.periods;

    const normalizedNomBienMobile = String(nom_bien_mobile || '').trim();

    const effectiveLocationSaisonniereConfig = location_saisonniere_config && typeof location_saisonniere_config === 'object'

      ? {

          ...location_saisonniere_config,

          ...(normalizedNomBienMobile ? { nom_bien_mobile: normalizedNomBienMobile } : {}),

          ...(pricingPeriodsPayload.hasConfigPeriods || pricingPeriodsPayload.hasExplicitPayload

            ? { pricing_periods: effectivePricingPeriods }

            : {}),

        }

      : (normalizedNomBienMobile

          ? {

              nom_bien_mobile: normalizedNomBienMobile,

              ...(pricingPeriodsPayload.hasConfigPeriods || pricingPeriodsPayload.hasExplicitPayload

                ? { pricing_periods: effectivePricingPeriods }

                : {}),

            }

          : null);



    await pool.query(

      `UPDATE biens SET 

        reference = ?, titre = ?, description = ?, mode = ?, type = ?, nb_chambres = ?, 

        nb_salle_bain = ?, prix_nuitee = ?, avance = ?, caution = ?, type_rue = ?, type_papier = ?, superficie_m2 = ?, etage = ?, configuration = ?, annee_construction = ?, distance_plage_m = ?,

        proche_plage = ?, chauffage_central = ?, climatisation = ?, balcon = ?, terrasse = ?, ascenseur = ?, vue_mer = ?, gaz_ville = ?, cuisine_equipee = ?, place_parking = ?,

        syndic = ?, meuble = ?, independant = ?, eau_puits = ?, eau_sonede = ?, electricite_steg = ?, surface_local_m2 = ?, facade_m = ?, hauteur_plafond_m = ?, activite_recommandee = ?, toilette = ?, reserve_local = ?, vitrine = ?, coin_angle = ?, electricite_3_phases = ?, alarme = ?,

        type_terrain = ?, terrain_facade_m = ?, terrain_surface_m2 = ?, terrain_distance_plage_m = ?, terrain_zone = ?, terrain_constructible = ?, terrain_angle = ?, immeuble_details_json = ?, immeuble_appartements_json = ?,

        statut = ?, visible_sur_site = ?, is_featured = ?, ui_config_json = ?, location_saisonniere_config_json = ?, menage_en_cours = ?, zone_id = ?, proprietaire_id = ?, updated_at = ?, admin_last_saved_at = ?

       WHERE id = ?`,

      [resolvedReference, titre, description || null, resolvedMode, resolvedType, resolvedNbChambres, resolvedNbSalleBain,

       resolvedPrixNuitee, avance || 0, caution || 0, details.typeRue, details.typePapier, details.superficieM2, details.etage, persistedConfiguration, details.anneeConstruction, details.distancePlageM,

       details.prochePlage ? 1 : 0, details.chauffageCentral ? 1 : 0, details.climatisation ? 1 : 0, details.balcon ? 1 : 0, details.terrasse ? 1 : 0, details.ascenseur ? 1 : 0, details.vueMer ? 1 : 0, details.gazVille ? 1 : 0, details.cuisineEquipee ? 1 : 0, details.placeParking ? 1 : 0,

       details.syndic ? 1 : 0, details.meuble ? 1 : 0, details.independant ? 1 : 0,

       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauPuits ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauPuits ? 1 : 0) : (details.eauPuits ? 1 : 0))),

       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauSonede ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauSonede ? 1 : 0) : (details.eauSonede ? 1 : 0))),

       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.electriciteSteg ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.electriciteSteg ? 1 : 0) : (details.electriciteSteg ? 1 : 0))),

       localDetails.surfaceM2, localDetails.facadeM, localDetails.hauteurPlafondM, localDetails.activiteRecommandee,

       localDetails.toilette ? 1 : 0, localDetails.reserveLocal ? 1 : 0, localDetails.vitrine ? 1 : 0, localDetails.coinAngle ? 1 : 0, localDetails.electricite3Phases ? 1 : 0, localDetails.alarme ? 1 : 0,

       terrainDetails.typeTerrain, terrainDetails.facadeM, terrainDetails.surfaceM2, terrainDetails.distancePlageM, terrainDetails.zoneTerrain, terrainDetails.constructible ? 1 : 0, terrainDetails.terrainAngle ? 1 : 0,

       immeubleDetails.detailsJson, immeubleDetails.appartementsJson,

       statut || 'disponible',

       resolvedVisibleSurSite,

       resolvedIsFeatured,

       ui_config && typeof ui_config === 'object' ? JSON.stringify(ui_config) : null,

       effectiveLocationSaisonniereConfig ? JSON.stringify(effectiveLocationSaisonniereConfig) : null,

       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,

       updated_at, updated_at, req.params.id]

    );



    await pool.query(

      `UPDATE biens

       SET tarification_methode = ?, prix_affiche_client = ?, prix_fixe_proprietaire = ?, prix_proprietaire = ?, prix_final = ?, revenu_agence = ?,

           commission_pourcentage_proprietaire = ?, commission_pourcentage_client = ?, montant_max_reduction_negociation = ?, prix_minimum_accepte = ?,

           modalite_paiement_vente = ?, pourcentage_premiere_partie_promesse = ?, montant_premiere_partie_promesse = ?, montant_deuxieme_partie = ?,

           nombre_tranches = ?, periode_tranches_mois = ?, montant_par_tranche = ?,

           terrain_prix_affiche_total = ?, terrain_prix_affiche_par_m2 = ?, terrain_mode_affichage_prix = ?, terrain_details_json = ?,

           lotissement_nb_terrains = ?, lotissement_prix_total = ?, lotissement_mode_prix_m2 = ?, lotissement_prix_m2_unique = ?, lotissement_terrains_json = ?, lotissement_paliers_prix_m2_json = ?

       WHERE id = ?`,

      [

        venteTarification.tarificationMethode,

        venteTarification.prixAfficheClient,

        venteTarification.prixFixeProprietaire,

        toNullableNumber(prix_proprietaire),

        venteTarification.prixFinal,

        venteTarification.revenuAgence,

        venteTarification.commissionPourcentageProprietaire,

        venteTarification.commissionPourcentageClient,

        venteTarification.montantMaxReductionNegociation,

        venteTarification.prixMinimumAccepte,

        paiementVente.modalitePaiementVente,

        paiementVente.pourcentagePremierePartiePromesse,

        paiementVente.montantPremierePartiePromesse,

        paiementVente.montantDeuxiemePartie,

        paiementVente.nombreTranches,

        paiementVente.periodeTranchesMois,

        paiementVente.montantParTranche,

        terrainDetails.prixAfficheTotal,

        terrainDetails.prixAfficheParM2,

        terrainDetails.modeAffichagePrix,

        terrainDetails.terrainDetailsJson,

        lotissementDetails.nbTerrains,

        lotissementDetails.prixTotal,

        lotissementDetails.modePrixM2,

        lotissementDetails.prixM2Unique,

        lotissementDetails.terrainsJson,

        lotissementDetails.paliersPrixM2Json,

        req.params.id,

      ]

    );

    if (Array.isArray(caracteristique_ids)) {

      await syncBienCaracteristiques(req.params.id, caracteristique_ids);

      await syncBienCaracteristiqueValeurs(req.params.id, caracteristique_ids, caracteristique_valeurs);

    }

    await syncBienPaidServices(req.params.id, effectiveLocationSaisonniereConfig?.services_payants || []);

    await pool.query('UPDATE biens SET prix_semaine = ? WHERE id = ?', [

      (resolvedMode === 'vente' || prix_semaine === undefined || prix_semaine === null || Number(prix_semaine) <= 0) ? null : Number(prix_semaine),

      req.params.id,

    ]);

    // Keep DB pricing periods as single source of truth for listing/public reads.

    // For admin PUT payloads, sync even when scope comes only from nested config payload.

    if (

      pricingPeriodsPayload.hasExplicitPayload

      || Array.isArray(req.body?.pricing_periods)

      || Array.isArray(req.body?.pricingPeriods)

      || Array.isArray(location_saisonniere_config?.pricing_periods)

      || (resolvedMode === 'location_saisonniere' && Array.isArray(effectivePricingPeriods))

    ) {

      await syncBienPricingPeriods(req.params.id, effectivePricingPeriods || []);

    }



    const [updatedBien] = await pool.query('SELECT * FROM biens WHERE id = ?', [req.params.id]);

    res.json(updatedBien[0]);

  } catch (error) {

    console.error('Error updating bien:', error);

    if (String(error?.message || '').includes('Invalid caracteristique_ids')) {

      return res.status(400).json({ error: error.message });

    }

    res.status(500).json({ error: 'Failed to update bien' });

  }

});



app.patch('/api/biens/:id/maintenance-state', async (req, res) => {

  try {

    const id = String(req.params.id || '').trim();

    if (!id) return res.status(400).json({ error: 'bien_id requis' });

    const menageEnCours = req.body?.menage_en_cours === true || Number(req.body?.menage_en_cours) === 1;

    const statut = String(req.body?.statut || '').trim();

    const allowedStatuts = ['disponible', 'loue', 'reserve', 'maintenance', 'bloque'];

    const resolvedStatut = allowedStatuts.includes(statut) ? statut : null;

    const updatedAt = getAgencySqlDateTime();

    await pool.query(

      `UPDATE biens

       SET menage_en_cours = ?, statut = COALESCE(?, statut), updated_at = ?

       WHERE id = ?`,

      [menageEnCours ? 1 : 0, resolvedStatut, updatedAt, id]

    );

    const [rows] = await pool.query('SELECT * FROM biens WHERE id = ? LIMIT 1', [id]);

    if (!Array.isArray(rows) || !rows[0]) return res.status(404).json({ error: 'Bien introuvable' });

    return res.json(rows[0]);

  } catch (error) {

    console.error('Error patching bien maintenance state:', error);

    return res.status(500).json({ error: 'Mise a jour maintenance impossible' });

  }

});





// DELETE bien

app.delete('/api/biens/:id', requireAdminSession, async (req, res) => {

  try {

    await pool.query('DELETE FROM biens WHERE id = ?', [req.params.id]);

    res.json({ message: 'Bien deleted successfully' });

  } catch (error) {

    console.error('Error deleting bien:', error);

    res.status(500).json({ error: 'Failed to delete bien' });

  }

});



// ============================================

// ZONES API

// ============================================



app.get('/api/zones', async (req, res) => {

  try {

    await ensureZonesSchema();

    const [rows] = await pool.query('SELECT * FROM zones ORDER BY nom');

    const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) => {

      const nom = String(row?.nom || '').trim();

      const pays = String(row?.pays || '').trim();

      const gouvernerat = String(row?.gouvernerat || '').trim();

      const region = String(row?.region || '').trim();

      const quartier = String(row?.quartier || '').trim();

      const hasLegacyMissingGeo = !pays && !gouvernerat && !region && !quartier;



      if (!hasLegacyMissingGeo) return row;



      return {

        ...row,

        pays: 'Tunisie',

        gouvernerat: 'Nabeul',

        region: nom || null,

        quartier: nom || null,

      };

    });

    res.json(normalizedRows);

  } catch (error) {

    console.error('Error fetching zones:', error);

    res.status(500).json({ error: 'Failed to fetch zones' });

  }

});



// GET light biens payload (optimized for constrained mobile browsers)

app.get('/api/biens-lite', async (req, res) => {

  try {

    await ensurePaidServicesSchema();

    await ensureSeasonalPricingSchema();

    const [rows] = await pool.query(`

      SELECT

        id, reference, titre, description, mode, type, nb_chambres, nb_salle_bain,

        prix_nuitee, prix_semaine, avance, caution, statut, visible_sur_site, is_featured,

        ui_config_json, location_saisonniere_config_json, menage_en_cours, zone_id, proprietaire_id,

        date_ajout, created_at, updated_at, admin_last_saved_at,

        tarification_methode, prix_affiche_client, prix_fixe_proprietaire, prix_proprietaire, prix_final, revenu_agence

      FROM biens

      ORDER BY date_ajout DESC

    `);

    const pricingPeriodsByBienId = await listPricingPeriodsForBienIds((rows || []).map((row) => row.id));

    const servicesByBienId = await listPaidServicesForBienIds((rows || []).map((row) => row.id));

    const enrichedRows = (rows || []).map((row) => {

      let config = null;

      try {

        config = row.location_saisonniere_config_json

          ? (typeof row.location_saisonniere_config_json === 'string'

            ? JSON.parse(row.location_saisonniere_config_json)

            : row.location_saisonniere_config_json)

          : null;

      } catch {

        config = null;

      }

      const nextConfig = injectPaidServicesIntoConfig(config, servicesByBienId.get(row.id) || []);

      return {

        ...row,

        location_saisonniere_config_json: JSON.stringify(nextConfig),

        pricing_periods_json: JSON.stringify(pricingPeriodsByBienId.get(row.id) || []),

      };

    });

    res.json(enrichedRows);

  } catch (error) {

    console.error('Error fetching biens-lite:', error);

    res.status(500).json({ error: 'Failed to fetch biens-lite' });

  }

});



app.post('/api/zones', requireAdminSession, async (req, res) => {

  try {

    await ensureZonesSchema();

    const normalizeMapsInput = (raw) => {

      const value = String(raw || '').trim();

      if (!value) return null;

      const match = value.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i);

      const extracted = match?.[1] || value;

      const normalized = String(extracted || '').replace(/&amp;/g, '&').trim();

      return normalized || null;

    };

    const {

      id,

      nom,

      description,

      pays,

      gouvernerat,

      region,

      quartier,

      google_maps_url,

      image_url,

      pays_image_url,

      gouvernerat_image_url,

      region_image_url,

      quartier_image_url,

    } = req.body;

    const normalizedPays = String(pays || '').trim();

    const normalizedGouvernerat = String(gouvernerat || '').trim();

    const normalizedRegion = String(region || '').trim();

    const normalizedQuartier = String(quartier || '').trim();

    const normalizedNom = String(nom || '').trim() || [normalizedQuartier, normalizedRegion, normalizedGouvernerat, normalizedPays].filter(Boolean).join(', ');

    if (!normalizedNom) {

      return res.status(400).json({ error: 'Nom de zone requis' });

    }

    await pool.query(

      'INSERT INTO zones (id, nom, description, pays, gouvernerat, region, quartier, google_maps_url, image_url, pays_image_url, gouvernerat_image_url, region_image_url, quartier_image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',

      [

        id,

        normalizedNom,

        description || '',

        normalizedPays || null,

        normalizedGouvernerat || null,

        normalizedRegion || null,

        normalizedQuartier || null,

        normalizeMapsInput(google_maps_url),

        String(image_url || '').trim() || null,

        String(pays_image_url || '').trim() || null,

        String(gouvernerat_image_url || '').trim() || null,

        String(region_image_url || '').trim() || null,

        String(quartier_image_url || '').trim() || null,

      ]

    );

    const [newZone] = await pool.query('SELECT * FROM zones WHERE id = ?', [id]);

    res.status(201).json(newZone[0]);

  } catch (error) {

    console.error('Error creating zone:', error);

    res.status(500).json({ error: 'Failed to create zone' });

  }

});



// ============================================

// PROPRIETAIRES API

// ============================================



app.get('/api/proprietaires', requireAdminSession, async (req, res) => {

  try {

    try {

      await ensureProprietairesSchema();

    } catch (schemaError) {

      console.warn('ensureProprietairesSchema failed while listing proprietaires:', schemaError?.message || schemaError);

    }

    const [rows] = await pool.query('SELECT * FROM proprietaires ORDER BY nom');

    res.json(rows);

  } catch (error) {

    console.error('Error fetching proprietaires:', error);

    res.json([]);

  }

});



app.post('/api/proprietaires', requireAdminSession, async (req, res) => {

  try {

    const { id, nom, telephone, email, cin } = req.body;

    await ensureProprietairesSchema();

    const newId = id || 'p' + Date.now();

    const normalizedNom = String(nom || '').trim();

    const normalizedTelephone = String(telephone || '').trim();

    const normalizedEmail = String(email || '').trim().toLowerCase() || null;

    const normalizedCin = String(cin || '').trim() || null;

    if (!normalizedNom) {

      return res.status(400).json({ error: 'Nom proprietaire requis' });

    }

    if (!normalizedTelephone) {

      return res.status(400).json({ error: 'Telephone proprietaire requis' });

    }

    await pool.query('INSERT INTO proprietaires (id, nom, telephone, email, cin) VALUES (?, ?, ?, ?, ?)', 

      [newId, normalizedNom, normalizedTelephone, normalizedEmail, normalizedCin]);

    const [newProp] = await pool.query('SELECT * FROM proprietaires WHERE id = ?', [newId]);

    res.status(201).json(newProp[0]);

  } catch (error) {

    console.error('Error creating proprietaire:', error);

    res.status(500).json({ error: 'Failed to create proprietaire' });

  }

});



app.put('/api/proprietaires/:id', requireAdminSession, async (req, res) => {

  try {

    const { nom, telephone, email, cin } = req.body;

    await ensureProprietairesSchema();

    const normalizedNom = String(nom || '').trim();

    const normalizedTelephone = String(telephone || '').trim();

    const normalizedEmail = String(email || '').trim().toLowerCase() || null;

    const normalizedCin = String(cin || '').trim() || null;

    if (!normalizedNom) {

      return res.status(400).json({ error: 'Nom proprietaire requis' });

    }

    if (!normalizedTelephone) {

      return res.status(400).json({ error: 'Telephone proprietaire requis' });

    }

    await pool.query('UPDATE proprietaires SET nom = ?, telephone = ?, email = ?, cin = ? WHERE id = ?',

      [normalizedNom, normalizedTelephone, normalizedEmail, normalizedCin, req.params.id]);

    const [updated] = await pool.query('SELECT * FROM proprietaires WHERE id = ?', [req.params.id]);

    res.json(updated[0]);

  } catch (error) {

    console.error('Error updating proprietaire:', error);

    res.status(500).json({ error: 'Failed to update proprietaire' });

  }

});



app.delete('/api/proprietaires/:id', requireAdminSession, async (req, res) => {

  try {

    await pool.query('DELETE FROM proprietaires WHERE id = ?', [req.params.id]);

    res.json({ message: 'Proprietaire deleted' });

  } catch (error) {

    console.error('Error deleting proprietaire:', error);

    res.status(500).json({ error: 'Failed to delete proprietaire' });

  }

});



// ============================================

// LOCATAIRES API

// ============================================



app.get('/api/locataires', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query('SELECT * FROM locataires ORDER BY nom');

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch locataires' });

  }

});



app.post('/api/locataires', requireAdminSession, async (req, res) => {

  try {

    const { nom, telephone, email, cin, score_fiabilite } = req.body;

    const id = 'l' + Date.now();

    const created_at = new Date().toISOString().split('T')[0];

    await pool.query(

      'INSERT INTO locataires (id, nom, telephone, email, cin, score_fiabilite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',

      [id, nom, telephone, email, cin, score_fiabilite || 5, created_at]

    );

    const [newLoc] = await pool.query('SELECT * FROM locataires WHERE id = ?', [id]);

    res.status(201).json(newLoc[0]);

  } catch (error) {

    console.error('Error creating locataire:', error);

    res.status(500).json({ error: 'Failed to create locataire' });

  }

});



app.get('/api/proprietaires/:id/linked-biens', requireAdminSession, async (req, res) => {

  try {

    const ownerId = String(req.params.id || '').trim();

    if (!ownerId) return res.status(400).json({ error: 'id proprietaire requis' });

    const [rows] = await pool.query(

      'SELECT id, reference, titre, mode, type FROM biens WHERE proprietaire_id = ? ORDER BY created_at DESC',

      [ownerId]

    );

    res.json(rows);

  } catch (error) {

    console.error('Error fetching linked biens for proprietaire:', error);

    res.status(500).json({ error: 'Failed to fetch linked biens' });

  }

});



app.post('/api/proprietaires/:id/reassign-and-delete', requireAdminSession, async (req, res) => {

  const connection = await pool.getConnection();

  try {

    const ownerId = String(req.params.id || '').trim();

    const targetOwnerId = String(req.body?.target_proprietaire_id || '').trim();

    if (!ownerId) return res.status(400).json({ error: 'id proprietaire requis' });

    if (targetOwnerId && targetOwnerId === ownerId) {

      return res.status(400).json({ error: 'Le proprietaire cible doit etre different' });

    }



    await connection.beginTransaction();



    const [sourceOwner] = await connection.query('SELECT id FROM proprietaires WHERE id = ? LIMIT 1', [ownerId]);

    if (!Array.isArray(sourceOwner) || sourceOwner.length === 0) {

      await connection.rollback();

      return res.status(404).json({ error: 'Proprietaire introuvable' });

    }



    const [linkedRows] = await connection.query('SELECT id FROM biens WHERE proprietaire_id = ?', [ownerId]);

    const linkedCount = Array.isArray(linkedRows) ? linkedRows.length : 0;



    if (linkedCount > 0) {

      if (!targetOwnerId) {

        await connection.rollback();

        return res.status(400).json({ error: 'Selectionnez un proprietaire cible' });

      }

      const [targetOwner] = await connection.query('SELECT id FROM proprietaires WHERE id = ? LIMIT 1', [targetOwnerId]);

      if (!Array.isArray(targetOwner) || targetOwner.length === 0) {

        await connection.rollback();

        return res.status(400).json({ error: 'Proprietaire cible introuvable' });

      }

      await connection.query('UPDATE biens SET proprietaire_id = ? WHERE proprietaire_id = ?', [targetOwnerId, ownerId]);

    }



    await connection.query('DELETE FROM proprietaires WHERE id = ?', [ownerId]);

    await connection.commit();

    res.json({ message: 'Proprietaire deleted', reassigned_biens: linkedCount, target_proprietaire_id: targetOwnerId || null });

  } catch (error) {

    await connection.rollback();

    console.error('Error reassigning/deleting proprietaire:', error);

    res.status(500).json({ error: 'Failed to reassign/delete proprietaire' });

  } finally {

    connection.release();

  }

});



app.delete('/api/zones/:id', requireAdminSession, async (req, res) => {

  try {

    const zoneId = String(req.params.id || '').trim();

    if (!zoneId) return res.status(400).json({ error: 'id zone requis' });

    const [linkedBiens] = await pool.query('SELECT COUNT(*) AS total FROM biens WHERE zone_id = ?', [zoneId]);

    if (Number(linkedBiens[0]?.total || 0) > 0) {

      return res.status(400).json({ error: 'Suppression impossible: cette zone est utilisee par des biens' });

    }

    await pool.query('DELETE FROM zones WHERE id = ?', [zoneId]);

    res.json({ message: 'Zone deleted' });

  } catch (error) {

    console.error('Error deleting zone:', error);

    res.status(500).json({ error: 'Failed to delete zone' });

  }

});



app.get('/api/zones/:id/linked-biens', requireAdminSession, async (req, res) => {

  try {

    const zoneId = String(req.params.id || '').trim();

    if (!zoneId) return res.status(400).json({ error: 'id zone requis' });

    const [rows] = await pool.query(

      'SELECT id, reference, titre, mode, type FROM biens WHERE zone_id = ? ORDER BY created_at DESC',

      [zoneId]

    );

    res.json(rows);

  } catch (error) {

    console.error('Error fetching linked biens for zone:', error);

    res.status(500).json({ error: 'Failed to fetch linked biens' });

  }

});



app.post('/api/zones/:id/reassign-and-delete', requireAdminSession, async (req, res) => {

  const connection = await pool.getConnection();

  try {

    const zoneId = String(req.params.id || '').trim();

    const targetZoneId = String(req.body?.target_zone_id || '').trim();

    if (!zoneId) return res.status(400).json({ error: 'id zone requis' });

    if (targetZoneId && targetZoneId === zoneId) {

      return res.status(400).json({ error: 'La zone cible doit etre differente' });

    }



    await connection.beginTransaction();



    const [sourceZone] = await connection.query('SELECT id FROM zones WHERE id = ? LIMIT 1', [zoneId]);

    if (!Array.isArray(sourceZone) || sourceZone.length === 0) {

      await connection.rollback();

      return res.status(404).json({ error: 'Zone introuvable' });

    }



    const [linkedRows] = await connection.query('SELECT id FROM biens WHERE zone_id = ?', [zoneId]);

    const linkedCount = Array.isArray(linkedRows) ? linkedRows.length : 0;



    if (linkedCount > 0) {

      if (!targetZoneId) {

        await connection.rollback();

        return res.status(400).json({ error: 'Selectionnez une zone cible' });

      }

      const [targetZone] = await connection.query('SELECT id FROM zones WHERE id = ? LIMIT 1', [targetZoneId]);

      if (!Array.isArray(targetZone) || targetZone.length === 0) {

        await connection.rollback();

        return res.status(400).json({ error: 'Zone cible introuvable' });

      }

      await connection.query('UPDATE biens SET zone_id = ? WHERE zone_id = ?', [targetZoneId, zoneId]);

    }



    await connection.query('DELETE FROM zones WHERE id = ?', [zoneId]);

    await connection.commit();

    res.json({ message: 'Zone deleted', reassigned_biens: linkedCount, target_zone_id: targetZoneId || null });

  } catch (error) {

    await connection.rollback();

    console.error('Error reassigning/deleting zone:', error);

    res.status(500).json({ error: 'Failed to reassign/delete zone' });

  } finally {

    connection.release();

  }

});



app.put('/api/locataires/:id', requireAdminSession, async (req, res) => {

  try {

    const { nom, telephone, email, cin, score_fiabilite } = req.body;

    await pool.query(

      'UPDATE locataires SET nom = ?, telephone = ?, email = ?, cin = ?, score_fiabilite = ? WHERE id = ?',

      [nom, telephone, email, cin, score_fiabilite || 5, req.params.id]

    );

    const [updated] = await pool.query('SELECT * FROM locataires WHERE id = ?', [req.params.id]);

    res.json(updated[0]);

  } catch (error) {

    console.error('Error updating locataire:', error);

    res.status(500).json({ error: 'Failed to update locataire' });

  }

});



app.delete('/api/locataires/:id', requireAdminSession, async (req, res) => {

  try {

    await pool.query('DELETE FROM locataires WHERE id = ?', [req.params.id]);

    res.json({ message: 'Locataire deleted' });

  } catch (error) {

    console.error('Error deleting locataire:', error);

    res.status(500).json({ error: 'Failed to delete locataire' });

  }

});



// ============================================

// CONTRATS API

// ============================================



app.get('/api/contrats', requireAdminSession, async (req, res) => {

  try {

    await ensureContractsSchema();

    const [rows] = await pool.query(`

      SELECT c.*, b.titre as bien_titre, l.nom as locataire_nom 

      FROM contrats c 

      LEFT JOIN biens b ON c.bien_id = b.id 

      LEFT JOIN locataires l ON c.locataire_id = l.id

      ORDER BY c.created_at DESC

    `);

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch contrats' });

  }

});



app.get('/api/contrats/:id', requireAuthenticatedSession, async (req, res) => {

  try {

    await ensureContractsSchema();

    const requester = req.authUser || null;

    const contractId = String(req.params.id || '').trim();

    if (!contractId) return res.status(400).json({ error: 'id contrat requis' });

    const [rows] = await pool.query(

      `SELECT c.*, b.titre as bien_titre, b.reference AS bien_reference, l.nom as locataire_nom

       FROM contrats c

       LEFT JOIN biens b ON c.bien_id = b.id

       LEFT JOIN locataires l ON c.locataire_id = l.id

       WHERE c.id = ?

       LIMIT 1`,

      [contractId]

    );

    if (!rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });

    if (requester?.role !== 'admin') {

      const requesterId = String(requester?.id || '').trim();

      const requesterEmail = normalizeEmailForCompare(requester?.email);

      const [accessRows] = await pool.query(

        `SELECT id

         FROM reservation_demands

         WHERE contract_id = ?

           AND (

             (client_user_id IS NOT NULL AND client_user_id = ?)

             OR (client_email IS NOT NULL AND LOWER(TRIM(client_email)) = ?)

           )

         LIMIT 1`,

        [contractId, requesterId, requesterEmail]

      );

      if (!accessRows[0]) {

        void logSecurityEvent({

          req,

          eventType: 'contract_access_denied',

          severity: 'warning',

          success: false,

          statusCode: 403,

          userId: requester?.id || null,

          userEmail: requester?.email || null,

          message: 'Contract access denied by ownership check',

          metadata: { contractId },

        });

        return res.status(403).json({ error: 'Acces refuse a ce contrat' });

      }

    }

    res.json(rows[0]);

  } catch (error) {

    console.error('Error fetching contrat by id:', error);

    res.status(500).json({ error: 'Failed to fetch contrat' });

  }

});



app.post('/api/contrats/:id/regenerate-template-pdf', requireAdminSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    await ensureContractsSchema();

    const contractId = String(req.params.id || '').trim();

    if (!contractId) return res.status(400).json({ error: 'id contrat requis' });



    const [contractRows] = await pool.query(

      `SELECT c.*, 

              b.titre AS bien_titre,

              b.reference AS bien_reference,

              b.type AS bien_type,

              b.location_saisonniere_config_json AS bien_location_saisonniere_config_json,

              b.prix_nuitee,

              b.avance,

              b.caution,

              z.nom AS zone_nom,

              z.quartier AS zone_quartier,

              z.gouvernerat AS zone_gouvernerat,

              z.region AS zone_region,

              z.pays AS zone_pays,

              p.nom AS proprietaire_nom,

              p.email AS proprietaire_email,

              l.nom AS locataire_nom,

              l.email AS locataire_email,

              l.telephone AS locataire_telephone,

              l.cin AS locataire_cin

       FROM contrats c

       LEFT JOIN biens b ON b.id = c.bien_id

       LEFT JOIN zones z ON z.id = b.zone_id

       LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

       LEFT JOIN locataires l ON l.id = c.locataire_id

       WHERE c.id = ?

       LIMIT 1`,

      [contractId]

    );

    const contract = contractRows[0];

    if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });



    const [demandRows] = await pool.query(

      `SELECT *

       FROM reservation_demands

       WHERE contract_id = ?

       ORDER BY updated_at DESC

       LIMIT 1`,

      [contractId]

    );

    const demand = demandRows[0] || {};



    const locataireName = splitFullName(contract.locataire_nom || '');

    const identityFirstName = String(demand.identity_first_name || locataireName.firstName || '').trim();

    const identityLastName = String(demand.identity_last_name || locataireName.lastName || '').trim();

    const identityNumber = normalizeIdentityNumber(demand.identity_document_number || contract.locataire_cin || '');

    const identityDocumentType = normalizeIdentityDocumentType(demand.identity_document_type, identityNumber && /^\d{8}$/.test(identityNumber) ? 'cin_tn' : 'passport_foreign');



    const startDate = String(demand.start_date || contract.date_debut || '').trim();

    const endDate = String(demand.end_date || contract.date_fin || '').trim();

    const nights = computeNights(startDate, endDate);

    const totalAmount = Number.isFinite(Number(demand.total_amount))

      ? Number(demand.total_amount)

      : (Number(contract.prix_nuitee || 0) > 0 ? (Number(contract.prix_nuitee || 0) * nights) : Number(contract.montant_recu || 0));

    const paymentMode = normalizePaymentMode(demand.payment_mode || 'avance', 'avance');

    const amountDueNow = Number.isFinite(Number(demand.amount_due_now))

      ? Number(demand.amount_due_now)

      : Number(contract.montant_recu || 0);



    const contractDemandContext = {

      ...demand,

      bien_id: contract.bien_id,

      bien_titre: contract.bien_titre || null,

      start_date: startDate,

      end_date: endDate,

      client_name: `${identityLastName} ${identityFirstName}`.trim() || String(contract.locataire_nom || '').trim(),

      client_email: String(demand.client_email || contract.locataire_email || '').trim(),

      client_phone: String(demand.client_phone || contract.locataire_telephone || '').trim(),

      finalization_due_at: demand.finalization_due_at || null,

      payment_mode: paymentMode,

      amount_due_now: amountDueNow,

      total_amount: totalAmount,

    };

    const bienContext = {

      id: contract.bien_id,

      reference: contract.bien_reference || '',

      titre: contract.bien_titre || '',

      type: contract.bien_type || '',

      location_saisonniere_config_json: contract.bien_location_saisonniere_config_json || null,

      zone_nom: contract.zone_nom || null,

      zone_quartier: contract.zone_quartier || null,

      zone_gouvernerat: contract.zone_gouvernerat || null,

      zone_region: contract.zone_region || null,

      zone_pays: contract.zone_pays || null,

      caution: contract.caution,

      ville: String(demand.ville || demand.city || '').trim() || 'Kelibia',

    };



    const previousUrl = String(contract.url_pdf || '').trim() || null;

    const regeneratedUrl = await generateReservationClientContractHtml({

      demand: contractDemandContext,

      bien: bienContext,

      contractId,

      contractCreatedAt: contract.created_at || getAgencySqlDateTime(),

      totalAmount,

      amountDueNow,

      paymentMode,

      identityNumber: identityNumber || '-',

      identityDocumentType,

      identityFirstName: identityFirstName || '-',

      identityLastName: identityLastName || '-',

    });



    await pool.query('UPDATE contrats SET url_pdf = ? WHERE id = ?', [regeneratedUrl, contractId]);

    const [updatedRows] = await pool.query('SELECT * FROM contrats WHERE id = ? LIMIT 1', [contractId]);



    res.json({

      ok: true,

      contract_id: contractId,

      previous_url_pdf: previousUrl,

      url_pdf: regeneratedUrl,

      contract: updatedRows[0] || null,

    });

  } catch (error) {

    console.error('Error regenerating contract template PDF:', error);

    res.status(500).json({ error: 'Regeneration du contrat impossible' });

  }

});



app.post('/api/contrats', requireAdminSession, async (req, res) => {

  try {

    await ensureContractsSchema();

    const { bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, owner_url_pdf, statut, origine } = req.body;

    const locataireProfile = await fetchClienteleProfileBySource('locataires', locataire_id);

    if (locataireProfile && (locataireProfile.globalStatus === 'blackliste' || locataireProfile.locataireStatus === 'blackliste')) {

      return res.status(400).json({ error: 'Creation impossible: ce locataire est blackliste' });

    }

    const id = 'c' + Date.now();

    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const contractOrigin = String(origine || 'manuel').trim().toLowerCase() === 'automatique' ? 'automatique' : 'manuel';

    await pool.query(

      'INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, owner_url_pdf, origine, statut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',

      [id, bien_id, locataire_id, date_debut, date_fin, montant_recu || 0, url_pdf || null, owner_url_pdf || null, contractOrigin, statut || 'actif', created_at]

    );

    const [matchingDemandRows] = await pool.query(

      `SELECT d.id

       FROM reservation_demands d

       LEFT JOIN locataires l ON l.id = ?

       WHERE d.bien_id = ?

         AND (d.client_user_id = ? OR (l.email IS NOT NULL AND d.client_email = l.email))

         AND d.start_date <= ?

         AND d.end_date >= ?

         AND d.status IN (

           'en_attente_reponse_proprietaire',

           'pas_de_reponse_proprietaire',

           'reponse_positive_attente_confirmation_client',

           'client_procede_vers_paiement_en_cours',

           'reponse_negative_autre_proposition_meme_bien',

           'reponse_negative_autre_proposition_bien_similaire',

           'attente_envoi_coordonnees_contrat'

         )

       ORDER BY d.created_at DESC

       LIMIT 1`,

      [locataire_id, bien_id, locataire_id, date_fin, date_debut]

    );

    if (matchingDemandRows[0]) {

      const demandUpdatedAt = getAgencySqlDateTime();

      await pool.query(

        `UPDATE reservation_demands

         SET status = 'contrat_realise', contract_id = ?, updated_at = ?

         WHERE id = ?`,

        [id, demandUpdatedAt, matchingDemandRows[0].id]

      );

      await appendReservationDemandHistory(

        matchingDemandRows[0].id,

        'contrat_realise',

        'system',

        id,

        `Contrat ${id} cree automatiquement depuis la demande`,

        demandUpdatedAt

      );

    }

    const [newContrat] = await pool.query('SELECT * FROM contrats WHERE id = ?', [id]);

    res.status(201).json(newContrat[0]);

  } catch (error) {

    console.error('Error creating contrat:', error);

    res.status(500).json({ error: 'Failed to create contrat' });

  }

});



// ============================================

// PAIEMENTS API

// ============================================



app.get('/api/paiements', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query(`

      SELECT p.*, c.id as contrat_ref 

      FROM paiements p 

      LEFT JOIN contrats c ON p.contrat_id = c.id

      ORDER BY p.date_paiement DESC

    `);

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch paiements' });

  }

});



app.post('/api/paiements', requireAdminSession, async (req, res) => {

  try {

    const { contrat_id, montant, date_paiement, statut, methode } = req.body;

    const id = 'pay' + Date.now();

    await pool.query(

      'INSERT INTO paiements (id, contrat_id, montant, date_paiement, statut, methode) VALUES (?, ?, ?, ?, ?, ?)',

      [id, contrat_id, montant, date_paiement, statut || 'en_attente', methode || 'virement']

    );

    if ((statut || 'en_attente') === 'paye' && contrat_id) {

      const [demandRows] = await pool.query(

        `SELECT id

         FROM reservation_demands

         WHERE contract_id = ?

         ORDER BY updated_at DESC

         LIMIT 1`,

        [contrat_id]

      );

      if (demandRows[0]) {

        const demandUpdatedAt = getAgencySqlDateTime();

        await pool.query(

          `UPDATE reservation_demands

           SET status = 'succes_paiement', payment_id = ?, updated_at = ?

           WHERE id = ?`,

          [id, demandUpdatedAt, demandRows[0].id]

        );

        await appendReservationDemandHistory(

          demandRows[0].id,

          'succes_paiement',

          'admin',

          String(req.authUser?.id || 'admin'),

          `Paiement ${id} enregistre et valide par admin`,

          demandUpdatedAt

        );

      }

    }

    const [newPaiement] = await pool.query('SELECT * FROM paiements WHERE id = ?', [id]);

    res.status(201).json(newPaiement[0]);

  } catch (error) {

    console.error('Error creating paiement:', error);

    res.status(500).json({ error: 'Failed to create paiement' });

  }

});



// ============================================

// MAINTENANCE API

// ============================================



app.get('/api/maintenance', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query(`

      SELECT

        m.*,

        b.titre as bien_titre,

        b.proprietaire_id,

        p.nom as proprietaire_nom

      FROM maintenance m 

      LEFT JOIN biens b ON m.bien_id = b.id

      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

      ORDER BY m.created_at DESC

    `);

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch maintenance' });

  }

});



app.post('/api/maintenance', requireAdminSession, async (req, res) => {

  try {

    const { bien_id, description, cout, statut } = req.body;

    if (!bien_id || !description) {

      return res.status(400).json({ error: 'Bien et description requis' });

    }

    const id = 'maint' + Date.now();

    const created_at = getAgencySqlDateTime();

    const [bienRows] = await pool.query('SELECT id, titre, proprietaire_id FROM biens WHERE id = ? LIMIT 1', [bien_id]);

    const bien = bienRows[0];

    if (!bien) {

      return res.status(404).json({ error: 'Bien introuvable' });

    }



    let ownerApprovalRequired = 0;

    let ownerApprovalStatus = 'non_requis';

    let resolvedStatut = statut || 'en_cours';

    if (bien.proprietaire_id) {

      const ownerProfile = await fetchClienteleProfileBySource('proprietaires', bien.proprietaire_id);

      const plafond = Number(ownerProfile?.proprietairePlafondTravaux || 200);

      if (Number(cout || 0) > plafond) {

        ownerApprovalRequired = 1;

        ownerApprovalStatus = 'en_attente';

        resolvedStatut = 'en_attente_accord_proprietaire';

      }

    }



    await pool.query(

      `INSERT INTO maintenance (

        id, bien_id, description, cout, statut, owner_approval_required, owner_approval_status, owner_approved_at, created_at

      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [id, bien_id, description, cout || 0, resolvedStatut, ownerApprovalRequired, ownerApprovalStatus, null, created_at]

    );

    const [newMaint] = await pool.query(`

      SELECT

        m.*,

        b.titre as bien_titre,

        b.proprietaire_id,

        p.nom as proprietaire_nom

      FROM maintenance m

      LEFT JOIN biens b ON b.id = m.bien_id

      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

      WHERE m.id = ?`,

      [id]

    );

    res.status(201).json(newMaint[0]);

  } catch (error) {

    console.error('Error creating maintenance:', error);

    res.status(500).json({ error: 'Failed to create maintenance' });

  }

});



app.put('/api/maintenance/:id', requireAdminSession, async (req, res) => {

  try {

    const { description, cout, statut } = req.body || {};

    const [rows] = await pool.query(

      `SELECT m.*, b.proprietaire_id

       FROM maintenance m

       LEFT JOIN biens b ON b.id = m.bien_id

       WHERE m.id = ?

       LIMIT 1`,

      [req.params.id]

    );

    const current = rows[0];

    if (!current) {

      return res.status(404).json({ error: 'Maintenance introuvable' });

    }



    let ownerApprovalRequired = Number(current.owner_approval_required || 0);

    let ownerApprovalStatus = String(current.owner_approval_status || 'non_requis');

    let ownerApprovedAt = current.owner_approved_at || null;

    const nextCost = cout === undefined ? Number(current.cout || 0) : Number(cout || 0);

    let nextStatus = statut === undefined ? String(current.statut || 'en_cours') : String(statut);



    if (current.proprietaire_id) {

      const ownerProfile = await fetchClienteleProfileBySource('proprietaires', current.proprietaire_id);

      const plafond = Number(ownerProfile?.proprietairePlafondTravaux || 200);

      ownerApprovalRequired = nextCost > plafond ? 1 : 0;

      if (!ownerApprovalRequired) {

        ownerApprovalStatus = 'non_requis';

        ownerApprovedAt = null;

      } else if (nextStatus === 'approuve') {

        ownerApprovalStatus = 'approuve';

        ownerApprovedAt = getAgencySqlDateTime();

      } else if (ownerApprovalStatus !== 'approuve') {

        ownerApprovalStatus = 'en_attente';

        if (nextStatus === 'en_cours') {

          return res.status(400).json({ error: 'Passage en cours impossible: accord proprietaire requis avant travaux' });

        }

        if (nextStatus !== 'termine' && nextStatus !== 'annule') {

          nextStatus = 'en_attente_accord_proprietaire';

        }

      }

    }



    await pool.query(

      `UPDATE maintenance

       SET description = ?, cout = ?, statut = ?, owner_approval_required = ?, owner_approval_status = ?, owner_approved_at = ?

       WHERE id = ?`,

      [

        description === undefined ? current.description : String(description),

        nextCost,

        nextStatus,

        ownerApprovalRequired,

        ownerApprovalStatus,

        ownerApprovedAt,

        req.params.id,

      ]

    );



    const [updatedRows] = await pool.query(`

      SELECT

        m.*,

        b.titre as bien_titre,

        b.proprietaire_id,

        p.nom as proprietaire_nom

      FROM maintenance m

      LEFT JOIN biens b ON b.id = m.bien_id

      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

      WHERE m.id = ?`,

      [req.params.id]

    );

    res.json(updatedRows[0]);

  } catch (error) {

    console.error('Error updating maintenance:', error);

    res.status(500).json({ error: 'Failed to update maintenance' });

  }

});



// ============================================

// NOTIFICATIONS API

// ============================================



app.get('/api/notifications', requireAdminSession, async (req, res) => {

  try {

    await ensureAdminNotificationsSchema();

    const [rows] = await pool.query('SELECT id, NULL AS utilisateur_id, type, message, lu, created_at FROM admin_notifications ORDER BY created_at DESC LIMIT 50');

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch notifications' });

  }

});



app.post('/api/notifications', requireAdminSession, async (req, res) => {

  try {

    const { type, message } = req.body;

    const created_at = new Date().toISOString();

    await ensureAdminNotificationsSchema();

    const id = await createAdminNotification(type || 'info', message, created_at);

    const [newNotif] = await pool.query('SELECT id, NULL AS utilisateur_id, type, message, lu, created_at FROM admin_notifications WHERE id = ?', [id]);

    res.status(201).json(newNotif[0]);

  } catch (error) {

    console.error('Error creating notification:', error);

    res.status(500).json({ error: 'Failed to create notification' });

  }

});



app.put('/api/notifications/:id/lu', requireAdminSession, async (req, res) => {

  try {

    await ensureAdminNotificationsSchema();

    await pool.query('UPDATE admin_notifications SET lu = 1 WHERE id = ?', [req.params.id]);

    res.json({ message: 'Notification marked as read' });

  } catch (error) {

    res.status(500).json({ error: 'Failed to update notification' });

  }

});



app.post('/api/contrats/manual-reservation', requireAdminSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    await ensureContractsSchema();



    const {

      bien_id,

      start_date,

      end_date,

      guests,

      adult_guests,

      child_guests,

      caution_amount,

      payment_mode,

      total_amount,

      amount_due_now,

      client_note,

      client_first_name,

      client_last_name,

      client_email,

      client_telephone,

      client_address,

      identity_document_type,

      identity_document_number,

      representative,

      arrival_time,

      departure_time,

      payment_id,

      payment_method,

      payment_deadline_date,

      payment_deadline_time,

      signature_city,

      service_1,

      prix_service_1,

      service_2,

      prix_service_2,

      service_3,

      prix_service_3,

    } = req.body || {};



    const bienId = String(bien_id || '').trim();

    const startDate = toSqlDateOnly(start_date);

    const endDate = toSqlDateOnly(end_date);

    if (!bienId || !startDate || !endDate) {

      return res.status(400).json({ error: 'bien_id, start_date et end_date requis' });

    }

    if (endDate < startDate) {

      return res.status(400).json({ error: 'La date de fin doit etre apres la date de debut' });

    }



    const [bienRows] = await pool.query(

      `SELECT b.id, b.titre, b.reference, b.mode, b.type, b.proprietaire_id, b.prix_nuitee, b.location_saisonniere_config_json,

              z.nom AS zone_nom, z.quartier AS zone_quartier, z.gouvernerat AS zone_gouvernerat, z.region AS zone_region, z.pays AS zone_pays

       FROM biens b

       LEFT JOIN zones z ON z.id = b.zone_id

       WHERE b.id = ?

       LIMIT 1`,

      [bienId]

    );

    const bien = bienRows[0];

    if (!bien) return res.status(404).json({ error: 'Bien introuvable' });

    if (String(bien.mode || '') === 'vente') {

      return res.status(400).json({ error: 'Reservation manuelle indisponible pour un bien en vente' });

    }



    const [overlapRows] = await pool.query(

      `SELECT id

       FROM unavailable_dates

       WHERE bien_id = ?

         AND start_date < ?

         AND end_date > ?

         AND status IN ('blocked', 'booked', 'pending')

       LIMIT 1`,

      [bienId, endDate, startDate]

    );

    if (overlapRows[0]) {

      return res.status(400).json({ error: 'Periode deja indisponible pour ce bien' });

    }



    const firstName = normalizePersonName(client_first_name || '');

    const lastName = normalizePersonName(client_last_name || '');

    const fullName = normalizePersonName(`${firstName} ${lastName}`) || 'Client';

    const email = normalizeEmailForCompare(client_email);

    const telephone = normalizePhoneNumber(client_telephone || '');

    const identityDocType = normalizeIdentityDocumentType(identity_document_type, 'cin_tn');

    const identityNumber = normalizeIdentityNumber(identity_document_number || '');

    const now = getAgencySqlDateTime();

    const normalizedPaymentMode = normalizePaymentMode(payment_mode, 'avance');

    const normalizedArrivalTime = String(arrival_time || '').trim();

    const normalizedDepartureTime = String(departure_time || '').trim();

    const normalizedPaymentId = String(payment_id || '').trim();

    const normalizedRepresentative = String(representative || 'ghaith').trim().toLowerCase() === 'chayma' ? 'chayma' : 'ghaith';

    const normalizedSignatureCity = String(signature_city || '').trim();

    const paymentDeadlineDate = toSqlDateOnly(payment_deadline_date);

    const paymentDeadlineTimeRaw = String(payment_deadline_time || '').trim();

    const paymentDeadlineTime = /^\d{2}:\d{2}$/.test(paymentDeadlineTimeRaw) ? paymentDeadlineTimeRaw : '';

    const paymentDeadlineAt = paymentDeadlineDate

      ? `${paymentDeadlineDate} ${paymentDeadlineTime || '00:00'}:00`

      : now;

    const nights = computeNights(startDate, endDate);

    const saisonCfg = safeParseJson(bien.location_saisonniere_config_json, {});

    const fallbackTotal = Math.max(0, Number(bien.prix_nuitee || 0) * Math.max(1, nights));

    const hasTotalAmountInput = total_amount !== undefined && total_amount !== null && String(total_amount).trim() !== '';

    const parsedTotalAmount = Number(total_amount);

    if (hasTotalAmountInput && (!Number.isFinite(parsedTotalAmount) || parsedTotalAmount <= 0)) {

      return res.status(400).json({ error: 'Le prix total manuel doit etre superieur a 0' });

    }

    const normalizedTotalAmount = hasTotalAmountInput

      ? Math.round(parsedTotalAmount * 100) / 100

      : fallbackTotal;

    const advancePercent = Math.min(

      100,

      Math.max(1, Number(saisonCfg?.avance_pourcentage ?? saisonCfg?.avancePourcentage ?? 30))

    );

    const fallbackAdvanceAmount = normalizedPaymentMode === 'totalite'

      ? normalizedTotalAmount

      : Math.round(((normalizedTotalAmount * advancePercent) / 100) * 100) / 100;

    const hasAmountDueNowInput = amount_due_now !== undefined && amount_due_now !== null && String(amount_due_now).trim() !== '';

    const parsedAmountDueNow = Number(amount_due_now);

    if (normalizedPaymentMode === 'avance' && hasAmountDueNowInput && (!Number.isFinite(parsedAmountDueNow) || parsedAmountDueNow < 0)) {

      return res.status(400).json({ error: 'L avance manuelle doit etre un montant valide' });

    }

    const normalizedAmountDueNow = normalizedPaymentMode === 'totalite'

      ? normalizedTotalAmount

      : (hasAmountDueNowInput ? Math.round(parsedAmountDueNow * 100) / 100 : fallbackAdvanceAmount);

    if (normalizedAmountDueNow > normalizedTotalAmount) {

      return res.status(400).json({ error: 'L avance a verser ne peut pas depasser le total' });

    }

    const cfgMaxGuestsRaw = Number(

      saisonCfg?.limite_personnes_nuit

      ?? saisonCfg?.limitePersonnesNuit

      ?? saisonCfg?.limite_personne_nuit

    );

    const cfgMaxAdultsRaw = Number(saisonCfg?.max_adultes);

    const cfgMaxChildrenRaw = Number(saisonCfg?.max_enfants);

    const hasCfgMaxGuests = Number.isFinite(cfgMaxGuestsRaw) && cfgMaxGuestsRaw > 0;

    const hasCfgMaxAdults = Number.isFinite(cfgMaxAdultsRaw) && cfgMaxAdultsRaw > 0;

    const hasCfgMaxChildren = Number.isFinite(cfgMaxChildrenRaw) && cfgMaxChildrenRaw >= 0;

    const maxGuestsCap = hasCfgMaxGuests

      ? Math.floor(cfgMaxGuestsRaw)

      : (hasCfgMaxAdults && hasCfgMaxChildren ? Math.floor(cfgMaxAdultsRaw) + Math.floor(cfgMaxChildrenRaw) : null);

    const maxAdultsCap = hasCfgMaxAdults ? Math.floor(cfgMaxAdultsRaw) : null;

    const maxChildrenCap = hasCfgMaxChildren ? Math.floor(cfgMaxChildrenRaw) : null;



    const normalizedGuests = Math.max(1, Number(guests || 1));

    const normalizedAdultGuests = Math.max(1, Number((adult_guests ?? guests) || 1));

    const normalizedChildGuests = Math.max(0, Number(child_guests ?? 0));

    const requestedTotalGuests = normalizedAdultGuests + normalizedChildGuests;

    if (normalizedGuests !== requestedTotalGuests) {

      return res.status(400).json({ error: 'Le total voyageurs doit etre egal a adultes + enfants' });

    }

    if (maxGuestsCap !== null && normalizedGuests > maxGuestsCap) {

      return res.status(400).json({ error: `Le nombre max de voyageurs est ${maxGuestsCap}` });

    }

    if (maxAdultsCap !== null && normalizedAdultGuests > maxAdultsCap) {

      return res.status(400).json({ error: `Le nombre max d adultes est ${maxAdultsCap}` });

    }

    if (maxChildrenCap !== null && normalizedChildGuests > maxChildrenCap) {

      return res.status(400).json({ error: `Le nombre max d enfants est ${maxChildrenCap}` });

    }

    const balancedAdultGuests = normalizedAdultGuests;

    const balancedChildGuests = normalizedChildGuests;



    const locataireId = await upsertLocataireFromReservationProfile({

      userId: null,

      name: fullName,

      email,

      telephone,

      cin: identityNumber,

    });

    if (!locataireId) {

      return res.status(500).json({ error: 'Impossible de creer le profil locataire' });

    }



    const demandId = `rd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const unavailableDateId = `ud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const contractId = `c${Date.now()}`;

    const [ownerRows] = await pool.query(

      'SELECT id, nom, email FROM proprietaires WHERE id = ? LIMIT 1',

      [bien.proprietaire_id || '']

    );

    const owner = ownerRows[0] || null;



    await pool.query(

      `INSERT INTO reservation_demands (

        id, bien_id, request_type, unavailable_date_id, client_user_id, client_email, client_name, proprietaire_id, owner_user_id,

        start_date, end_date, guests, adult_guests, child_guests, payment_mode, total_amount, amount_due_now, selected_fixed_services_json, selected_variable_services_json,

        variable_services_quote_json, variable_services_quote_total, variable_services_quote_status, status, owner_notified_at, owner_response_at,

        client_confirmation_clicked_at, identity_document_type, identity_document_number, identity_first_name, identity_last_name, identity_submitted_at,

        contract_generated_at, admin_note, client_note, finalization_due_at, contract_id, payment_id, created_at, updated_at

      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,

      [

        demandId,

        bienId,

        'reservation',

        unavailableDateId,

        null,

        email || null,

        fullName,

        bien.proprietaire_id || null,

        null,

        startDate,

        endDate,

        normalizedGuests,

        balancedAdultGuests,

        balancedChildGuests,

        normalizedPaymentMode,

        normalizedTotalAmount,

        normalizedAmountDueNow,

        JSON.stringify([]),

        JSON.stringify([]),

        JSON.stringify([]),

        0,

        'aucun',

        'contrat_realise',

        now,

        now,

        now,

        identityDocType,

        identityNumber || null,

        firstName || null,

        lastName || null,

        now,

        now,

        'Reservation/contrat cree manuellement par administrateur',

        client_note || null,

        paymentDeadlineAt,

        contractId,

        normalizedPaymentId || null,

        now,

        now,

      ]

    );



    await pool.query(

      `INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, reservation_demand_id, payment_deadline)

       VALUES (?, ?, ?, ?, 'booked', ?, NULL)`,

      [unavailableDateId, bienId, startDate, endDate, demandId]

    );



    const demandSnapshot = {

      id: demandId,

      bien_id: bienId,

      bien_titre: bien.titre || null,

      start_date: startDate,

      end_date: endDate,

      guests: normalizedGuests,

      adult_guests: balancedAdultGuests,

      child_guests: balancedChildGuests,

      client_email: email || null,

      client_phone: telephone || null,

      client_address: String(client_address || '').trim() || null,

      arrival_time: normalizedArrivalTime || null,

      departure_time: normalizedDepartureTime || null,

      payment_id: normalizedPaymentId || null,

      payment_method: String(payment_method || '').trim().toLowerCase() || null,

      payment_deadline_at: paymentDeadlineAt,

      signature_city: normalizedSignatureCity || null,

      contract_representative: normalizedRepresentative,

      service_1: String(service_1 || '').trim(),

      prix_service_1: String(prix_service_1 || '').trim(),

      service_2: String(service_2 || '').trim(),

      prix_service_2: String(prix_service_2 || '').trim(),

      service_3: String(service_3 || '').trim(),

      prix_service_3: String(prix_service_3 || '').trim(),

      variable_services_quote_total: 0,

    };



    const [contractUrl, ownerContractUrl] = await Promise.all([

      generateReservationClientContractHtml({

        demand: demandSnapshot,

        bien,

        contractId,

        contractCreatedAt: now,

        totalAmount: normalizedTotalAmount,

        amountDueNow: normalizedAmountDueNow,

        paymentMode: normalizedPaymentMode,

        identityNumber: identityNumber || '-',

        identityDocumentType: identityDocType,

        identityFirstName: firstName || '-',

        identityLastName: lastName || '-',

        cautionAmount: caution_amount,

      }),

      generateReservationOwnerContractHtml({

        demand: demandSnapshot,

        bien,

        owner,

        contractId,

        contractCreatedAt: now,

        totalAmount: normalizedTotalAmount,

        amountDueNow: normalizedAmountDueNow,

        paymentMode: normalizedPaymentMode,

      }),

    ]);



    await pool.query(

      `INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, owner_url_pdf, origine, statut, created_at)

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manuel', 'actif', ?)`,

      [contractId, bienId, locataireId, startDate, endDate, normalizedAmountDueNow, contractUrl, ownerContractUrl, now]

    );



    await appendReservationDemandHistory(

      demandId,

      'contrat_realise',

      'admin',

      String(req.authUser?.id || 'admin'),

      `Contrat ${contractId} genere manuellement par administrateur`,

      now

    );



    res.status(201).json({

      reservation_demand_id: demandId,

      contract_id: contractId,

      contract_url: contractUrl,

      owner_contract_url: ownerContractUrl,

      bien_id: bienId,

      start_date: startDate,

      end_date: endDate,

      guests: normalizedGuests,

      total_amount: normalizedTotalAmount,

      amount_due_now: normalizedAmountDueNow,

      payment_mode: normalizedPaymentMode,

      origine: 'manuel',

    });

  } catch (error) {

    console.error('Error creating manual contract reservation:', error);

    res.status(500).json({ error: 'Impossible de creer la reservation manuelle' });

  }

});



app.get('/api/system/db-source', requireAdminSession, async (req, res) => {

  try {

    res.json({

      source: isSiteDbSource ? 'site' : 'local',

      host: String(dbConfig.host || ''),

      database: String(dbConfig.database || ''),

      user: String(dbConfig.user || ''),

      fcmEnabled: !!firebaseMessaging,

    });

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch db source state' });

  }

});



app.post('/api/system/sync-feature-catalog-from-site', requireAdminSession, async (req, res) => {

  let sitePool = null;

  let localConn = null;

  try {

    await ensureBiensWorkflowSchemaSafe();

    if (isSiteDbSource) {

      return res.status(400).json({ error: 'Cette action doit etre lancee depuis une instance locale (DB_SOURCE=local).' });

    }

    if (!canMirrorFromSiteDb) {

      return res.status(400).json({ error: 'SITE_DB_HOST/SITE_DB_USER/SITE_DB_NAME requis pour la synchro.' });

    }



    const modeRaw = String(req.body?.mode_bien || req.body?.mode || '').trim();

    const typeRaw = String(req.body?.type_bien || req.body?.type || '').trim();

    const mode = modeRaw ? normalizeBienMode(modeRaw) : null;

    const type = typeRaw ? normalizeBienType(typeRaw) : null;



    if (type && !mode) {

      return res.status(400).json({ error: 'type_bien exige mode_bien.' });

    }

    if (mode && !BIEN_MODES.includes(mode)) {

      return res.status(400).json({ error: 'mode_bien invalide.' });

    }

    if (mode && type) {

      const validation = validateModeAndType(mode, type);

      if (!validation.valid) {

        return res.status(400).json({ error: validation.error });

      }

    }



    sitePool = createSiteMirrorPool();

    const whereParts = [];

    const whereParams = [];

    if (mode) {

      whereParts.push('mode_bien = ?');

      whereParams.push(mode);

    }

    if (type) {

      whereParts.push('type_bien = ?');

      whereParams.push(type);

    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';



    const [contextRowsRaw] = await sitePool.query(

      `SELECT id, caracteristique_id, mode_bien, type_bien, onglet_id

       FROM caracteristique_contextes

       ${whereClause}`,

      whereParams

    );

    const contextRows = Array.isArray(contextRowsRaw) ? contextRowsRaw : [];

    if (contextRows.length === 0) {

      return res.json({

        message: 'Aucune donnee a synchroniser pour le scope demande.',

        scope: { mode_bien: mode || null, type_bien: type || null },

        counts: { caracteristiques: 0, onglets: 0, contextes: 0, modifier_onglets: 0 },

      });

    }



    const featureIds = Array.from(new Set(contextRows.map((row) => String(row.caracteristique_id || '').trim()).filter(Boolean)));

    const tabIdsFromContext = contextRows.map((row) => String(row.onglet_id || '').trim()).filter(Boolean);



    const [modifierRowsRaw] = await sitePool.query(

      `SELECT id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre

       FROM modifier_onglets

       ${whereClause}`,

      whereParams

    );

    const modifierRows = (Array.isArray(modifierRowsRaw) ? modifierRowsRaw : []).filter((row) =>

      featureIds.includes(String(row.caracteristique_id || '').trim())

    );

    const tabIds = Array.from(new Set([...tabIdsFromContext, ...modifierRows.map((row) => String(row.onglet_id || '').trim()).filter(Boolean)]));



    const chunk = (arr, size = 200) => {

      const out = [];

      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));

      return out;

    };



    const featureRows = [];

    for (const ids of chunk(featureIds)) {

      if (ids.length === 0) continue;

      const placeholders = ids.map(() => '?').join(', ');

      const [rows] = await sitePool.query(

        `SELECT id, nom, type_caracteristique, choix_json, unite, icon_name, visibilite_client

         FROM caracteristiques

         WHERE id IN (${placeholders})`,

        ids

      );

      if (Array.isArray(rows)) featureRows.push(...rows);

    }



    const tabRows = [];

    for (const ids of chunk(tabIds)) {

      if (ids.length === 0) continue;

      const placeholders = ids.map(() => '?').join(', ');

      const [rows] = await sitePool.query(

        `SELECT id, mode_bien, type_bien, nom, ordre, is_system

         FROM caracteristique_onglets

         WHERE id IN (${placeholders})`,

        ids

      );

      if (Array.isArray(rows)) tabRows.push(...rows);

    }



    localConn = await pool.getConnection();

    await localConn.beginTransaction();



    for (const row of featureRows) {

      await localConn.query(

        `INSERT INTO caracteristiques (id, nom, type_caracteristique, choix_json, unite, icon_name, visibilite_client)

         VALUES (?, ?, ?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE

           nom = VALUES(nom),

           type_caracteristique = VALUES(type_caracteristique),

           choix_json = VALUES(choix_json),

           unite = VALUES(unite),

           icon_name = VALUES(icon_name),

           visibilite_client = VALUES(visibilite_client)`,

        [

          row.id,

          row.nom,

          row.type_caracteristique || 'simple',

          row.choix_json || null,

          row.unite || null,

          row.icon_name || null,

          Number(row.visibilite_client) === 0 ? 0 : 1,

        ]

      );

    }



    for (const row of tabRows) {

      await localConn.query(

        `INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)

         VALUES (?, ?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE

           nom = VALUES(nom),

           ordre = VALUES(ordre),

           is_system = VALUES(is_system)`,

        [

          row.id,

          normalizeBienMode(row.mode_bien),

          normalizeBienType(row.type_bien),

          row.nom,

          Number(row.ordre || 999),

          Number(row.is_system || 0),

        ]

      );

    }



    for (const row of contextRows) {

      await localConn.query(

        `INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien, onglet_id)

         VALUES (?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE

           caracteristique_id = VALUES(caracteristique_id),

           mode_bien = VALUES(mode_bien),

           type_bien = VALUES(type_bien),

           onglet_id = VALUES(onglet_id)`,

        [

          row.id,

          row.caracteristique_id,

          normalizeBienMode(row.mode_bien),

          normalizeBienType(row.type_bien),

          String(row.onglet_id || '').trim() || null,

        ]

      );

    }



    for (const row of modifierRows) {

      await localConn.query(

        `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)

         VALUES (?, ?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE

           onglet_id = VALUES(onglet_id),

           caracteristique_id = VALUES(caracteristique_id),

           ordre = VALUES(ordre)`,

        [

          row.id,

          normalizeBienMode(row.mode_bien),

          normalizeBienType(row.type_bien),

          String(row.onglet_id || '').trim() || null,

          row.caracteristique_id,

          Number(row.ordre || 0),

        ]

      );

    }



    await localConn.commit();

    res.json({

      message: 'Synchronisation terminee (site -> local).',

      scope: { mode_bien: mode || null, type_bien: type || null },

      counts: {

        caracteristiques: featureRows.length,

        onglets: tabRows.length,

        contextes: contextRows.length,

        modifier_onglets: modifierRows.length,

      },

    });

  } catch (error) {

    if (localConn) {

      try { await localConn.rollback(); } catch {}

    }

    console.error('Error syncing feature catalog from site:', error);

    res.status(500).json({ error: 'Echec de la synchro des caracteristiques depuis la base site.' });

  } finally {

    if (localConn) localConn.release();

    if (sitePool) {

      try { await sitePool.end(); } catch {}

    }

  }

});



// ============================================

// MOBILE OWNERS CHAT + NOTIFICATIONS API

// ============================================



app.get('/api/mobile/owners/:ownerId/chat', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    const bienId = String(req.query?.bien_id || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'ownerId requis' });

    }

    const params = [ownerId];

    let bienFilterSql = '';

    if (bienId) {

      bienFilterSql = ` AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.bienId')), '') = ?`;

      params.push(bienId);

    }



    const [rows] = await pool.query(

      `SELECT id, client_user_id, client_email, client_name, type, bien_id, property_title, source, metadata_json,

              DATE_FORMAT(event_at, '%Y-%m-%d %H:%i:%s') AS event_at

       FROM client_interactions

       WHERE type = 'partage'

         AND metadata_json IS NOT NULL

         AND JSON_VALID(metadata_json) = 1

         AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.ownerId')) = ?

         AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.kind')) IN ('owner_admin_chat', 'admin_owner_chat')

         ${bienFilterSql}

       ORDER BY event_at DESC

       LIMIT 200`,

      params

    );



    const mapped = (rows || []).map((row) => {

      let metadata = null;

      try {

        metadata = row.metadata_json ? JSON.parse(String(row.metadata_json)) : null;

      } catch {

        metadata = null;

      }

      return {

        id: row.id,

        ownerId,

        bienId: metadata?.bienId || row.bien_id || null,

        propertyTitle: metadata?.propertyTitle || row.property_title || null,

        source: row.source || 'site_public',

        type: row.type,

        clientUserId: row.client_user_id || null,

        text: metadata?.text || '',

        kind: metadata?.kind || null,

        createdAt: row.event_at,

        metadata,

      };

    });

    res.json(mapped);

  } catch (error) {

    console.error('Error fetching mobile owner chat messages:', error);

    res.status(500).json({ error: 'Failed to fetch owner chat messages' });

  }

});



app.post('/api/mobile/owners/:ownerId/chat', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    const text = String(req.body?.text || '').trim();

    const bienId = String(req.body?.bienId || '').trim();

    const propertyTitle = String(req.body?.propertyTitle || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'ownerId requis' });

    }

    if (!text) {

      return res.status(400).json({ error: 'message requis' });

    }



    const created = await appendClientInteraction({

      req,

      clientUserId: ownerId,

      clientEmail: `${ownerId}@owner.local`,

      clientName: ownerId,

      type: 'partage',

      bienId: bienId || 'owner-chat',

      propertyTitle: propertyTitle || 'Chat proprietaire',

      source: 'site_public',

      routePath: '/mobile/owner/chat',

      metadata: {

        kind: 'owner_admin_chat',

        ownerId,

        bienId: bienId || null,

        propertyTitle: propertyTitle || null,

        text,

        createdAt: getAgencySqlDateTime(),

      },

    });



    await createAdminNotification('info', `Nouveau message proprietaire (${ownerId})`);

    res.status(201).json(created);

  } catch (error) {

    console.error('Error creating mobile owner chat message:', error);

    res.status(500).json({ error: 'Failed to send owner chat message' });

  }

});



app.post('/api/mobile/admin/owners/:ownerId/chat', requireAdminSession, async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    const text = String(req.body?.text || '').trim();

    const bienId = String(req.body?.bienId || '').trim();

    const propertyTitle = String(req.body?.propertyTitle || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'ownerId requis' });

    }

    if (!text) {

      return res.status(400).json({ error: 'message requis' });

    }



    const created = await appendClientInteraction({

      req,

      clientUserId: req.authUser?.id || 'admin_mobile',

      clientEmail: req.authUser?.email || 'admin@dwira.mobile',

      clientName: req.authUser?.name || 'Admin',

      type: 'partage',

      bienId: bienId || 'owner-chat',

      propertyTitle: propertyTitle || 'Chat admin',

      source: 'admin',

      routePath: '/mobile/admin/chat',

      metadata: {

        kind: 'admin_owner_chat',

        ownerId,

        bienId: bienId || null,

        propertyTitle: propertyTitle || null,

        text,

        createdAt: getAgencySqlDateTime(),

      },

    });



    await ensureOwnerMobileNotificationsSchema();

    const notifId = `omn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(

      `INSERT INTO owner_mobile_notifications

       (id, owner_id, type, message, lu, metadata_json, created_at)

       VALUES (?, ?, ?, ?, 0, ?, ?)`,

      [

        notifId,

        ownerId,

        'info',

        'Nouveau message de l admin',

        JSON.stringify({

          kind: 'admin_owner_chat',

          ownerId,

          bienId: bienId || null,

          propertyTitle: propertyTitle || null,

          interactionId: created?.id || null,

          text,

        }),

        getAgencySqlDateTime(),

      ]

    );

    await createAdminNotification(

      'info',

      `Message admin envoyÃ© au proprietaire ${ownerId}${bienId ? ` (bien ${bienId})` : ''}`

    );



    res.status(201).json(created);

  } catch (error) {

    console.error('Error creating admin->owner chat message:', error);

    res.status(500).json({ error: 'Failed to send admin chat message' });

  }

});



app.get('/api/mobile/owners/:ownerId/notifications', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'ownerId requis' });

    }

    await ensureOwnerMobileNotificationsSchema();

    const [rows] = await pool.query(

      `SELECT id, owner_id, type, message, lu, metadata_json, created_at

       FROM owner_mobile_notifications

       WHERE owner_id = ?

       ORDER BY created_at DESC

       LIMIT 200`,

      [ownerId]

    );



    const mapped = (rows || []).map((row) => {

      let metadata = null;

      try {

        metadata = row.metadata_json ? JSON.parse(String(row.metadata_json)) : null;

      } catch {

        metadata = null;

      }

      return {

        id: row.id,

        ownerId: row.owner_id,

        type: row.type,

        message: row.message,

        lu: Number(row.lu || 0) === 1,

        createdAt: row.created_at,

        metadata,

      };

    });

    res.json(mapped);

  } catch (error) {

    console.error('Error fetching owner notifications:', error);

    res.status(500).json({ error: 'Failed to fetch owner notifications' });

  }

});



app.put('/api/mobile/owners/:ownerId/notifications/:id/read', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    const id = String(req.params.id || '').trim();

    if (!ownerId || !id) {

      return res.status(400).json({ error: 'ownerId et id requis' });

    }

    await ensureOwnerMobileNotificationsSchema();

    await pool.query(

      'UPDATE owner_mobile_notifications SET lu = 1 WHERE id = ? AND owner_id = ?',

      [id, ownerId]

    );

    res.json({ ok: true });

  } catch (error) {

    console.error('Error marking owner notification as read:', error);

    res.status(500).json({ error: 'Failed to mark owner notification as read' });

  }

});



app.post('/api/mobile/owners/:ownerId/push-token', async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || '').trim();

    const token = String(req.body?.token || '').trim();

    const platform = String(req.body?.platform || '').trim();

    const appVersion = String(req.body?.appVersion || '').trim();

    if (!ownerId || !token) {

      return res.status(400).json({ error: 'ownerId et token requis' });

    }

    await ensureOwnerPushTokensSchema();

    const now = getAgencySqlDateTime();

    const [existing] = await pool.query(

      `SELECT id

       FROM owner_push_tokens

       WHERE owner_id = ? AND token = ?

       LIMIT 1`,

      [ownerId, token]

    );

    const existingId = String(existing?.[0]?.id || '').trim();

    if (existingId) {

      await pool.query(

        `UPDATE owner_push_tokens

         SET active = 1,

             platform = ?,

             app_version = ?,

             updated_at = ?,

             last_seen_at = ?

         WHERE id = ?`,

        [platform || null, appVersion || null, now, now, existingId]

      );

      return res.json({ ok: true, id: existingId, updated: true });

    }

    const id = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(

      `INSERT INTO owner_push_tokens

       (id, owner_id, token, platform, app_version, active, created_at, updated_at, last_seen_at)

       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,

      [id, ownerId, token, platform || null, appVersion || null, now, now, now]

    );

    res.status(201).json({ ok: true, id, created: true });

  } catch (error) {

    console.error('Error saving owner push token:', error);
    res.status(500).json({ error: 'Failed to save owner push token' });
  }
});

app.post('/api/mobile/admin/push-token', requireAdminSession, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || '').trim();
    const appVersion = String(req.body?.appVersion || '').trim();
    const adminUserId = String(req.authUser?.id || '').trim() || null;
    const adminEmail = normalizeEmailForCompare(req.authUser?.email || '') || null;
    if (!token) {
      return res.status(400).json({ error: 'token requis' });
    }
    await ensureAdminPushTokensSchema();
    const now = getAgencySqlDateTime();
    const [existing] = await pool.query(
      `SELECT id
       FROM admin_push_tokens
       WHERE token = ?
       LIMIT 1`,
      [token]
    );
    const existingId = String(existing?.[0]?.id || '').trim();
    if (existingId) {
      await pool.query(
        `UPDATE admin_push_tokens
         SET active = 1,
             admin_user_id = ?,
             admin_email = ?,
             platform = ?,
             app_version = ?,
             updated_at = ?,
             last_seen_at = ?
         WHERE id = ?`,
        [adminUserId, adminEmail, platform || null, appVersion || null, now, now, existingId]
      );
      return res.json({ ok: true, id: existingId, updated: true });
    }
    const id = `apt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO admin_push_tokens
       (id, admin_user_id, admin_email, token, platform, app_version, active, created_at, updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, adminUserId, adminEmail, token, platform || null, appVersion || null, now, now, now]
    );
    res.status(201).json({ ok: true, id, created: true });
  } catch (error) {
    console.error('Error saving admin push token:', error);
    res.status(500).json({ error: 'Failed to save admin push token' });
  }
});

app.get('/api/mobile/admin/calendar-prompt-schedule', requireAdminSession, async (req, res) => {
  try {
    const schedule = await getOwnerCalendarPromptSchedule();

    res.json(schedule);

  } catch (error) {

    console.error('Error fetching owner calendar prompt schedule:', error);

    res.status(500).json({ error: 'Failed to fetch owner calendar prompt schedule' });

  }

});



app.put('/api/mobile/admin/calendar-prompt-schedule', requireAdminSession, async (req, res) => {

  try {

    const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true;

    const startDate = String(req.body?.startDate || '').trim() || getAgencyLocalDate();

    const dispatchHour = clampCalendarPromptHour(req.body?.dispatchHour, 20);

    const dispatchMinute = clampCalendarPromptMinute(req.body?.dispatchMinute, 0);

    const schedule = await updateOwnerCalendarPromptSchedule({

      enabled,

      startDate,

      dispatchHour,

      dispatchMinute,

    });

    await createAdminNotification(

      'info',

      `Programmation relance calendrier mise a jour: ${schedule.enabled ? 'active' : 'inactive'} - ${schedule.startDate || '-'} ${schedule.dailyTime} ${schedule.timezoneOffsetLabel}`

    );

    res.json(schedule);

  } catch (error) {

    console.error('Error updating owner calendar prompt schedule:', error);

    res.status(500).json({ error: 'Failed to update owner calendar prompt schedule' });

  }

});



app.post('/api/mobile/admin/calendar-prompt-schedule/dispatch-now', requireAdminSession, async (req, res) => {

  try {

    const promptDate = String(req.body?.promptDate || '').trim() || getAgencyLocalDate();

    const result = await dispatchOwnerCalendarPromptBatch({

      promptDate,

      source: 'manual_test',

      forceRedispatch: true,

    });

    await createAdminNotification(

      'info',

      `Test relance calendrier envoye (${result.sentOwners}/${result.totalOwners}) pour ${result.promptDate}`

    );

    res.json({ ok: true, ...result });

  } catch (error) {

    console.error('Error dispatching owner calendar prompt batch manually:', error);

    res.status(500).json({ error: 'Failed to dispatch owner calendar prompt batch' });

  }

});



app.get('/api/mobile/admin/owner-calendar-prompt-statuses', requireAdminSession, async (req, res) => {

  try {

    const rows = await getOwnerCalendarPromptStatuses();

    res.json(rows);

  } catch (error) {

    console.error('Error fetching owner calendar prompt statuses:', error);

    res.status(500).json({ error: 'Failed to fetch owner calendar prompt statuses' });

  }

});



app.get('/api/mobile/owners/:ownerId/calendar-prompts/pending', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'ownerId requis' });

    }

    await ensureOwnerCalendarPromptSchema();

    const [rows] = await pool.query(

      `SELECT id, owner_id, prompt_date, status, notification_id, responded_at, response_metadata_json, created_at, updated_at

       FROM owner_calendar_prompts

       WHERE owner_id = ?

         AND status = 'pending'

       ORDER BY prompt_date DESC, created_at DESC

       LIMIT 1`,

      [ownerId]

    );

    const row = rows?.[0];

    if (!row) {

      return res.json(null);

    }

    let responseMetadata = null;

    try {

      responseMetadata = row.response_metadata_json ? JSON.parse(String(row.response_metadata_json)) : null;

    } catch {

      responseMetadata = null;

    }

    res.json({

      id: row.id,

      ownerId: row.owner_id,

      promptDate: row.prompt_date,

      status: row.status,

      notificationId: row.notification_id || null,

      respondedAt: row.responded_at || null,

      responseMetadata,

      createdAt: row.created_at,

      updatedAt: row.updated_at,

    });

  } catch (error) {

    console.error('Error fetching pending owner calendar prompt:', error);

    res.status(500).json({ error: 'Failed to fetch pending owner calendar prompt' });

  }

});



app.post('/api/mobile/owners/:ownerId/calendar-prompts/:promptId/respond', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    const promptId = String(req.params.promptId || '').trim();

    const responseKind = String(req.body?.response || '').trim().toLowerCase();

    const bienId = String(req.body?.bienId || '').trim();

    const propertyTitle = String(req.body?.propertyTitle || '').trim();

    if (!ownerId || !promptId) {

      return res.status(400).json({ error: 'ownerId et promptId requis' });

    }

    if (responseKind !== 'up_to_date' && responseKind !== 'update_requested') {

      return res.status(400).json({ error: 'Reponse invalide' });

    }

    await ensureOwnerCalendarPromptSchema();

    const [rows] = await pool.query(

      `SELECT id, owner_id, prompt_date, status, notification_id

       FROM owner_calendar_prompts

       WHERE id = ? AND owner_id = ?

       LIMIT 1`,

      [promptId, ownerId]

    );

    const prompt = rows?.[0];

    if (!prompt) {

      return res.status(404).json({ error: 'Prompt calendrier introuvable' });

    }

    if (String(prompt.status || '').trim() !== 'pending') {

      return res.json({

        ok: true,

        alreadyHandled: true,

        status: prompt.status,

      });

    }

    const now = getAgencySqlDateTime();

    const nextStatus = responseKind === 'up_to_date' ? 'confirmed_up_to_date' : 'update_requested';

    const responseMetadata = {

      response: responseKind,

      bienId: bienId || null,

      propertyTitle: propertyTitle || null,

      respondedAt: now,

    };

    await pool.query(

      `UPDATE owner_calendar_prompts

       SET status = ?, responded_at = ?, response_metadata_json = ?, updated_at = ?

       WHERE id = ?`,

      [nextStatus, now, JSON.stringify(responseMetadata), now, promptId]

    );

    if (prompt.notification_id) {

      await pool.query(

        'UPDATE owner_mobile_notifications SET lu = 1 WHERE id = ? AND owner_id = ?',

        [prompt.notification_id, ownerId]

      ).catch(() => {});

    }

    const ownerIdentity = await fetchOwnerIdentity(ownerId);
    if (responseKind === 'up_to_date') {
      await createAdminNotification(
        'success',
        `Calendrier du proprietaire ${ownerIdentity.ownerName} est a jour. Date de reponse : ${now}`
      );

      await appendOwnerSystemChatMessage({

        ownerId,

        text: `Calendrier du proprietaire ${ownerIdentity.ownerName} est a jour. Date de reponse : ${now}`,

        metadata: {

          kind: 'calendar_prompt_up_to_date',

          promptId,

          promptDate: prompt.prompt_date,

        },
      });
    } else {
      await createAdminNotificationWithPush(
        'warning',
        `Le proprietaire ${ownerIdentity.ownerName} a indique que ses calendriers ne sont pas a jour. Mise a jour envoyee le ${now}${propertyTitle ? ` (${propertyTitle})` : ''}`,
        {
          title: 'Mise a jour calendrier',
          kind: 'calendar_update_request',
          createdAt: now,
          data: {
            ownerId,
            promptId,
            promptDate: String(prompt.prompt_date || '').trim(),
            bienId: bienId || '',
            propertyTitle: propertyTitle || '',
            submittedAt: now,
          },
        }
      );
      await appendOwnerSystemChatMessage({
        ownerId,
        bienId: bienId || null,

        propertyTitle: propertyTitle || null,

        text: `Le proprietaire ${ownerIdentity.ownerName} a indique que ses calendriers ne sont pas a jour et a envoye une demande de mise a jour${propertyTitle ? ` pour ${propertyTitle}` : ''}. Date de reponse : ${now}`,

        metadata: {

          kind: 'calendar_prompt_update_requested',

          promptId,

          promptDate: prompt.prompt_date,

        },

      });

    }

    res.json({

      ok: true,

      id: promptId,

      status: nextStatus,

      respondedAt: now,

    });

  } catch (error) {

    console.error('Error saving owner calendar prompt response:', error);

    res.status(500).json({ error: 'Failed to save owner calendar prompt response' });

  }

});



app.get('/api/mobile/owners/:ownerId/availability-requests', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'ownerId requis' });

    }

    await ensureReservationDemandSchema();

    const [rows] = await pool.query(

      `SELECT

         d.id,

         d.bien_id,

         d.proprietaire_id,

         d.start_date,

         d.end_date,

         d.guests,

         d.status,

         DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

         DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

         b.titre AS bien_titre,

         b.reference AS bien_reference,

         (SELECT m.url FROM media m WHERE m.bien_id = d.bien_id ORDER BY COALESCE(m.position, 0) ASC, m.id ASC LIMIT 1) AS cover_media_url

       FROM reservation_demands d

       LEFT JOIN biens b ON b.id = d.bien_id

       WHERE d.proprietaire_id = ?

         AND d.owner_notified_at IS NOT NULL

         AND d.owner_response_at IS NULL

         AND d.status = 'en_attente_reponse_proprietaire'

       ORDER BY d.owner_notified_at DESC, d.created_at DESC

       LIMIT 20`,

      [ownerId]

    );

    res.json(rows || []);

  } catch (error) {

    console.error('Error fetching owner availability requests:', error);

    res.status(500).json({ error: 'Failed to fetch owner availability requests' });

  }

});



app.post('/api/mobile/owners/:ownerId/availability-requests/:demandId/respond', async (req, res) => {

  try {

    const ownerId = String(req.params.ownerId || '').trim();

    const demandId = String(req.params.demandId || '').trim();

    const available = req.body?.available === true;

    const note = String(req.body?.note || '').trim() || null;

    if (!ownerId || !demandId) {

      return res.status(400).json({ error: 'ownerId et demandId requis' });

    }



    await ensureReservationDemandSchema();

    const [rows] = await pool.query(

      `SELECT d.*, b.titre AS bien_titre, b.reference AS bien_reference

       FROM reservation_demands d

       LEFT JOIN biens b ON b.id = d.bien_id

       WHERE d.id = ?

       LIMIT 1`,

      [demandId]

    );

    const demand = rows?.[0];

    if (!demand) {

      return res.status(404).json({ error: 'Demande introuvable' });

    }

    if (String(demand.proprietaire_id || '').trim() !== ownerId) {

      return res.status(403).json({ error: 'Cette demande ne correspond pas a ce proprietaire' });

    }

    if (demand.owner_response_at) {

      return res.status(400).json({ error: 'Demande deja traitee par proprietaire' });

    }



    const now = getAgencySqlDateTime();

    const nextStatus = available

      ? 'reponse_positive_attente_confirmation_client'

      : 'reponse_negative_autre_proposition_bien_similaire';

    const historyNote = available

      ? `Proprietaire confirme disponibilite${note ? `: ${note}` : ''}`

      : `Proprietaire confirme indisponibilite${note ? `: ${note}` : ''}`;



    await pool.query(

      `UPDATE reservation_demands

       SET status = ?, owner_response_at = ?, updated_at = ?

       WHERE id = ?`,

      [nextStatus, now, now, demandId]

    );

    await appendReservationDemandHistory(

      demandId,

      nextStatus,

      'proprietaire',

      ownerId,

      historyNote,

      now

    );



    await createAdminNotification(

      available ? 'success' : 'warning',

      `${available ? 'Disponibilite confirmee' : 'Indisponibilite confirmee'} par proprietaire ${ownerId} pour ${String(demand.bien_reference || demand.bien_id || 'bien')} (${String(demand.start_date || '')} -> ${String(demand.end_date || '')})`,

      now

    );



    await createOwnerMobileNotification({

      ownerId,

      type: available ? 'success' : 'warning',

      message: available

        ? `Votre reponse a ete envoyee: bien disponible (${String(demand.start_date || '')} -> ${String(demand.end_date || '')})`

        : `Votre reponse a ete envoyee: bien indisponible (${String(demand.start_date || '')} -> ${String(demand.end_date || '')})`,

      metadata: {

        kind: 'reservation_owner_response_saved',

        demandId,

        available,

        status: nextStatus,

      },

      createdAt: now,

    });



    res.json({

      ok: true,

      demandId,

      status: nextStatus,

      owner_response_at: now,

    });

  } catch (error) {

    console.error('Error saving owner availability response:', error);

    res.status(500).json({ error: 'Failed to save owner availability response' });

  }

});



function normalizeCalendarRequestStatusValue(metadata) {

  return String(metadata?.status || 'pending').trim().toLowerCase() || 'pending';

}



function buildCalendarRequestDedupKey(metadata) {

  const ownerId = String(metadata?.ownerId || '').trim();

  const bienId = String(metadata?.bienId || '').trim();

  const startDate = String(metadata?.startDate || '').trim();

  const endDate = String(metadata?.endDate || '').trim();

  const requestType = String(metadata?.requestType || 'close').trim().toLowerCase() === 'open' ? 'open' : 'close';

  return [ownerId, bienId, startDate, endDate, requestType].join('|');

}



async function fetchAdminCalendarRequests({ statuses = null } = {}) {

  const normalizedStatuses = Array.isArray(statuses)

    ? statuses.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)

    : null;

  const [rows] = await pool.query(

    `SELECT id, client_user_id, client_name, bien_id, property_title, metadata_json,

            DATE_FORMAT(event_at, '%Y-%m-%d %H:%i:%s') AS event_at

     FROM client_interactions

     WHERE metadata_json IS NOT NULL

       AND JSON_VALID(metadata_json) = 1

       AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.kind')) = 'calendar_update_request'

     ORDER BY event_at DESC, id DESC`

  );



  const mapped = [];

  const ownerIds = new Set();

  for (const row of rows || []) {

    let metadata = null;

    try {

      metadata = row.metadata_json ? JSON.parse(String(row.metadata_json)) : null;

    } catch {

      metadata = null;

    }

    if (!metadata || metadata.kind !== 'calendar_update_request') continue;

    const ownerId = String(metadata.ownerId || row.client_user_id || '').trim();

    const status = normalizeCalendarRequestStatusValue(metadata);

    const requestType = String(metadata.requestType || 'close').trim().toLowerCase() === 'open' ? 'open' : 'close';

    const entry = {

      id: row.id,

      ownerId,

      ownerName: ownerId,

      bienId: String(metadata.bienId || row.bien_id || '').trim(),

      propertyTitle: String(metadata.propertyTitle || row.property_title || '').trim(),

      startDate: String(metadata.startDate || '').trim(),

      endDate: String(metadata.endDate || '').trim(),

      note: String(metadata.note || '').trim(),

      status,

      requestType,

      submittedAt: String(metadata.submittedAt || row.event_at || '').trim(),

      reviewedAt: String(metadata.reviewedAt || '').trim() || null,

      reviewedBy: String(metadata.reviewedBy || '').trim() || null,

      decision: String(metadata.decision || status).trim() || status,

      reason: String(metadata.reason || '').trim() || null,

      metadata,

      dateTime: row.event_at,

      key: buildCalendarRequestDedupKey(metadata),

    };

    mapped.push(entry);

    if (ownerId) ownerIds.add(ownerId);

  }



  const ownerNameById = new Map();

  const ownerIdList = Array.from(ownerIds);

  if (ownerIdList.length > 0) {

    const placeholders = ownerIdList.map(() => '?').join(',');

    const [ownerRows] = await pool.query(

      `SELECT id, nom FROM proprietaires WHERE id IN (${placeholders})`,

      ownerIdList

    );

    for (const row of ownerRows || []) {

      ownerNameById.set(String(row.id || '').trim(), String(row.nom || row.id || '').trim());

    }

  }



  const enriched = mapped.map((row) => ({

    ...row,

    ownerName: ownerNameById.get(row.ownerId) || row.ownerName || row.ownerId,

  }));



  const hasFinalByKey = new Map();

  for (const row of enriched) {

    if (!row.key) continue;

    if (row.status === 'approved' || row.status === 'rejected') {

      hasFinalByKey.set(row.key, true);

    }

  }



  let filtered = enriched.filter((row) => {

    if (row.status === 'pending' && hasFinalByKey.get(row.key)) return false;

    if (!normalizedStatuses || normalizedStatuses.length === 0) return true;

    return normalizedStatuses.includes(row.status);

  });



  if (normalizedStatuses && normalizedStatuses.length === 1 && normalizedStatuses[0] === 'pending') {

    const seen = new Set();

    filtered = filtered.filter((row) => {

      if (!row.key) return true;

      if (seen.has(row.key)) return false;

      seen.add(row.key);

      return true;

    });

  } else if (normalizedStatuses && normalizedStatuses.every((value) => value === 'approved' || value === 'rejected')) {

    const bestByKey = new Map();

    for (const row of filtered) {

      if (!row.key) continue;

      const current = bestByKey.get(row.key);

      const currentSort = current ? String(current.reviewedAt || current.submittedAt || current.dateTime || '') : '';

      const rowSort = String(row.reviewedAt || row.submittedAt || row.dateTime || '');

      if (!current || rowSort > currentSort) {

        bestByKey.set(row.key, row);

      }

    }

    filtered = Array.from(bestByKey.values());

  }



  return filtered.map(({ key, ...row }) => row);

}



async function buildAdminCalendarRequestDiff(interactionId) {

  const [rows] = await pool.query(

    `SELECT id, client_user_id, bien_id, property_title, metadata_json,

            DATE_FORMAT(event_at, '%Y-%m-%d %H:%i:%s') AS event_at

     FROM client_interactions

     WHERE id = ?

     LIMIT 1`,

    [interactionId]

  );

  const row = rows?.[0] || null;

  if (!row || !row.metadata_json) return null;



  let metadata = null;

  try {

    metadata = JSON.parse(String(row.metadata_json));

  } catch {

    metadata = null;

  }

  if (!metadata || metadata.kind !== 'calendar_update_request') return null;



  const bienId = String(metadata.bienId || row.bien_id || '').trim();

  const ownerId = String(metadata.ownerId || row.client_user_id || '').trim();

  const propertyTitle = String(metadata.propertyTitle || row.property_title || '').trim();

  const startDate = String(metadata.startDate || '').trim();

  const endDate = String(metadata.endDate || '').trim();

  const requestType = String(metadata.requestType || 'close').trim().toLowerCase() === 'open' ? 'open' : 'close';

  if (!bienId || !startDate || !endDate) return null;



  const [dateRows] = await pool.query(

    `SELECT id, bien_id, start_date, end_date, status,

            DATE_FORMAT(payment_deadline, '%Y-%m-%d %H:%i:%s') AS paymentDeadline

     FROM unavailable_dates

     WHERE bien_id = ?

     ORDER BY start_date ASC, end_date ASC, id ASC`,

    [bienId]

  );

  const currentCalendar = (dateRows || []).map((item) => ({

    id: item.id,

    start: item.start_date,

    end: item.end_date,

    status: String(item.status || 'blocked').trim().toLowerCase() === 'booked' ? 'booked' : (String(item.status || 'blocked').trim().toLowerCase() === 'pending' ? 'pending' : 'blocked'),

    paymentDeadline: item.paymentDeadline || null,

  }));



  let projectedCalendar = currentCalendar.map((item) => ({ ...item }));

  if (requestType === 'close') {

    projectedCalendar = [

      ...projectedCalendar,

      {

        id: `preview_${interactionId}`,

        start: startDate,

        end: endDate,

        status: 'blocked',

        paymentDeadline: null,

      },

    ];

  } else {

    projectedCalendar = projectedCalendar.filter((item) => {

      const rangeStart = String(item.start || '').slice(0, 10);

      const rangeEnd = String(item.end || '').slice(0, 10);

      return rangeEnd < startDate || rangeStart > endDate;

    });

  }



  const ownerIdentity = await fetchOwnerIdentity(ownerId);

  return {

    interactionId,

    ownerId,

    ownerName: ownerIdentity.ownerName || ownerId,

    bienId,

    propertyTitle,

    startDate,

    endDate,

    requestType,

    status: normalizeCalendarRequestStatusValue(metadata),

    note: String(metadata.note || '').trim(),

    submittedAt: String(metadata.submittedAt || row.event_at || '').trim(),

    reviewedAt: String(metadata.reviewedAt || '').trim() || null,

    currentCalendar,

    projectedCalendar,

  };

}



app.get('/api/mobile/admin/calendar-requests', requireAdminSession, async (req, res) => {

  try {

    const rawStatuses = String(req.query?.statuses || '').trim();

    const statuses = rawStatuses

      ? rawStatuses.split(',').map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)

      : null;

    const rows = await fetchAdminCalendarRequests({ statuses });

    res.json(rows);

  } catch (error) {

    console.error('Error fetching admin calendar requests:', error);

    res.status(500).json({ error: 'Failed to fetch admin calendar requests' });

  }

});



app.get('/api/mobile/admin/calendar-requests/:id/diff', requireAdminSession, async (req, res) => {

  try {

    const interactionId = String(req.params.id || '').trim();

    if (!interactionId) {

      return res.status(400).json({ error: 'id demande requis' });

    }

    const payload = await buildAdminCalendarRequestDiff(interactionId);

    if (!payload) {

      return res.status(404).json({ error: 'Demande calendrier introuvable' });

    }

    res.json(payload);

  } catch (error) {

    console.error('Error building admin calendar request diff:', error);

    res.status(500).json({ error: 'Failed to build admin calendar request diff' });

  }

});



app.post('/api/mobile/admin/calendar-requests/:id/approve', requireAdminSession, async (req, res) => {

  try {

    const interactionId = String(req.params.id || '').trim();

    if (!interactionId) {

      return res.status(400).json({ error: 'id demande requis' });

    }

    const [rows] = await pool.query(

      `SELECT id, metadata_json

       FROM client_interactions

       WHERE id = ?

       LIMIT 1`,

      [interactionId]

    );

    const row = rows?.[0];

    if (!row) {

      return res.status(404).json({ error: 'Demande introuvable' });

    }

    if (!row.metadata_json) {

      return res.status(400).json({ error: 'Metadonnees demande manquantes' });

    }



    let metadata = null;

    try {

      metadata = JSON.parse(String(row.metadata_json));

    } catch {

      metadata = null;

    }

    if (!metadata || metadata.kind !== 'calendar_update_request') {

      return res.status(400).json({ error: 'Interaction non compatible approval calendrier' });

    }



    const ownerId = String(metadata.ownerId || '').trim();

    const bienId = String(metadata.bienId || '').trim();

    const startDate = String(metadata.startDate || '').trim();

    const endDate = String(metadata.endDate || '').trim();

    const requestType = String(metadata.requestType || 'close').trim().toLowerCase() === 'open' ? 'open' : 'close';

    if (!ownerId || !bienId || !startDate || !endDate) {

      return res.status(400).json({ error: 'Demande calendrier incomplete' });

    }



    let unavailableDateId = null;

    let removedRows = 0;

    if (requestType === 'close') {

      unavailableDateId = `ud_mobile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      await pool.query(

        `INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, color, payment_deadline)

         VALUES (?, ?, ?, ?, ?, ?, NULL)`,

        [unavailableDateId, bienId, startDate, endDate, 'blocked', '#ef4444']

      );

    } else {

      const [deleteResult] = await pool.query(

        `DELETE FROM unavailable_dates

         WHERE bien_id = ?

           AND NOT (end_date < ? OR start_date > ?)`,

        [bienId, startDate, endDate]

      );

      removedRows = Number(deleteResult?.affectedRows || 0);

    }



    await ensureOwnerMobileNotificationsSchema();

    const ownerNotifId = `omn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(

      `INSERT INTO owner_mobile_notifications

       (id, owner_id, type, message, lu, metadata_json, created_at)

       VALUES (?, ?, ?, ?, 0, ?, ?)`,

      [

        ownerNotifId,

        ownerId,

        'success',

        requestType === 'close'

          ? `Demande de fermeture approuvee (${startDate} -> ${endDate})`

          : `Demande de reouverture approuvee (${startDate} -> ${endDate})`,

        JSON.stringify({

          kind: 'calendar_update_approved',

          ownerId,

          bienId,

          startDate,

          endDate,

          requestType,

          interactionId,

          removedRows,

        }),

        getAgencySqlDateTime(),

      ]

    );



    await createAdminNotification(

      'success',

      requestType === 'close'

        ? `Fermeture calendrier approuvee pour proprietaire ${ownerId}`

        : `Reouverture calendrier approuvee pour proprietaire ${ownerId}`

    );

    const nextMetadata = {

      ...metadata,

      status: 'approved',

      requestType,

      reviewedAt: getAgencySqlDateTime(),

      reviewedBy: req.authUser?.id || 'admin',

      decision: 'approved',

      removedRows,

      unavailableDateId,

    };

    await pool.query(

      'UPDATE client_interactions SET metadata_json = ? WHERE id = ?',

      [JSON.stringify(nextMetadata), interactionId]

    );

    await pool.query(

      `DELETE FROM client_interactions

       WHERE id <> ?

         AND metadata_json IS NOT NULL

         AND JSON_VALID(metadata_json) = 1

         AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.kind')) = 'calendar_update_request'

         AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.status')), 'pending')) = 'pending'

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.ownerId')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.bienId')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.startDate')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.endDate')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.requestType')), 'close') = ?`,

      [interactionId, ownerId, bienId, startDate, endDate, requestType]

    );

    res.json({ ok: true, interactionId, requestType, unavailableDateId, removedRows });

  } catch (error) {

    console.error('Error approving mobile calendar request:', error);

    res.status(500).json({ error: 'Failed to approve calendar request' });

  }

});



app.post('/api/mobile/admin/calendar-requests/:id/reject', requireAdminSession, async (req, res) => {

  try {

    const interactionId = String(req.params.id || '').trim();

    if (!interactionId) {

      return res.status(400).json({ error: 'id demande requis' });

    }

    const [rows] = await pool.query(

      `SELECT id, metadata_json

       FROM client_interactions

       WHERE id = ?

       LIMIT 1`,

      [interactionId]

    );

    const row = rows?.[0];

    if (!row || !row.metadata_json) {

      return res.status(404).json({ error: 'Demande introuvable' });

    }



    let metadata = null;

    try {

      metadata = JSON.parse(String(row.metadata_json));

    } catch {

      metadata = null;

    }

    if (!metadata || metadata.kind !== 'calendar_update_request') {

      return res.status(400).json({ error: 'Interaction non compatible rejection calendrier' });

    }



    const ownerId = String(metadata.ownerId || '').trim();

    const startDate = String(metadata.startDate || '').trim();

    const endDate = String(metadata.endDate || '').trim();

    const requestType = String(metadata.requestType || 'close').trim().toLowerCase() === 'open' ? 'open' : 'close';

    const rejectReason = String(req.body?.reason || '').trim() || null;



    await ensureOwnerMobileNotificationsSchema();

    const ownerNotifId = `omn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(

      `INSERT INTO owner_mobile_notifications

       (id, owner_id, type, message, lu, metadata_json, created_at)

       VALUES (?, ?, ?, ?, 0, ?, ?)`,

      [

        ownerNotifId,

        ownerId,

        'warning',

        requestType === 'close'

          ? `Demande de fermeture rejetee (${startDate} -> ${endDate})`

          : `Demande de reouverture rejetee (${startDate} -> ${endDate})`,

        JSON.stringify({

          kind: 'calendar_update_rejected',

          ownerId,

          startDate,

          endDate,

          requestType,

          interactionId,

          reason: rejectReason,

        }),

        getAgencySqlDateTime(),

      ]

    );

    const nextMetadata = {

      ...metadata,

      status: 'rejected',

      requestType,

      reviewedAt: getAgencySqlDateTime(),

      reviewedBy: req.authUser?.id || 'admin',

      decision: 'rejected',

      reason: rejectReason,

    };

    await pool.query(

      'UPDATE client_interactions SET metadata_json = ? WHERE id = ?',

      [JSON.stringify(nextMetadata), interactionId]

    );

    await pool.query(

      `DELETE FROM client_interactions

       WHERE id <> ?

         AND metadata_json IS NOT NULL

         AND JSON_VALID(metadata_json) = 1

         AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.kind')) = 'calendar_update_request'

         AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.status')), 'pending')) = 'pending'

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.ownerId')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.bienId')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.startDate')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.endDate')), '') = ?

         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.requestType')), 'close') = ?`,

      [interactionId, ownerId, String(metadata.bienId || '').trim(), startDate, endDate, requestType]

    );



    await createAdminNotification('warning', `Calendrier rejete pour proprietaire ${ownerId}`);

    res.json({ ok: true, interactionId });

  } catch (error) {

    console.error('Error rejecting mobile calendar request:', error);

    res.status(500).json({ error: 'Failed to reject calendar request' });

  }

});



// ============================================

// MEDIA API

// ============================================



app.get('/api/media-bulk', async (req, res) => {

  try {

    const bienIds = String(req.query.bien_ids || '')

      .split(',')

      .map((value) => String(value || '').trim())

      .filter(Boolean);



    if (bienIds.length === 0) {

      return res.json([]);

    }



    const placeholders = bienIds.map(() => '?').join(',');

    const [rows] = await pool.query(

      `SELECT * FROM media WHERE bien_id IN (${placeholders}) ORDER BY bien_id ASC, position ASC, id ASC`,

      bienIds

    );

    res.json(rows);

  } catch (error) {

    console.error('Error fetching bulk media:', error);

    res.status(500).json({ error: 'Failed to fetch bulk media' });

  }

});



app.put('/api/zones/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureZonesSchema();

    const zoneId = String(req.params.id || '').trim();

    if (!zoneId) return res.status(400).json({ error: 'Zone id requis' });



    const {

      nom,

      description,

      pays,

      gouvernerat,

      region,

      quartier,

      google_maps_url,

      image_url,

      pays_image_url,

      gouvernerat_image_url,

      region_image_url,

      quartier_image_url,

    } = req.body || {};



    const normalizeMapsInput = (raw) => {

      const value = String(raw || '').trim();

      if (!value) return null;

      const match = value.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i);

      const extracted = match?.[1] || value;

      return String(extracted || '').replace(/&amp;/g, '&').trim() || null;

    };



    const fields = [];

    const values = [];

    if (nom !== undefined) { fields.push('nom = ?'); values.push(String(nom || '').trim() || null); }

    if (description !== undefined) { fields.push('description = ?'); values.push(String(description || '').trim() || ''); }

    if (pays !== undefined) { fields.push('pays = ?'); values.push(String(pays || '').trim() || null); }

    if (gouvernerat !== undefined) { fields.push('gouvernerat = ?'); values.push(String(gouvernerat || '').trim() || null); }

    if (region !== undefined) { fields.push('region = ?'); values.push(String(region || '').trim() || null); }

    if (quartier !== undefined) { fields.push('quartier = ?'); values.push(String(quartier || '').trim() || null); }

    if (google_maps_url !== undefined) { fields.push('google_maps_url = ?'); values.push(normalizeMapsInput(google_maps_url)); }

    if (image_url !== undefined) { fields.push('image_url = ?'); values.push(String(image_url || '').trim() || null); }

    if (pays_image_url !== undefined) { fields.push('pays_image_url = ?'); values.push(String(pays_image_url || '').trim() || null); }

    if (gouvernerat_image_url !== undefined) { fields.push('gouvernerat_image_url = ?'); values.push(String(gouvernerat_image_url || '').trim() || null); }

    if (region_image_url !== undefined) { fields.push('region_image_url = ?'); values.push(String(region_image_url || '').trim() || null); }

    if (quartier_image_url !== undefined) { fields.push('quartier_image_url = ?'); values.push(String(quartier_image_url || '').trim() || null); }



    if (fields.length === 0) return res.status(400).json({ error: 'Aucune modification' });



    values.push(zoneId);

    await pool.query(`UPDATE zones SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.query('SELECT * FROM zones WHERE id = ? LIMIT 1', [zoneId]);

    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (!row) return res.status(404).json({ error: 'Zone not found' });

    res.json(row);

  } catch (error) {

    console.error('Error updating zone:', error);

    res.status(500).json({ error: 'Failed to update zone' });

  }

});



app.get('/api/media/:bien_id', async (req, res) => {

  try {

    const [rows] = await pool.query('SELECT * FROM media WHERE bien_id = ? ORDER BY position ASC, id ASC', [req.params.bien_id]);

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch media' });

  }

});



app.delete('/api/contrats/:id', requireAdminSession, async (req, res) => {

  try {

    await pool.query('DELETE FROM contrats WHERE id = ?', [req.params.id]);

    res.json({ message: 'Contrat deleted successfully' });

  } catch (error) {

    console.error('Error deleting contrat:', error);

    res.status(500).json({ error: 'Failed to delete contrat' });

  }

});



app.put('/api/contrats/:id', requireAdminSession, async (req, res) => {

  try {

    const { bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, owner_url_pdf, statut } = req.body;

    if (locataire_id) {

      const locataireProfile = await fetchClienteleProfileBySource('locataires', locataire_id);

      if (locataireProfile && (locataireProfile.globalStatus === 'blackliste' || locataireProfile.locataireStatus === 'blackliste')) {

        return res.status(400).json({ error: 'Mise a jour impossible: ce locataire est blackliste' });

      }

    }

    if (statut === 'termine') {

      const [pendingPayments] = await pool.query(

        `SELECT COUNT(*) AS total

         FROM paiements

         WHERE contrat_id = ? AND statut IN ('en_attente', 'retard')`,

        [req.params.id]

      );

      if (Number(pendingPayments?.[0]?.total || 0) > 0) {

        return res.status(400).json({ error: 'Cloture impossible: des loyers ou penalites restent impayes' });

      }

    }

    const fields = [];

    const values = [];



    if (bien_id !== undefined) { fields.push('bien_id = ?'); values.push(bien_id); }

    if (locataire_id !== undefined) { fields.push('locataire_id = ?'); values.push(locataire_id); }

    if (date_debut !== undefined) { fields.push('date_debut = ?'); values.push(date_debut); }

    if (date_fin !== undefined) { fields.push('date_fin = ?'); values.push(date_fin); }

    if (montant_recu !== undefined) { fields.push('montant_recu = ?'); values.push(montant_recu); }

    if (url_pdf !== undefined) { fields.push('url_pdf = ?'); values.push(url_pdf); }

    if (owner_url_pdf !== undefined) { fields.push('owner_url_pdf = ?'); values.push(owner_url_pdf); }

    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }



    if (fields.length === 0) {

      return res.status(400).json({ error: 'No fields to update' });

    }



    values.push(req.params.id);

    await pool.query(`UPDATE contrats SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM contrats WHERE id = ?', [req.params.id]);

    if (!updated.length) return res.status(404).json({ error: 'Contrat not found' });

    res.json(updated[0]);

  } catch (error) {

    console.error('Error updating contrat:', error);

    res.status(500).json({ error: 'Failed to update contrat' });

  }

});



const contractStorage = multer.diskStorage({

  destination: (req, file, cb) => {

    const contractsDir = path.join(__dirname, 'contracts');

    if (!fs.existsSync(contractsDir)) {

      fs.mkdirSync(contractsDir, { recursive: true });

    }

    cb(null, contractsDir);

  },

  filename: (req, file, cb) => {

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

    cb(null, 'contract-' + uniqueSuffix + '.pdf');

  }

});



const contractUpload = multer({

  storage: contractStorage,

  limits: { fileSize: 15 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {

    const isPdfMime = file.mimetype === 'application/pdf';

    const isPdfExt = path.extname(file.originalname).toLowerCase() === '.pdf';

    if (isPdfMime || isPdfExt) return cb(null, true);

    cb(new Error('Only PDF files are allowed'));

  }

});



const reservationIdentityStorage = multer.diskStorage({

  destination: (req, file, cb) => {

    const identityDir = path.join(__dirname, 'uploads', 'reservation-identities');

    if (!fs.existsSync(identityDir)) {

      fs.mkdirSync(identityDir, { recursive: true });

    }

    cb(null, identityDir);

  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    cb(null, `identity-${uniqueSuffix}${ext}`);

  },

});



const reservationIdentityUpload = multer({

  storage: reservationIdentityStorage,

  limits: { fileSize: 12 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {

    const allowedExt = /\.(jpg|jpeg|png|webp)$/i.test(path.extname(file.originalname || '').toLowerCase());

    const mime = String(file.mimetype || '').toLowerCase();

    const allowedMime = mime.startsWith('image/');

    if (allowedExt && allowedMime) return cb(null, true);

    cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed'));

  },

});



const paymentReceiptStorage = multer.diskStorage({

  destination: (req, file, cb) => {

    const receiptDir = path.join(__dirname, 'uploads', 'reservation-payment-receipts');

    if (!fs.existsSync(receiptDir)) {

      fs.mkdirSync(receiptDir, { recursive: true });

    }

    cb(null, receiptDir);

  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    cb(null, `payment-receipt-${uniqueSuffix}${ext}`);

  },

});



const paymentReceiptUpload = multer({

  storage: paymentReceiptStorage,

  limits: { fileSize: 12 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {

    const allowedExt = /\.(jpg|jpeg|png|webp)$/i.test(path.extname(file.originalname || '').toLowerCase());

    const mime = String(file.mimetype || '').toLowerCase();

    const allowedMime = mime.startsWith('image/');

    if (allowedExt && allowedMime) return cb(null, true);

    cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed'));

  },

});



// ============================================

// CARACTERISTIQUES API

// ============================================



app.get('/api/workflow/biens-options', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query(

      `SELECT cc.mode_bien, cc.type_bien, c.id, c.nom

       FROM caracteristique_contextes cc

       INNER JOIN caracteristiques c ON c.id = cc.caracteristique_id

       ORDER BY cc.mode_bien ASC, cc.type_bien ASC, c.nom ASC`

    );



    const featuresByModeAndType = {};

    for (const row of rows) {

      if (!featuresByModeAndType[row.mode_bien]) featuresByModeAndType[row.mode_bien] = {};

      if (!featuresByModeAndType[row.mode_bien][row.type_bien]) featuresByModeAndType[row.mode_bien][row.type_bien] = [];

      featuresByModeAndType[row.mode_bien][row.type_bien].push({ id: row.id, nom: row.nom });

    }



    res.json({

      modes: BIEN_MODES.map((mode) => ({

        value: mode,

        types: BIEN_TYPES_BY_MODE[mode] || [],

      })),

      featuresByModeAndType,

    });

  } catch (error) {

    console.error('Error fetching bien workflow options:', error);

    res.status(500).json({ error: 'Failed to fetch bien workflow options' });

  }

});



app.get('/api/caracteristique-onglets', async (req, res) => {

  try {

    const mode = normalizeBienMode(req.query.mode_bien || req.query.mode);

    const type = normalizeBienType(req.query.type_bien || req.query.type);

    const validation = validateModeAndType(mode, type);

    if (!validation.valid) {

      return res.status(400).json({ error: validation.error });

    }

    const [rows] = await pool.query(

      `SELECT id, mode_bien, type_bien, nom, ordre, is_system

       FROM caracteristique_onglets

       WHERE mode_bien = ? AND type_bien = ?

       ORDER BY ordre ASC, nom ASC`,

      [mode, type]

    );

    res.json(rows);

  } catch (error) {

    console.error('Error fetching caracteristique onglets:', error);

    res.status(500).json({ error: 'Failed to fetch caracteristique onglets' });

  }

});



app.get('/api/reservation-demands', requireAuthenticatedSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    await cleanupNamelessAmicalesAndTheirDemands();

    const requester = req.authUser || null;

    const where = [];

    const params = [];



    if (requester?.role === 'admin') {

      if (req.query.client_user_id) {

        where.push('d.client_user_id = ?');

        params.push(String(req.query.client_user_id));

      }

      if (req.query.client_email) {

        where.push('d.client_email = ?');

        params.push(String(req.query.client_email).trim().toLowerCase());

      }

      if (req.query.proprietaire_id) {

        where.push('d.proprietaire_id = ?');

        params.push(String(req.query.proprietaire_id));

      }

    } else {

      where.push('(d.client_user_id = ? OR (d.client_email IS NOT NULL AND LOWER(TRIM(d.client_email)) = ?))');

      params.push(String(requester?.id || '').trim(), normalizeEmailForCompare(requester?.email));

    }



    const [rows] = await pool.query(`

      SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        b.mode AS bien_mode,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

        DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at,

        DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      ${where.length > 0 ? `WHERE ${where.join(' OR ')}` : ''}

      ORDER BY d.created_at DESC

    `, params);

    res.json((rows || []).map((row) => formatReservationDemandRow(row)));

  } catch (error) {

    console.error('Error fetching reservation demands:', error);

    res.status(500).json({ error: 'Impossible de charger les demandes de reservation' });

  }

});



app.delete('/api/reservation-demands/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    if (!demandId) return res.status(400).json({ error: 'Demande introuvable' });



    const [rows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = rows?.[0] || null;

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });



    const connection = await pool.getConnection();

    try {

      await connection.beginTransaction();

      await deleteReservationDemandArtifacts(connection, current);

      await connection.commit();

    } catch (error) {

      await connection.rollback();

      throw error;

    } finally {

      connection.release();

    }



    await createAdminNotification('warning', `Demande ${demandId} supprimee de la base par admin.`, getAgencySqlDateTime());

    res.json({ success: true });

  } catch (error) {

    console.error('Error deleting reservation demand:', error);

    res.status(500).json({ error: 'Impossible de supprimer la demande' });

  }

});



app.get('/api/reservation-demands/:id/history', requireAuthenticatedSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    const [demandRows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const demand = demandRows[0];

    if (!demand) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, demand)) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_demand_access_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Reservation demand history access denied',

        metadata: { demandId, context: 'history' },

      });

      return res.status(403).json({ error: 'Acces refuse a cette demande' });

    }

    const [rows] = await pool.query(

      `SELECT

         id,

         demand_id,

         status,

         actor_type,

         actor_id,

         note,

         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at

       FROM reservation_demand_history

       WHERE demand_id = ?

       ORDER BY created_at ASC`,

      [demandId]

    );

    res.json(rows || []);

  } catch (error) {

    console.error('Error fetching reservation demand history:', error);

    res.status(500).json({ error: 'Impossible de charger l historique de la demande' });

  }

});



app.post('/api/reservation-demands', reservationMutationRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    await ensureSeasonalPricingSchema();

    const requester = getSessionUserFromRequest(req);

    if (requester) {

      req.authUser = requester;

    }

    const {

      bien_id,

      client_user_id,

      client_email,

      client_name,

      start_date,

      end_date,

      guests,

      adult_guests,

      child_guests,

      payment_mode,

      total_amount,

      amount_due_now,

      selected_fixed_services,

      selected_variable_services,

      client_note,

      request_type,

      pricing_amicale_id,

      amicale_name,

      amicale_matricule,

      amicale_phone,

      amicale_code,

      turnstileToken,

      sessionId,

    } = req.body || {};



    const normalizedPaymentMode = normalizePaymentMode(payment_mode, 'avance');

    const normalizedPricingAmicaleId = String(pricing_amicale_id || req.body?.pricingAmicaleId || req.body?.amicale_id || req.body?.amicaleSelectionId || '').trim() || null;

    const normalizedAmicaleName = String(amicale_name || req.body?.amicaleName || client_name || '').trim() || null;

    const normalizedAmicaleMatricule = String(amicale_matricule || req.body?.amicaleMatricule || '').trim() || null;

    const normalizedAmicalePhone = normalizePhoneNumber(amicale_phone || req.body?.amicalePhone || '');

    const normalizedAmicaleCode = String(amicale_code || req.body?.amicaleCode || '').trim() || null;

    const isAmicaleFlow = normalizedPaymentMode === 'amicale';



    if (!requester && !isAmicaleFlow) {

      return res.status(401).json({ error: 'Authentification requise' });

    }

    if (isAmicaleFlow && !normalizedPricingAmicaleId) {

      return res.status(400).json({ error: 'Amicale cible requise' });

    }



    const resolvedClientUserId = requester?.role === 'admin'

      ? (client_user_id || null)

      : (requester ? (String(requester.id || '').trim() || null) : null);

    let resolvedClientEmail = requester?.role === 'admin'

      ? (client_email || null)

      : (requester ? normalizeEmailForCompare(requester.email) : null);

    let resolvedClientName = requester?.role === 'admin'

      ? (client_name || null)

      : (requester ? (String(requester.name || '').trim() || null) : normalizedAmicaleName);

    let resolvedClientTelephone = requester?.role === 'admin'

      ? normalizePhoneNumber(req.body?.client_telephone || '')

      : (requester ? normalizePhoneNumber(requester.telephone || '') : normalizedAmicalePhone);

    let resolvedClientCin = requester?.role === 'admin'

      ? String(req.body?.client_cin || '').trim()

      : (requester ? String(requester.cin || '').trim() : null);



    if (resolvedClientUserId) {

      const [clientUserRows] = await pool.query(

        'SELECT nom, email, telephone, cin FROM utilisateurs WHERE id = ? LIMIT 1',

        [resolvedClientUserId]

      );

      const clientUser = clientUserRows?.[0];

      if (clientUser) {

        if (!resolvedClientName) resolvedClientName = String(clientUser.nom || '').trim() || resolvedClientName;

        if (!resolvedClientEmail) resolvedClientEmail = normalizeEmailForCompare(clientUser.email || resolvedClientEmail);

        resolvedClientTelephone = normalizePhoneNumber(clientUser.telephone || resolvedClientTelephone);

        resolvedClientCin = String(clientUser.cin || resolvedClientCin || '').trim();

      }

    }



    const antiBotCheck = await verifyTurnstileToken(turnstileToken, getClientIp(req));

    if (antiBotCheck.enabled && !antiBotCheck.success) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_antibot_failed',

        severity: 'warning',

        success: false,

        statusCode: 403,

        userId: resolvedClientUserId,

        userEmail: resolvedClientEmail,

        message: 'Reservation denied by anti-bot verification',

        metadata: { reason: antiBotCheck.reason || null },

      });

      return res.status(403).json({ error: 'Verification anti-bot invalide. Veuillez reessayer.' });

    }



    if (!bien_id || !start_date || !end_date) {

      return res.status(400).json({ error: 'Bien, date de debut et date de fin requis' });

    }

    if (String(end_date) < String(start_date)) {

      return res.status(400).json({ error: 'La date de fin doit etre apres la date de debut' });

    }



    const [bienRows] = await pool.query(

      'SELECT id, titre, reference, mode, proprietaire_id, location_saisonniere_config_json FROM biens WHERE id = ? LIMIT 1',

      [bien_id]

    );

    const bien = bienRows[0];

    if (!bien) return res.status(404).json({ error: 'Bien introuvable' });

    let amicaleRow = null;

    if (isAmicaleFlow) {

      if (!normalizedAmicaleName) {

        return res.status(400).json({ error: 'Nom et prenom obligatoires pour une reservation amicale' });

      }

      if (!normalizedAmicaleMatricule) {

        return res.status(400).json({ error: 'Matricule obligatoire pour une reservation amicale' });

      }

      if (!normalizedAmicalePhone) {

        return res.status(400).json({ error: 'Numero de telephone obligatoire pour une reservation amicale' });

      }

      if (!normalizedAmicaleCode) {

        return res.status(400).json({ error: 'Code amicale obligatoire' });

      }

      const [amicaleRows] = await pool.query(

        'SELECT id, name, code, logo_url FROM amicales WHERE id = ? LIMIT 1',

        [normalizedPricingAmicaleId]

      );

      amicaleRow = amicaleRows?.[0] || null;

      if (!amicaleRow) {

        return res.status(400).json({ error: 'Amicale selectionnee introuvable' });

      }

      if (String(amicaleRow.code || '').trim() !== normalizedAmicaleCode) {

        return res.status(400).json({ error: 'Code amicale incorrect' });

      }

      if (!String(amicaleRow.name || '').trim()) {

        return res.status(400).json({ error: 'Amicale invalide' });

      }

    }

    await appendClientInteraction({

      req,

      clientUserId: resolvedClientUserId,

      clientEmail: resolvedClientEmail,

      clientName: resolvedClientName,

      type: 'reservation_attempt',

      bienId: bien.id,

      propertyTitle: bien.titre,

      sessionId,

      routePath: req.originalUrl || req.url || null,

      metadata: {

        requestType: request_type === 'visite' ? 'visite' : 'reservation',

        startDate: start_date,

        endDate: end_date,

      },

    }).catch(() => {});

    const requestType = bien.mode === 'vente' ? 'visite' : (request_type === 'visite' ? 'visite' : 'reservation');

    const normalizedTotalAmount = Number.isFinite(Number(total_amount)) ? Number(total_amount) : null;

    const normalizedAmountDueNow = Number.isFinite(Number(amount_due_now)) ? Number(amount_due_now) : null;

    const normalizedFixedServices = Array.isArray(selected_fixed_services) ? selected_fixed_services : [];

    const normalizedVariableServices = Array.isArray(selected_variable_services) ? selected_variable_services : [];

    const variableServicesQuoteStatus = normalizedVariableServices.length > 0 ? 'a_traiter' : 'aucun';



    const [overlapRows] = await pool.query(

      `SELECT id, status

       FROM unavailable_dates

       WHERE bien_id = ?

         AND start_date < ?

         AND end_date > ?

         AND status IN ('blocked', 'booked', 'pending')

       LIMIT 1`,

      [bien_id, end_date, start_date]

    );

    if (overlapRows[0]) {

      return res.status(400).json({ error: 'Bien deja indisponible ou deja en attente sur cette periode' });

    }



    const saisonCfg = safeParseJson(bien.location_saisonniere_config_json, {});

    const requestedNights = computeNights(start_date, end_date);

    const cfgMinStayRaw = Number(

      saisonCfg?.duree_min_sejour_nuits

      ?? saisonCfg?.dureeMinSejourNuits

    );

    const cfgMinStay = Number.isFinite(cfgMinStayRaw) && cfgMinStayRaw > 0

      ? Math.max(1, Math.floor(cfgMinStayRaw))

      : 1;

    const normalizeReservationPeriod = (row) => ({

      start: toSqlDateOnly(row?.start_date),

      end: toSqlDateOnly(row?.end_date),

      minimum_nuitees: row?.minimum_nuitees === null || row?.minimum_nuitees === undefined

        ? null

        : Math.max(1, Math.floor(Number(row.minimum_nuitees || 0))),

      checkin_jour: row?.checkin_jour ? String(row.checkin_jour).trim().toLowerCase() : null,

      checkout_jour: row?.checkout_jour ? String(row.checkout_jour).trim().toLowerCase() : null,

      scope: String(row?.scope || '').trim().toLowerCase() || (row?.amicale_id ? 'amicale' : 'global'),

      amicale_id: row?.amicale_id ? String(row.amicale_id).trim() : null,

    });

    const getReservationPeriodScopeRank = (period, targetAmicaleId) => {

      const target = String(targetAmicaleId || '').trim();

      const scope = String(period?.scope || '').trim().toLowerCase() || (String(period?.amicale_id || '').trim() ? 'amicale' : 'global');

      const periodAmicaleId = String(period?.amicale_id || '').trim();

      if (!target) {

        return scope === 'global' ? 1 : 0;

      }

      if (scope === 'amicale' && periodAmicaleId === target) return 3;

      if (scope === 'amicales') return 2;

      if (scope === 'global') return 1;

      return 0;

    };

    const findReservationPeriodForDate = (periods, date, targetAmicaleId) => {

      const target = toSqlDateOnly(date);

      const candidates = (Array.isArray(periods) ? periods : [])

        .filter((period) => {

          const start = String(period?.start || '').slice(0, 10);

          const end = String(period?.end || '').slice(0, 10);

          return start && end && start <= target && target <= end && getReservationPeriodScopeRank(period, targetAmicaleId) > 0;

        })

        .sort((a, b) => {

          const scopeDiff = getReservationPeriodScopeRank(b, targetAmicaleId) - getReservationPeriodScopeRank(a, targetAmicaleId);

          if (scopeDiff !== 0) return scopeDiff;

          const startDiff = String(b.start || '').localeCompare(String(a.start || ''));

          if (startDiff !== 0) return startDiff;

          return String(b.end || '').localeCompare(String(a.end || ''));

        });

      return candidates[0] || null;

    };

    const addSqlDays = (date, days) => {

      const base = toSqlDateOnly(date);

      if (!base) return null;

      const next = new Date(`${base}T00:00:00`);

      if (Number.isNaN(next.getTime())) return null;

      next.setDate(next.getDate() + days);

      return toSqlDateOnly(next);

    };

    const [periodRules] = await pool.query(

      `SELECT minimum_nuitees, checkin_jour, checkout_jour,

              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,

              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,

              scope, amicale_id

       FROM bien_pricing_periods

       WHERE bien_id = ?

         AND start_date <= ?

         AND end_date >= ?`,

      [bien_id, end_date, start_date]

    );

    const normalizedPeriodRules = (periodRules || []).map(normalizeReservationPeriod);

    let requiredMinNights = cfgMinStay;

    for (let offset = 0; offset < requestedNights; offset += 1) {

      const day = addSqlDays(start_date, offset);

      if (!day) continue;

      const period = findReservationPeriodForDate(normalizedPeriodRules, day, normalizedPricingAmicaleId);

      const value = Number(period?.minimum_nuitees || 0);

      if (Number.isFinite(value) && value > requiredMinNights) {

        requiredMinNights = Math.max(1, Math.floor(value));

      }

    }

    if (requestType === 'reservation' && requestedNights < requiredMinNights) {

      return res.status(400).json({ error: `Sejour minimum pour cette periode: ${requiredMinNights} nuit(s)` });

    }

    const startWeekday = getWeekdayFrFromSqlDate(start_date);

    const endWeekday = getWeekdayFrFromSqlDate(end_date);

    const arrivalPeriod = findReservationPeriodForDate(normalizedPeriodRules, start_date, normalizedPricingAmicaleId);

    const departurePeriod = findReservationPeriodForDate(normalizedPeriodRules, addSqlDays(end_date, -1), normalizedPricingAmicaleId);

    const checkinDay = String(arrivalPeriod?.checkin_jour || '').trim().toLowerCase();

    const checkoutDay = String(departurePeriod?.checkout_jour || '').trim().toLowerCase();

    if (requestType === 'reservation' && checkinDay && startWeekday && checkinDay !== startWeekday) {

      return res.status(400).json({ error: `Check-in autorise uniquement le ${checkinDay} pour cette periode` });

    }

    if (requestType === 'reservation' && checkoutDay && endWeekday && checkoutDay !== endWeekday) {

      return res.status(400).json({ error: `Check-out autorise uniquement le ${checkoutDay} pour cette periode` });

    }



    const now = getAgencySqlDateTime();

    const demandId = `rd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const unavailableDateId = `ud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const paymentDeadline = getAgencySqlDateTime(new Date(Date.now() + (48 * 60 * 60 * 1000)));

    const ownerUserId = bien.proprietaire_id

      ? (await fetchClienteleProfileBySource('proprietaires', bien.proprietaire_id))?.linkedUserId || null

      : null;



    const cfgMaxGuestsRaw = Number(

      saisonCfg?.limite_personnes_nuit

      ?? saisonCfg?.limitePersonnesNuit

      ?? saisonCfg?.limite_personne_nuit

    );

    const cfgMaxAdultsRaw = Number(saisonCfg?.max_adultes);

    const cfgMaxChildrenRaw = Number(saisonCfg?.max_enfants);

    const hasCfgMaxGuests = Number.isFinite(cfgMaxGuestsRaw) && cfgMaxGuestsRaw > 0;

    const hasCfgMaxAdults = Number.isFinite(cfgMaxAdultsRaw) && cfgMaxAdultsRaw > 0;

    const hasCfgMaxChildren = Number.isFinite(cfgMaxChildrenRaw) && cfgMaxChildrenRaw >= 0;

    const maxAdultsCap = hasCfgMaxAdults ? Math.floor(cfgMaxAdultsRaw) : null;

    const maxChildrenCap = hasCfgMaxChildren ? Math.floor(cfgMaxChildrenRaw) : null;

    const splitCapsTotal = (maxAdultsCap !== null && maxChildrenCap !== null)

      ? (maxAdultsCap + maxChildrenCap)

      : null;

    const maxGuestsCap = hasCfgMaxGuests

      ? Math.floor(cfgMaxGuestsRaw)

      : splitCapsTotal;



    const normalizedGuests = Math.max(1, Math.floor(Number(guests || 1)));

    const normalizedAdultGuests = Math.max(1, Math.floor(Number((adult_guests ?? guests) || 1)));

    const normalizedChildGuests = Math.max(0, Math.floor(Number(child_guests ?? 0)));

    const requestedTotalGuests = normalizedAdultGuests + normalizedChildGuests;

    if (normalizedGuests !== requestedTotalGuests) {

      return res.status(400).json({ error: 'Le total voyageurs doit etre egal a adultes + enfants' });

    }

    if (maxGuestsCap !== null && normalizedGuests > maxGuestsCap) {

      return res.status(400).json({ error: `Le nombre max de voyageurs est ${maxGuestsCap}` });

    }

    if (maxAdultsCap !== null && normalizedAdultGuests > maxAdultsCap) {

      return res.status(400).json({ error: `Le nombre max d adultes est ${maxAdultsCap}` });

    }

    if (maxChildrenCap !== null && normalizedChildGuests > maxChildrenCap) {

      return res.status(400).json({ error: `Le nombre max d enfants est ${maxChildrenCap}` });

    }

    const balancedAdultGuests = normalizedAdultGuests;

    const balancedChildGuests = normalizedChildGuests;

    const initialDemandStatus = isAmicaleFlow ? 'attente_validation_amicale' : 'en_attente_reponse_proprietaire';



    await pool.query(

      `INSERT INTO reservation_demands (

        id, bien_id, request_type, unavailable_date_id, client_user_id, client_email, client_name, proprietaire_id, owner_user_id,

        start_date, end_date, guests, adult_guests, child_guests, payment_mode, pricing_amicale_id, amicale_matricule, amicale_phone, amicale_code,

        total_amount, amount_due_now, selected_fixed_services_json, selected_variable_services_json, variable_services_quote_json, variable_services_quote_total, variable_services_quote_status, status,

        amicale_validation_at, agency_validation_at, voucher_id, voucher_number, voucher_url, voucher_generated_at, owner_notified_at, owner_response_at, admin_note, client_note,

        finalization_due_at, contract_id, payment_id, created_at, updated_at

      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,

      [

        demandId,

        bien_id,

        requestType,

        unavailableDateId,

        resolvedClientUserId,

        resolvedClientEmail,

        resolvedClientName,

        bien.proprietaire_id || null,

        ownerUserId,

        start_date,

        end_date,

        normalizedGuests,

        balancedAdultGuests,

        balancedChildGuests,

        normalizedPaymentMode,

        normalizedPricingAmicaleId,

        isAmicaleFlow ? normalizedAmicaleMatricule : null,

        isAmicaleFlow ? normalizedAmicalePhone : null,

        isAmicaleFlow ? normalizedAmicaleCode : null,

        normalizedTotalAmount,

        normalizedAmountDueNow,

        JSON.stringify(normalizedFixedServices),

        JSON.stringify(normalizedVariableServices),

        JSON.stringify([]),

        null,

        variableServicesQuoteStatus,

        initialDemandStatus,

        null,

        null,

        null,

        null,

        null,

        null,

        null,

        null,

        null,

        client_note || null,

        paymentDeadline,

        null,

        null,

        now,

        now,

      ]

    );



    await pool.query(

      `INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, reservation_demand_id, payment_deadline)

       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,

      [unavailableDateId, bien_id, start_date, end_date, demandId, paymentDeadline]

    );



    await appendReservationDemandHistory(
      demandId,
      initialDemandStatus,
      'client',
      resolvedClientUserId || resolvedClientEmail || normalizedAmicaleMatricule || null,
      isAmicaleFlow
        ? `Nouvelle demande amicale de ${requestType === 'visite' ? 'visite' : 'reservation'} pour ${bien.reference || bien.id} - ${bien.titre}`
        : `Nouvelle demande de ${requestType === 'visite' ? 'visite' : 'reservation'} pour ${bien.reference || bien.id} - ${bien.titre}`
    );

    if (!isAmicaleFlow) {
      await createAdminNotificationWithPush(
        'warning',
        `Nouvelle demande de ${requestType === 'visite' ? 'visite' : 'reservation'}: ${resolvedClientName || resolvedClientEmail || 'Client'} pour ${bien.reference || bien.id} du ${start_date} au ${end_date}`,
        {
          title: requestType === 'visite' ? 'Nouvelle visite' : 'Nouvelle reservation',
          kind: 'reservation_submitted',
          createdAt: now,
          data: {
            demandId,
            bienId: String(bien.id || '').trim(),
            ownerId: String(bien.proprietaire_id || '').trim(),
            requestType,
            startDate: start_date,
            endDate: end_date,
          },
        }
      );

      if (requestType === 'reservation' && String(bien.proprietaire_id || '').trim()) {
        await notifyOwnerAvailabilityRequestForDemand({

          demand: {

            id: demandId,

            proprietaire_id: bien.proprietaire_id,

            bien_id,

            bien_titre: bien.titre,

            bien_reference: bien.reference,

            start_date,

            end_date,

            guests: normalizedGuests,

            cover_media_url: '',

          },

          actorType: 'system',

          actorId: resolvedClientUserId || resolvedClientEmail || 'site_public',

          historyNote: 'Demande de disponibilite envoyee automatiquement au proprietaire apres reservation client',

          adminNotificationMessage: `Notification disponibilite envoyee automatiquement au proprietaire ${String(bien.proprietaire_id || '').trim()}`,

          createdAt: now,

        });
      }
    }


    if (requestType === 'reservation') {

      await upsertLocataireFromReservationProfile({

        userId: resolvedClientUserId,

        name: resolvedClientName,

        email: resolvedClientEmail,

        telephone: resolvedClientTelephone,

        cin: resolvedClientCin,

      }).catch((error) => {

        console.warn('Failed to upsert locataire from reservation profile:', error?.message || error);

      });

    }



    await appendClientInteraction({

      req,

      clientUserId: resolvedClientUserId,

      clientEmail: resolvedClientEmail,

      clientName: resolvedClientName,

      type: 'reservation_submitted',

      bienId: bien.id,

      propertyTitle: bien.titre,

      sessionId,

      routePath: req.originalUrl || req.url || null,

      metadata: {

        demandId,

        requestType,

      },

    }).catch(() => {});



    const [rows] = await pool.query(

      `SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        b.mode AS bien_mode,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      WHERE d.id = ? LIMIT 1`,

      [demandId]

    );

    res.status(201).json(formatReservationDemandRow(rows[0]));

  } catch (error) {

    console.error('Error creating reservation demand:', error);

    res.status(500).json({ error: 'Impossible de creer la demande de reservation' });

  }

});



app.post('/api/reservation-demands/:id/request-owner-availability', requireAdminSession, reservationMutationRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    if (!demandId) {

      return res.status(400).json({ error: 'Demande introuvable' });

    }

    const [rows] = await pool.query(

      `SELECT

         d.*,

         b.titre AS bien_titre,

         b.reference AS bien_reference,

         p.nom AS proprietaire_nom,

         (SELECT m.url FROM media m WHERE m.bien_id = d.bien_id ORDER BY COALESCE(m.position, 0) ASC, m.id ASC LIMIT 1) AS cover_media_url

       FROM reservation_demands d

       LEFT JOIN biens b ON b.id = d.bien_id

       LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

       WHERE d.id = ?

       LIMIT 1`,

      [demandId]

    );

    const current = rows?.[0];

    if (!current) {

      return res.status(404).json({ error: 'Demande introuvable' });

    }

    const ownerId = String(current.proprietaire_id || '').trim();

    if (!ownerId) {

      return res.status(400).json({ error: 'Aucun proprietaire lie a cette demande' });

    }



    const alreadyWaitingOwnerReply =

      String(current.status || '').trim() === 'en_attente_reponse_proprietaire' &&

      current.owner_notified_at &&

      !current.owner_response_at;

    if (alreadyWaitingOwnerReply) {

      const [unchangedRows] = await pool.query(

        `SELECT

           d.*,

           b.titre AS bien_titre,

           b.reference AS bien_reference,

           p.nom AS proprietaire_nom,

           DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

           DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

           DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

           (SELECT m.url FROM media m WHERE m.bien_id = d.bien_id ORDER BY COALESCE(m.position, 0) ASC, m.id ASC LIMIT 1) AS cover_media_url

         FROM reservation_demands d

         LEFT JOIN biens b ON b.id = d.bien_id

         LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

         WHERE d.id = ?

         LIMIT 1`,

        [demandId]

      );

      return res.json({

        ok: true,

        pushSkipped: true,

        reason: 'owner_response_pending',

        demand: formatReservationDemandForAdmin(unchangedRows?.[0] || current),

      });

    }



    const now = getAgencySqlDateTime();
    await notifyOwnerAvailabilityRequestForDemand({

      demand: current,

      actorType: 'admin',

      actorId: String(req.authUser?.id || 'admin').trim(),

      historyNote: current.owner_response_at

          ? 'Relance disponibilite envoyee au proprietaire (nouvelle reponse attendue)'

          : 'Demande de disponibilite envoyee au proprietaire',

      createdAt: now,

    });



    const [updatedRows] = await pool.query(

      `SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      WHERE d.id = ? LIMIT 1`,

      [demandId]

    );

    res.json(formatReservationDemandRow(updatedRows[0]));

  } catch (error) {

    console.error('Error requesting owner availability:', error);

    res.status(500).json({ error: 'Impossible d envoyer la demande de disponibilite' });

  }

});



app.put('/api/reservation-demands/:id', requireAuthenticatedSession, reservationMutationRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    const requester = req.authUser || null;

    const rawBody = req.body || {};

    const [rows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = rows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(requester, current)) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_demand_access_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Reservation demand access denied',

        metadata: { demandId, context: 'update_status' },

      });

      return res.status(403).json({ error: 'Acces refuse a cette demande' });

    }



    const body = requester?.role === 'admin'

      ? rawBody

      : {

          status: rawBody?.status ?? current.status,

          actor_type: 'client',

          actor_id: String(requester?.id || requester?.email || 'client').trim(),

          history_note: String(rawBody?.history_note || '').trim() || 'Client a confirme la poursuite vers la finalisation du contrat',

          client_note: rawBody?.client_note,

        };



    const nextStatus = normalizeReservationDemandStatus(body.status || current.status);

    if (nextStatus === 'client_procede_vers_paiement_en_cours' || String(current.status || '') === 'reponse_positive_attente_confirmation_client') {

      logMobileFlow('reservation_status_update_request', req, {

        demandId,

        fromStatus: String(current.status || ''),

        toStatus: nextStatus,

        actorType: body.actor_type || null,

      });

    }

    if (requester?.role !== 'admin') {

      const allowedCurrentStatuses = ['reponse_positive_attente_confirmation_client'];

      if (!allowedCurrentStatuses.includes(String(current.status || ''))) {

        void logSecurityEvent({

          req,

          eventType: 'reservation_demand_transition_denied',

          severity: 'warning',

          success: false,

          statusCode: 403,

          message: 'Client transition denied due to current status',

          metadata: { demandId, currentStatus: String(current.status || ''), requestedStatus: nextStatus },

        });

        return res.status(403).json({ error: 'Transition de statut non autorisee pour ce client' });

      }

      const allowedClientTargetStatuses = [String(current.status || ''), 'demande_annulee_client', 'client_procede_vers_paiement_en_cours'];

      if (!allowedClientTargetStatuses.includes(nextStatus)) {

        void logSecurityEvent({

          req,

          eventType: 'reservation_demand_transition_denied',

          severity: 'warning',

          success: false,

          statusCode: 403,

          message: 'Client transition denied due to forbidden target status',

          metadata: { demandId, requestedStatus: nextStatus },

        });

        return res.status(403).json({ error: 'La modification de statut demandee n est pas autorisee sur cette etape' });

      }

      if (nextStatus === 'client_procede_vers_paiement_en_cours' && !String(current.contract_id || '').trim()) {

        try {

          const autoContract = await ensureAutoContractForDemand(

            current,

            body.actor_id || requester?.id || requester?.email || 'client'

          );

          if (autoContract?.contractId) {

            current.contract_id = autoContract.contractId;

          }

        } catch (autoContractError) {

          // Non-blocking: clients must still be able to continue their payment flow.

          console.warn(

            'auto_contract_generation_failed_on_client_transition:',

            autoContractError?.message || autoContractError

          );

          logMobileFlow('reservation_auto_contract_non_blocking_error', req, {

            demandId,

            error: String(autoContractError?.message || autoContractError),

          });

        }

      }

    }

    const isAmicaleDemand = String(current.payment_mode || '').trim() === 'amicale'

      || Boolean(String(current.pricing_amicale_id || '').trim());

    if (requester?.role === 'admin' && isAmicaleDemand && ['voucher_en_cours', 'rejete_par_agence'].includes(nextStatus)) {

      const currentStatus = String(current.status || '');

      if (nextStatus === 'voucher_en_cours' && currentStatus !== 'attente_validation_par_agence') {

        return res.status(400).json({ error: 'La demande amicale doit etre en attente agence avant validation finale' });

      }

      if (nextStatus === 'rejete_par_agence' && !['attente_validation_par_agence', 'voucher_en_cours'].includes(currentStatus)) {

        return res.status(400).json({ error: 'La demande amicale ne peut pas etre rejetee sur ce statut' });

      }

      const detailedCurrent = await fetchReservationDemandDetailsById(demandId) || formatReservationDemandRow(current);

      const agencyValidationAt = getAgencySqlDateTime();

      if (nextStatus === 'voucher_en_cours') {

        const voucherNumber = String(detailedCurrent?.voucher_number || `VCH-${String(demandId).slice(-8).toUpperCase()}`).trim();

        const voucherUrl = await generateAmicaleVoucherHtml({

          demand: detailedCurrent || current,

          bien: {

            reference: detailedCurrent?.bien_reference || current.bien_id,

            titre: detailedCurrent?.bien_titre || current.bien_titre || current.bien_id,

          },

          amicale: {

            name: detailedCurrent?.amicale_name || detailedCurrent?.client_name || 'Amicale',

            logoUrl: detailedCurrent?.amicale_logo_url || null,

          },

          voucherNumber,

          generatedAt: agencyValidationAt,

        });

        const voucherId = String(detailedCurrent?.voucher_id || `vch_${demandId}`).trim();

        await pool.query(

          `UPDATE reservation_demands

           SET status = ?,

               agency_validation_at = ?,

               voucher_id = ?,

               voucher_number = ?,

               voucher_url = ?,

               voucher_generated_at = ?,

               updated_at = ?

           WHERE id = ?`,

          [nextStatus, agencyValidationAt, voucherId, voucherNumber, voucherUrl, agencyValidationAt, agencyValidationAt, demandId]

        );

        if (current.unavailable_date_id) {

          await pool.query(

            'UPDATE unavailable_dates SET status = ?, payment_deadline = ? WHERE id = ?',

            ['booked', current.finalization_due_at || agencyValidationAt, current.unavailable_date_id]

          );

        }

        await appendReservationDemandHistory(

          demandId,

          nextStatus,

          'admin',

          body.actor_id || 'admin',

          body.history_note || `Agence valide la demande amicale et genere le voucher ${voucherNumber}`,

          agencyValidationAt

        );

        const [updatedRows] = await pool.query(

          `SELECT

            d.*,

            b.titre AS bien_titre,

            b.reference AS bien_reference,

            p.nom AS proprietaire_nom,

            DATE_FORMAT(d.amicale_validation_at, '%Y-%m-%d %H:%i:%s') AS amicale_validation_at,

            DATE_FORMAT(d.agency_validation_at, '%Y-%m-%d %H:%i:%s') AS agency_validation_at,

            DATE_FORMAT(d.voucher_generated_at, '%Y-%m-%d %H:%i:%s') AS voucher_generated_at,

            DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

            DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

            DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

            DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

            DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

            DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

            DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

            DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at,

            DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at,

            DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

            DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

          FROM reservation_demands d

          LEFT JOIN biens b ON b.id = d.bien_id

          LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

          WHERE d.id = ? LIMIT 1`,

          [demandId]

        );

        return res.json(formatReservationDemandRow(updatedRows?.[0] || null));

      }

      await pool.query(

        `UPDATE reservation_demands

         SET status = ?,

             agency_validation_at = ?,

             voucher_id = NULL,

             voucher_number = NULL,

             voucher_url = NULL,

             voucher_generated_at = NULL,

             updated_at = ?

         WHERE id = ?`,

        [nextStatus, agencyValidationAt, agencyValidationAt, demandId]

      );

      try {

        const existingVoucherUrl = String(detailedCurrent?.voucher_url || current.voucher_url || '').trim();

        if (existingVoucherUrl) {

          const voucherFileName = path.basename(existingVoucherUrl);

          const vouchersDir = path.join(__dirname, 'contracts', 'amicale-vouchers');

          const voucherFilePath = path.join(vouchersDir, voucherFileName);

          if (voucherFileName && fs.existsSync(voucherFilePath)) {

            await fs.promises.unlink(voucherFilePath);

          }

        }

      } catch (unlinkError) {

        console.warn('Failed to delete amicale voucher file:', unlinkError?.message || unlinkError);

      }

      if (current.unavailable_date_id) {

        await pool.query(

          `DELETE FROM unavailable_dates

           WHERE id = ?

             AND reservation_demand_id = ?`,

          [current.unavailable_date_id, demandId]

        );

        await pool.query(

          'UPDATE reservation_demands SET unavailable_date_id = NULL, updated_at = ? WHERE id = ?',

          [agencyValidationAt, demandId]

        );

      }

      await appendReservationDemandHistory(

        demandId,

        nextStatus,

        'admin',

        body.actor_id || 'admin',

        body.history_note || 'Demande amicale rejetee par l agence',

        agencyValidationAt

      );

      const [updatedRows] = await pool.query(

        `SELECT

          d.*,

          b.titre AS bien_titre,

          b.reference AS bien_reference,

          p.nom AS proprietaire_nom,

          DATE_FORMAT(d.amicale_validation_at, '%Y-%m-%d %H:%i:%s') AS amicale_validation_at,

          DATE_FORMAT(d.agency_validation_at, '%Y-%m-%d %H:%i:%s') AS agency_validation_at,

          DATE_FORMAT(d.voucher_generated_at, '%Y-%m-%d %H:%i:%s') AS voucher_generated_at,

          DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

          DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

          DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

          DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

          DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

          DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

          DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

          DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at,

          DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at,

          DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

          DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

        FROM reservation_demands d

        LEFT JOIN biens b ON b.id = d.bien_id

        LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

        WHERE d.id = ? LIMIT 1`,

        [demandId]

      );

      return res.json(formatReservationDemandRow(updatedRows?.[0] || null));

    }

    const ownerNotifiedAt = body.communicateToOwner

      ? getAgencySqlDateTime()

      : (body.owner_notified_at !== undefined ? body.owner_notified_at : current.owner_notified_at);

    const ownerResponseAt = body.owner_response_at !== undefined

      ? body.owner_response_at

      : (nextStatus !== current.status && (

          nextStatus === 'pas_de_reponse_proprietaire' ||

          nextStatus === 'reponse_positive_attente_confirmation_client' ||

          nextStatus === 'reponse_negative_autre_proposition_meme_bien' ||

          nextStatus === 'reponse_negative_autre_proposition_bien_similaire'

        ) ? getAgencySqlDateTime() : current.owner_response_at);

    const updatedAt = getAgencySqlDateTime();

    const clientConfirmationClickedAt = body.client_confirmation_clicked_at !== undefined

      ? body.client_confirmation_clicked_at

      : (

          current.client_confirmation_clicked_at ||

          (body.actor_type === 'client' && nextStatus === 'client_procede_vers_paiement_en_cours'

            ? getAgencySqlDateTime()

            : null)

        );

    const adminNote = body.admin_note !== undefined ? body.admin_note : current.admin_note;

    const clientNote = body.client_note !== undefined ? body.client_note : current.client_note;

    const notifyClientOnRejection = requester?.role === 'admin' && body?.notifyClientOnRejection === true;

    const paymentMode = body.payment_mode !== undefined

      ? normalizePaymentMode(body.payment_mode, current.payment_mode || 'avance')

      : normalizePaymentMode(current.payment_mode, 'avance');

    const totalAmount = body.total_amount !== undefined

      ? (Number.isFinite(Number(body.total_amount)) ? Number(body.total_amount) : null)

      : (current.total_amount === null || current.total_amount === undefined ? null : Number(current.total_amount));

    const amountDueNow = body.amount_due_now !== undefined

      ? (Number.isFinite(Number(body.amount_due_now)) ? Number(body.amount_due_now) : null)

      : (current.amount_due_now === null || current.amount_due_now === undefined ? null : Number(current.amount_due_now));

    const selectedFixedServices = body.selected_fixed_services !== undefined

      ? (Array.isArray(body.selected_fixed_services) ? body.selected_fixed_services : [])

      : parseJsonArray(current.selected_fixed_services_json);

    const selectedVariableServices = body.selected_variable_services !== undefined

      ? (Array.isArray(body.selected_variable_services) ? body.selected_variable_services : [])

      : parseJsonArray(current.selected_variable_services_json);

    const variableServicesQuote = body.variable_services_quote !== undefined

      ? (Array.isArray(body.variable_services_quote) ? body.variable_services_quote : [])

      : parseJsonArray(current.variable_services_quote_json);

    const variableServicesQuoteTotal = body.variable_services_quote_total !== undefined

      ? (Number.isFinite(Number(body.variable_services_quote_total)) ? Number(body.variable_services_quote_total) : null)

      : (current.variable_services_quote_total === null || current.variable_services_quote_total === undefined ? null : Number(current.variable_services_quote_total));

    const variableServicesQuoteStatus = body.variable_services_quote_status !== undefined

      ? String(body.variable_services_quote_status || '').trim() || null

      : (current.variable_services_quote_status || (selectedVariableServices.length > 0 ? 'a_traiter' : 'aucun'));

    const identityDocumentType = body.identity_document_type !== undefined

      ? normalizeIdentityDocumentType(body.identity_document_type, current.identity_document_type || 'cin_tn')

      : current.identity_document_type;

    const identityDocumentNumber = body.identity_document_number !== undefined

      ? normalizeIdentityNumber(body.identity_document_number)

      : current.identity_document_number;

    const identityFirstName = body.identity_first_name !== undefined ? normalizePersonName(body.identity_first_name) || null : current.identity_first_name;

    const identityLastName = body.identity_last_name !== undefined ? normalizePersonName(body.identity_last_name) || null : current.identity_last_name;

    const identityDocumentCountry = body.identity_document_country !== undefined ? String(body.identity_document_country || '').trim() || null : current.identity_document_country;

    const identityDocumentImageUrl = body.identity_document_image_url !== undefined ? String(body.identity_document_image_url || '').trim() || null : current.identity_document_image_url;

    const identityOcrText = body.identity_ocr_text !== undefined ? String(body.identity_ocr_text || '').trim() || null : current.identity_ocr_text;

    const identitySubmittedAt = body.identity_submitted_at !== undefined ? body.identity_submitted_at : current.identity_submitted_at;

    const paymentReceiptImageUrl = body.payment_receipt_image_url !== undefined ? String(body.payment_receipt_image_url || '').trim() || null : current.payment_receipt_image_url;

    const paymentReceiptUploadedAt = body.payment_receipt_uploaded_at !== undefined ? body.payment_receipt_uploaded_at : current.payment_receipt_uploaded_at;

    const paymentReceiptNote = body.payment_receipt_note !== undefined ? String(body.payment_receipt_note || '').trim() || null : current.payment_receipt_note;

    const contractGeneratedAt = body.contract_generated_at !== undefined ? body.contract_generated_at : current.contract_generated_at;

    const finalizationDueAt = body.finalization_due_at !== undefined ? body.finalization_due_at : current.finalization_due_at;

    const contractId = body.contract_id !== undefined ? body.contract_id : current.contract_id;

    const paymentId = body.payment_id !== undefined ? body.payment_id : current.payment_id;



    await pool.query(

      `UPDATE reservation_demands

       SET status = ?, owner_notified_at = ?, owner_response_at = ?, client_confirmation_clicked_at = ?,

           payment_mode = ?, total_amount = ?, amount_due_now = ?,

           selected_fixed_services_json = ?, selected_variable_services_json = ?, variable_services_quote_json = ?, variable_services_quote_total = ?, variable_services_quote_status = ?,

           identity_document_type = ?, identity_document_number = ?, identity_document_country = ?,

           identity_first_name = ?, identity_last_name = ?,

           identity_document_image_url = ?, identity_ocr_text = ?, identity_submitted_at = ?, contract_generated_at = ?,

           payment_receipt_image_url = ?, payment_receipt_uploaded_at = ?, payment_receipt_note = ?,

           admin_note = ?, client_note = ?, finalization_due_at = ?, contract_id = ?, payment_id = ?, updated_at = ?

       WHERE id = ?`,

      [

        nextStatus,

        ownerNotifiedAt || null,

        ownerResponseAt || null,

        clientConfirmationClickedAt || null,

        paymentMode,

        totalAmount,

        amountDueNow,

        JSON.stringify(selectedFixedServices),

        JSON.stringify(selectedVariableServices),

        JSON.stringify(variableServicesQuote),

        variableServicesQuoteTotal,

        variableServicesQuoteStatus,

        identityDocumentType || null,

        identityDocumentNumber || null,

        identityDocumentCountry || null,

        identityFirstName,

        identityLastName,

        identityDocumentImageUrl || null,

        identityOcrText || null,

        identitySubmittedAt || null,

        contractGeneratedAt || null,

        paymentReceiptImageUrl || null,

        paymentReceiptUploadedAt || null,

        paymentReceiptNote || null,

        adminNote || null,

        clientNote || null,

        finalizationDueAt || null,

        contractId || null,

        paymentId || null,

        updatedAt,

        demandId,

      ]

    );



    if (current.unavailable_date_id) {

      if (nextStatus === 'demande_rejetee_admin' || nextStatus === 'demande_annulee_client') {

        await pool.query(

          `DELETE FROM unavailable_dates

           WHERE id = ?

             AND reservation_demand_id = ?`,

          [current.unavailable_date_id, demandId]

        );

        await pool.query(

          'UPDATE reservation_demands SET unavailable_date_id = ?, updated_at = ? WHERE id = ?',

          [null, updatedAt, demandId]

        );

      } else {

        const unavailableStatus = (nextStatus === 'contrat_realise' || nextStatus === 'succes_paiement') ? 'booked' : 'pending';

        await pool.query(

          'UPDATE unavailable_dates SET status = ?, payment_deadline = ? WHERE id = ?',

          [unavailableStatus, finalizationDueAt || current.finalization_due_at || null, current.unavailable_date_id]

        );

      }

    }



    if (body.communicateToOwner) {

      const notificationMessage = `Demande reservation a traiter pour le bien ${current.bien_id} du ${current.start_date} au ${current.end_date}`;

      await createAdminNotification('info', notificationMessage, updatedAt);

      await appendReservationDemandHistory(demandId, nextStatus, 'admin', body.actor_id || 'admin', body.history_note || 'Demande communiquee au proprietaire', updatedAt);

    } else if (nextStatus !== current.status || body.history_note) {

      await appendReservationDemandHistory(

        demandId,

        nextStatus,

        body.actor_type || 'admin',

        body.actor_id || 'admin',

        body.history_note || `Etat mis a jour vers ${nextStatus}`,

        updatedAt

      );

    }



    if (notifyClientOnRejection && nextStatus === 'demande_rejetee_admin') {

      await appendReservationDemandHistory(

        demandId,

        nextStatus,

        'admin',

        body.actor_id || 'admin',

        'Notification popup client demandee pour rejet admin.',

        updatedAt

      );

      await createAdminNotification(

        'info',

        `Rejet notifie au client (popup) pour la demande ${demandId}`,

        updatedAt

      );

    }



    if (requester?.role === 'admin' && nextStatus === 'demande_recu_paiement' && nextStatus !== current.status) {

      await createAdminNotification(

        'warning',

        `Demande de recu de paiement envoyee au client pour la demande ${demandId}`,

        updatedAt

      );

    }



    const [updatedRows] = await pool.query(

      `SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      WHERE d.id = ? LIMIT 1`,

      [demandId]

    );

    res.json(formatReservationDemandRow(updatedRows[0]));

    if (nextStatus === 'client_procede_vers_paiement_en_cours' || nextStatus === 'contrat_realise') {

      logMobileFlow('reservation_status_update_success', req, {

        demandId,

        fromStatus: String(current.status || ''),

        toStatus: nextStatus,

      });

    }

  } catch (error) {

    console.error('Error updating reservation demand:', error);

    logMobileFlow('reservation_status_update_error', req, {

      demandId: String(req.params?.id || ''),

      error: String(error?.message || error),

    });

    res.status(500).json({ error: 'Impossible de mettre a jour la demande de reservation' });

  }

});



app.post('/api/reservation-demands/:id/extract-identity', requireAuthenticatedSession, reservationMutationRateLimit, reservationIdentityUpload.single('document'), async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    if (!demandId) {

      return res.status(400).json({ error: 'Demande introuvable' });

    }

    const [demandRows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = demandRows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, current)) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_demand_access_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Reservation demand access denied',

        metadata: { demandId, context: 'extract_identity' },

      });

      return res.status(403).json({ error: 'Acces refuse a cette demande' });

    }

    if (!['attente_envoi_coordonnees_contrat', 'reponse_positive_attente_confirmation_client', 'client_procede_vers_paiement_en_cours'].includes(String(current.status || ''))) {

      return res.status(400).json({ error: 'Cette demande n est pas dans une etape de collecte des coordonnees' });

    }



    const documentType = normalizeIdentityDocumentType(req.body?.document_type || req.body?.identity_document_type, 'cin_tn');

    const manualDocumentNumber = normalizeIdentityNumber(req.body?.manual_document_number || req.body?.identity_document_number);

    const imageUrl = req.file ? `/uploads/reservation-identities/${req.file.filename}` : String(req.body?.identity_document_image_url || '').trim();

    if (!imageUrl && !manualDocumentNumber) {

      return res.status(400).json({ error: 'Une image du document ou un numero manuel est requis' });

    }



    const ocrPayload = req.file

      ? await extractIdentityDataFromImage(req.file.path, documentType, { fileSize: Number(req.file.size || 0) })

      : { ocrText: '', extractedNumber: '', extractedFirstName: '', extractedLastName: '', skipped: true, reason: 'no_file' };

    const identityDocumentNumber = manualDocumentNumber || normalizeIdentityNumber(ocrPayload.extractedNumber);

    const identityFirstName = normalizePersonName(req.body?.manual_first_name || req.body?.identity_first_name || ocrPayload.extractedFirstName);

    const identityLastName = normalizePersonName(req.body?.manual_last_name || req.body?.identity_last_name || ocrPayload.extractedLastName);



    if (!identityDocumentNumber) {

      const ocrReason = ocrPayload?.reason ? ` (${ocrPayload.reason})` : '';

      return res.status(400).json({ error: `Numero de document non detecte${ocrReason}. Veuillez le saisir manuellement.` });

    }



    res.json({

      demand_id: demandId,

      document_type: documentType,

      identity_document_number: identityDocumentNumber,

      identity_first_name: identityFirstName || '',

      identity_last_name: identityLastName || '',

      identity_document_image_url: imageUrl || null,

      ocr_skipped: !!ocrPayload.skipped,

      ocr_reason: ocrPayload.reason || '',

      ocr_text_preview: String(ocrPayload.ocrText || '').slice(0, 600),

    });

    console.log(`[OCR] extract-identity demand=${demandId} reason=${ocrPayload.reason || 'none'}`);

  } catch (error) {

    console.error('Error extracting reservation identity data:', error);

    res.status(500).json({ error: 'Extraction OCR impossible' });

  }

});



app.post('/api/reservation-demands/:id/submit-identity', requireAuthenticatedSession, reservationMutationRateLimit, reservationIdentityUpload.single('document'), async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    if (!demandId) {

      return res.status(400).json({ error: 'Demande introuvable' });

    }



    const [demandRows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = demandRows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, current)) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_demand_access_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Reservation demand access denied',

        metadata: { demandId, context: 'submit_identity' },

      });

      return res.status(403).json({ error: 'Acces refuse a cette demande' });

    }



    if (!['attente_envoi_coordonnees_contrat', 'reponse_positive_attente_confirmation_client', 'client_procede_vers_paiement_en_cours'].includes(String(current.status || ''))) {

      return res.status(400).json({ error: 'Cette demande n est pas dans une etape de collecte des coordonnees' });

    }



    const documentType = normalizeIdentityDocumentType(req.body?.document_type || req.body?.identity_document_type, 'cin_tn');

    const documentCountry = String(req.body?.document_country || '').trim() || (documentType === 'passport_foreign' ? 'etranger' : 'tunisie');

    const actorId = String(req.authUser?.id || req.authUser?.email || current.client_user_id || current.client_email || 'client').trim();

    const manualDocumentNumber = normalizeIdentityNumber(req.body?.manual_document_number || req.body?.identity_document_number);

    const manualFirstName = normalizePersonName(req.body?.manual_first_name || req.body?.identity_first_name || req.body?.confirmed_first_name);

    const manualLastName = normalizePersonName(req.body?.manual_last_name || req.body?.identity_last_name || req.body?.confirmed_last_name);

    const imageUrl = req.file ? `/uploads/reservation-identities/${req.file.filename}` : String(req.body?.identity_document_image_url || '').trim();



    if (!imageUrl && !manualDocumentNumber) {

      return res.status(400).json({ error: 'Une image du document ou un numero manuel est requis' });

    }



    const ocrPayload = req.file

      ? await extractIdentityDataFromImage(req.file.path, documentType, { fileSize: Number(req.file.size || 0) })

      : { ocrText: '', extractedNumber: '', extractedFirstName: '', extractedLastName: '', skipped: true, reason: 'no_file' };

    const identityDocumentNumber = manualDocumentNumber || normalizeIdentityNumber(ocrPayload.extractedNumber);

    if (!identityDocumentNumber) {

      const ocrReason = ocrPayload?.reason ? ` (${ocrPayload.reason})` : '';

      return res.status(400).json({ error: `Numero de document non detecte${ocrReason}. Veuillez le saisir manuellement.` });

    }

    let identityFirstName = manualFirstName || normalizePersonName(ocrPayload.extractedFirstName);

    let identityLastName = manualLastName || normalizePersonName(ocrPayload.extractedLastName);

    if (!identityFirstName || !identityLastName) {

      const nameParts = String(current.client_name || '').trim().split(/\s+/).filter(Boolean);

      if (!identityLastName && nameParts.length > 0) identityLastName = nameParts[0];

      if (!identityFirstName && nameParts.length > 1) identityFirstName = nameParts.slice(1).join(' ');

    }

    if (!identityFirstName || !identityLastName) {

      return res.status(400).json({ error: 'Nom et prenom obligatoires. Verifiez puis confirmez les donnees OCR.' });

    }



    const [bienRows] = await pool.query(

      `SELECT b.id, b.reference, b.titre, b.type, b.prix_nuitee, b.avance, b.caution, b.proprietaire_id, p.nom AS proprietaire_nom, p.email AS proprietaire_email

       FROM biens b

       LEFT JOIN proprietaires p ON p.id = b.proprietaire_id

       WHERE b.id = ?

       LIMIT 1`,

      [current.bien_id]

    );

    const bien = bienRows[0];

    if (!bien) return res.status(404).json({ error: 'Bien introuvable' });



    const now = getAgencySqlDateTime();

    let locataireId = '';

    const clientUserId = String(current.client_user_id || '').trim();

    const clientEmail = String(current.client_email || '').trim().toLowerCase();

    if (clientUserId) {

      const [locByIdRows] = await pool.query('SELECT id FROM locataires WHERE id = ? LIMIT 1', [clientUserId]);

      if (locByIdRows[0]?.id) {

        locataireId = String(locByIdRows[0].id);

      }

    }

    if (!locataireId && clientEmail) {

      const [locByEmailRows] = await pool.query(

        'SELECT id FROM locataires WHERE LOWER(TRIM(email)) = ? ORDER BY created_at DESC LIMIT 1',

        [clientEmail]

      );

      if (locByEmailRows[0]?.id) {

        locataireId = String(locByEmailRows[0].id);

      }

    }

    if (!locataireId) {

      locataireId = `l${Date.now()}`;

      const locataireCreatedAt = new Date().toISOString().split('T')[0];

      await pool.query(

        `INSERT INTO locataires (id, nom, telephone, email, cin, score_fiabilite, created_at)

         VALUES (?, ?, ?, ?, ?, ?, ?)`,

        [

          locataireId,

          `${identityLastName} ${identityFirstName}`.trim() || String(current.client_name || 'Client').trim() || 'Client',

          '',

          clientEmail || `${locataireId}@dwira.local`,

          documentType === 'cin_tn' ? identityDocumentNumber : '',

          5,

          locataireCreatedAt,

        ]

      );

    } else {

      await pool.query(

        `UPDATE locataires

         SET nom = COALESCE(NULLIF(?, ''), nom),

             cin = CASE WHEN ? = 'cin_tn' THEN ? ELSE cin END

         WHERE id = ?`,

        [`${identityLastName} ${identityFirstName}`.trim(), documentType, identityDocumentNumber, locataireId]

      );

    }

    const contractId = String(current.contract_id || `c${Date.now()}`);

    const nights = computeNights(current.start_date, current.end_date);

    const totalAmount = Number.isFinite(Number(current.total_amount)) && Number(current.total_amount) > 0

      ? Number(current.total_amount)

      : (Number(bien.prix_nuitee || 0) * nights);

    const paymentMode = normalizePaymentMode(current.payment_mode || req.body?.payment_mode, 'avance');

    const amountDueNow = Number.isFinite(Number(current.amount_due_now)) && Number(current.amount_due_now) >= 0

      ? Number(current.amount_due_now)

      : (paymentMode === 'totalite' ? totalAmount : Math.min(totalAmount, Number(bien.avance || 0)));

    const [contractUrl, ownerContractUrl] = await Promise.all([

      generateReservationClientContractHtml({

        demand: current,

        bien,

        contractId,

        contractCreatedAt: now,

        totalAmount,

        amountDueNow,

        paymentMode,

        identityNumber: identityDocumentNumber,

        identityDocumentType: documentType,

        identityFirstName,

        identityLastName,

      }),

      generateReservationOwnerContractHtml({

        demand: current,

        bien,

        owner: { nom: bien.proprietaire_nom, email: bien.proprietaire_email },

        contractId,

        contractCreatedAt: now,

        totalAmount,

        amountDueNow,

        paymentMode,

      }),

    ]);



    if (current.contract_id) {

      await pool.query(

        `UPDATE contrats

         SET bien_id = ?, locataire_id = ?, date_debut = ?, date_fin = ?, montant_recu = ?, url_pdf = ?, owner_url_pdf = ?, origine = 'automatique', statut = ?

         WHERE id = ?`,

        [current.bien_id, locataireId, current.start_date, current.end_date, amountDueNow, contractUrl, ownerContractUrl, 'actif', contractId]

      );

    } else {

      await pool.query(

        `INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, owner_url_pdf, origine, statut, created_at)

         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

        [contractId, current.bien_id, locataireId, current.start_date, current.end_date, amountDueNow, contractUrl, ownerContractUrl, 'automatique', 'actif', now]

      );

    }



    await pool.query(

      `UPDATE reservation_demands

       SET status = 'contrat_realise',

           contract_id = ?,

           client_confirmation_clicked_at = COALESCE(client_confirmation_clicked_at, ?),

           payment_mode = ?,

           total_amount = ?,

           amount_due_now = ?,

           identity_document_type = ?,

           identity_document_number = ?,

           identity_first_name = ?,

           identity_last_name = ?,

           identity_document_country = ?,

           identity_document_image_url = ?,

           identity_ocr_text = ?,

           identity_submitted_at = ?,

           contract_generated_at = ?,

           updated_at = ?

       WHERE id = ?`,

      [

        contractId,

        now,

        paymentMode,

        totalAmount,

        amountDueNow,

        documentType,

        identityDocumentNumber,

        identityFirstName,

        identityLastName,

        documentCountry,

        imageUrl || null,

        (ocrPayload.ocrText || '').slice(0, 10000) || null,

        now,

        now,

        now,

        demandId,

      ]

    );



    if (current.unavailable_date_id) {

      await pool.query(

        'UPDATE unavailable_dates SET status = ?, payment_deadline = ? WHERE id = ?',

        ['booked', current.finalization_due_at || now, current.unavailable_date_id]

      );

    }



    if (current.client_user_id && documentType === 'cin_tn') {

      try {

        await pool.query(

          'UPDATE utilisateurs SET cin = ?, cin_image_url = COALESCE(?, cin_image_url) WHERE id = ?',

          [identityDocumentNumber, imageUrl || null, current.client_user_id]

        );

      } catch (userUpdateError) {

        console.warn('Non blocking user identity sync error:', userUpdateError?.message || userUpdateError);

      }

    }



    await appendReservationDemandHistory(

      demandId,

      'contrat_realise',

      'client',

      actorId,

      `Coordonnees confirmees (${documentType}) et contrat ${contractId} genere`,

      now

    );

    await createAdminNotification(

      'success',

      `Contrat ${contractId} genere pour la demande ${demandId} (${current.client_name || current.client_email || 'client'})`,

      now

    );



    const [updatedRows] = await pool.query(

      `SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      WHERE d.id = ?

      LIMIT 1`,

      [demandId]

    );

    res.json(formatReservationDemandRow(updatedRows[0]));

  } catch (error) {

    console.error('Error submitting reservation demand identity:', error);

    const detail = String(error?.message || '').trim();

    res.status(500).json({

      error: detail ? `Impossible de soumettre les coordonnees du client (${detail})` : 'Impossible de soumettre les coordonnees du client',

      detail,

    });

  }

});



app.post('/api/reservation-demands/:id/regenerate-voucher', requireAdminSession, reservationMutationRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    const detailedCurrent = await fetchReservationDemandDetailsById(demandId);

    if (!detailedCurrent) return res.status(404).json({ error: 'Demande introuvable' });

    const isAmicaleDemand = String(detailedCurrent.payment_mode || '').trim() === 'amicale'

      || Boolean(String(detailedCurrent.pricing_amicale_id || '').trim());

    if (!isAmicaleDemand) return res.status(400).json({ error: 'Regeneration voucher reservee aux demandes amicale' });

    if (String(detailedCurrent.status || '') !== 'voucher_en_cours') {

      return res.status(400).json({ error: 'Le voucher ne peut etre regenere que pour une demande en cours' });

    }



    const now = getAgencySqlDateTime();

    const voucherNumber = String(detailedCurrent.voucher_number || `VCH-${String(demandId).slice(-8).toUpperCase()}`).trim();

    const voucherUrl = await generateAmicaleVoucherHtml({

      demand: detailedCurrent,

      bien: {

        reference: detailedCurrent.bien_reference || detailedCurrent.bien_id,

        titre: detailedCurrent.bien_titre || detailedCurrent.bien_id,

      },

      amicale: {

        name: detailedCurrent.amicale_name || detailedCurrent.client_name || 'Amicale',

        logoUrl: detailedCurrent.amicale_logo_url || null,

      },

      voucherNumber,

      generatedAt: now,

    });

    const voucherId = String(detailedCurrent.voucher_id || `vch_${demandId}`).trim();

    await pool.query(

      `UPDATE reservation_demands

       SET voucher_id = ?, voucher_number = ?, voucher_url = ?, voucher_generated_at = ?, updated_at = ?

       WHERE id = ?`,

      [voucherId, voucherNumber, voucherUrl, now, now, demandId]

    );

    await appendReservationDemandHistory(

      demandId,

      'voucher_en_cours',

      'admin',

      String(req.authUser?.id || req.authUser?.email || 'admin').trim(),

      `Voucher regenere (${voucherNumber})`,

      now

    );

    const refreshed = await fetchReservationDemandDetailsById(demandId);

    return res.json(refreshed || null);

  } catch (error) {

    console.error('Error regenerating voucher:', error);

    return res.status(500).json({ error: 'Impossible de regenerer le voucher' });

  }

});



app.post('/api/reservation-demands/:id/upload-payment-receipt', requireAuthenticatedSession, reservationMutationRateLimit, paymentReceiptUpload.single('receipt'), async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    if (!demandId) {

      return res.status(400).json({ error: 'Demande introuvable' });

    }

    const [demandRows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = demandRows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, current)) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_demand_access_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Reservation demand access denied',

        metadata: { demandId, context: 'upload_payment_receipt' },

      });

      return res.status(403).json({ error: 'Acces refuse a cette demande' });

    }

    if (!req.file) {

      return res.status(400).json({ error: 'Image du recu requise' });

    }

    const currentStatus = String(current.status || '').trim();

    const allowedUploadReceiptStatuses = new Set([

      'demande_recu_paiement',

      'recu_paiement_envoye',

      'contrat_realise',

      'reponse_positive_attente_confirmation_client',

      'client_procede_vers_paiement_en_cours',

      'attente_envoi_coordonnees_contrat',

    ]);

    if (!allowedUploadReceiptStatuses.has(currentStatus)) {

      return res.status(400).json({ error: 'Le recu ne peut pas etre envoye a cette etape' });

    }



    const now = getAgencySqlDateTime();

    const nextStatus = 'recu_paiement_envoye';

    const receiptUrl = `/uploads/reservation-payment-receipts/${req.file.filename}`;

    const receiptNote = String(req.body?.payment_receipt_note || req.body?.note || '').trim() || null;

    const actorId = String(req.authUser?.id || req.authUser?.email || current.client_user_id || current.client_email || 'client').trim();



    await pool.query(

      `UPDATE reservation_demands

       SET status = ?,

           payment_receipt_image_url = ?,

           payment_receipt_uploaded_at = ?,

           payment_receipt_note = ?,

           updated_at = ?

       WHERE id = ?`,

      [nextStatus, receiptUrl, now, receiptNote, now, demandId]

    );



    await appendReservationDemandHistory(

      demandId,

      nextStatus,

      'client',

      actorId,

      'Recu de paiement envoye par le client',

      now

    );

    await createAdminNotification(

      'warning',

      `Recu de paiement recu pour la demande ${demandId}. Verification admin requise.`,

      now

    );



    const [updatedRows] = await pool.query(

      `SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

        DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at,

        DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      WHERE d.id = ?

      LIMIT 1`,

      [demandId]

    );

    res.json(formatReservationDemandRow(updatedRows[0]));

  } catch (error) {

    console.error('Error uploading payment receipt:', error);

    res.status(500).json({ error: 'Impossible d envoyer le recu de paiement' });

  }

});



async function applyReservationDemandPayment({ current, demandId, scope, method, actorType, actorId, explicitPaymentIdPrefix = 'pay' }) {

  const reservationAmount = Number.isFinite(Number(current.amount_due_now))

    ? Number(current.amount_due_now)

    : Number(current.total_amount || 0);

  const servicesAmount = Number.isFinite(Number(current.variable_services_quote_total))

    ? Number(current.variable_services_quote_total)

    : 0;

  const servicesQuoteIsPayable = String(current.variable_services_quote_status || '') === 'devis_envoye' && servicesAmount > 0;

  const reservationAlreadyPaid = !!String(current.reservation_payment_id || '').trim();

  const servicesAlreadyPaid = !!String(current.services_payment_id || '').trim()

    || (servicesQuoteIsPayable && String(current.variable_services_quote_status || '') === 'paye');



  if (scope === 'reservation' && (reservationAmount <= 0 || reservationAlreadyPaid)) {

    throw new Error(reservationAlreadyPaid ? 'La reservation a deja ete reglee' : 'Aucun montant de reservation a regler');

  }

  if (scope === 'services' && (!servicesQuoteIsPayable || servicesAlreadyPaid)) {

    throw new Error(servicesAlreadyPaid ? 'Les services ont deja ete regles' : 'Aucun devis services payable pour le moment');

  }

  if (scope === 'combined') {

    if (reservationAlreadyPaid && (!servicesQuoteIsPayable || servicesAlreadyPaid)) {

      throw new Error('Cette demande est deja entierement reglee');

    }

    if (!reservationAlreadyPaid && reservationAmount <= 0) {

      throw new Error('Aucun montant de reservation a regler');

    }

  }



  const now = getAgencySqlDateTime();

  let reservationPaymentId = String(current.reservation_payment_id || '').trim() || null;

  let servicesPaymentId = String(current.services_payment_id || '').trim() || null;

  let reservationPaidAt = current.reservation_payment_paid_at || null;

  let servicesPaidAt = current.services_payment_paid_at || null;

  let variableServicesQuoteStatus = current.variable_services_quote_status || null;



  if ((scope === 'reservation' || scope === 'combined') && !reservationAlreadyPaid && reservationAmount > 0) {

    reservationPaymentId = `${explicitPaymentIdPrefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    await pool.query(

      'INSERT INTO paiements (id, contrat_id, montant, date_paiement, statut, methode) VALUES (?, ?, ?, ?, ?, ?)',

      [reservationPaymentId, current.contract_id, reservationAmount, now, 'paye', method]

    );

    reservationPaidAt = now;

  }



  if ((scope === 'services' || scope === 'combined') && servicesQuoteIsPayable && !servicesAlreadyPaid) {

    servicesPaymentId = `${explicitPaymentIdPrefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    await pool.query(

      'INSERT INTO paiements (id, contrat_id, montant, date_paiement, statut, methode) VALUES (?, ?, ?, ?, ?, ?)',

      [servicesPaymentId, current.contract_id, servicesAmount, now, 'paye', method]

    );

    servicesPaidAt = now;

    variableServicesQuoteStatus = 'paye';

  }



  const reservationIsPaidAfterUpdate = !!reservationPaymentId;

  const servicesIsPaidAfterUpdate = !servicesQuoteIsPayable || !!servicesPaymentId;

  const nextStatus = reservationIsPaidAfterUpdate && servicesIsPaidAfterUpdate ? 'succes_paiement' : 'contrat_realise';

  const primaryPaymentId = reservationPaymentId || servicesPaymentId || current.payment_id || null;



  await pool.query(

    `UPDATE reservation_demands

     SET status = ?,

         payment_id = ?,

         reservation_payment_id = ?,

         reservation_payment_paid_at = ?,

         services_payment_id = ?,

         services_payment_paid_at = ?,

         variable_services_quote_status = ?,

         updated_at = ?

     WHERE id = ?`,

    [

      nextStatus,

      primaryPaymentId,

      reservationPaymentId,

      reservationPaidAt,

      servicesPaymentId,

      servicesPaidAt,

      variableServicesQuoteStatus,

      now,

      demandId,

    ]

  );



  const paidParts = [];

  if (scope === 'combined') {

    if (reservationPaymentId && !reservationAlreadyPaid) paidParts.push('reservation');

    if (servicesPaymentId && !servicesAlreadyPaid) paidParts.push('services');

  } else {

    paidParts.push(scope);

  }

  await appendReservationDemandHistory(

    demandId,

    nextStatus,

    actorType,

    actorId,

    `Paiement ${method} enregistre pour: ${paidParts.join(' + ')}`

  );

  await createAdminNotification(

    'success',

    `Paiement ${method} recu pour la demande ${demandId}: ${paidParts.join(' + ')}`,

    now

  );

}



app.post('/api/reservation-demands/:id/pay', requireAuthenticatedSession, paymentRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    const scope = String(req.body?.scope || '').trim().toLowerCase();

    const method = String(req.body?.methode || req.body?.method || 'virement').trim() || 'virement';

    const actorId = String(req.authUser?.id || req.authUser?.email || req.body?.actor_id || req.body?.actorId || 'client').trim() || 'client';

    if (!demandId) return res.status(400).json({ error: 'Demande introuvable' });

    if (!['reservation', 'services', 'combined'].includes(scope)) {

      return res.status(400).json({ error: 'Scope de paiement invalide' });

    }



    const [rows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = rows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, current)) {

      void logSecurityEvent({

        req,

        eventType: 'reservation_demand_access_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Reservation demand access denied',

        metadata: { demandId, context: 'pay' },

      });

      return res.status(403).json({ error: 'Acces refuse a cette demande' });

    }

    if (req.authUser?.role !== 'admin') {

      return res.status(403).json({ error: 'Paiement valide manuellement par admin. Veuillez envoyer votre recu de paiement.' });

    }

    if (!current.contract_id) return res.status(400).json({ error: 'Le contrat doit etre genere avant le paiement' });



    try {

      await applyReservationDemandPayment({

        current,

        demandId,

        scope,

        method,

        actorType: 'client',

        actorId,

      });

    } catch (paymentError) {

      return res.status(400).json({ error: paymentError instanceof Error ? paymentError.message : 'Paiement impossible' });

    }



    const [updatedRows] = await pool.query(

      `SELECT

        d.*,

        b.titre AS bien_titre,

        b.reference AS bien_reference,

        p.nom AS proprietaire_nom,

        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

        DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

        DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

        DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

        DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

        DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at,

        DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at,

        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

      FROM reservation_demands d

      LEFT JOIN biens b ON b.id = d.bien_id

      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

      WHERE d.id = ?

      LIMIT 1`,

      [demandId]

    );

    res.json(formatReservationDemandRow(updatedRows[0]));

  } catch (error) {

    console.error('Error creating reservation demand payment:', error);

    res.status(500).json({ error: 'Impossible de traiter le paiement de cette demande' });

  }

});



app.post('/api/reservation-demands/:id/flouci/create-checkout', requireAuthenticatedSession, paymentRateLimit, async (req, res) => {

  try {

    logMobileFlow('flouci_create_checkout_start', req, {

      demandId: String(req.params?.id || ''),

      scope: String(req.body?.scope || 'reservation'),

    });

    await ensureReservationDemandSchema();

    if (!FLOUCI_ENABLED) {

      return res.status(501).json({ error: 'Flouci non configure. Ajoutez FLOUCI_PUBLIC_KEY et FLOUCI_PRIVATE_KEY.' });

    }

    const demandId = String(req.params.id || '').trim();

    const scope = String(req.body?.scope || 'reservation').trim().toLowerCase();

    if (!demandId) return res.status(400).json({ error: 'Demande introuvable' });

    if (!['reservation', 'services', 'combined'].includes(scope)) {

      return res.status(400).json({ error: 'Scope de paiement invalide' });

    }



    const [rows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = rows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, current)) return res.status(403).json({ error: 'Acces refuse a cette demande' });

    if (!current.contract_id) return res.status(400).json({ error: 'Le contrat doit etre genere avant le paiement' });



    const reservationAmount = Number.isFinite(Number(current.amount_due_now))

      ? Number(current.amount_due_now)

      : Number(current.total_amount || 0);

    const servicesAmount = Number.isFinite(Number(current.variable_services_quote_total))

      ? Number(current.variable_services_quote_total)

      : 0;

    const servicesQuoteIsPayable = String(current.variable_services_quote_status || '') === 'devis_envoye' && servicesAmount > 0;

    const reservationAlreadyPaid = !!String(current.reservation_payment_id || '').trim();

    const servicesAlreadyPaid = !!String(current.services_payment_id || '').trim()

      || (servicesQuoteIsPayable && String(current.variable_services_quote_status || '') === 'paye');



    let amountTnd = 0;

    if (scope === 'reservation') {

      if (reservationAlreadyPaid || reservationAmount <= 0) {

        return res.status(400).json({ error: reservationAlreadyPaid ? 'La reservation a deja ete reglee' : 'Aucun montant de reservation a regler' });

      }

      amountTnd = reservationAmount;

    } else if (scope === 'services') {

      if (!servicesQuoteIsPayable || servicesAlreadyPaid) {

        return res.status(400).json({ error: servicesAlreadyPaid ? 'Les services ont deja ete regles' : 'Aucun devis services payable pour le moment' });

      }

      amountTnd = servicesAmount;

    } else {

      amountTnd = (reservationAlreadyPaid ? 0 : reservationAmount) + ((servicesQuoteIsPayable && !servicesAlreadyPaid) ? servicesAmount : 0);

      if (amountTnd <= 0) return res.status(400).json({ error: 'Cette demande est deja entierement reglee' });

    }



    const amountForFlouci = normalizeFlouciAmount(amountTnd);

    if (amountForFlouci <= 0) return res.status(400).json({ error: 'Montant Flouci invalide' });

    const frontendBase = CANONICAL_FRONTEND_URL.replace(/\/+$/, '');

    const backendBase = resolvePublicApiBase(req) || `${req.protocol}://${req.get('host')}`;

    const callbackBase = `${backendBase.replace(/\/+$/, '')}/api/payments/flouci/callback`;

    const successLink = `${callbackBase}?demand_id=${encodeURIComponent(demandId)}&scope=${encodeURIComponent(scope)}&flow=success&return_to=${encodeURIComponent(`${frontendBase}/mes-reservations/${encodeURIComponent(demandId)}/paiement`)}`;

    const failLink = `${callbackBase}?demand_id=${encodeURIComponent(demandId)}&scope=${encodeURIComponent(scope)}&flow=fail&return_to=${encodeURIComponent(`${frontendBase}/mes-reservations/${encodeURIComponent(demandId)}/paiement`)}`;

    const shortDemandId = String(demandId).replace(/[^a-zA-Z0-9_-]/g, '').slice(-14);

    const shortScope = String(scope || 'reservation').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 10);

    const trackingId = `dwira-${shortDemandId}-${shortScope}-${Date.now()}`;



    const payload = {

      amount: amountForFlouci,

      success_link: successLink,

      fail_link: failLink,

      developer_tracking_id: trackingId,

      session_timeout_secs: FLOUCI_SESSION_TIMEOUT_SECS,

    };

    const generated = await flouciGeneratePayment(payload);

    const checkoutUrl = String(generated?.result?.link || generated?.link || '').trim();

    const checkoutId = String(generated?.result?.payment_id || generated?.payment_id || '').trim();

    if (!checkoutUrl || !checkoutId) {

      return res.status(502).json({ error: 'Reponse Flouci incomplete (link/payment_id manquant)' });

    }



    await pool.query(

      `UPDATE reservation_demands

       SET flouci_checkout_id = ?,

           flouci_scope = ?,

           flouci_status = ?,

           flouci_checkout_url = ?,

           updated_at = ?

       WHERE id = ?`,

      [checkoutId, scope, 'PENDING', checkoutUrl, getAgencySqlDateTime(), demandId]

    );



    await appendReservationDemandHistory(

      demandId,

      String(current.status || 'contrat_realise'),

      'client',

      String(req.authUser?.id || req.authUser?.email || 'client'),

      `Checkout Flouci cree (scope=${scope}, amount=${amountTnd} TND, id=${checkoutId})`

    );

    return res.json({

      provider: 'flouci',

      checkout_url: checkoutUrl,

      checkout_id: checkoutId,

      amount_tnd: amountTnd,

      amount_flouci: amountForFlouci,

      scope,

    });

  } catch (error) {

    console.error('Error creating Flouci checkout:', error);

    logMobileFlow('flouci_create_checkout_error', req, {

      demandId: String(req.params?.id || ''),

      error: String(error?.message || error),

    });

    const detail = String(error?.message || '').trim();

    return res.status(500).json({

      error: detail ? `Impossible de creer la session Flouci (${detail})` : 'Impossible de creer la session Flouci',

      detail,

    });

  }

});



app.post('/api/reservation-demands/:id/flouci/confirm', requireAuthenticatedSession, paymentRateLimit, async (req, res) => {

  try {

    logMobileFlow('flouci_confirm_start', req, {

      demandId: String(req.params?.id || ''),

      paymentId: String(req.body?.payment_id || req.body?.paymentId || ''),

      scope: String(req.body?.scope || ''),

    });

    await ensureReservationDemandSchema();

    if (!FLOUCI_ENABLED) return res.status(501).json({ error: 'Flouci non configure' });

    const demandId = String(req.params.id || '').trim();

    const incomingPaymentId = String(req.body?.payment_id || req.body?.paymentId || '').trim();

    if (!demandId) return res.status(400).json({ error: 'Demande introuvable' });

    const [rows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);

    const current = rows[0];

    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    if (!canAccessReservationDemand(req.authUser, current)) return res.status(403).json({ error: 'Acces refuse a cette demande' });



    const paymentId = incomingPaymentId || String(current.flouci_checkout_id || '').trim();

    if (!paymentId) return res.status(400).json({ error: 'Aucun payment_id Flouci a verifier' });

    const scope = String(req.body?.scope || current.flouci_scope || 'reservation').trim().toLowerCase();

    if (!['reservation', 'services', 'combined'].includes(scope)) {

      return res.status(400).json({ error: 'Scope de paiement invalide' });

    }



    const verification = await flouciVerifyPayment(paymentId);

    const status = String(

      verification?.result?.status

      || verification?.status

      || verification?.payment_status

      || ''

    ).trim();

    const paid = isFlouciSuccessStatus(status);

    const now = getAgencySqlDateTime();

    await pool.query(

      `UPDATE reservation_demands

       SET flouci_checkout_id = ?,

           flouci_scope = ?,

           flouci_status = ?,

           flouci_verified_at = ?,

           updated_at = ?

       WHERE id = ?`,

      [paymentId, scope, status || 'UNKNOWN', now, now, demandId]

    );



    if (!paid) {

      return res.status(409).json({ error: `Paiement Flouci non confirme (status=${status || 'inconnu'})`, flouci_status: status || null });

    }



    await applyReservationDemandPayment({

      current: { ...current },

      demandId,

      scope,

      method: 'flouci',

      actorType: 'client',

      actorId: String(req.authUser?.id || req.authUser?.email || 'client'),

      explicitPaymentIdPrefix: 'flouci_',

    });



    const [updatedRows] = await pool.query(

      `SELECT d.*, b.titre AS bien_titre, b.reference AS bien_reference, p.nom AS proprietaire_nom,

              DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

              DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,

              DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at,

              DATE_FORMAT(d.services_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS services_payment_paid_at

       FROM reservation_demands d

       LEFT JOIN biens b ON b.id = d.bien_id

       LEFT JOIN proprietaires p ON p.id = d.proprietaire_id

       WHERE d.id = ?

       LIMIT 1`,

      [demandId]

    );

    return res.json(formatReservationDemandRow(updatedRows[0]));

  } catch (error) {

    console.error('Error confirming Flouci payment:', error);

    logMobileFlow('flouci_confirm_error', req, {

      demandId: String(req.params?.id || ''),

      error: String(error?.message || error),

    });

    return res.status(500).json({ error: 'Impossible de confirmer le paiement Flouci' });

  }

});



app.get('/api/payments/flouci/callback', async (req, res) => {

  try {

    const demandId = String(req.query?.demand_id || '').trim();

    const scope = String(req.query?.scope || 'reservation').trim().toLowerCase();

    const paymentId = String(req.query?.payment_id || req.query?.paymentId || req.query?.id || '').trim();

    const flow = String(req.query?.flow || '').trim().toLowerCase();

    const returnTo = String(req.query?.return_to || `${CANONICAL_FRONTEND_URL}/mes-reservations`).trim();

    const targetUrl = new URL(returnTo, CANONICAL_FRONTEND_URL);

    if (demandId) targetUrl.searchParams.set('demand_id', demandId);

    if (scope) targetUrl.searchParams.set('scope', scope);

    if (paymentId) targetUrl.searchParams.set('flouci_payment_id', paymentId);

    if (flow) targetUrl.searchParams.set('flouci_flow', flow);

    return res.redirect(targetUrl.toString());

  } catch (error) {

    console.error('Flouci callback redirect error:', error);

    return res.redirect(`${CANONICAL_FRONTEND_URL}/mes-reservations`);

  }

});



app.post('/api/payments/flouci/webhook', async (req, res) => {

  try {

    if (FLOUCI_WEBHOOK_SECRET) {

      const provided = String(req.headers['x-webhook-secret'] || req.headers['x-flouci-secret'] || '').trim();

      if (!provided || provided !== FLOUCI_WEBHOOK_SECRET) {

        return res.status(401).json({ error: 'Webhook secret invalide' });

      }

    }

    await ensureReservationDemandSchema();

    const paymentId = String(req.body?.payment_id || req.body?.paymentId || req.body?.id || '').trim();

    if (!paymentId || !FLOUCI_ENABLED) return res.json({ ok: true, ignored: true });

    const [rows] = await pool.query(

      'SELECT * FROM reservation_demands WHERE flouci_checkout_id = ? ORDER BY updated_at DESC LIMIT 1',

      [paymentId]

    );

    const current = rows[0];

    if (!current) return res.json({ ok: true, ignored: true });

    const verification = await flouciVerifyPayment(paymentId);

    const status = String(verification?.result?.status || verification?.status || '').trim();

    const now = getAgencySqlDateTime();

    await pool.query(

      'UPDATE reservation_demands SET flouci_status = ?, flouci_verified_at = ?, updated_at = ? WHERE id = ?',

      [status || 'UNKNOWN', now, now, current.id]

    );

    return res.json({ ok: true });

  } catch (error) {

    console.error('Flouci webhook error:', error);

    return res.status(500).json({ error: 'Webhook Flouci error' });

  }

});



app.post('/api/caracteristique-onglets', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const mode = normalizeBienMode(req.body.mode_bien || req.body.mode);

    const type = normalizeBienType(req.body.type_bien || req.body.type);

    const nom = String(req.body.nom || '').trim();

    const ordre = Number(req.body.ordre || 999);

    const validation = validateModeAndType(mode, type);

    if (!validation.valid) {

      return res.status(400).json({ error: validation.error });

    }

    if (!nom) {

      return res.status(400).json({ error: 'nom requis' });

    }

    const [existingRows] = await pool.query(

      'SELECT * FROM caracteristique_onglets WHERE mode_bien = ? AND type_bien = ? ORDER BY ordre ASC, nom ASC',

      [mode, type]

    );

    const existingEquivalent = Array.isArray(existingRows)

      ? existingRows.find((row) => normalizeTabNameForMatch(row?.nom) === normalizeTabNameForMatch(nom))

      : null;

    if (existingEquivalent) {

      return res.status(200).json(existingEquivalent);

    }

    const id = String(req.body.id || `tab${Date.now()}`).trim();

    await pool.query(

      `INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)

       VALUES (?, ?, ?, ?, ?, 0)

       ON DUPLICATE KEY UPDATE nom = VALUES(nom), ordre = VALUES(ordre)`,

      [id, mode, type, nom, Number.isFinite(ordre) ? ordre : 999]

    );

    const [rows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);

    res.status(201).json(rows[0]);

  } catch (error) {

    console.error('Error creating caracteristique onglet:', error);

    res.status(500).json({ error: 'Failed to create caracteristique onglet' });

  }

});



app.delete('/api/caracteristique-onglets/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const id = String(req.params.id || '').trim();

    if (!id) return res.status(400).json({ error: 'id requis' });

    const [rows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);

    const onglet = rows?.[0];

    if (!onglet) return res.status(404).json({ error: 'onglet introuvable' });

    await pool.query('UPDATE caracteristique_contextes SET onglet_id = NULL WHERE onglet_id = ?', [id]);

    await pool.query('DELETE FROM caracteristique_onglets WHERE id = ?', [id]);

    res.json({ message: 'Onglet supprime' });

  } catch (error) {

    console.error('Error deleting caracteristique onglet:', error);

    res.status(500).json({ error: 'Failed to delete caracteristique onglet' });

  }

});



app.put('/api/caracteristique-onglets/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const id = String(req.params.id || '').trim();

    const nom = String(req.body.nom || '').trim();

    const ordre = Number(req.body.ordre || 999);

    if (!id) return res.status(400).json({ error: 'id requis' });

    if (!nom) return res.status(400).json({ error: 'nom requis' });

    const [rows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);

    const onglet = rows?.[0];

    if (!onglet) return res.status(404).json({ error: 'onglet introuvable' });



    await pool.query(

      'UPDATE caracteristique_onglets SET nom = ?, ordre = ? WHERE id = ?',

      [nom, Number.isFinite(ordre) ? ordre : 999, id]

    );

    const [nextRows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);

    res.json(nextRows[0]);

  } catch (error) {

    console.error('Error updating caracteristique onglet:', error);

    res.status(500).json({ error: 'Failed to update caracteristique onglet' });

  }

});



app.get('/api/caracteristiques', async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const normalizeFeatureNameForFilter = (value) => String(value || '')

      .toLowerCase()

      .normalize('NFD')

      .replace(/[\u0300-\u036f]/g, '')

      .replace(/\s+/g, ' ')

      .trim();

    const isLegacyNightLimitFeature = (featureName) => {

      const normalized = normalizeFeatureNameForFilter(featureName);

      return normalized.startsWith('limite personnes')

        && normalized.includes('nuit');

    };

    const filterLegacyNightLimit = (rows) => (Array.isArray(rows) ? rows : [])

      .filter((row) => !isLegacyNightLimitFeature(row?.nom));



    const mode = normalizeBienMode(req.query.mode_bien || req.query.mode);

    const type = normalizeBienType(req.query.type_bien || req.query.type);

    const bienId = String(req.query.bien_id || '').trim() || null;



    if ((req.query.mode_bien || req.query.mode) && (req.query.type_bien || req.query.type)) {

      const validation = validateModeAndType(mode, type);

      if (!validation.valid) {

        return res.status(400).json({ error: validation.error });

      }

      const query = bienId

        ? `SELECT DISTINCT c.id,

             COALESCE(bc.override_nom, c.nom) AS nom,

             COALESCE(bc.override_type_caracteristique, c.type_caracteristique) AS type_caracteristique,

             c.choix_json,

             COALESCE(bc.override_unite, c.unite) AS unite,

             c.icon_name,

             bc.override_valeur_json AS valeur_json,

             COALESCE(bc.override_onglet_id, mo.onglet_id) AS onglet_id,

             co.nom AS onglet_nom,

             COALESCE(bc.visibilite_client, c.visibilite_client, 1) AS visibilite_client

           FROM caracteristiques c

           INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id

           LEFT JOIN modifier_onglets mo

             ON mo.caracteristique_id = c.id

            AND mo.mode_bien = cc.mode_bien

            AND mo.type_bien = cc.type_bien

           LEFT JOIN bien_caracteristiques bc

             ON bc.caracteristique_id = c.id

            AND bc.bien_id = ?

           LEFT JOIN caracteristique_onglets co

             ON co.id = COALESCE(bc.override_onglet_id, mo.onglet_id)

           WHERE cc.mode_bien = ? AND cc.type_bien = ?

           ORDER BY nom ASC`

        : `SELECT DISTINCT c.*, NULL AS valeur_json, mo.onglet_id, co.nom as onglet_nom

           FROM caracteristiques c

           INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id

           LEFT JOIN modifier_onglets mo

             ON mo.caracteristique_id = c.id

            AND mo.mode_bien = cc.mode_bien

            AND mo.type_bien = cc.type_bien

           LEFT JOIN caracteristique_onglets co ON co.id = mo.onglet_id

           WHERE cc.mode_bien = ? AND cc.type_bien = ?

           ORDER BY c.nom ASC`;

      const params = bienId ? [bienId, mode, type] : [mode, type];

      try {

        const [rows] = await pool.query(query, params);

        return res.json(filterLegacyNightLimit(rows));

      } catch (queryError) {

        const queryErrorCode = String(queryError?.code || '').trim().toUpperCase();

        if (bienId && queryErrorCode === 'ER_BAD_FIELD_ERROR') {

          const fallbackQuery = `SELECT DISTINCT c.*, NULL AS valeur_json, mo.onglet_id, co.nom as onglet_nom

             FROM caracteristiques c

             INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id

             LEFT JOIN modifier_onglets mo

               ON mo.caracteristique_id = c.id

              AND mo.mode_bien = cc.mode_bien

              AND mo.type_bien = cc.type_bien

             LEFT JOIN caracteristique_onglets co ON co.id = mo.onglet_id

             WHERE cc.mode_bien = ? AND cc.type_bien = ?

             ORDER BY c.nom ASC`;

          const [fallbackRows] = await pool.query(fallbackQuery, [mode, type]);

          return res.json(filterLegacyNightLimit(fallbackRows));

        }

        throw queryError;

      }

    }



    const [rows] = await pool.query('SELECT * FROM caracteristiques ORDER BY nom ASC');

    res.json(filterLegacyNightLimit(rows));

  } catch (error) {

    console.error('Error fetching caracteristiques:', error);

    res.status(500).json({ error: 'Failed to fetch caracteristiques' });

  }

});



app.post('/api/caracteristiques', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const { nom, mode_bien, mode, type_bien, type, type_caracteristique, choix, unite, icon_name, onglet_id, visibilite_client } = req.body;

    const normalizedMode = normalizeBienMode(mode_bien ?? mode);

    const normalizedType = normalizeBienType(type_bien ?? type);

    const featureName = String(nom || '').trim();

    const normalizedFeatureName = featureName

      .toLowerCase()

      .normalize('NFD')

      .replace(/[\u0300-\u036f]/g, '')

      .replace(/\s+/g, ' ')

      .trim();

    const featureType = ['simple', 'choix_multiple', 'plusieurs_choix', 'valeur', 'texte'].includes(String(type_caracteristique || '').trim())

      ? String(type_caracteristique).trim()

      : 'simple';

    const normalizedChoices = Array.isArray(choix)

      ? Array.from(new Set(choix.map((item) => String(item || '').trim()).filter(Boolean)))

      : [];

    const normalizedUnit = String(unite || '').trim() || null;

    const normalizedIconName = String(icon_name || '').trim() || null;

    const visibleClient = Number(visibilite_client) === 0 ? 0 : 1;

    if (!featureName) {

      return res.status(400).json({ error: 'nom requis' });

    }

    if (normalizedFeatureName.startsWith('limite personnes') && normalizedFeatureName.includes('nuit')) {

      return res.status(400).json({ error: "La caracteristique 'Limite personnes (nuit)' est obsolete. Utilisez Capacite max adultes et Capacite enfants." });

    }

    if ((featureType === 'choix_multiple' || featureType === 'plusieurs_choix') && normalizedChoices.length === 0) {

      return res.status(400).json({ error: 'choix requis pour type choix_multiple/plusieurs_choix' });

    }

    if (featureType !== 'choix_multiple' && featureType !== 'plusieurs_choix' && normalizedChoices.length > 0) {

      return res.status(400).json({ error: 'choix autorises uniquement pour type choix_multiple/plusieurs_choix' });

    }

    if (featureType !== 'valeur' && normalizedUnit) {

      return res.status(400).json({ error: 'unite autorisee uniquement pour type valeur' });

    }

    const featureChoicesJson = (featureType === 'choix_multiple' || featureType === 'plusieurs_choix') ? JSON.stringify(normalizedChoices) : null;

    const featureUnit = featureType === 'valeur' ? normalizedUnit : null;



    const [existingRows] = await pool.query(

      'SELECT * FROM caracteristiques WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?)) LIMIT 1',

      [featureName]

    );

    let caracteristique = existingRows[0];

    if (!caracteristique) {

      const id = buildShortId('car', featureName, normalizedMode, normalizedType, Date.now(), Math.random());

      await pool.query(

        'INSERT INTO caracteristiques (id, nom, type_caracteristique, choix_json, unite, icon_name, visibilite_client) VALUES (?, ?, ?, ?, ?, ?, ?)',

        [id, featureName, featureType, featureChoicesJson, featureUnit, normalizedIconName, visibleClient]

      );

      caracteristique = {

        id,

        nom: featureName,

        type_caracteristique: featureType,

        choix_json: featureChoicesJson,

        unite: featureUnit,

        icon_name: normalizedIconName,

        visibilite_client: visibleClient,

      };

    } else {

      await pool.query(

        'UPDATE caracteristiques SET type_caracteristique = ?, choix_json = ?, unite = ?, icon_name = ?, visibilite_client = ? WHERE id = ?',

        [featureType, featureChoicesJson, featureUnit, normalizedIconName, visibleClient, caracteristique.id]

      );

      caracteristique = {

        ...caracteristique,

        type_caracteristique: featureType,

        choix_json: featureChoicesJson,

        unite: featureUnit,

        icon_name: normalizedIconName,

        visibilite_client: visibleClient,

      };

    }



    if ((mode_bien || mode) && (type_bien || type)) {

      const validation = validateModeAndType(normalizedMode, normalizedType);

      if (!validation.valid) {

        return res.status(400).json({ error: validation.error });

      }

      const normalizedOngletId = String(onglet_id || '').trim() || null;

      if (normalizedOngletId) {

        const [ongletRows] = await pool.query(

          'SELECT id FROM caracteristique_onglets WHERE id = ? AND mode_bien = ? AND type_bien = ? LIMIT 1',

          [normalizedOngletId, normalizedMode, normalizedType]

        );

        if (!ongletRows?.[0]) {

          return res.status(400).json({ error: 'onglet invalide pour ce mode/type' });

        }

      }

      await pool.query(

        `INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien, onglet_id)

         VALUES (?, ?, ?, ?, ?)

         ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien), onglet_id = VALUES(onglet_id)`,

        [buildShortId('ctx', caracteristique.id, normalizedMode, normalizedType), caracteristique.id, normalizedMode, normalizedType, normalizedOngletId]

      );

      if (normalizedOngletId) {

        await pool.query(

          `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)

           VALUES (?, ?, ?, ?, ?, 0)

           ON DUPLICATE KEY UPDATE onglet_id = VALUES(onglet_id), ordre = VALUES(ordre)`,

          [buildShortId('mo', normalizedMode, normalizedType, caracteristique.id), normalizedMode, normalizedType, normalizedOngletId, caracteristique.id]

        );

      } else {

        await pool.query(

          'DELETE FROM modifier_onglets WHERE mode_bien = ? AND type_bien = ? AND caracteristique_id = ?',

          [normalizedMode, normalizedType, caracteristique.id]

        );

      }

    }



    res.status(201).json(caracteristique);

  } catch (error) {

    console.error('Error creating caracteristique:', error);

    res.status(500).json({ error: 'Failed to create caracteristique' });

  }

});



async function ensureMaintenanceWorkflowSchema() {

  const columnExists = async (tableName, columnName) => {

    const [rows] = await pool.query(

      `

      SELECT 1

      FROM information_schema.COLUMNS

      WHERE TABLE_SCHEMA = DATABASE()

        AND TABLE_NAME = ?

        AND COLUMN_NAME = ?

      LIMIT 1

      `,

      [tableName, columnName]

    );

    return rows.length > 0;

  };



  if (!(await columnExists('maintenance', 'owner_approval_required'))) {

    await pool.query("ALTER TABLE maintenance ADD COLUMN owner_approval_required TINYINT(1) NOT NULL DEFAULT 0 AFTER statut");

  }

  if (!(await columnExists('maintenance', 'owner_approval_status'))) {

    await pool.query("ALTER TABLE maintenance ADD COLUMN owner_approval_status VARCHAR(32) NOT NULL DEFAULT 'non_requis' AFTER owner_approval_required");

  }

  if (!(await columnExists('maintenance', 'owner_approved_at'))) {

    await pool.query('ALTER TABLE maintenance ADD COLUMN owner_approved_at DATETIME NULL AFTER owner_approval_status');

  }

}



async function ensureAdminNotificationsSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS admin_notifications (

      id VARCHAR(100) PRIMARY KEY,

      type VARCHAR(20) NOT NULL DEFAULT 'info',

      message TEXT NOT NULL,

      lu TINYINT(1) NOT NULL DEFAULT 0,

      created_at DATETIME NOT NULL,

      KEY idx_admin_notifications_lu_created (lu, created_at)

    )

  `);

}



async function ensureOwnerMobileNotificationsSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS owner_mobile_notifications (

      id VARCHAR(100) PRIMARY KEY,

      owner_id VARCHAR(100) NOT NULL,

      type VARCHAR(30) NOT NULL DEFAULT 'info',

      message TEXT NOT NULL,

      lu TINYINT(1) NOT NULL DEFAULT 0,

      metadata_json LONGTEXT NULL,

      created_at DATETIME NOT NULL,

      KEY idx_owner_mobile_notifications_owner_created (owner_id, created_at),

      KEY idx_owner_mobile_notifications_owner_read (owner_id, lu, created_at)

    )

  `);

}



async function ensureOwnerPushTokensSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_push_tokens (
      id VARCHAR(100) PRIMARY KEY,

      owner_id VARCHAR(100) NOT NULL,

      token TEXT NOT NULL,

      platform VARCHAR(30) NULL,

      app_version VARCHAR(40) NULL,

      active TINYINT(1) NOT NULL DEFAULT 1,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      last_seen_at DATETIME NOT NULL,

      KEY idx_owner_push_tokens_owner_active (owner_id, active, updated_at)

    )

  `);
}

async function ensureAdminPushTokensSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_push_tokens (
      id VARCHAR(100) PRIMARY KEY,
      admin_user_id VARCHAR(100) NULL,
      admin_email VARCHAR(255) NULL,
      token TEXT NOT NULL,
      platform VARCHAR(30) NULL,
      app_version VARCHAR(40) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_seen_at DATETIME NOT NULL,
      KEY idx_admin_push_tokens_active (active, updated_at),
      KEY idx_admin_push_tokens_admin (admin_user_id, admin_email, active, updated_at)
    )
  `);
}


async function ensureOwnerCalendarPromptSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS owner_calendar_prompt_schedule (

      id VARCHAR(30) PRIMARY KEY,

      enabled TINYINT(1) NOT NULL DEFAULT 0,

      start_date DATE NULL,

      dispatch_hour INT NOT NULL DEFAULT 20,

      dispatch_minute INT NOT NULL DEFAULT 0,

      timezone_name VARCHAR(80) NOT NULL DEFAULT 'Africa/Tunis',

      last_dispatched_local_date DATE NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL

    )

  `);

  await pool.query(`

    CREATE TABLE IF NOT EXISTS owner_calendar_prompts (

      id VARCHAR(100) PRIMARY KEY,

      owner_id VARCHAR(100) NOT NULL,

      prompt_date DATE NOT NULL,

      status VARCHAR(40) NOT NULL DEFAULT 'pending',

      notification_id VARCHAR(100) NULL,

      responded_at DATETIME NULL,

      response_metadata_json LONGTEXT NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      UNIQUE KEY uniq_owner_calendar_prompt_owner_date (owner_id, prompt_date),

      KEY idx_owner_calendar_prompt_status (owner_id, status, prompt_date),

      KEY idx_owner_calendar_prompt_date (prompt_date, status)

    )

  `);

}



async function getOwnerCalendarPromptSchedule() {

  await ensureOwnerCalendarPromptSchema();

  const [rows] = await pool.query(

    `SELECT id, enabled, start_date, dispatch_hour, dispatch_minute, timezone_name,

            last_dispatched_local_date, created_at, updated_at

     FROM owner_calendar_prompt_schedule

     WHERE id = 'default'

     LIMIT 1`

  );

  const existing = rows?.[0];

  if (existing) {

    return normalizeCalendarPromptScheduleRow(existing);

  }

  const now = getAgencySqlDateTime();

  const startDate = getAgencyLocalDate();

  await pool.query(

    `INSERT INTO owner_calendar_prompt_schedule

     (id, enabled, start_date, dispatch_hour, dispatch_minute, timezone_name, last_dispatched_local_date, created_at, updated_at)

     VALUES ('default', 0, ?, 20, 0, ?, NULL, ?, ?)`,

    [startDate, AGENCY_TIME_ZONE, now, now]

  );

  return normalizeCalendarPromptScheduleRow({

    id: 'default',

    enabled: 0,

    start_date: startDate,

    dispatch_hour: 20,

    dispatch_minute: 0,

    timezone_name: AGENCY_TIME_ZONE,

    last_dispatched_local_date: null,

    created_at: now,

    updated_at: now,

  });

}



async function updateOwnerCalendarPromptSchedule({

  enabled,

  startDate,

  dispatchHour,

  dispatchMinute,

}) {

  await ensureOwnerCalendarPromptSchema();

  const now = getAgencySqlDateTime();

  const normalizedStartDate =

    String(startDate || '').trim() || getAgencyLocalDate();

  const normalizedHour = clampCalendarPromptHour(dispatchHour, 20);

  const normalizedMinute = clampCalendarPromptMinute(dispatchMinute, 0);

  await pool.query(

    `INSERT INTO owner_calendar_prompt_schedule

     (id, enabled, start_date, dispatch_hour, dispatch_minute, timezone_name, last_dispatched_local_date, created_at, updated_at)

     VALUES ('default', ?, ?, ?, ?, ?, NULL, ?, ?)

     ON DUPLICATE KEY UPDATE

       enabled = VALUES(enabled),

       start_date = VALUES(start_date),

       dispatch_hour = VALUES(dispatch_hour),

       dispatch_minute = VALUES(dispatch_minute),

       timezone_name = VALUES(timezone_name),

       updated_at = VALUES(updated_at)`,

    [

      enabled ? 1 : 0,

      normalizedStartDate,

      normalizedHour,

      normalizedMinute,

      AGENCY_TIME_ZONE,

      now,

      now,

    ]

  );

  return getOwnerCalendarPromptSchedule();

}



async function fetchOwnerIdentity(ownerId) {

  const normalizedOwnerId = String(ownerId || '').trim();

  if (!normalizedOwnerId) {

    return { ownerId: '', ownerName: '' };

  }

  const [rows] = await pool.query(

    'SELECT id, nom FROM proprietaires WHERE id = ? LIMIT 1',

    [normalizedOwnerId]

  );

  const row = rows?.[0] || null;

  return {

    ownerId: normalizedOwnerId,

    ownerName: String(row?.nom || normalizedOwnerId).trim() || normalizedOwnerId,

  };

}



async function getOwnerCalendarPromptStatuses() {

  await ensureOwnerCalendarPromptSchema();

  const [rows] = await pool.query(

    `SELECT p.id, p.owner_id, p.prompt_date, p.status, p.notification_id,

            DATE_FORMAT(p.responded_at, '%Y-%m-%d %H:%i:%s') AS responded_at,

            p.response_metadata_json,

            DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

            DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,

            o.nom AS owner_name

     FROM owner_calendar_prompts p

     LEFT JOIN proprietaires o ON o.id = p.owner_id

     ORDER BY p.updated_at DESC, p.created_at DESC`

  );

  const byOwner = new Map();

  for (const row of rows || []) {

    const ownerId = String(row.owner_id || '').trim();

    if (!ownerId || byOwner.has(ownerId)) continue;

    let responseMetadata = null;

    try {

      responseMetadata = row.response_metadata_json ? JSON.parse(String(row.response_metadata_json)) : null;

    } catch {

      responseMetadata = null;

    }

    byOwner.set(ownerId, {

      promptId: row.id,

      ownerId,

      ownerName: String(row.owner_name || ownerId).trim() || ownerId,

      promptDate: row.prompt_date || null,

      status: String(row.status || '').trim() || 'pending',

      notificationId: row.notification_id || null,

      respondedAt: row.responded_at || null,

      responseMetadata,

      createdAt: row.created_at || null,

      updatedAt: row.updated_at || null,

    });

  }

  return Array.from(byOwner.values());

}



async function appendOwnerSystemChatMessage({

  ownerId,

  text,

  bienId = null,

  propertyTitle = null,

  metadata = null,

}) {

  const normalizedOwnerId = String(ownerId || '').trim();

  const normalizedText = String(text || '').trim();

  if (!normalizedOwnerId || !normalizedText) return null;

  return appendClientInteraction({

    req: null,

    clientUserId: normalizedOwnerId,

    clientEmail: `${normalizedOwnerId}@owner.local`,

    clientName: normalizedOwnerId,

    type: 'partage',

    bienId: bienId || 'owner-system-chat',

    propertyTitle: propertyTitle || 'Chat proprietaire',

    source: 'system',

    routePath: '/system/calendar-prompt',

    metadata: {

      kind: 'owner_admin_chat',

      ownerId: normalizedOwnerId,

      bienId: bienId || null,

      propertyTitle: propertyTitle || null,

      text: normalizedText,

      createdAt: getAgencySqlDateTime(),

      ...(metadata && typeof metadata === 'object' ? metadata : {}),

    },

  });

}



async function dispatchOwnerCalendarPromptBatch({

  promptDate = getAgencyLocalDate(),

  source = 'scheduled',

  forceRedispatch = false,

}) {

  await ensureOwnerCalendarPromptSchema();

  await ensureOwnerMobileNotificationsSchema();

  const normalizedPromptDate = String(promptDate || '').trim() || getAgencyLocalDate();

  const now = getAgencySqlDateTime();

  const [owners] = await pool.query(

    `SELECT id, nom

     FROM proprietaires

     ORDER BY nom ASC, id ASC`

  );

  let sentOwners = 0;

  let skippedOwners = 0;

  for (const owner of owners || []) {

    const ownerId = String(owner.id || '').trim();

    if (!ownerId) continue;

    const [existingRows] = await pool.query(

      `SELECT id, status, notification_id

       FROM owner_calendar_prompts

       WHERE owner_id = ? AND prompt_date = ?

       LIMIT 1`,

      [ownerId, normalizedPromptDate]

    );

    const existingPrompt = existingRows?.[0] || null;

    if (existingPrompt && !forceRedispatch) {

      skippedOwners += 1;

      continue;

    }

    const promptId = existingPrompt?.id

      ? String(existingPrompt.id)

      : `ocp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const ownerName = String(owner.nom || ownerId).trim() || ownerId;

    const message = 'Vos calendriers sont a jour ?';

    const notificationId = await createOwnerMobileNotification({

      ownerId,

      type: 'warning',

      message,

      metadata: {

        kind: 'calendar_daily_check_prompt',

        promptId,

        ownerId,

        ownerName,

        promptDate: normalizedPromptDate,

        source,

      },

      createdAt: now,

    });

    if (existingPrompt) {

      await pool.query(

        `UPDATE owner_calendar_prompts

         SET status = 'pending',

             notification_id = ?,

             responded_at = NULL,

             response_metadata_json = NULL,

             updated_at = ?

         WHERE id = ?`,

        [notificationId, now, promptId]

      );

    } else {

      await pool.query(

        `INSERT INTO owner_calendar_prompts

         (id, owner_id, prompt_date, status, notification_id, responded_at, response_metadata_json, created_at, updated_at)

         VALUES (?, ?, ?, 'pending', ?, NULL, NULL, ?, ?)`,

        [promptId, ownerId, normalizedPromptDate, notificationId, now, now]

      );

    }

    await pushToOwnerDevices(ownerId, {

      title: 'Mise a jour calendrier',

      body: message,

      data: {

        title: 'Mise a jour calendrier',

        body: message,

        kind: 'calendar_daily_check_prompt',

        promptId,

        ownerId,

        promptDate: normalizedPromptDate,

      },

    });

    sentOwners += 1;

  }

  return {

    promptDate: normalizedPromptDate,

    sentOwners,

    skippedOwners,

    totalOwners: Array.isArray(owners) ? owners.length : 0,

  };

}



let ownerCalendarPromptSchedulerRunning = false;



async function runOwnerCalendarPromptSchedulerTick() {

  if (ownerCalendarPromptSchedulerRunning) return;

  ownerCalendarPromptSchedulerRunning = true;

  try {

    const schedule = await getOwnerCalendarPromptSchedule();

    if (!schedule.enabled) return;

    const localDate = getAgencyLocalDate();

    const localTime = getAgencyLocalTime();

    const hhmm = localTime.slice(0, 5);

    if (schedule.startDate && localDate < schedule.startDate) return;

    if (schedule.lastDispatchedLocalDate === localDate) return;

    if (hhmm < schedule.dailyTime) return;



    const dispatchResult = await dispatchOwnerCalendarPromptBatch({

      promptDate: localDate,

      source: 'scheduled',

    });

    const now = getAgencySqlDateTime();

    await pool.query(

      `UPDATE owner_calendar_prompt_schedule

       SET last_dispatched_local_date = ?, updated_at = ?

       WHERE id = 'default'`,

      [localDate, now]

    );

    await createAdminNotification(

      'info',

      `Relance calendrier quotidienne envoyee (${dispatchResult.sentOwners}/${dispatchResult.totalOwners}) pour ${localDate}`

    );

  } catch (error) {

    console.error('Error during owner calendar prompt scheduler tick:', error);

  } finally {

    ownerCalendarPromptSchedulerRunning = false;

  }

}



async function createOwnerMobileNotification({

  ownerId,

  type = 'info',

  message,

  metadata = null,

  createdAt = getAgencySqlDateTime(),

}) {

  if (!ownerId || !message) return null;

  await ensureOwnerMobileNotificationsSchema();

  const notifId = `omn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await pool.query(

    `INSERT INTO owner_mobile_notifications

     (id, owner_id, type, message, lu, metadata_json, created_at)

     VALUES (?, ?, ?, ?, 0, ?, ?)`,

    [

      notifId,

      String(ownerId).trim(),

      String(type || 'info').trim() || 'info',

      String(message || '').trim(),

      metadata && typeof metadata === 'object' ? JSON.stringify(metadata) : null,

      createdAt,

    ]

  );

  return notifId;

}



async function notifyOwnerAvailabilityRequestForDemand({

  demand,

  actorType = 'system',

  actorId = null,

  historyNote = 'Demande de disponibilite envoyee au proprietaire',

  adminNotificationMessage = null,

  createdAt = getAgencySqlDateTime(),

}) {

  const demandId = String(demand?.id || '').trim();

  const ownerId = String(demand?.proprietaire_id || '').trim();

  if (!demandId || !ownerId) {
    return { sent: 0, skipped: true, reason: 'missing_demand_or_owner' };
  }

  const nextStatus = 'en_attente_reponse_proprietaire';
  const normalizedStartDate = toSqlDateOnly(demand?.start_date);
  const normalizedEndDate = toSqlDateOnly(demand?.end_date);
  const periodLabel = formatStayPeriodFr(
    normalizedStartDate || demand?.start_date,
    normalizedEndDate || demand?.end_date
  );

  await pool.query(

    `UPDATE reservation_demands

     SET status = ?,

         owner_notified_at = ?,

         owner_response_at = NULL,

         updated_at = ?

     WHERE id = ?`,

    [nextStatus, createdAt, createdAt, demandId]

  );

  await appendReservationDemandHistory(

    demandId,

    nextStatus,

    actorType,

    actorId,

    historyNote,

    createdAt

  );

  const notificationMessage = `Confirmez la disponibilite du bien ${String(demand?.bien_titre || demand?.bien_reference || demand?.bien_id || 'bien')} pour la periode ${periodLabel}`;

  await createOwnerMobileNotification({

    ownerId,

    type: 'warning',

    message: notificationMessage,

    metadata: {

      kind: 'reservation_availability_request',

      demandId,

      ownerId,

      bienId: String(demand?.bien_id || '').trim(),

      propertyTitle: String(demand?.bien_titre || demand?.bien_reference || '').trim(),

      startDate: String(normalizedStartDate || '').trim(),

      endDate: String(normalizedEndDate || '').trim(),

      guests: Number(demand?.guests || 1),

      coverMediaUrl: String(demand?.cover_media_url || '').trim(),

    },

    createdAt,

  });

  const pushResult = await pushToOwnerDevices(ownerId, {

    title: 'Demande de disponibilite',

    body: notificationMessage,

    data: {

      title: 'Demande de disponibilite',

      body: notificationMessage,

      kind: 'reservation_availability_request',

      demandId,

      ownerId,

      bienId: String(demand?.bien_id || '').trim(),

    },

  });

  await createAdminNotification(

    'info',

    adminNotificationMessage ||
        `Notification disponibilite envoyee au proprietaire ${ownerId}${pushResult?.sent ? ` (push envoye: ${pushResult.sent})` : ''}`,

    createdAt

  );

  return { sent: Number(pushResult?.sent || 0), notifiedAt: createdAt };

}



async function pushToOwnerDevices(ownerId, payload) {
  if (!firebaseMessaging || !ownerId) return { sent: 0, disabled: true };
  await ensureOwnerPushTokensSchema();

  const [rows] = await pool.query(

    `SELECT id, token

     FROM owner_push_tokens

     WHERE owner_id = ? AND active = 1

     ORDER BY updated_at DESC

     LIMIT 20`,

    [String(ownerId).trim()]

  );

  const tokens = (rows || []).map((row) => String(row.token || '').trim()).filter(Boolean);

  if (tokens.length === 0) return { sent: 0, noTokens: true };



  const dataPayload = Object.fromEntries(

    Object.entries(payload?.data || {}).map(([key, value]) => [

      key,

      String(value == null ? '' : value),

    ])

  );

  const kind = String(dataPayload.kind || '').trim();

  const isAvailabilityRequest = kind === 'reservation_availability_request';



  let sent = 0;

  for (const token of tokens) {

    try {

      const message = {

        token,

        data: dataPayload,

        android: isAvailabilityRequest

          ? {

              priority: 'high',

              ttl: 0,

            }

          : {

              priority: 'high',

              notification: {

                channelId: 'owner_notifications',

                sound: 'default',

                priority: 'high',

                defaultSound: true,

              },

            },

        apns: {

          headers: {

            'apns-priority': '10',

          },

          payload: {

            aps: {

              alert: {

                title: String(payload?.title || 'Dwira'),

                body: String(payload?.body || ''),

              },

              sound: isAvailabilityRequest

                ? 'availability_request.wav'

                : 'default',

              badge: 1,

            },

          },

        },

      };



      if (!isAvailabilityRequest) {

        message.notification = {

          title: String(payload?.title || 'Dwira'),

          body: String(payload?.body || ''),

        };

      }



      await firebaseMessaging.send(message);

      sent += 1;

    } catch (error) {

      const code = String(error?.code || '');

      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {

        await pool.query(

          'UPDATE owner_push_tokens SET active = 0, updated_at = ?, last_seen_at = ? WHERE owner_id = ? AND token = ?',

          [getAgencySqlDateTime(), getAgencySqlDateTime(), String(ownerId).trim(), token]

        ).catch(() => {});

      }

      console.warn('[FCM] send failed:', code || error?.message || error);

    }

  }
  return { sent };
}

async function pushToAdminDevices(payload) {
  if (!firebaseMessaging) return { sent: 0, disabled: true };
  await ensureAdminPushTokensSchema();
  const [rows] = await pool.query(
    `SELECT id, token
     FROM admin_push_tokens
     WHERE active = 1
     ORDER BY updated_at DESC
     LIMIT 50`
  );
  const targets = (rows || [])
    .map((row) => ({
      id: String(row.id || '').trim(),
      token: String(row.token || '').trim(),
    }))
    .filter((row) => row.id && row.token);
  if (targets.length === 0) return { sent: 0, noTokens: true };

  const dataPayload = Object.fromEntries(
    Object.entries(payload?.data || {}).map(([key, value]) => [
      key,
      String(value == null ? '' : value),
    ])
  );
  const title = String(payload?.title || 'Alerte admin');
  const body = String(payload?.body || '');

  let sent = 0;
  for (const target of targets) {
    try {
      await firebaseMessaging.send({
        token: target.token,
        notification: {
          title,
          body,
        },
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'admin_alerts',
            sound: 'availability_request',
            priority: 'high',
            defaultSound: false,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: { title, body },
              sound: 'availability_request.wav',
              badge: 1,
            },
          },
        },
      });
      sent += 1;
    } catch (error) {
      const code = String(error?.code || '');
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        await pool.query(
          'UPDATE admin_push_tokens SET active = 0, updated_at = ?, last_seen_at = ? WHERE id = ?',
          [getAgencySqlDateTime(), getAgencySqlDateTime(), target.id]
        ).catch(() => {});
      }
      console.warn('[FCM] admin send failed:', code || error?.message || error);
    }
  }
  return { sent };
}

async function ensureSecurityAuditSchema() {
  await pool.query(`

    CREATE TABLE IF NOT EXISTS security_audit_logs (

      id VARCHAR(100) PRIMARY KEY,

      event_type VARCHAR(80) NOT NULL,

      severity VARCHAR(20) NOT NULL DEFAULT 'info',

      success TINYINT(1) NOT NULL DEFAULT 0,

      http_status INT NULL,

      method VARCHAR(10) NULL,

      path VARCHAR(500) NULL,

      ip VARCHAR(80) NULL,

      user_agent VARCHAR(500) NULL,

      user_id VARCHAR(100) NULL,

      user_email VARCHAR(255) NULL,

      message VARCHAR(1000) NULL,

      metadata_json LONGTEXT NULL,

      created_at DATETIME NOT NULL,

      KEY idx_security_audit_created (created_at),

      KEY idx_security_audit_event (event_type, created_at),

      KEY idx_security_audit_user (user_id, user_email, created_at)

    )

  `);

}



async function ensureAdminDataExportsSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS admin_data_exports (

      id VARCHAR(100) PRIMARY KEY,

      dataset VARCHAR(60) NOT NULL,

      format VARCHAR(20) NOT NULL DEFAULT 'csv',

      date_from DATETIME NULL,

      date_to DATETIME NULL,

      row_count INT NOT NULL DEFAULT 0,

      exported_by_user_id VARCHAR(100) NULL,

      exported_by_email VARCHAR(255) NULL,

      created_at DATETIME NOT NULL,

      KEY idx_admin_data_exports_dataset_created (dataset, created_at),

      KEY idx_admin_data_exports_created (created_at)

    )

  `);

}



async function recordAdminDataExport({ dataset, format = 'csv', dateFrom = null, dateTo = null, rowCount = 0, req, user = null }) {

  await ensureAdminDataExportsSchema();

  const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const actor = user || req?.authUser || null;

  const now = getAgencySqlDateTime();

  await pool.query(

    `INSERT INTO admin_data_exports

     (id, dataset, format, date_from, date_to, row_count, exported_by_user_id, exported_by_email, created_at)

     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,

    [

      id,

      String(dataset || '').trim().slice(0, 60),

      String(format || 'csv').trim().slice(0, 20),

      dateFrom || null,

      dateTo || null,

      Math.max(0, Number(rowCount || 0)),

      actor?.id ? String(actor.id).trim() : null,

      actor?.email ? String(actor.email).trim().toLowerCase() : null,

      now,

    ]

  );

}



async function ensureClientelesTasksSchema() {

  await pool.query(`

    CREATE TABLE IF NOT EXISTS clienteles_tasks (

      id VARCHAR(100) PRIMARY KEY,

      source_table VARCHAR(50) NOT NULL,

      source_id VARCHAR(100) NOT NULL,

      task_type VARCHAR(100) NOT NULL,

      severity VARCHAR(20) NOT NULL DEFAULT 'info',

      title VARCHAR(255) NOT NULL,

      detail TEXT NULL,

      due_date DATETIME NULL,

      related_entity_type VARCHAR(50) NULL,

      related_entity_id VARCHAR(100) NULL,

      status VARCHAR(20) NOT NULL DEFAULT 'open',

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      UNIQUE KEY uniq_client_task (source_table, source_id, task_type, related_entity_type, related_entity_id)

    )

  `);

}



async function ensureReservationDemandSchema() {

  const columnExists = async (tableName, columnName) => {

    const [rows] = await pool.query(

      `

      SELECT 1

      FROM information_schema.COLUMNS

      WHERE TABLE_SCHEMA = DATABASE()

        AND TABLE_NAME = ?

        AND COLUMN_NAME = ?

      LIMIT 1

      `,

      [tableName, columnName]

    );

    return rows.length > 0;

  };

  const getColumnDataType = async (tableName, columnName) => {

    const [rows] = await pool.query(

      `

      SELECT DATA_TYPE AS data_type

      FROM information_schema.COLUMNS

      WHERE TABLE_SCHEMA = DATABASE()

        AND TABLE_NAME = ?

        AND COLUMN_NAME = ?

      LIMIT 1

      `,

      [tableName, columnName]

    );

    return String(rows?.[0]?.data_type || '').trim().toLowerCase();

  };



  await pool.query(`

    CREATE TABLE IF NOT EXISTS reservation_demands (

      id VARCHAR(100) PRIMARY KEY,

      bien_id VARCHAR(100) NOT NULL,

      request_type VARCHAR(20) NOT NULL DEFAULT 'reservation',

      unavailable_date_id VARCHAR(100) NULL,

      client_user_id VARCHAR(100) NULL,

      client_email VARCHAR(255) NULL,

      client_name VARCHAR(255) NULL,

      proprietaire_id VARCHAR(100) NULL,

      owner_user_id VARCHAR(100) NULL,

      start_date DATE NOT NULL,

      end_date DATE NOT NULL,

      guests INT NOT NULL DEFAULT 1,

      adult_guests INT NOT NULL DEFAULT 1,

      child_guests INT NOT NULL DEFAULT 0,

      payment_mode VARCHAR(20) NULL,

      pricing_amicale_id VARCHAR(64) NULL,

      amicale_matricule VARCHAR(80) NULL,

      amicale_phone VARCHAR(40) NULL,

      amicale_code VARCHAR(80) NULL,

      total_amount DECIMAL(12,2) NULL,

      amount_due_now DECIMAL(12,2) NULL,

      selected_fixed_services_json LONGTEXT NULL,

      selected_variable_services_json LONGTEXT NULL,

      variable_services_quote_json LONGTEXT NULL,

      variable_services_quote_total DECIMAL(12,2) NULL,

      variable_services_quote_status VARCHAR(30) NULL,

      status VARCHAR(80) NOT NULL,

      amicale_validation_at DATETIME NULL,

      agency_validation_at DATETIME NULL,

      voucher_id VARCHAR(100) NULL,

      voucher_number VARCHAR(80) NULL,

      voucher_url VARCHAR(700) NULL,

      voucher_generated_at DATETIME NULL,

      owner_notified_at DATETIME NULL,

      owner_response_at DATETIME NULL,

      client_confirmation_clicked_at DATETIME NULL,

      identity_document_type VARCHAR(30) NULL,

      identity_document_number VARCHAR(80) NULL,

      identity_first_name VARCHAR(120) NULL,

      identity_last_name VARCHAR(120) NULL,

      identity_document_country VARCHAR(80) NULL,

      identity_document_image_url VARCHAR(500) NULL,

      identity_ocr_text LONGTEXT NULL,

      identity_submitted_at DATETIME NULL,

      contract_generated_at DATETIME NULL,

      admin_note TEXT NULL,

      client_note TEXT NULL,

      finalization_due_at DATETIME NULL,

      contract_id VARCHAR(100) NULL,

      payment_id VARCHAR(100) NULL,

      reservation_payment_id VARCHAR(100) NULL,

      reservation_payment_paid_at DATETIME NULL,

      services_payment_id VARCHAR(100) NULL,

      services_payment_paid_at DATETIME NULL,

      flouci_checkout_id VARCHAR(120) NULL,

      flouci_scope VARCHAR(20) NULL,

      flouci_status VARCHAR(40) NULL,

      flouci_checkout_url VARCHAR(700) NULL,

      flouci_verified_at DATETIME NULL,

      payment_receipt_image_url VARCHAR(500) NULL,

      payment_receipt_uploaded_at DATETIME NULL,

      payment_receipt_note TEXT NULL,

      created_at DATETIME NOT NULL,

      updated_at DATETIME NOT NULL,

      KEY idx_reservation_demands_client (client_user_id, client_email),

      KEY idx_reservation_demands_bien (bien_id),

      KEY idx_reservation_demands_pricing_amicale (pricing_amicale_id),

      KEY idx_reservation_demands_amicale_status (pricing_amicale_id, status),

      KEY idx_reservation_demands_owner (proprietaire_id, owner_user_id),

      KEY idx_reservation_demands_voucher (voucher_id),

      KEY idx_reservation_demands_status (status)

    )

  `);



  await pool.query(`

    CREATE TABLE IF NOT EXISTS reservation_demand_history (

      id VARCHAR(100) PRIMARY KEY,

      demand_id VARCHAR(100) NOT NULL,

      status VARCHAR(80) NOT NULL,

      actor_type VARCHAR(30) NOT NULL,

      actor_id VARCHAR(100) NULL,

      note TEXT NULL,

      created_at DATETIME NOT NULL,

      KEY idx_reservation_demand_history_demand (demand_id, created_at)

    )

  `);



  // Backward compatibility: older prod schemas may still have ENUM status values.

  // Convert to VARCHAR so new statuses (e.g. demande_annulee_client) are persisted.

  const reservationStatusType = await getColumnDataType('reservation_demands', 'status');

  if (reservationStatusType && reservationStatusType !== 'varchar') {

    await pool.query('ALTER TABLE reservation_demands MODIFY COLUMN status VARCHAR(80) NOT NULL');

  }

  const historyStatusType = await getColumnDataType('reservation_demand_history', 'status');

  if (historyStatusType && historyStatusType !== 'varchar') {

    await pool.query('ALTER TABLE reservation_demand_history MODIFY COLUMN status VARCHAR(80) NOT NULL');

  }



  if (!(await columnExists('unavailable_dates', 'reservation_demand_id'))) {

    await pool.query('ALTER TABLE unavailable_dates ADD COLUMN reservation_demand_id VARCHAR(100) NULL AFTER status');

  }

  if (!(await columnExists('unavailable_dates', 'payment_deadline'))) {

    await pool.query('ALTER TABLE unavailable_dates ADD COLUMN payment_deadline DATETIME NULL AFTER reservation_demand_id');

  }

  if (!(await columnExists('reservation_demands', 'request_type'))) {

    await pool.query("ALTER TABLE reservation_demands ADD COLUMN request_type VARCHAR(20) NOT NULL DEFAULT 'reservation' AFTER bien_id");

  }

  if (!(await columnExists('reservation_demands', 'unavailable_date_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN unavailable_date_id VARCHAR(100) NULL AFTER request_type');

  }

  if (!(await columnExists('reservation_demands', 'client_user_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN client_user_id VARCHAR(100) NULL AFTER unavailable_date_id');

  }

  if (!(await columnExists('reservation_demands', 'client_email'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN client_email VARCHAR(255) NULL AFTER client_user_id');

  }

  if (!(await columnExists('reservation_demands', 'client_name'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN client_name VARCHAR(255) NULL AFTER client_email');

  }

  if (!(await columnExists('reservation_demands', 'proprietaire_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN proprietaire_id VARCHAR(100) NULL AFTER client_name');

  }

  if (!(await columnExists('reservation_demands', 'owner_user_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN owner_user_id VARCHAR(100) NULL AFTER proprietaire_id');

  }

  if (!(await columnExists('reservation_demands', 'owner_notified_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN owner_notified_at DATETIME NULL AFTER status');

  }

  if (!(await columnExists('reservation_demands', 'owner_response_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN owner_response_at DATETIME NULL AFTER owner_notified_at');

  }

  if (!(await columnExists('reservation_demands', 'client_confirmation_clicked_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN client_confirmation_clicked_at DATETIME NULL AFTER owner_response_at');

  }

  if (!(await columnExists('reservation_demands', 'payment_mode'))) {

    await pool.query("ALTER TABLE reservation_demands ADD COLUMN payment_mode VARCHAR(20) NULL AFTER guests");

  }

  if (!(await columnExists('reservation_demands', 'pricing_amicale_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN pricing_amicale_id VARCHAR(64) NULL AFTER payment_mode');

  }

  if (!(await columnExists('reservation_demands', 'amicale_matricule'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN amicale_matricule VARCHAR(80) NULL AFTER pricing_amicale_id');

  }

  if (!(await columnExists('reservation_demands', 'amicale_phone'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN amicale_phone VARCHAR(40) NULL AFTER amicale_matricule');

  }

  if (!(await columnExists('reservation_demands', 'amicale_code'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN amicale_code VARCHAR(80) NULL AFTER amicale_phone');

  }

  if (!(await columnExists('reservation_demands', 'adult_guests'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN adult_guests INT NOT NULL DEFAULT 1 AFTER guests');

  }

  if (!(await columnExists('reservation_demands', 'child_guests'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN child_guests INT NOT NULL DEFAULT 0 AFTER adult_guests');

  }

  if (!(await columnExists('reservation_demands', 'amicale_validation_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN amicale_validation_at DATETIME NULL AFTER status');

  }

  if (!(await columnExists('reservation_demands', 'agency_validation_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN agency_validation_at DATETIME NULL AFTER amicale_validation_at');

  }

  if (!(await columnExists('reservation_demands', 'voucher_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN voucher_id VARCHAR(100) NULL AFTER agency_validation_at');

  }

  if (!(await columnExists('reservation_demands', 'voucher_number'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN voucher_number VARCHAR(80) NULL AFTER voucher_id');

  }

  if (!(await columnExists('reservation_demands', 'voucher_url'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN voucher_url VARCHAR(700) NULL AFTER voucher_number');

  }

  if (!(await columnExists('reservation_demands', 'voucher_generated_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN voucher_generated_at DATETIME NULL AFTER voucher_url');

  }

  if (!(await columnExists('reservation_demands', 'total_amount'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN total_amount DECIMAL(12,2) NULL AFTER payment_mode');

  }

  if (!(await columnExists('reservation_demands', 'amount_due_now'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN amount_due_now DECIMAL(12,2) NULL AFTER total_amount');

  }

  if (!(await columnExists('reservation_demands', 'selected_fixed_services_json'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN selected_fixed_services_json LONGTEXT NULL AFTER amount_due_now');

  }

  if (!(await columnExists('reservation_demands', 'selected_variable_services_json'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN selected_variable_services_json LONGTEXT NULL AFTER selected_fixed_services_json');

  }

  if (!(await columnExists('reservation_demands', 'variable_services_quote_json'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN variable_services_quote_json LONGTEXT NULL AFTER selected_variable_services_json');

  }

  if (!(await columnExists('reservation_demands', 'variable_services_quote_total'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN variable_services_quote_total DECIMAL(12,2) NULL AFTER variable_services_quote_json');

  }

  if (!(await columnExists('reservation_demands', 'variable_services_quote_status'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN variable_services_quote_status VARCHAR(30) NULL AFTER variable_services_quote_total');

  }

  if (!(await columnExists('reservation_demands', 'reservation_payment_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN reservation_payment_id VARCHAR(100) NULL AFTER payment_id');

  }

  if (!(await columnExists('reservation_demands', 'reservation_payment_paid_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN reservation_payment_paid_at DATETIME NULL AFTER reservation_payment_id');

  }

  if (!(await columnExists('reservation_demands', 'services_payment_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN services_payment_id VARCHAR(100) NULL AFTER reservation_payment_paid_at');

  }

  if (!(await columnExists('reservation_demands', 'services_payment_paid_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN services_payment_paid_at DATETIME NULL AFTER services_payment_id');

  }

  if (!(await columnExists('reservation_demands', 'flouci_checkout_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN flouci_checkout_id VARCHAR(120) NULL AFTER services_payment_paid_at');

  }

  if (!(await columnExists('reservation_demands', 'flouci_scope'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN flouci_scope VARCHAR(20) NULL AFTER flouci_checkout_id');

  }

  if (!(await columnExists('reservation_demands', 'flouci_status'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN flouci_status VARCHAR(40) NULL AFTER flouci_scope');

  }

  if (!(await columnExists('reservation_demands', 'flouci_checkout_url'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN flouci_checkout_url VARCHAR(700) NULL AFTER flouci_status');

  }

  if (!(await columnExists('reservation_demands', 'flouci_verified_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN flouci_verified_at DATETIME NULL AFTER flouci_checkout_url');

  }

  if (!(await columnExists('reservation_demands', 'payment_receipt_image_url'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN payment_receipt_image_url VARCHAR(500) NULL AFTER services_payment_paid_at');

  }

  if (!(await columnExists('reservation_demands', 'payment_receipt_uploaded_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN payment_receipt_uploaded_at DATETIME NULL AFTER payment_receipt_image_url');

  }

  if (!(await columnExists('reservation_demands', 'payment_receipt_note'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN payment_receipt_note TEXT NULL AFTER payment_receipt_uploaded_at');

  }

  if (!(await columnExists('reservation_demands', 'identity_document_type'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_document_type VARCHAR(30) NULL AFTER client_confirmation_clicked_at');

  }

  if (!(await columnExists('reservation_demands', 'identity_document_number'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_document_number VARCHAR(80) NULL AFTER identity_document_type');

  }

  if (!(await columnExists('reservation_demands', 'identity_first_name'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_first_name VARCHAR(120) NULL AFTER identity_document_number');

  }

  if (!(await columnExists('reservation_demands', 'identity_last_name'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_last_name VARCHAR(120) NULL AFTER identity_first_name');

  }

  if (!(await columnExists('reservation_demands', 'identity_document_country'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_document_country VARCHAR(80) NULL AFTER identity_last_name');

  }

  if (!(await columnExists('reservation_demands', 'identity_document_image_url'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_document_image_url VARCHAR(500) NULL AFTER identity_document_country');

  }

  if (!(await columnExists('reservation_demands', 'identity_ocr_text'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_ocr_text LONGTEXT NULL AFTER identity_document_image_url');

  }

  if (!(await columnExists('reservation_demands', 'identity_submitted_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN identity_submitted_at DATETIME NULL AFTER identity_ocr_text');

  }

  if (!(await columnExists('reservation_demands', 'contract_generated_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN contract_generated_at DATETIME NULL AFTER identity_submitted_at');

  }

  if (!(await columnExists('reservation_demands', 'admin_note'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN admin_note TEXT NULL AFTER contract_generated_at');

  }

  if (!(await columnExists('reservation_demands', 'client_note'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN client_note TEXT NULL AFTER admin_note');

  }

  if (!(await columnExists('reservation_demands', 'finalization_due_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN finalization_due_at DATETIME NULL AFTER client_note');

  }

  if (!(await columnExists('reservation_demands', 'contract_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN contract_id VARCHAR(100) NULL AFTER finalization_due_at');

  }

  if (!(await columnExists('reservation_demands', 'payment_id'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN payment_id VARCHAR(100) NULL AFTER contract_id');

  }

  if (!(await columnExists('reservation_demands', 'created_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER payment_receipt_note');

  }

  if (!(await columnExists('reservation_demands', 'updated_at'))) {

    await pool.query('ALTER TABLE reservation_demands ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');

  }

}



async function ensureContractsSchema() {

  const [rows] = await pool.query(

    `

    SELECT 1

    FROM information_schema.COLUMNS

    WHERE TABLE_SCHEMA = DATABASE()

      AND TABLE_NAME = 'contrats'

      AND COLUMN_NAME = 'owner_url_pdf'

    LIMIT 1

    `

  );

  if (!rows[0]) {

    await pool.query('ALTER TABLE contrats ADD COLUMN owner_url_pdf VARCHAR(500) NULL AFTER url_pdf');

  }

  const [originRows] = await pool.query(

    `

    SELECT 1

    FROM information_schema.COLUMNS

    WHERE TABLE_SCHEMA = DATABASE()

      AND TABLE_NAME = 'contrats'

      AND COLUMN_NAME = 'origine'

    LIMIT 1

    `

  );

  if (!originRows[0]) {

    await pool.query("ALTER TABLE contrats ADD COLUMN origine VARCHAR(20) NOT NULL DEFAULT 'automatique' AFTER owner_url_pdf");

  }

}



app.delete('/api/caracteristiques/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const featureId = String(req.params.id || '').trim();

    if (!featureId) {

      return res.status(400).json({ error: 'id requis' });

    }



    const hasMode = req.query.mode_bien || req.query.mode;

    const hasType = req.query.type_bien || req.query.type;

    const normalizedMode = normalizeBienMode(hasMode);

    const normalizedType = normalizeBienType(hasType);



    if ((hasMode && !hasType) || (!hasMode && hasType)) {

      return res.status(400).json({ error: 'mode_bien et type_bien requis ensemble' });

    }



    if (hasMode && hasType) {

      const validation = validateModeAndType(normalizedMode, normalizedType);

      if (!validation.valid) {

        return res.status(400).json({ error: validation.error });

      }

      await pool.query(

        'DELETE FROM caracteristique_contextes WHERE caracteristique_id = ? AND mode_bien = ? AND type_bien = ?',

        [featureId, normalizedMode, normalizedType]

      );

      await pool.query(

        'DELETE FROM modifier_onglets WHERE caracteristique_id = ? AND mode_bien = ? AND type_bien = ?',

        [featureId, normalizedMode, normalizedType]

      );

    } else {

      await pool.query('DELETE FROM caracteristique_contextes WHERE caracteristique_id = ?', [featureId]);

      await pool.query('DELETE FROM modifier_onglets WHERE caracteristique_id = ?', [featureId]);

      await pool.query('DELETE FROM bien_caracteristiques WHERE caracteristique_id = ?', [featureId]);

      await pool.query('DELETE FROM caracteristiques WHERE id = ?', [featureId]);

      return res.json({ message: 'Caracteristique supprimee' });

    }



    const [ctxRows] = await pool.query(

      'SELECT COUNT(*) AS total FROM caracteristique_contextes WHERE caracteristique_id = ?',

      [featureId]

    );

    const [linkRows] = await pool.query(

      'SELECT COUNT(*) AS total FROM bien_caracteristiques WHERE caracteristique_id = ?',

      [featureId]

    );

    const ctxCount = Number(ctxRows?.[0]?.total || 0);

    const linkCount = Number(linkRows?.[0]?.total || 0);



    if (ctxCount === 0 && linkCount === 0) {

      await pool.query('DELETE FROM caracteristiques WHERE id = ?', [featureId]);

    }



    res.json({ message: 'Caracteristique supprimee du contexte' });

  } catch (error) {

    console.error('Error deleting caracteristique:', error);

    res.status(500).json({ error: 'Failed to delete caracteristique' });

  }

});



app.put('/api/caracteristiques/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureBiensWorkflowSchemaSafe();

    const featureId = String(req.params.id || '').trim();

    const mode = normalizeBienMode(req.body.mode_bien || req.body.mode);

    const type = normalizeBienType(req.body.type_bien || req.body.type);

    const bienId = String(req.body.bien_id || '').trim() || null;

    const applyToAll = req.body.apply_to_all === true || String(req.body.apply_to_all || '').trim() === '1';

    const nom = String(req.body.nom || '').trim();

    const normalizedNom = nom

      .toLowerCase()

      .normalize('NFD')

      .replace(/[\u0300-\u036f]/g, '')

      .replace(/\s+/g, ' ')

      .trim();

    const featureType = ['simple', 'choix_multiple', 'plusieurs_choix', 'valeur', 'texte'].includes(String(req.body.type_caracteristique || '').trim())

      ? String(req.body.type_caracteristique).trim()

      : 'simple';

    const normalizedChoices = Array.isArray(req.body.choix)

      ? Array.from(new Set(req.body.choix.map((item) => String(item || '').trim()).filter(Boolean)))

      : [];

    const normalizedUnit = String(req.body.unite || '').trim() || null;

    const normalizedIconName = String(req.body.icon_name || '').trim() || null;

    const normalizedOngletId = String(req.body.onglet_id || '').trim() || null;

    const visibleClient = Number(req.body.visibilite_client) === 0 ? 0 : 1;



    if (!featureId) return res.status(400).json({ error: 'id requis' });

    if (!nom) return res.status(400).json({ error: 'nom requis' });

    if (normalizedNom.startsWith('limite personnes') && normalizedNom.includes('nuit')) {

      return res.status(400).json({ error: "La caracteristique 'Limite personnes (nuit)' est obsolete. Utilisez Capacite max adultes et Capacite enfants." });

    }

    const validation = validateModeAndType(mode, type);

    if (!validation.valid) return res.status(400).json({ error: validation.error });

    if ((featureType === 'choix_multiple' || featureType === 'plusieurs_choix') && normalizedChoices.length === 0) {

      return res.status(400).json({ error: 'choix requis pour type choix_multiple/plusieurs_choix' });

    }

    if (featureType !== 'choix_multiple' && featureType !== 'plusieurs_choix' && normalizedChoices.length > 0) {

      return res.status(400).json({ error: 'choix autorises uniquement pour type choix_multiple/plusieurs_choix' });

    }

    if (featureType !== 'valeur' && normalizedUnit) {

      return res.status(400).json({ error: 'unite autorisee uniquement pour type valeur' });

    }

    if (normalizedOngletId) {

      const [ongletRows] = await pool.query(

        'SELECT id FROM caracteristique_onglets WHERE id = ? AND mode_bien = ? AND type_bien = ? LIMIT 1',

        [normalizedOngletId, mode, type]

      );

      if (!ongletRows?.[0]) {

        return res.status(400).json({ error: 'onglet invalide pour ce mode/type' });

      }

    }



    if (bienId && !applyToAll) {

      const [bienRows] = await pool.query('SELECT id FROM biens WHERE id = ? LIMIT 1', [bienId]);

      if (!bienRows?.[0]) {

        return res.status(404).json({ error: 'bien introuvable' });

      }

      await pool.query(

        `INSERT INTO bien_caracteristiques (

          bien_id, caracteristique_id, visibilite_client, override_nom, override_type_caracteristique, override_unite, override_onglet_id

        ) VALUES (?, ?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE

          visibilite_client = VALUES(visibilite_client),

          override_nom = VALUES(override_nom),

          override_type_caracteristique = VALUES(override_type_caracteristique),

          override_unite = VALUES(override_unite),

          override_onglet_id = VALUES(override_onglet_id)`,

        [

          bienId,

          featureId,

          visibleClient,

          nom,

          featureType,

          featureType === 'valeur' ? normalizedUnit : null,

          normalizedOngletId,

        ]

      );



      const [rows] = await pool.query(

        `SELECT c.id,

            COALESCE(bc.override_nom, c.nom) AS nom,

            COALESCE(bc.override_type_caracteristique, c.type_caracteristique) AS type_caracteristique,

            c.choix_json,

            COALESCE(bc.override_unite, c.unite) AS unite,

            c.icon_name,

            COALESCE(bc.override_onglet_id, mo.onglet_id) AS onglet_id,

            co.nom AS onglet_nom,

            COALESCE(bc.visibilite_client, c.visibilite_client, 1) AS visibilite_client

         FROM caracteristiques c

         LEFT JOIN modifier_onglets mo

           ON mo.caracteristique_id = c.id

          AND mo.mode_bien = ?

          AND mo.type_bien = ?

         LEFT JOIN bien_caracteristiques bc

           ON bc.caracteristique_id = c.id

          AND bc.bien_id = ?

         LEFT JOIN caracteristique_onglets co

           ON co.id = COALESCE(bc.override_onglet_id, mo.onglet_id)

         WHERE c.id = ?

         LIMIT 1`,

        [mode, type, bienId, featureId]

      );

      return res.json(rows[0] || null);

    }



    await pool.query(

      'UPDATE caracteristiques SET nom = ?, type_caracteristique = ?, choix_json = ?, unite = ?, icon_name = ?, visibilite_client = ? WHERE id = ?',

      [nom, featureType, (featureType === 'choix_multiple' || featureType === 'plusieurs_choix') ? JSON.stringify(normalizedChoices) : null, featureType === 'valeur' ? normalizedUnit : null, normalizedIconName, visibleClient, featureId]

    );

    await pool.query(

      'UPDATE caracteristique_contextes SET onglet_id = ? WHERE caracteristique_id = ? AND mode_bien = ? AND type_bien = ?',

      [normalizedOngletId, featureId, mode, type]

    );

    if (normalizedOngletId) {

      await pool.query(

        `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)

         VALUES (?, ?, ?, ?, ?, 0)

         ON DUPLICATE KEY UPDATE onglet_id = VALUES(onglet_id), ordre = VALUES(ordre)`,

        [buildShortId('mo', mode, type, featureId), mode, type, normalizedOngletId, featureId]

      );

    } else {

      await pool.query(

        'DELETE FROM modifier_onglets WHERE mode_bien = ? AND type_bien = ? AND caracteristique_id = ?',

        [mode, type, featureId]

      );

    }

    if (applyToAll) {

      await pool.query(

        `UPDATE bien_caracteristiques bc

         INNER JOIN biens b ON b.id = bc.bien_id

         SET bc.visibilite_client = ?,

             bc.override_nom = ?,

             bc.override_type_caracteristique = ?,

             bc.override_unite = ?,

             bc.override_onglet_id = ?

         WHERE bc.caracteristique_id = ?

           AND b.mode = ?

           AND b.type = ?`,

        [visibleClient, nom, featureType, featureType === 'valeur' ? normalizedUnit : null, normalizedOngletId, featureId, mode, type]

      );

    }

    const [rows] = await pool.query('SELECT * FROM caracteristiques WHERE id = ? LIMIT 1', [featureId]);

    res.json(rows[0] || null);

  } catch (error) {

    console.error('Error updating caracteristique:', error);

    res.status(500).json({ error: 'Failed to update caracteristique' });

  }

});



app.post('/api/biens/:id/caracteristiques', requireAdminSession, async (req, res) => {

  try {

    const { caracteristique_ids } = req.body;

    if (!Array.isArray(caracteristique_ids)) {

      return res.status(400).json({ error: 'caracteristique_ids must be an array' });

    }



    await syncBienCaracteristiques(req.params.id, caracteristique_ids);



    res.json({ message: 'Caracteristiques updated' });

  } catch (error) {

    console.error('Error updating bien caracteristiques:', error);

    if (String(error?.message || '').includes('Invalid caracteristique_ids')) {

      return res.status(400).json({ error: error.message });

    }

    res.status(500).json({ error: 'Failed to update bien caracteristiques' });

  }

});



// Upload media endpoint

app.post('/api/upload', requireAuthenticatedSession, uploadMediaMiddleware, async (req, res) => {

  try {

    console.log('[UPLOAD] request received', {

      hasFile: Boolean(req.file),

      filename: req.file?.originalname || null,

      mimetype: req.file?.mimetype || null,

      uploadScope: req.body?.upload_scope || null,

      amicaleCode: req.body?.amicale_code || null,

      amicaleName: req.body?.amicale_name || null,

    });

    if (!req.file) {

      return res.status(400).json({ error: 'No file uploaded' });

    }



    const mediaType = String(req.file.mimetype || '').startsWith('video/') ? 'video' : 'image';

    const localUrl = `/uploads/${req.file.filename}`;

    const bienIdRaw = Array.isArray(req.body?.bien_id) ? req.body.bien_id[0] : req.body?.bien_id;

    const bienRefRaw = Array.isArray(req.body?.bien_reference) ? req.body.bien_reference[0] : req.body?.bien_reference;

    const uploadScopeRaw = Array.isArray(req.body?.upload_scope) ? req.body.upload_scope[0] : req.body?.upload_scope;

    const zoneIdRaw = Array.isArray(req.body?.zone_id) ? req.body.zone_id[0] : req.body?.zone_id;

    const zoneRefRaw = Array.isArray(req.body?.zone_reference) ? req.body.zone_reference[0] : req.body?.zone_reference;

    const amicaleIdRaw = Array.isArray(req.body?.amicale_id) ? req.body.amicale_id[0] : req.body?.amicale_id;

    const amicaleCodeRaw = Array.isArray(req.body?.amicale_code) ? req.body.amicale_code[0] : req.body?.amicale_code;

    const amicaleNameRaw = Array.isArray(req.body?.amicale_name) ? req.body.amicale_name[0] : req.body?.amicale_name;

    const bienId = String(bienIdRaw || '').trim();

    const bienReference = String(bienRefRaw || '').trim();

    const uploadScope = String(uploadScopeRaw || '').trim().toLowerCase();

    const zoneId = String(zoneIdRaw || '').trim();

    const zoneReference = String(zoneRefRaw || '').trim();

    const amicaleId = String(amicaleIdRaw || '').trim();

    const amicaleCode = String(amicaleCodeRaw || '').trim();

    const amicaleName = String(amicaleNameRaw || '').trim();

    const folderKey = (

      uploadScope === 'zone'

        ? (zoneReference || zoneId || 'unassigned-zone')

        : uploadScope === 'amicale'

          ? (amicaleCode || amicaleName || amicaleId || 'unassigned-amicale')

        : (bienReference || bienId || 'unassigned')

    )

      .toLowerCase()

      .replace(/[^a-z0-9._-]+/g, '-')

      .replace(/-+/g, '-')

      .replace(/^-+|-+$/g, '') || 'unassigned';



    const scopeFolder =

      uploadScope === 'zone' ? 'zones'

      : uploadScope === 'amicale' ? 'amicales'

      : 'biens';

    const dynamicFolder = `${CLOUDINARY_UPLOAD_FOLDER ? `${CLOUDINARY_UPLOAD_FOLDER}/` : ''}${scopeFolder}/${folderKey}`;

    const candidateProviders = getUploadProviderCandidates(mediaType);

    let lastProviderError = null;



    for (const provider of candidateProviders) {

      if (provider === 'r2') {

        try {

          const uploaded = await uploadLocalMediaToR2({

            localFilePath: req.file.path,

            filename: req.file.filename,

            mimetype: req.file.mimetype,

            folderKey,

            uploadScope: uploadScope || 'bien',

            mediaType,

          });

          if (uploaded?.url) {

            try {

              fs.unlinkSync(req.file.path);

            } catch {

              // keep local file if deletion fails

            }

            return res.json({

              success: true,

              url: uploaded.url,

              provider: 'r2',

              objectKey: uploaded.objectKey || null,

              filename: req.file.filename,

              mimetype: req.file.mimetype,

              mediaType,

              scope: uploadScope || 'bien',

            });

          }

        } catch (r2Error) {

          lastProviderError = r2Error;

          console.error('R2 upload failed, trying next provider:', r2Error?.message || r2Error);

          continue;

        }

      }



      if (provider === 'cloudflare') {

        try {

          const uploaded = mediaType === 'video'

            ? await uploadLocalVideoToCloudflare({

                localFilePath: req.file.path,

                filename: req.file.filename,

              })

            : await uploadLocalImageToCloudflare({

                localFilePath: req.file.path,

                filename: req.file.filename,

                folderKey,

                uploadScope: uploadScope || 'bien',

              });

          if (uploaded?.url) {

            try {

              fs.unlinkSync(req.file.path);

            } catch {

              // keep local file if deletion fails

            }

            return res.json({

              success: true,

              url: uploaded.url,

              provider: uploaded.provider || 'cloudflare',

              imageId: uploaded.imageId || null,

              videoUid: uploaded.videoUid || null,

              filename: req.file.filename,

              mimetype: req.file.mimetype,

              mediaType,

              scope: uploadScope || 'bien',

            });

          }

        } catch (cloudflareError) {

          lastProviderError = cloudflareError;

          console.error('Cloudflare upload failed, trying next provider:', cloudflareError?.message || cloudflareError);

          continue;

        }

      }



      if (provider === 'cloudinary') {

        try {

          const uploaded = await uploadLocalMediaToCloudinary({

            localFilePath: req.file.path,

            filename: req.file.filename,

            mimetype: req.file.mimetype,

            folderPrefix: dynamicFolder,

          });



          if (uploaded?.url) {

            try {

              fs.unlinkSync(req.file.path);

            } catch {

              // keep local file if deletion fails

            }

            return res.json({

              success: true,

              url: uploaded.url,

              provider: 'cloudinary',

              publicId: uploaded.publicId,

              filename: req.file.filename,

              mimetype: req.file.mimetype,

              mediaType,

              scope: uploadScope || 'bien',

            });

          }

        } catch (cloudinaryError) {

          lastProviderError = cloudinaryError;

          console.error('Cloudinary upload failed, trying next provider:', cloudinaryError?.message || cloudinaryError);

          continue;

        }

      }



      if (provider === 'local') {

        break;

      }

    }



    if (MEDIA_REQUIRED_UPLOAD || CLOUDINARY_REQUIRED_UPLOAD) {

      const detail = String(lastProviderError?.message || '').trim();

      return res.status(502).json({ error: detail || 'Remote media upload failed' });

    }



    res.json({

      success: true,

      url: localUrl,

      provider: 'local',

      filename: req.file.filename,

      mimetype: req.file.mimetype,

      mediaType,

      scope: uploadScope || 'bien',

    });

  } catch (error) {

    console.error('Error uploading media:', error);

    res.status(500).json({ error: 'Failed to upload media' });

  }

});



app.post('/api/upload-contract', requireAdminSession, contractUpload.single('contract'), async (req, res) => {

  try {

    if (!req.file) {

      return res.status(400).json({ error: 'No contract file uploaded' });

    }

    const contractUrl = `/contracts/${req.file.filename}`;

    res.json({

      success: true,

      url: contractUrl,

      filename: req.file.filename

    });

  } catch (error) {

    console.error('Error uploading contract:', error);

    res.status(500).json({ error: 'Failed to upload contract' });

  }

});



app.post('/api/media', requireAdminSession, async (req, res) => {

  try {

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {

      return res.status(400).json({ error: 'payload JSON invalide' });

    }

    const { bien_id, type, url, position, motif_upload } = req.body;

    if (!bien_id || typeof bien_id !== 'string') {

      return res.status(400).json({ error: 'bien_id requis' });

    }

    const resolvedType = Array.isArray(type)

      ? String(type[type.length - 1] || 'image')

      : String(type || 'image');

    const safeType = resolvedType === 'video' ? 'video' : 'image';

    const resolvedUrl = Array.isArray(url) ? String(url[0] || '') : String(url || '');

    const resolvedMotif = Array.isArray(motif_upload)

      ? String(motif_upload[motif_upload.length - 1] || '')

      : String(motif_upload || '');

    if (!resolvedUrl.trim()) {

      return res.status(400).json({ error: 'url image requis' });

    }

    const id = 'm' + Date.now();

    

    // Calculate the next position if not provided (max existing position + 1)

    let mediaPosition = Number(position);

    if (position === undefined || position === null || Number.isNaN(mediaPosition)) {

      const [maxPosResult] = await pool.query(

        'SELECT MAX(position) as maxPos FROM media WHERE bien_id = ?',

        [bien_id]

      );

      mediaPosition = (maxPosResult[0]?.maxPos ?? -1) + 1;

    }

    if (!Number.isFinite(mediaPosition) || mediaPosition < 0) {

      mediaPosition = 0;

    }

    

    await pool.query('INSERT INTO media (id, bien_id, type, url, motif_upload, position) VALUES (?, ?, ?, ?, ?, ?)',

      [id, bien_id, safeType, resolvedUrl, resolvedMotif.trim() || null, mediaPosition]);

    const [newMedia] = await pool.query('SELECT * FROM media WHERE id = ?', [id]);

    res.status(201).json(newMedia[0]);

  } catch (error) {

    console.error('Error creating media:', error);

    res.status(500).json({ error: 'Failed to create media' });

  }

});





// Update media order

app.put('/api/media/:id/position', requireAdminSession, async (req, res) => {

  try {

    const { position } = req.body;

    await pool.query('UPDATE media SET position = ? WHERE id = ?', [position, req.params.id]);

    res.json({ message: 'Position updated' });

  } catch (error) {

    console.error('Error updating media position:', error);

    res.status(500).json({ error: 'Failed to update position' });

  }

});



// Bulk update media positions

app.put('/api/media/bulk/positions', requireAdminSession, async (req, res) => {

  try {

    const { media } = req.body;

    if (!Array.isArray(media)) {

      return res.status(400).json({ error: 'Media array required' });

    }

    

    for (const item of media) {

      await pool.query('UPDATE media SET position = ? WHERE id = ?', [item.position, item.id]);

    }

    

    res.json({ message: 'Positions updated' });

  } catch (error) {

    console.error('Error updating media positions:', error);

    res.status(500).json({ error: 'Failed to update positions' });

  }

});



app.delete('/api/media/:id', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query('SELECT id, type, url FROM media WHERE id = ? LIMIT 1', [req.params.id]);

    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (!row) {

      return res.status(404).json({ error: 'Media not found' });

    }



    const mediaUrl = String(row.url || '').trim();

    if (isCloudinaryUrl(mediaUrl)) {

      await deleteCloudinaryAssetByUrl(mediaUrl, row.type || 'image');

    } else if (isR2PublicUrl(mediaUrl)) {

      await deleteR2ObjectByUrl(mediaUrl);

    } else if (isCloudflareImageUrl(mediaUrl)) {

      await deleteCloudflareImageByUrl(mediaUrl);

    } else if (isCloudflareStreamUrl(mediaUrl)) {

      await deleteCloudflareStreamByUrl(mediaUrl);

    }



    await pool.query('DELETE FROM media WHERE id = ?', [req.params.id]);

    res.json({ message: 'Media deleted' });

  } catch (error) {

    console.error('Error deleting media:', error);

    res.status(500).json({ error: 'Failed to delete media' });

  }

});





// ============================================

// UNAVAILABLE DATES API

// ============================================



app.get('/api/unavailable-dates/:bien_id', async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const [rows] = await pool.query(

      `SELECT

         id,

         bien_id,

         start_date,

         end_date,

         status,

         reservation_demand_id,

         DATE_FORMAT(payment_deadline, '%Y-%m-%d %H:%i:%s') AS paymentDeadline

       FROM unavailable_dates

       WHERE bien_id = ?`,

      [req.params.bien_id]

    );

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch unavailable dates' });

  }

});



app.post('/api/unavailable-dates', requireAdminSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const { bien_id, start_date, end_date, status } = req.body;

    const id = 'ud' + Date.now();

    await pool.query(

      'INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, reservation_demand_id, payment_deadline) VALUES (?, ?, ?, ?, ?, ?, ?)',

      [id, bien_id, start_date, end_date, status || 'blocked', null, null]

    );

    const [newDate] = await pool.query('SELECT * FROM unavailable_dates WHERE id = ?', [id]);

    res.status(201).json(newDate[0]);

  } catch (error) {

    console.error('Error creating unavailable date:', error);

    res.status(500).json({ error: 'Failed to create unavailable date' });

  }

});



app.delete('/api/unavailable-dates/:id', requireAdminSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const unavailableId = String(req.params.id || '').trim();

    await pool.query('UPDATE reservation_demands SET unavailable_date_id = NULL WHERE unavailable_date_id = ?', [unavailableId]);

    await pool.query('DELETE FROM unavailable_dates WHERE id = ?', [unavailableId]);

    res.json({ message: 'Unavailable date deleted' });

  } catch (error) {

    res.status(500).json({ error: 'Failed to delete unavailable date' });

  }

});



app.get('/api/pricing-periods/:bien_id', async (req, res) => {

  try {

    await ensureSeasonalPricingSchema();

    const bienId = String(req.params.bien_id || '').trim();

    if (!bienId) return res.status(400).json({ error: 'bien_id requis' });

    const [rows] = await pool.query(

      `SELECT id, bien_id, scope, amicale_id,

              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,

              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,

              prix_nuitee, prix_semaine, minimum_nuitees, checkin_jour, checkout_jour

       FROM bien_pricing_periods

       WHERE bien_id = ?

       ORDER BY start_date ASC, end_date ASC`,

      [bienId]

    );

    const data = (rows || []).map((row) => ({

      id: String(row.id),

      bien_id: String(row.bien_id),

      start: toSqlDateOnly(row.start_date),

      end: toSqlDateOnly(row.end_date),

      prix_nuitee: Number(row.prix_nuitee || 0),

      prix_semaine: row.prix_semaine === null || row.prix_semaine === undefined ? null : Number(row.prix_semaine || 0),

      minimum_nuitees: row.minimum_nuitees === null || row.minimum_nuitees === undefined ? null : Math.max(1, Math.floor(Number(row.minimum_nuitees || 0))),

      checkin_jour: row.checkin_jour ? String(row.checkin_jour).toLowerCase() : null,

      checkout_jour: row.checkout_jour ? String(row.checkout_jour).toLowerCase() : null,

      scope: String(row.scope || '').trim().toLowerCase() || (row.amicale_id ? 'amicale' : 'global'),

      amicale_id: row.amicale_id ? String(row.amicale_id).trim() : null,

    }));

    res.json(data);

  } catch (error) {

    console.error('Error fetching pricing periods:', error);

    res.status(500).json({ error: 'Failed to fetch pricing periods' });

  }

});



// ============================================

// UTILISATEURS API

// ============================================



// ============================================

// AUTH API

// ============================================



app.post('/api/auth/admin/login', authLoginRateLimit, async (req, res) => {

  try {

    const { email, password } = req.body;

    if (!email || !password) {

      void logSecurityEvent({

        req,

        eventType: 'admin_login_failed',

        severity: 'warning',

        success: false,

        statusCode: 400,

        userEmail: email || null,

        message: 'Admin login failed: missing email or password',

      });

      return res.status(400).json({ error: 'Email et mot de passe obligatoires' });

    }



    const [rows] = await pool.query(

      'SELECT id, nom, email, mot_de_passe_hash, actif FROM administrateurs WHERE email = ? LIMIT 1',

      [String(email).toLowerCase()]

    );

    const admin = rows[0];

    if (!admin || !admin.actif) {

      void logSecurityEvent({

        req,

        eventType: 'admin_login_failed',

        severity: 'warning',

        success: false,

        statusCode: 401,

        userEmail: email,

        message: 'Admin login failed: invalid credentials',

      });

      return res.status(401).json({ error: 'Identifiants administrateur invalides' });

    }



    const isPasswordValid = await bcrypt.compare(String(password), admin.mot_de_passe_hash);

    if (!isPasswordValid) {

      void logSecurityEvent({

        req,

        eventType: 'admin_login_failed',

        severity: 'warning',

        success: false,

        statusCode: 401,

        userEmail: email,

        message: 'Admin login failed: invalid credentials',

      });

      return res.status(401).json({ error: 'Identifiants administrateur invalides' });

    }



    const authUser = buildAuthUser({

      id: admin.id,

      email: admin.email,

      name: admin.nom,

      role: 'admin',

      profileCompleted: true,

    });

    setAuthSessionCookie(req, res, authUser);

    void logSecurityEvent({

      req,

      eventType: 'admin_login_success',

      severity: 'info',

      success: true,

      statusCode: 200,

      userId: authUser.id,

      userEmail: authUser.email,

      message: 'Admin login successful',

    });

    res.json({ user: authUser });

  } catch (error) {

    console.error('Error during admin login:', error);

    void logSecurityEvent({

      req,

      eventType: 'admin_login_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      userEmail: req.body?.email || null,

      message: 'Admin login failed: server error',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Erreur de connexion administrateur' });

  }

});



app.post('/api/auth/agent-amicale/login', authLoginRateLimit, async (req, res) => {

  try {

    const username = String(req.body?.username || '').trim();

    const password = String(req.body?.password || '').trim();

    if (!username || !password) {

      return res.status(400).json({ error: 'username and password are required' });

    }

    const [rows] = await pool.query(

      `SELECT

        p.user_id,

        p.amicale_id,

        p.username,

        p.password_text,

        u.nom AS user_nom,

        a.name AS amicale_name,

        a.logo_url AS amicale_logo_url

      FROM agent_amicale_profiles p

      INNER JOIN utilisateurs u ON u.id = p.user_id

      LEFT JOIN amicales a ON a.id = p.amicale_id

      WHERE p.username = ?

      LIMIT 1`,

      [username]

    );

    const row = rows?.[0] || null;

    if (!row) return res.status(401).json({ error: 'Identifiants invalides' });

    if (String(row.password_text || '') !== password) return res.status(401).json({ error: 'Identifiants invalides' });



    const agentSession = {

      userId: String(row.user_id || '').trim(),

      username: String(row.username || '').trim(),

      displayName: String(row.user_nom || '').trim(),

      amicaleId: String(row.amicale_id || '').trim(),

      amicaleName: String(row.amicale_name || '').trim(),

      amicaleLogoUrl: row.amicale_logo_url ? String(row.amicale_logo_url).trim() : null,

    };

    setAgentSessionCookie(req, res, agentSession);

    return res.json({ session: agentSession });

  } catch (error) {

    console.error('Error logging agent amicale:', error);

    return res.status(500).json({ error: 'Connexion agent amicale impossible' });

  }

});



app.get('/api/auth/agent-amicale/me', async (req, res) => {

  try {

    const session = getAgentSessionFromRequest(req);

    if (!session) return res.status(401).json({ error: 'Session agent invalide' });

    let amicaleLogoUrl = null;

    try {

      const [rows] = await pool.query(

        'SELECT logo_url FROM amicales WHERE id = ? LIMIT 1',

        [String(session.amicaleId || '').trim()]

      );

      amicaleLogoUrl = rows?.[0]?.logo_url ? String(rows[0].logo_url).trim() : null;

    } catch (lookupError) {

      console.warn('agent-amicale/me logo lookup failed:', lookupError?.message || lookupError);

    }

    return res.json({ session: { ...session, amicaleLogoUrl } });

  } catch (error) {

    console.error('Error reading agent session:', error);

    return res.status(500).json({ error: 'Lecture session agent impossible' });

  }

});



app.post('/api/auth/agent-amicale/logout', async (req, res) => {

  clearAgentSessionCookie(req, res);

  return res.json({ success: true });

});



app.get('/api/agent-amicale/reservation-demands', requireAgentAmicaleSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    await cleanupNamelessAmicalesAndTheirDemands();

    const amicaleId = String(req.agentSession?.amicaleId || '').trim();

    if (!amicaleId) {

      return res.status(400).json({ error: 'Amicale introuvable' });

    }

    const [rows] = await pool.query(

      `SELECT

         d.*,

         b.titre AS bien_titre,

         b.reference AS bien_reference,

         a.name AS amicale_name,

         a.logo_url AS amicale_logo_url,

         DATE_FORMAT(d.amicale_validation_at, '%Y-%m-%d %H:%i:%s') AS amicale_validation_at,

         DATE_FORMAT(d.agency_validation_at, '%Y-%m-%d %H:%i:%s') AS agency_validation_at,

         DATE_FORMAT(d.voucher_generated_at, '%Y-%m-%d %H:%i:%s') AS voucher_generated_at,

         DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,

         DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,

         DATE_FORMAT(d.client_confirmation_clicked_at, '%Y-%m-%d %H:%i:%s') AS client_confirmation_clicked_at,

         DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at,

         DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at,

         DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,

         DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

         DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

       FROM reservation_demands d

       LEFT JOIN biens b ON b.id = d.bien_id

       LEFT JOIN amicales a ON a.id = d.pricing_amicale_id

       WHERE d.pricing_amicale_id = ?

       ORDER BY d.created_at DESC`,

      [amicaleId]

    );

    res.json((rows || []).map((row) => formatReservationDemandRow(row)));

  } catch (error) {

    console.error('Error fetching agent amicale reservation demands:', error);

    res.status(500).json({ error: 'Impossible de charger les demandes amicale' });

  }

});



app.get('/api/agent-amicale/vouchers', requireAgentAmicaleSession, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const amicaleId = String(req.agentSession?.amicaleId || '').trim();

    const [rows] = await pool.query(

      `SELECT

         d.*,

         b.titre AS bien_titre,

         b.reference AS bien_reference,

         a.name AS amicale_name,

         a.logo_url AS amicale_logo_url,

         DATE_FORMAT(d.amicale_validation_at, '%Y-%m-%d %H:%i:%s') AS amicale_validation_at,

         DATE_FORMAT(d.agency_validation_at, '%Y-%m-%d %H:%i:%s') AS agency_validation_at,

         DATE_FORMAT(d.voucher_generated_at, '%Y-%m-%d %H:%i:%s') AS voucher_generated_at,

         DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,

         DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at

       FROM reservation_demands d

       LEFT JOIN biens b ON b.id = d.bien_id

       LEFT JOIN amicales a ON a.id = d.pricing_amicale_id

       WHERE d.pricing_amicale_id = ?

         AND d.voucher_url IS NOT NULL

       ORDER BY d.voucher_generated_at DESC, d.updated_at DESC`,

      [amicaleId]

    );

    res.json((rows || []).map((row) => formatReservationDemandRow(row)));

  } catch (error) {

    console.error('Error fetching agent amicale vouchers:', error);

    res.status(500).json({ error: 'Impossible de charger les vouchers amicale' });

  }

});



app.post('/api/agent-amicale/reservation-demands/:id/validate', requireAgentAmicaleSession, reservationMutationRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    const amicaleId = String(req.agentSession?.amicaleId || '').trim();

    if (!demandId) return res.status(400).json({ error: 'Demande introuvable' });

    const detailedCurrent = await fetchReservationDemandDetailsById(demandId);

    if (!detailedCurrent) return res.status(404).json({ error: 'Demande introuvable' });

    if (String(detailedCurrent.pricing_amicale_id || '').trim() !== amicaleId) {

      return res.status(403).json({ error: 'Demande amicale non autorisee' });

    }

    if (String(detailedCurrent.status || '') !== 'attente_validation_amicale') {

      return res.status(400).json({ error: 'Cette demande ne peut plus etre validee par l amicale' });

    }



    const now = getAgencySqlDateTime();

    await pool.query(

      `UPDATE reservation_demands

       SET status = ?,

           amicale_validation_at = ?,

           updated_at = ?

       WHERE id = ?`,

      ['attente_validation_par_agence', now, now, demandId]

    );

    await appendReservationDemandHistory(

      demandId,

      'attente_validation_par_agence',

      'agent_amicale',

      String(req.agentSession?.userId || req.agentSession?.username || 'agent_amicale').trim(),

      'Demande validee par l amicale et transmise a l agence',

      now

    );

    return res.json((await fetchReservationDemandDetailsById(demandId)) || null);

  } catch (error) {

    console.error('Error validating agent amicale demand:', error);

    res.status(500).json({ error: 'Impossible de valider la demande amicale' });

  }

});



app.post('/api/agent-amicale/reservation-demands/:id/reject', requireAgentAmicaleSession, reservationMutationRateLimit, async (req, res) => {

  try {

    await ensureReservationDemandSchema();

    const demandId = String(req.params.id || '').trim();

    const amicaleId = String(req.agentSession?.amicaleId || '').trim();

    if (!demandId) return res.status(400).json({ error: 'Demande introuvable' });

    const detailedCurrent = await fetchReservationDemandDetailsById(demandId);

    if (!detailedCurrent) return res.status(404).json({ error: 'Demande introuvable' });

    if (String(detailedCurrent.pricing_amicale_id || '').trim() !== amicaleId) {

      return res.status(403).json({ error: 'Demande amicale non autorisee' });

    }

    if (String(detailedCurrent.status || '') !== 'attente_validation_amicale') {

      return res.status(400).json({ error: 'Cette demande ne peut plus etre rejetee par l amicale' });

    }



    const now = getAgencySqlDateTime();

    await pool.query(

      `UPDATE reservation_demands

       SET status = ?,

           amicale_validation_at = ?,

           agency_validation_at = NULL,

           voucher_id = NULL,

           voucher_number = NULL,

           voucher_url = NULL,

           voucher_generated_at = NULL,

           updated_at = ?

       WHERE id = ?`,

      ['rejete_par_amicale', now, now, demandId]

    );

    if (detailedCurrent.unavailable_date_id) {

      await pool.query(

        `DELETE FROM unavailable_dates

         WHERE id = ?

           AND reservation_demand_id = ?`,

        [detailedCurrent.unavailable_date_id, demandId]

      );

      await pool.query(

        'UPDATE reservation_demands SET unavailable_date_id = NULL, updated_at = ? WHERE id = ?',

        [now, demandId]

      );

    }

    await appendReservationDemandHistory(

      demandId,

      'rejete_par_amicale',

      'agent_amicale',

      String(req.agentSession?.userId || req.agentSession?.username || 'agent_amicale').trim(),

      'Demande rejetee par l amicale',

      now

    );

    return res.json((await fetchReservationDemandDetailsById(demandId)) || null);

  } catch (error) {

    console.error('Error rejecting agent amicale demand:', error);

    res.status(500).json({ error: 'Impossible de rejeter la demande amicale' });

  }

});



app.get('/api/auth/providers', (req, res) => {

  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  const facebookConfigured = Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);

  const phoneOtpConfigured = false;

  const emailOtpConfigured = Boolean((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.ALLOW_EMAIL_OTP_IN_RESPONSE === '1');

  const passkeyConfigured = true;

  res.json({

    google: googleConfigured,

    facebook: facebookConfigured,

    phoneOtp: phoneOtpConfigured,

    emailOtp: emailOtpConfigured,

    passkey: passkeyConfigured,

  });

});



app.get('/api/facebook/video-source', async (req, res) => {

  try {

    const inputUrl = String(req.query?.url || '').trim();

    const { videoId, resolvedUrl } = await resolveFacebookVideoIdFromAnyUrl(inputUrl);

    if (!videoId) {

      return res.status(400).json({ error: 'facebook_video_id_missing' });

    }

    const accessToken = resolveAnyMessengerPageToken();

    if (!accessToken) {

      return res.status(503).json({ error: 'facebook_page_token_missing' });

    }



    const endpoint = new URL(`https://graph.facebook.com/${MESSENGER_API_VERSION}/${encodeURIComponent(videoId)}`);

    endpoint.searchParams.set('fields', 'id,source,permalink_url,from{id}');

    endpoint.searchParams.set('access_token', accessToken);



    const response = await fetch(endpoint.toString());

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.error) {

      return res.status(404).json({

        error: 'facebook_video_source_unavailable',

        detail: payload?.error?.message || `Graph API ${response.status}`,

      });

    }



    const ownerId = String(payload?.from?.id || '').trim();

    const allowedOwnerIds = [MESSENGER_PAGE_ID_LOCATION, MESSENGER_PAGE_ID_VENTE].map((v) => String(v || '').trim()).filter(Boolean);

    if (allowedOwnerIds.length > 0 && ownerId && !allowedOwnerIds.includes(ownerId)) {

      return res.status(403).json({ error: 'facebook_video_not_owned_by_configured_page' });

    }



    const source = String(payload?.source || '').trim();

    if (!source) {

      return res.status(404).json({ error: 'facebook_video_source_missing' });

    }

    return res.json({

      videoId: String(payload?.id || videoId),

      source,

      resolved_url: resolvedUrl || inputUrl || null,

      permalink_url: String(payload?.permalink_url || '').trim() || null,

      owner_id: ownerId || null,

    });

  } catch (error) {

    console.error('Facebook video source error:', error);

    return res.status(500).json({ error: 'facebook_video_source_failed' });

  }

});



app.get('/api/facebook/embed-status', async (req, res) => {

  try {

    const inputUrl = String(req.query?.url || '').trim();

    if (!inputUrl) {

      return res.status(400).json({ error: 'facebook_url_missing' });

    }

    const status = await checkFacebookEmbedAvailability(inputUrl);

    return res.json(status);

  } catch (error) {

    console.error('Facebook embed status error:', error);

    return res.status(500).json({ error: 'facebook_embed_status_failed' });

  }

});



app.get('/api/anti-bot/config', (req, res) => {

  const enabled = Boolean(TURNSTILE_SECRET_KEY && TURNSTILE_SITE_KEY);

  res.json({

    provider: 'turnstile',

    enabled,

    siteKey: enabled ? TURNSTILE_SITE_KEY : null,

  });

});



app.get('/api/auth/session', (req, res) => {

  const cookies = parseCookies(req.headers?.cookie);

  const hasSessionCookie = Boolean(String(cookies?.[SESSION_COOKIE_NAME] || '').trim());

  const user = getSessionUserFromRequest(req);

  logMobileFlow('auth_session_check', req, {

    hasSessionCookie,

    authenticated: Boolean(user),

    authUserId: user?.id || null,

    authRole: user?.role || null,

  });

  if (!user) {

    return res.json({ authenticated: false, user: null });

  }

  res.json({ authenticated: true, user });

});



app.post('/api/auth/logout', (req, res) => {

  clearAuthSessionCookie(req, res);

  res.json({ success: true });

});



app.post('/api/auth/passkey/register/options', authLoginRateLimit, async (req, res) => {

  try {

    await ensureAuthSchema();

    await ensurePasskeySchema();

    const email = String(req.body?.email || '').trim().toLowerCase();

    const name = String(req.body?.name || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

      return res.status(400).json({ error: 'Email invalide' });

    }

    const user = await upsertPasskeyUser({ email, name });

    const existingCredentials = await getPasskeyRowsForUser(user.id);

    const rpID = getWebauthnRpId(req);

    const options = await generateRegistrationOptions({

      rpName: WEBAUTHN_RP_NAME,

      rpID,

      userID: Buffer.from(String(user.id), 'utf8'),

      userName: user.email,

      userDisplayName: user.name,

      timeout: 60_000,

      attestationType: 'none',

      authenticatorSelection: {

        residentKey: 'preferred',

        userVerification: 'preferred',

      },

      supportedAlgorithmIDs: [-7, -257],

      excludeCredentials: existingCredentials.map((row) => ({

        id: String(row.credential_id),

        type: 'public-key',

      })),

    });

    const challengeId = persistPasskeyChallenge({

      flow: 'register',

      challenge: options.challenge,

      userId: user.id,

      deviceId: req.deviceId,

    });

    void logSecurityEvent({

      req,

      eventType: 'passkey_register_options_issued',

      severity: 'info',

      success: true,

      statusCode: 200,

      userId: user.id,

      userEmail: user.email,

      message: 'Passkey registration options issued',

    });

    res.json({ options, challengeId, user: buildAuthUser(user) });

  } catch (error) {

    console.error('Passkey register options error:', error);

    void logSecurityEvent({

      req,

      eventType: 'passkey_register_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      message: 'Passkey register options failed',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Impossible de preparer la creation Passkey' });

  }

});



app.post('/api/auth/passkey/register/verify', authLoginRateLimit, async (req, res) => {

  try {

    await ensureAuthSchema();

    await ensurePasskeySchema();

    const challengeId = String(req.body?.challengeId || '').trim();

    const credential = req.body?.credential;

    const friendlyName = String(req.body?.friendlyName || '').trim() || null;

    const challengeRecord = consumePasskeyChallenge(challengeId, 'register', req.deviceId);

    if (!challengeRecord) {

      return res.status(400).json({ error: 'Challenge Passkey invalide ou expire' });

    }

    const userId = String(challengeRecord.userId || '').trim();

    if (!userId || !credential) {

      return res.status(400).json({ error: 'Requete Passkey invalide' });

    }

    const [userRows] = await pool.query(

      `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type

       FROM utilisateurs WHERE id = ? LIMIT 1`,

      [userId]

    );

    const user = userRows?.[0];

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const verification = await verifyRegistrationResponse({

      response: credential,

      expectedChallenge: challengeRecord.challenge,

      expectedOrigin: getExpectedWebauthnOrigins(req),

      expectedRPID: getWebauthnRpId(req),

      // Keep verification compatible with authenticators that do not always

      // provide a UV flag, since options use userVerification='preferred'.

      requireUserVerification: false,

    });

    if (!verification.verified || !verification.registrationInfo) {

      void logSecurityEvent({

        req,

        eventType: 'passkey_register_failed',

        severity: 'warning',

        success: false,

        statusCode: 401,

        userId: user.id,

        userEmail: user.email,

        message: 'Passkey registration verification failed',

      });

      return res.status(401).json({ error: 'Verification Passkey echouee' });

    }

    const registrationInfo = verification.registrationInfo;

    const now = getAgencySqlDateTime();

    await pool.query(

      `INSERT INTO passkey_credentials (

         id, user_id, credential_id, public_key_base64, counter, transports_json,

         device_type, backed_up, disabled, friendly_name, created_at, last_used_at

       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)

       ON DUPLICATE KEY UPDATE

         user_id = VALUES(user_id),

         public_key_base64 = VALUES(public_key_base64),

         counter = VALUES(counter),

         transports_json = VALUES(transports_json),

         device_type = VALUES(device_type),

         backed_up = VALUES(backed_up),

         disabled = 0,

         friendly_name = VALUES(friendly_name),

         last_used_at = VALUES(last_used_at)`,

      [

        `pk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,

        String(user.id),

        String(registrationInfo.credentialID),

        Buffer.from(registrationInfo.credentialPublicKey).toString('base64url'),

        Number(registrationInfo.counter || 0),

        JSON.stringify(Array.isArray(credential?.response?.transports) ? credential.response.transports : []),

        String(registrationInfo.credentialDeviceType || 'singleDevice'),

        registrationInfo.credentialBackedUp ? 1 : 0,

        friendlyName,

        now,

        now,

      ]

    );

    await bindDeviceToUser(req, user.id, { reason: 'passkey_register' });

    const identityName = splitFullName(user.nom || '');

    const authUser = buildAuthUser({

      id: user.id,

      email: user.email,

      name: user.nom,

      firstName: identityName.firstName || null,

      lastName: identityName.lastName || null,

      role: user.role,

      avatar: user.avatar || null,

      clientType: user.client_type || null,

      telephone: user.telephone || null,

      cin: user.cin || null,

      cinImageUrl: user.cin_image_url || null,

      profileCompleted: isLegalIdentityProfileCompleted(user),

    });

    setAuthSessionCookie(req, res, authUser);

    void logSecurityEvent({

      req,

      eventType: 'passkey_register_success',

      severity: 'info',

      success: true,

      statusCode: 200,

      userId: authUser.id,

      userEmail: authUser.email,

      message: 'Passkey registered successfully',

    });

    res.json({ user: authUser });

  } catch (error) {

    console.error('Passkey register verify error:', error);

    void logSecurityEvent({

      req,

      eventType: 'passkey_register_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      message: 'Passkey registration failed',

      metadata: { error: String(error?.message || error || '') },

    });

    const detail = String(error?.message || error || '').trim();

    res.status(500).json({

      error: detail ? `Impossible d enregistrer cette Passkey (${detail})` : 'Impossible d enregistrer cette Passkey',

    });

  }

});



app.post('/api/auth/passkey/login/options', authLoginRateLimit, async (req, res) => {

  try {

    await ensurePasskeySchema();

    const email = String(req.body?.email || '').trim().toLowerCase();

    let credentialRows = [];

    let linkedUserId = null;

    if (email) {

      const [userRows] = await pool.query('SELECT id FROM utilisateurs WHERE email = ? LIMIT 1', [email]);

      linkedUserId = String(userRows?.[0]?.id || '').trim() || null;

      if (linkedUserId) {

        credentialRows = await getPasskeyRowsForUser(linkedUserId);

      }

    } else {

      credentialRows = await getPasskeyRowsForDevice(req.deviceId);

      if (credentialRows[0]?.user_id) linkedUserId = String(credentialRows[0].user_id).trim();

    }

    if (!credentialRows.length) {

      void logSecurityEvent({

        req,

        eventType: 'passkey_login_options_missing',

        severity: 'warning',

        success: false,

        statusCode: 404,

        userEmail: email || null,

        message: 'No passkey credential found for login options',

      });

      return res.status(404).json({ error: 'Aucun passkey configure pour cet appareil/compte' });

    }

    const options = await generateAuthenticationOptions({

      rpID: getWebauthnRpId(req),

      timeout: 60_000,

      userVerification: 'preferred',

      allowCredentials: credentialRows.map((row) => ({

        id: String(row.credential_id),

        type: 'public-key',

        transports: (() => {

          try {

            const parsed = JSON.parse(String(row.transports_json || '[]'));

            return Array.isArray(parsed) ? parsed : [];

          } catch {

            return [];

          }

        })(),

      })),

    });

    const challengeId = persistPasskeyChallenge({

      flow: 'login',

      challenge: options.challenge,

      userId: linkedUserId,

      deviceId: req.deviceId,

      credentialIds: credentialRows.map((row) => String(row.credential_id)),

    });

    res.json({ options, challengeId });

  } catch (error) {

    console.error('Passkey login options error:', error);

    res.status(500).json({ error: 'Impossible de preparer la connexion Passkey' });

  }

});



app.post('/api/auth/passkey/login/verify', authLoginRateLimit, async (req, res) => {

  try {

    await ensurePasskeySchema();

    const challengeId = String(req.body?.challengeId || '').trim();

    const credential = req.body?.credential;

    const challengeRecord = consumePasskeyChallenge(challengeId, 'login', req.deviceId);

    if (!challengeRecord) {

      return res.status(400).json({ error: 'Challenge Passkey invalide ou expire' });

    }

    const credentialId = String(credential?.id || '').trim();

    if (!credential || !credentialId) {

      return res.status(400).json({ error: 'Credential Passkey manquant' });

    }

    const [credentialRows] = await pool.query(

      `SELECT id, user_id, credential_id, public_key_base64, counter, transports_json

       FROM passkey_credentials

       WHERE credential_id = ? AND disabled = 0

       LIMIT 1`,

      [credentialId]

    );

    const storedCredential = credentialRows?.[0];

    if (!storedCredential) {

      void logSecurityEvent({

        req,

        eventType: 'passkey_login_failed',

        severity: 'warning',

        success: false,

        statusCode: 404,

        message: 'Passkey login failed: credential not found',

      });

      return res.status(404).json({ error: 'Passkey inconnue' });

    }

    const verification = await verifyAuthenticationResponse({

      response: credential,

      expectedChallenge: challengeRecord.challenge,

      expectedOrigin: getExpectedWebauthnOrigins(req),

      expectedRPID: getWebauthnRpId(req),

      authenticator: {

        credentialID: String(storedCredential.credential_id),

        credentialPublicKey: Buffer.from(String(storedCredential.public_key_base64 || ''), 'base64url'),

        counter: Number(storedCredential.counter || 0),

        transports: (() => {

          try {

            const parsed = JSON.parse(String(storedCredential.transports_json || '[]'));

            return Array.isArray(parsed) ? parsed : [];

          } catch {

            return [];

          }

        })(),

      },

      // Keep verification compatible with authenticators that do not always

      // provide a UV flag, since options use userVerification='preferred'.

      requireUserVerification: false,

    });

    if (!verification.verified) {

      void logSecurityEvent({

        req,

        eventType: 'passkey_login_failed',

        severity: 'warning',

        success: false,

        statusCode: 401,

        message: 'Passkey authentication verification failed',

      });

      return res.status(401).json({ error: 'Verification Passkey echouee' });

    }

    const [userRows] = await pool.query(

      `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type

       FROM utilisateurs

       WHERE id = ?

       LIMIT 1`,

      [storedCredential.user_id]

    );

    const user = userRows?.[0];

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const now = getAgencySqlDateTime();

    await pool.query(

      `UPDATE passkey_credentials

       SET counter = ?, last_used_at = ?

       WHERE id = ?`,

      [Number(verification.authenticationInfo.newCounter || 0), now, storedCredential.id]

    );

    await bindDeviceToUser(req, user.id, { reason: 'passkey_login' });

    const identityName = splitFullName(user.nom || '');

    const authUser = buildAuthUser({

      id: user.id,

      email: user.email,

      name: user.nom,

      firstName: identityName.firstName || null,

      lastName: identityName.lastName || null,

      role: user.role,

      avatar: user.avatar || null,

      clientType: user.client_type || null,

      telephone: user.telephone || null,

      cin: user.cin || null,

      cinImageUrl: user.cin_image_url || null,

      profileCompleted: isLegalIdentityProfileCompleted(user),

    });

    setAuthSessionCookie(req, res, authUser);

    void logSecurityEvent({

      req,

      eventType: 'passkey_login_success',

      severity: 'info',

      success: true,

      statusCode: 200,

      userId: authUser.id,

      userEmail: authUser.email,

      message: 'Passkey login successful',

    });

    res.json({ user: authUser });

  } catch (error) {

    console.error('Passkey login verify error:', error);

    void logSecurityEvent({

      req,

      eventType: 'passkey_login_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      message: 'Passkey login failed: server error',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Impossible de finaliser la connexion Passkey' });

  }

});



app.get('/api/security-audit-logs', requireAdminSession, async (req, res) => {

  try {

    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));

    const where = [];

    const params = [];

    if (req.query.event_type) {

      where.push('event_type = ?');

      params.push(String(req.query.event_type).trim());

    }

    if (req.query.user_id) {

      where.push('user_id = ?');

      params.push(String(req.query.user_id).trim());

    }

    if (req.query.success !== undefined) {

      const normalizedSuccess = String(req.query.success).trim().toLowerCase();

      if (normalizedSuccess === '0' || normalizedSuccess === '1') {

        where.push('success = ?');

        params.push(Number(normalizedSuccess));

      }

    }



    const [rows] = await pool.query(

      `SELECT

         id,

         event_type,

         severity,

         success,

         http_status,

         method,

         path,

         ip,

         user_agent,

         user_id,

         user_email,

         message,

         metadata_json,

         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at

       FROM security_audit_logs

       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}

       ORDER BY created_at DESC

       LIMIT ?`,

      [...params, limit]

    );



    const parsedRows = (rows || []).map((row) => ({

      ...row,

      success: Boolean(Number(row.success || 0)),

      metadata: (() => {

        try {

          return row.metadata_json ? JSON.parse(String(row.metadata_json)) : null;

        } catch {

          return null;

        }

      })(),

    }));

    res.json(parsedRows);

  } catch (error) {

    console.error('Error fetching security audit logs:', error);

    res.status(500).json({ error: 'Impossible de charger les logs de securite' });

  }

});



app.get('/api/security-audit-logs/export', requireAdminSession, async (req, res) => {

  try {

    const format = String(req.query.format || 'xlsx').trim().toLowerCase();

    const limitRaw = Number(req.query.limit || 5000);

    const limit = Number.isFinite(limitRaw) ? Math.min(50000, Math.max(1, limitRaw)) : 5000;

    const dateFrom = toSqlDateBoundary(req.query.date_from || req.query.dateFrom, false);

    const dateTo = toSqlDateBoundary(req.query.date_to || req.query.dateTo, true);

    const where = [];

    const params = [];

    if (req.query.event_type) {

      where.push('event_type = ?');

      params.push(String(req.query.event_type).trim());

    }

    if (req.query.user_id) {

      where.push('user_id = ?');

      params.push(String(req.query.user_id).trim());

    }

    if (req.query.success !== undefined) {

      const normalizedSuccess = String(req.query.success).trim().toLowerCase();

      if (normalizedSuccess === '0' || normalizedSuccess === '1') {

        where.push('success = ?');

        params.push(Number(normalizedSuccess));

      }

    }

    if (dateFrom) {

      where.push('created_at >= ?');

      params.push(dateFrom);

    }

    if (dateTo) {

      where.push('created_at <= ?');

      params.push(dateTo);

    }

    const [rows] = await pool.query(

      `SELECT

         id,

         event_type,

         severity,

         success,

         http_status,

         method,

         path,

         ip,

         user_agent,

         user_id,

         user_email,

         message,

         metadata_json,

         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at

       FROM security_audit_logs

       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}

       ORDER BY created_at DESC

       LIMIT ?`,

      [...params, limit]

    );

    const normalizedRows = (rows || []).map((row) => ({

      id: row.id,

      event_type: row.event_type,

      severity: row.severity,

      success: Boolean(Number(row.success || 0)),

      http_status: row.http_status || null,

      method: row.method || null,

      path: row.path || null,

      ip: row.ip || null,

      user_agent: row.user_agent || null,

      user_id: row.user_id || null,

      user_email: row.user_email || null,

      message: row.message || null,

      metadata_json: row.metadata_json || null,

      created_at: row.created_at || null,

    }));

    const exportedAt = getAgencySqlDateTime();

    await recordAdminDataExport({

      dataset: 'security_audit_logs',

      format,

      dateFrom,

      dateTo,

      rowCount: normalizedRows.length,

      req,

    });

    if (format === 'xlsx') {

      const xlsxRows = normalizedRows.map((row) => ({ ...row, success: row.success ? 1 : 0 }));

      const buffer = buildXlsxBufferFromRows(xlsxRows, 'SecurityAudit');

      const fileName = `security-audit-export-${String(exportedAt).replace(/[^0-9]/g, '').slice(0, 14)}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      return res.status(200).send(buffer);

    }

    const csv = buildCsvFromRows(normalizedRows, [

      { key: 'id', label: 'id' },

      { key: 'event_type', label: 'event_type' },

      { key: 'severity', label: 'severity' },

      { key: 'success', label: 'success' },

      { key: 'http_status', label: 'http_status' },

      { key: 'method', label: 'method' },

      { key: 'path', label: 'path' },

      { key: 'ip', label: 'ip' },

      { key: 'user_agent', label: 'user_agent' },

      { key: 'user_id', label: 'user_id' },

      { key: 'user_email', label: 'user_email' },

      { key: 'message', label: 'message' },

      { key: 'metadata_json', label: 'metadata_json' },

      { key: 'created_at', label: 'created_at' },

    ], { delimiter: '\t', includeExcelSeparatorHint: false });

    const fileName = `security-audit-export-${String(exportedAt).replace(/[^0-9]/g, '').slice(0, 14)}.tsv`;

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.status(200).send(csv);

  } catch (error) {

    console.error('Error exporting security audit logs:', error);

    res.status(500).json({ error: 'Impossible d exporter les logs de securite' });

  }

});



app.delete('/api/security-audit-logs', requireAdminSession, async (req, res) => {

  try {

    const purgeAllRaw = String(req.query.purge_all || req.body?.purge_all || '').trim().toLowerCase();

    const purgeAll = purgeAllRaw === '1' || purgeAllRaw === 'true' || purgeAllRaw === 'yes';

    if (purgeAll) {

      const [result] = await pool.query('DELETE FROM security_audit_logs');

      return res.json({

        success: true,

        mode: 'all',

        deleted: Number(result?.affectedRows || 0),

      });

    }

    const olderThanDays = Math.min(3650, Math.max(1, Number(req.query.older_than_days || req.body?.older_than_days || 30)));

    const [result] = await pool.query(

      `DELETE FROM security_audit_logs

       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,

      [olderThanDays]

    );

    res.json({

      success: true,

      deleted: Number(result?.affectedRows || 0),

      olderThanDays,

    });

  } catch (error) {

    console.error('Error deleting security audit logs:', error);

    res.status(500).json({ error: 'Impossible de nettoyer les logs de securite' });

  }

});



app.get('/api/messenger/webhook', (req, res) => {

  const mode = String(req.query['hub.mode'] || '').trim();

  const token = String(req.query['hub.verify_token'] || '').trim();

  const challenge = String(req.query['hub.challenge'] || '').trim();



  if (mode === 'subscribe' && MESSENGER_VERIFY_TOKEN && token === MESSENGER_VERIFY_TOKEN) {

    return res.status(200).send(challenge || 'ok');

  }

  return res.status(403).json({ error: 'Webhook verification failed' });

});



app.post('/api/messenger/webhook', async (req, res) => {

  try {

    if (!isMessengerSignatureValid(req)) {

      return res.status(401).json({ error: 'Invalid Messenger signature' });

    }



    const body = req.body || {};

    if (body.object !== 'page') {

      return res.status(200).json({ ok: true, ignored: true });

    }



    const entries = Array.isArray(body.entry) ? body.entry : [];

    for (const entry of entries) {

      const pageId = String(entry?.id || '').trim();

      const messagingEvents = Array.isArray(entry?.messaging) ? entry.messaging : [];

      for (const event of messagingEvents) {

        const senderId = String(event?.sender?.id || '').trim();

        if (!senderId) continue;

        if (event?.message?.is_echo) continue;



        const rawRef =

          String(event?.referral?.ref || '').trim()

          || String(event?.postback?.referral?.ref || '').trim()

          || '';

        const parsedRef = parseMessengerRef(rawRef);

        const contextKey = `${pageId}:${senderId}`;

        let sentViaReferralPending = false;

        if (parsedRef?.propertyUrl) {

          recentMessengerContexts.set(contextKey, {

            propertyUrl: parsedRef.propertyUrl,

            title: parsedRef.title || null,

            imageUrl: parsedRef.imageUrl || null,

            reference: parsedRef.reference || null,

            updatedAt: Date.now(),

          });

          const pendingAt = Number(pendingMessengerReplies.get(contextKey) || 0);

          const pendingAgeMs = Date.now() - pendingAt;

          if (pendingAt > 0 && pendingAgeMs >= 0 && pendingAgeMs < 15 * 60 * 1000) {

            const sent = await sendMessengerPropertyReply({

              senderId,

              pageId,

              propertyUrl: parsedRef.propertyUrl,

              propertyTitle: parsedRef.title || null,

              propertyImageUrl: parsedRef.imageUrl || null,

              propertyReference: parsedRef.reference || null,

            });

            if (sent) {

              pendingMessengerReplies.delete(contextKey);

              sentViaReferralPending = true;

            }

          }

        }

        console.log('Messenger event', {

          pageId,

          senderId,

          hasMessage: Boolean(event?.message),

          hasReferral: Boolean(event?.referral || event?.postback?.referral),

          hasRawRef: Boolean(rawRef),

          hasParsedProperty: Boolean(parsedRef?.propertyUrl),

          hasParsedImage: Boolean(parsedRef?.imageUrl),

        });



        await upsertMessengerContact({

          pagePsid: senderId,

          pageId,

          lastRef: rawRef || null,

          propertyUrl: parsedRef?.propertyUrl || null,

          propertyTitle: parsedRef?.title || null,

        });



        let replyPropertyUrl = parsedRef?.propertyUrl || null;

        let replyPropertyTitle = parsedRef?.title || null;

        let replyImageUrl = parsedRef?.imageUrl || null;

        let replyReference = parsedRef?.reference || null;

        if (!replyPropertyUrl) {

          const existingContact = await getMessengerContactByPsid(senderId);

          replyPropertyUrl = String(existingContact?.last_property_url || '').trim() || null;

          replyPropertyTitle = String(existingContact?.last_property_title || '').trim() || null;

          const parsedLastRef = parseMessengerRef(String(existingContact?.last_ref || '').trim());

          replyImageUrl = parsedLastRef?.imageUrl || null;

          replyReference = parsedLastRef?.reference || null;

          if (!replyPropertyUrl) {

            const recent = recentMessengerContexts.get(contextKey);

            const ageMs = Date.now() - Number(recent?.updatedAt || 0);

            if (recent?.propertyUrl && ageMs >= 0 && ageMs < 2 * 60 * 60 * 1000) {

              replyPropertyUrl = String(recent.propertyUrl || '').trim() || null;

              replyPropertyTitle = String(recent.title || '').trim() || null;

              replyImageUrl = String(recent.imageUrl || '').trim() || null;

              replyReference = String(recent.reference || '').trim() || null;

            }

          }

        }



        if (!sentViaReferralPending && replyPropertyUrl) {

          const sent = await sendMessengerPropertyReply({

            senderId,

            pageId,

            propertyUrl: replyPropertyUrl,

            propertyTitle: replyPropertyTitle,

            propertyImageUrl: replyImageUrl,

            propertyReference: replyReference,

          });

          if (sent) {

            pendingMessengerReplies.delete(contextKey);

          }

        } else if (!sentViaReferralPending && (event?.message?.text || event?.postback)) {

          pendingMessengerReplies.set(contextKey, Date.now());

        }

      }

    }



    return res.status(200).json({ ok: true });

  } catch (error) {

    console.error('Messenger webhook error:', error);

    return res.status(500).json({ error: 'Messenger webhook failed' });

  }

});



app.post('/api/auth/phone/direct-login', async (req, res) => {

  return res.status(403).json({ error: 'Connexion par telephone desactivee pour le moment' });

});



app.post('/api/auth/email/request-otp', otpRequestRateLimit, async (req, res) => {

  try {

    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

      void logSecurityEvent({

        req,

        eventType: 'email_otp_request_failed',

        severity: 'warning',

        success: false,

        statusCode: 400,

        userEmail: email || null,

        message: 'Email OTP request failed: invalid email format',

      });

      return res.status(400).json({ error: 'Email invalide' });

    }

    const code = String(process.env.EMAIL_OTP_STATIC_CODE || Math.floor(100000 + Math.random() * 900000));

    emailOtpSessions.set(email, {

      code,

      expiresAt: Date.now() + 5 * 60 * 1000,

      attempts: 0,

    });

    const delivery = await deliverEmailOtp({ email, code });

    void logSecurityEvent({

      req,

      eventType: 'email_otp_requested',

      severity: 'info',

      success: true,

      statusCode: 200,

      userEmail: email,

      message: `Email OTP requested for ${maskEmailForLog(email)}`,

    });

    res.json({

      success: true,

      expiresInSeconds: 300,

      ...(delivery.debugCode ? { debugCode: delivery.debugCode } : {}),

    });

  } catch (error) {

    if (String(error?.message || '') === 'email_otp_provider_missing') {

      void logSecurityEvent({

        req,

        eventType: 'email_otp_request_failed',

        severity: 'warning',

        success: false,

        statusCode: 503,

        userEmail: req.body?.email || null,

        message: 'Email OTP request failed: provider missing',

      });

      return res.status(503).json({

        error: "OTP email indisponible pour le moment. Configurez SMTP_HOST/SMTP_USER/SMTP_PASS ou ALLOW_EMAIL_OTP_IN_RESPONSE.",

      });

    }

    console.error('Error requesting email OTP:', error);

    void logSecurityEvent({

      req,

      eventType: 'email_otp_request_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      userEmail: req.body?.email || null,

      message: 'Email OTP request failed: server error',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Impossible d envoyer le code OTP par email' });

  }

});



app.post('/api/auth/email/verify-otp', otpVerifyRateLimit, async (req, res) => {

  try {

    await ensureAuthSchema();

    const email = String(req.body?.email || '').trim().toLowerCase();

    const code = String(req.body?.code || '').trim();

    if (!email || !code) {

      void logSecurityEvent({

        req,

        eventType: 'email_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 400,

        userEmail: email || null,

        message: 'Email OTP verify failed: missing email or code',

      });

      return res.status(400).json({ error: 'Email et code OTP obligatoires' });

    }

    const session = emailOtpSessions.get(email);

    if (!session) {

      void logSecurityEvent({

        req,

        eventType: 'email_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 404,

        userEmail: email,

        message: 'Email OTP verify failed: session not found or expired',

      });

      return res.status(404).json({ error: 'Code OTP introuvable ou expire' });

    }

    if (Date.now() > Number(session.expiresAt || 0)) {

      emailOtpSessions.delete(email);

      void logSecurityEvent({

        req,

        eventType: 'email_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 410,

        userEmail: email,

        message: 'Email OTP verify failed: code expired',

      });

      return res.status(410).json({ error: 'Code OTP expire' });

    }

    if (String(session.code) !== code) {

      session.attempts = Number(session.attempts || 0) + 1;

      if (session.attempts >= 5) {

        emailOtpSessions.delete(email);

      } else {

        emailOtpSessions.set(email, session);

      }

      void logSecurityEvent({

        req,

        eventType: 'email_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 401,

        userEmail: email,

        message: 'Email OTP verify failed: invalid code',

      });

      return res.status(401).json({ error: 'Code OTP invalide' });

    }

    emailOtpSessions.delete(email);

    const user = await upsertEmailOtpUser({ email });

    setAuthSessionCookie(req, res, user);

    void logSecurityEvent({

      req,

      eventType: 'email_otp_verify_success',

      severity: 'info',

      success: true,

      statusCode: 200,

      userId: user?.id || null,

      userEmail: user?.email || email,

      message: 'Email OTP verified successfully',

    });

    res.json({ user: buildAuthUser(user) });

  } catch (error) {

    console.error('Error verifying email OTP:', error);

    void logSecurityEvent({

      req,

      eventType: 'email_otp_verify_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      userEmail: req.body?.email || null,

      message: 'Email OTP verify failed: server error',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Impossible de verifier le code OTP email' });

  }

});



app.post('/api/auth/phone/request-otp', otpRequestRateLimit, async (req, res) => {

  try {

    const telephone = normalizePhoneNumber(req.body?.telephone);

    if (!telephone || telephone.replace(/\D/g, '').length < 8) {

      void logSecurityEvent({

        req,

        eventType: 'phone_otp_request_failed',

        severity: 'warning',

        success: false,

        statusCode: 400,

        message: 'Phone OTP request failed: invalid phone number',

      });

      return res.status(400).json({ error: 'Numero de telephone invalide' });

    }



    const code = String(process.env.OTP_STATIC_CODE || Math.floor(100000 + Math.random() * 900000));

    const expiresAt = Date.now() + 5 * 60 * 1000;

    phoneOtpSessions.set(telephone, {

      code,

      expiresAt,

      attempts: 0,

    });



    const delivery = await deliverPhoneOtp({ telephone, code });

    void logSecurityEvent({

      req,

      eventType: 'phone_otp_requested',

      severity: 'info',

      success: true,

      statusCode: 200,

      message: `Phone OTP requested for ${maskPhone(telephone)}`,

    });

    res.json({

      success: true,

      expiresInSeconds: 300,

      ...(delivery.debugCode ? { debugCode: delivery.debugCode } : {}),

    });

  } catch (error) {

    if (String(error?.message || '') === 'otp_provider_missing') {

      void logSecurityEvent({

        req,

        eventType: 'phone_otp_request_failed',

        severity: 'warning',

        success: false,

        statusCode: 503,

        message: 'Phone OTP request failed: provider missing',

      });

      return res.status(503).json({

        error: "OTP telephone indisponible pour le moment. Configurez OTP_PROVIDER_WEBHOOK_URL ou ALLOW_OTP_IN_RESPONSE.",

      });

    }

    console.error('Error requesting phone OTP:', error);

    void logSecurityEvent({

      req,

      eventType: 'phone_otp_request_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      message: 'Phone OTP request failed: server error',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Impossible d envoyer le code OTP' });

  }

});



app.post('/api/auth/phone/verify-otp', otpVerifyRateLimit, async (req, res) => {

  try {

    await ensureAuthSchema();

    const telephone = normalizePhoneNumber(req.body?.telephone);

    const code = String(req.body?.code || '').trim();

    if (!telephone || !code) {

      void logSecurityEvent({

        req,

        eventType: 'phone_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 400,

        message: 'Phone OTP verify failed: missing phone or code',

      });

      return res.status(400).json({ error: 'Telephone et code OTP obligatoires' });

    }



    const session = phoneOtpSessions.get(telephone);

    if (!session) {

      void logSecurityEvent({

        req,

        eventType: 'phone_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 404,

        message: 'Phone OTP verify failed: session not found or expired',

      });

      return res.status(404).json({ error: 'Code OTP introuvable ou expire' });

    }

    if (Date.now() > Number(session.expiresAt || 0)) {

      phoneOtpSessions.delete(telephone);

      void logSecurityEvent({

        req,

        eventType: 'phone_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 410,

        message: 'Phone OTP verify failed: code expired',

      });

      return res.status(410).json({ error: 'Code OTP expire' });

    }

    if (String(session.code) !== code) {

      session.attempts = Number(session.attempts || 0) + 1;

      if (session.attempts >= 5) {

        phoneOtpSessions.delete(telephone);

      } else {

        phoneOtpSessions.set(telephone, session);

      }

      void logSecurityEvent({

        req,

        eventType: 'phone_otp_verify_failed',

        severity: 'warning',

        success: false,

        statusCode: 401,

        message: 'Phone OTP verify failed: invalid code',

      });

      return res.status(401).json({ error: 'Code OTP invalide' });

    }



    phoneOtpSessions.delete(telephone);

    const user = await upsertPhoneUser({ telephone });

    setAuthSessionCookie(req, res, user);

    void logSecurityEvent({

      req,

      eventType: 'phone_otp_verify_success',

      severity: 'info',

      success: true,

      statusCode: 200,

      userId: user?.id || null,

      userEmail: user?.email || null,

      message: 'Phone OTP verified successfully',

    });

    res.json({ user: buildAuthUser(user) });

  } catch (error) {

    console.error('Error verifying phone OTP:', error);

    void logSecurityEvent({

      req,

      eventType: 'phone_otp_verify_failed',

      severity: 'error',

      success: false,

      statusCode: 500,

      message: 'Phone OTP verify failed: server error',

      metadata: { error: String(error?.message || error || '') },

    });

    res.status(500).json({ error: 'Impossible de verifier le code OTP' });

  }

});



app.get('/api/auth/google/start', async (req, res) => {

  const clientId = process.env.GOOGLE_CLIENT_ID;

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;

  const returnTo = sanitizeReturnToPath(req.query.return_to || req.query.returnTo);



  if (!clientId) {

    return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_config_missing', returnTo }));

  }



  const params = new URLSearchParams({

    client_id: clientId,

    redirect_uri: redirectUri,

    response_type: 'code',

    scope: 'openid email profile',

    access_type: 'offline',

    prompt: 'select_account',

  });

  if (returnTo) {

    params.set('state', encodeOauthState({ returnTo }));

  }



  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

});



app.get('/api/auth/google/callback', async (req, res) => {

  const oauthState = decodeOauthState(req.query.state);

  const returnTo = sanitizeReturnToPath(oauthState?.returnTo);

  try {

    const code = req.query.code;

    if (!code) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_code_missing', returnTo }));

    }



    const clientId = process.env.GOOGLE_CLIENT_ID;

    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;



    if (!clientId || !clientSecret) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_config_missing', returnTo }));

    }



    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {

      method: 'POST',

      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

      body: new URLSearchParams({

        code: String(code),

        client_id: clientId,

        client_secret: clientSecret,

        redirect_uri: redirectUri,

        grant_type: 'authorization_code',

      }),

    });



    if (!tokenResponse.ok) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_token_exchange_failed', returnTo }));

    }



    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_access_token_missing', returnTo }));

    }



    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {

      headers: {

        Authorization: `Bearer ${tokenData.access_token}`,

      },

    });



    if (!profileResponse.ok) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_profile_fetch_failed', returnTo }));

    }



    const profile = await profileResponse.json();

    if (!profile.email) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'google_email_missing', returnTo }));

    }



    const user = await upsertSocialUser({

      email: profile.email,

      name: profile.name || profile.email.split('@')[0],

      avatar: profile.picture || null,

      provider: 'google',

      providerUserId: profile.sub || null,

    });



    const socialToken = createTemporarySocialToken(user);

    res.redirect(buildFrontendLoginUrl({ socialToken, returnTo }));

  } catch (error) {

    console.error('Google callback error:', error);

    res.redirect(buildFrontendLoginUrl({ oauthError: 'google_callback_failed', returnTo }));

  }

});



app.get('/api/auth/facebook/start', async (req, res) => {

  const mobilePreferred = isMobileUserAgent(req.headers['user-agent']);

  const returnTo = sanitizeReturnToPath(req.query.return_to || req.query.returnTo);

  const oauthUrl = buildFacebookOauthUrl({ mobilePreferred, returnTo, req });

  if (!oauthUrl) {

    return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_config_missing', returnTo }));

  }

  res.redirect(oauthUrl);

});



app.get('/api/auth/facebook/authorize-url', (req, res) => {

  const mobilePreferred = isMobileUserAgent(req.headers['user-agent']);

  const oauthUrl = buildFacebookOauthUrl({ mobilePreferred, req });

  if (!oauthUrl) {

    return res.status(503).json({ error: 'facebook_config_missing' });

  }

  res.json({ url: oauthUrl });

});



app.get('/api/auth/facebook/callback', async (req, res) => {

  const oauthState = decodeOauthState(req.query.state);

  const returnTo = sanitizeReturnToPath(oauthState?.returnTo);

  try {

    const code = req.query.code;

    if (!code) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_code_missing', returnTo }));

    }



    const clientId = process.env.FACEBOOK_CLIENT_ID;

    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;

    const redirectUri = resolveFacebookRedirectUri(req);



    if (!clientId || !clientSecret) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_config_missing', returnTo }));

    }



    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');

    tokenUrl.searchParams.set('client_id', clientId);

    tokenUrl.searchParams.set('client_secret', clientSecret);

    tokenUrl.searchParams.set('redirect_uri', redirectUri);

    tokenUrl.searchParams.set('code', String(code));



    const tokenResponse = await fetch(tokenUrl);

    const tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok) {

      console.error('Facebook token exchange failed:', tokenData);

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_token_exchange_failed', returnTo }));

    }

    if (!tokenData.access_token) {

      console.error('Facebook access token missing:', tokenData);

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_access_token_missing', returnTo }));

    }



    const profileUrl = new URL('https://graph.facebook.com/me');

    profileUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');

    profileUrl.searchParams.set('access_token', tokenData.access_token);



    const profileResponse = await fetch(profileUrl);

    if (!profileResponse.ok) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_profile_fetch_failed', returnTo }));

    }



    const profile = await profileResponse.json();

    const fallbackEmail = profile.id

      ? `facebook_${String(profile.id).replace(/[^a-zA-Z0-9._-]/g, '')}@facebook.dwira.local`

      : '';

    const resolvedEmail = String(profile.email || fallbackEmail || '').trim().toLowerCase();

    if (!resolvedEmail) {

      return res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_email_missing', returnTo }));

    }



    const user = await upsertSocialUser({

      email: resolvedEmail,

      name: profile.name || resolvedEmail.split('@')[0],

      avatar: profile.picture?.data?.url || null,

      provider: 'facebook',

      providerUserId: profile.id || null,

    });



    const socialToken = createTemporarySocialToken(user);

    res.redirect(buildFrontendLoginUrl({ socialToken, returnTo }));

  } catch (error) {

    console.error('Facebook callback error:', error);

    res.redirect(buildFrontendLoginUrl({ oauthError: 'facebook_callback_failed', returnTo }));

  }

});



app.get('/api/auth/social/session/:token', (req, res) => {

  const user = consumeTemporarySocialToken(req.params.token);

  if (!user) {

    return res.status(404).json({ error: 'Session sociale invalide ou expirÃ©e' });

  }

  setAuthSessionCookie(req, res, user);

  res.json({ user: buildAuthUser(user) });

});



app.get('/api/client-interactions', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query(

      `SELECT id, client_user_id, client_email, client_name, type, bien_id, property_title, source, device_id, session_id, path, metadata_json,

              DATE_FORMAT(event_at, '%Y-%m-%d %H:%i:%s') AS event_at

       FROM client_interactions

       ORDER BY event_at DESC`

    );

    res.json((rows || []).map((row) => ({

      id: row.id,

      clientUserId: row.client_user_id || undefined,

      clientEmail: row.client_email || '',

      clientName: row.client_name || undefined,

      type: row.type,

      bienId: row.bien_id || '',

      propertyTitle: row.property_title || '',

      source: row.source,

      deviceId: row.device_id || undefined,

      sessionId: row.session_id || undefined,

      path: row.path || undefined,

      metadata: (() => {

        try {

          return row.metadata_json ? JSON.parse(String(row.metadata_json)) : null;

        } catch {

          return null;

        }

      })(),

      dateTime: row.event_at,

    })));

  } catch (error) {

    console.error('Error fetching client interactions:', error);

    res.status(500).json({ error: 'Impossible de charger les interactions clients' });

  }

});




app.put('/api/client-interactions/:id/lu', requireAdminSession, async (req, res) => {
  try {
    const interactionId = String(req.params.id || '').trim();
    if (!interactionId) {
      return res.status(400).json({ error: 'id requis' });
    }
    const [rows] = await pool.query(
      `SELECT id, metadata_json
       FROM client_interactions
       WHERE id = ?
       LIMIT 1`,
      [interactionId]
    );
    const row = rows?.[0];
    if (!row) {
      return res.status(404).json({ error: 'Interaction introuvable' });
    }
    let metadata = null;
    try {
      metadata = row.metadata_json ? JSON.parse(String(row.metadata_json)) : null;
    } catch {
      metadata = null;
    }
    const nextMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      lu: true,
      readByAdmin: true,
      readByAdminAt: getAgencySqlDateTime(),
    };
    await pool.query(
      'UPDATE client_interactions SET metadata_json = ? WHERE id = ?',
      [JSON.stringify(nextMetadata), interactionId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marking client interaction as read:', error);
    res.status(500).json({ error: 'Failed to mark interaction as read' });
  }
});

app.post('/api/client-interactions', async (req, res) => {

  try {

    const sessionUser = getSessionUserFromRequest(req);

    const clientUserId = sessionUser?.id || String(req.body?.clientUserId || '').trim() || null;

    const clientEmail = sessionUser?.email || String(req.body?.clientEmail || '').trim().toLowerCase();

    const clientName = sessionUser?.name || String(req.body?.clientName || '').trim() || null;

    const type = String(req.body?.type || '').trim().toLowerCase();

    const bienId = String(req.body?.bienId || '').trim() || null;

    const propertyTitle = String(req.body?.propertyTitle || '').trim() || null;

    const sessionId = String(req.body?.sessionId || '').trim() || null;

    const routePath = String(req.body?.path || '').trim() || null;

    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;



    if (!clientEmail && !String(req?.deviceId || '').trim()) {

      return res.status(400).json({ error: 'Identite client insuffisante (email ou device requis)' });

    }

    const allowedTypes = new Set(['visite', 'like', 'partage', 'site_open', 'session_start', 'reservation_attempt', 'reservation_submitted']);

    if (!allowedTypes.has(type)) return res.status(400).json({ error: 'Type interaction invalide' });

    if (['visite', 'like', 'partage', 'reservation_attempt', 'reservation_submitted'].includes(type) && !bienId) {

      return res.status(400).json({ error: 'Bien obligatoire pour ce type interaction' });

    }



    const created = await appendClientInteraction({

      req,

      clientUserId,

      clientEmail,

      clientName,

      type,

      bienId,

      propertyTitle,

      source: 'site_public',

      sessionId,

      routePath,

      metadata,

    });

    res.status(201).json(created);

  } catch (error) {

    console.error('Error creating client interaction:', error);

    res.status(500).json({ error: "Impossible d'enregistrer l interaction client" });

  }

});



app.get('/api/clienteles/profiles', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query('SELECT * FROM clienteles_profiles ORDER BY updated_at DESC, created_at DESC');

    res.json((rows || []).map((row) => normalizeClienteleProfileRow(row)));

  } catch (error) {

    console.error('Error fetching clienteles profiles:', error);

    res.status(500).json({ error: 'Impossible de charger les profils clienteles' });

  }

});



app.get('/api/clienteles/tasks/:sourceTable/:sourceId', requireAdminSession, async (req, res) => {

  try {

    const sourceTable = String(req.params.sourceTable || '').trim();

    const sourceId = String(req.params.sourceId || '').trim();

    if (!['utilisateurs', 'locataires', 'proprietaires'].includes(sourceTable)) {

      return res.status(400).json({ error: 'sourceTable invalide' });

    }

    if (!sourceId) {

      return res.status(400).json({ error: 'sourceId requis' });

    }

    const tasks = await syncClienteleTasks(sourceTable, sourceId);

    res.json(tasks);

  } catch (error) {

    console.error('Error syncing clientele tasks:', error);

    res.status(500).json({ error: 'Impossible de charger les taches clienteles' });

  }

});



app.put('/api/clienteles/profiles/:sourceTable/:sourceId', requireAdminSession, async (req, res) => {

  try {

    const sourceTable = String(req.params.sourceTable || '').trim();

    const sourceId = String(req.params.sourceId || '').trim();

    if (!['utilisateurs', 'locataires', 'proprietaires'].includes(sourceTable)) {

      return res.status(400).json({ error: 'sourceTable invalide' });

    }

    if (!sourceId) {

      return res.status(400).json({ error: 'sourceId requis' });

    }



    const now = getAgencySqlDateTime();

    const profileId = `cp_${sourceTable}_${sourceId}`.replace(/[^a-zA-Z0-9_]/g, '_');

    const body = req.body || {};

    const payload = [

      body.linkedUserId ? String(body.linkedUserId).trim() : null,

      body.email ? String(body.email).trim().toLowerCase() : null,

      ['prospect', 'actif', 'inactif', 'blackliste'].includes(String(body.globalStatus || '')) ? String(body.globalStatus) : 'prospect',

      body.scoreOverride === null || body.scoreOverride === undefined || body.scoreOverride === '' ? null : Number(body.scoreOverride),

      body.canalEntree ? String(body.canalEntree).trim() : null,

      body.lastInteractionAt ? String(body.lastInteractionAt).trim().replace('T', ' ') : null,

      body.lastInteractionNote ? String(body.lastInteractionNote) : null,

      JSON.stringify(Array.isArray(body.activeRoles) ? body.activeRoles : []),

      body.vip ? 1 : 0,

      body.blacklistReason ? String(body.blacklistReason) : null,

      body.locataireStatus ? String(body.locataireStatus) : null,

      body.locCinValidee ? 1 : 0,

      body.locContratSigne ? 1 : 0,

      body.locDepotEncaisse ? 1 : 0,

      body.locJustificatifRevenus ? 1 : 0,

      body.locAttestationTravail ? 1 : 0,

      body.locNbPersonnes === null || body.locNbPersonnes === undefined || body.locNbPersonnes === '' ? null : Number(body.locNbPersonnes),

      body.locJourEcheance === null || body.locJourEcheance === undefined || body.locJourEcheance === '' ? null : Number(body.locJourEcheance),

      body.locPenaliteMode ? String(body.locPenaliteMode) : null,

      body.locPenaliteValeur === null || body.locPenaliteValeur === undefined || body.locPenaliteValeur === '' ? null : Number(body.locPenaliteValeur),

      body.saisonMinNuits === null || body.saisonMinNuits === undefined || body.saisonMinNuits === '' ? null : Number(body.saisonMinNuits),

      body.saisonMaxNuits === null || body.saisonMaxNuits === undefined || body.saisonMaxNuits === '' ? null : Number(body.saisonMaxNuits),

      body.saisonCapaciteMax === null || body.saisonCapaciteMax === undefined || body.saisonCapaciteMax === '' ? null : Number(body.saisonCapaciteMax),

      JSON.stringify(Array.isArray(body.saisonJoursArrivee) ? body.saisonJoursArrivee : []),

      JSON.stringify(Array.isArray(body.saisonJoursDepart) ? body.saisonJoursDepart : []),

      body.saisonAcomptePourcentage === null || body.saisonAcomptePourcentage === undefined || body.saisonAcomptePourcentage === '' ? null : Number(body.saisonAcomptePourcentage),

      body.saisonDocumentsRecus ? 1 : 0,

      body.saisonDepotBloque ? 1 : 0,

      body.saisonDepotRetenuMontant === null || body.saisonDepotRetenuMontant === undefined || body.saisonDepotRetenuMontant === '' ? null : Number(body.saisonDepotRetenuMontant),

      body.saisonDepotRetenuMotif ? String(body.saisonDepotRetenuMotif) : null,

      body.acheteurStatus ? String(body.acheteurStatus) : null,

      JSON.stringify(Array.isArray(body.acheteurZones) ? body.acheteurZones : []),

      JSON.stringify(Array.isArray(body.acheteurTypes) ? body.acheteurTypes : []),

      body.acheteurBudgetMin === null || body.acheteurBudgetMin === undefined || body.acheteurBudgetMin === '' ? null : Number(body.acheteurBudgetMin),

      body.acheteurBudgetMax === null || body.acheteurBudgetMax === undefined || body.acheteurBudgetMax === '' ? null : Number(body.acheteurBudgetMax),

      body.acheteurSurfaceMin === null || body.acheteurSurfaceMin === undefined || body.acheteurSurfaceMin === '' ? null : Number(body.acheteurSurfaceMin),

      body.acheteurDistancePlageMax === null || body.acheteurDistancePlageMax === undefined || body.acheteurDistancePlageMax === '' ? null : Number(body.acheteurDistancePlageMax),

      body.acheteurFinancementMode ? String(body.acheteurFinancementMode) : null,

      body.acheteurNextAction ? String(body.acheteurNextAction) : null,

      body.acheteurActionDueAt ? String(body.acheteurActionDueAt).trim().replace('T', ' ') : null,

      body.proprietaireStatus ? String(body.proprietaireStatus) : null,

      body.proprietaireMandatType ? String(body.proprietaireMandatType) : null,

      body.proprietaireMandatStart ? String(body.proprietaireMandatStart) : null,

      body.proprietaireMandatEnd ? String(body.proprietaireMandatEnd) : null,

      body.proprietaireReversementFrequence ? String(body.proprietaireReversementFrequence) : null,

      body.proprietaireModePaiement ? String(body.proprietaireModePaiement) : null,

      body.proprietaireCommissionPercent === null || body.proprietaireCommissionPercent === undefined || body.proprietaireCommissionPercent === '' ? null : Number(body.proprietaireCommissionPercent),

      body.proprietairePlafondTravaux === null || body.proprietairePlafondTravaux === undefined || body.proprietairePlafondTravaux === '' ? null : Number(body.proprietairePlafondTravaux),

      body.proprietaireLastStatementAt ? String(body.proprietaireLastStatementAt) : null,

      now,

      now,

    ];



    await pool.query(

      `INSERT INTO clienteles_profiles (

        id, source_table, source_id, linked_user_id, email, global_status, score_override, canal_entree, last_interaction_at, last_interaction_note,

        active_roles_json, vip, blacklist_reason, locataire_status, loc_cin_validee, loc_contrat_signe, loc_depot_encaisse, loc_justificatif_revenus,

        loc_attestation_travail, loc_nb_personnes, loc_jour_echeance, loc_penalite_mode, loc_penalite_valeur, saison_min_nuits, saison_max_nuits,

        saison_capacite_max, saison_jours_arrivee_json, saison_jours_depart_json, saison_acompte_pourcentage, saison_documents_recus, saison_depot_bloque,

        saison_depot_retenu_montant, saison_depot_retenu_motif, acheteur_status, acheteur_zones_json, acheteur_types_json, acheteur_budget_min,

        acheteur_budget_max, acheteur_surface_min, acheteur_distance_plage_max, acheteur_financement_mode, acheteur_next_action, acheteur_action_due_at,

        proprietaire_status, proprietaire_mandat_type, proprietaire_mandat_start, proprietaire_mandat_end, proprietaire_reversement_frequence,

        proprietaire_mode_paiement, proprietaire_commission_percent, proprietaire_plafond_travaux, proprietaire_last_statement_at, created_at, updated_at

      ) VALUES (

        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?

      )

      ON DUPLICATE KEY UPDATE

        linked_user_id = VALUES(linked_user_id),

        email = VALUES(email),

        global_status = VALUES(global_status),

        score_override = VALUES(score_override),

        canal_entree = VALUES(canal_entree),

        last_interaction_at = VALUES(last_interaction_at),

        last_interaction_note = VALUES(last_interaction_note),

        active_roles_json = VALUES(active_roles_json),

        vip = VALUES(vip),

        blacklist_reason = VALUES(blacklist_reason),

        locataire_status = VALUES(locataire_status),

        loc_cin_validee = VALUES(loc_cin_validee),

        loc_contrat_signe = VALUES(loc_contrat_signe),

        loc_depot_encaisse = VALUES(loc_depot_encaisse),

        loc_justificatif_revenus = VALUES(loc_justificatif_revenus),

        loc_attestation_travail = VALUES(loc_attestation_travail),

        loc_nb_personnes = VALUES(loc_nb_personnes),

        loc_jour_echeance = VALUES(loc_jour_echeance),

        loc_penalite_mode = VALUES(loc_penalite_mode),

        loc_penalite_valeur = VALUES(loc_penalite_valeur),

        saison_min_nuits = VALUES(saison_min_nuits),

        saison_max_nuits = VALUES(saison_max_nuits),

        saison_capacite_max = VALUES(saison_capacite_max),

        saison_jours_arrivee_json = VALUES(saison_jours_arrivee_json),

        saison_jours_depart_json = VALUES(saison_jours_depart_json),

        saison_acompte_pourcentage = VALUES(saison_acompte_pourcentage),

        saison_documents_recus = VALUES(saison_documents_recus),

        saison_depot_bloque = VALUES(saison_depot_bloque),

        saison_depot_retenu_montant = VALUES(saison_depot_retenu_montant),

        saison_depot_retenu_motif = VALUES(saison_depot_retenu_motif),

        acheteur_status = VALUES(acheteur_status),

        acheteur_zones_json = VALUES(acheteur_zones_json),

        acheteur_types_json = VALUES(acheteur_types_json),

        acheteur_budget_min = VALUES(acheteur_budget_min),

        acheteur_budget_max = VALUES(acheteur_budget_max),

        acheteur_surface_min = VALUES(acheteur_surface_min),

        acheteur_distance_plage_max = VALUES(acheteur_distance_plage_max),

        acheteur_financement_mode = VALUES(acheteur_financement_mode),

        acheteur_next_action = VALUES(acheteur_next_action),

        acheteur_action_due_at = VALUES(acheteur_action_due_at),

        proprietaire_status = VALUES(proprietaire_status),

        proprietaire_mandat_type = VALUES(proprietaire_mandat_type),

        proprietaire_mandat_start = VALUES(proprietaire_mandat_start),

        proprietaire_mandat_end = VALUES(proprietaire_mandat_end),

        proprietaire_reversement_frequence = VALUES(proprietaire_reversement_frequence),

        proprietaire_mode_paiement = VALUES(proprietaire_mode_paiement),

        proprietaire_commission_percent = VALUES(proprietaire_commission_percent),

        proprietaire_plafond_travaux = VALUES(proprietaire_plafond_travaux),

        proprietaire_last_statement_at = VALUES(proprietaire_last_statement_at),

        updated_at = VALUES(updated_at)`,

      [profileId, sourceTable, sourceId, ...payload]

    );



    const profile = await fetchClienteleProfileBySource(sourceTable, sourceId);

    res.json(profile);

  } catch (error) {

    console.error('Error saving clientele profile:', error);

    res.status(500).json({ error: 'Impossible de sauvegarder le profil clientele' });

  }

});



app.put('/api/auth/social/profile/:id', requireAuthenticatedSession, reservationMutationRateLimit, async (req, res) => {

  try {

    const { id } = req.params;

    const firstName = String(req.body?.firstName || req.body?.prenom || '').trim();

    const lastName = String(req.body?.lastName || req.body?.nomFamille || req.body?.nom || '').trim();

    const fallbackFullName = String(req.body?.name || '').trim();

    const nom = [firstName, lastName].filter(Boolean).join(' ').trim() || fallbackFullName;

    const email = String(req.body?.email || '').trim().toLowerCase();

    const telephone = normalizePhoneNumber(req.body?.telephone || '');

    const clientType = String(req.body?.clientType || req.body?.client_type || '').trim().toLowerCase();

    const cin = String(req.body?.cin || '').trim();

    const cinImageUrl = String(req.body?.cinImageUrl || req.body?.cin_image_url || '').trim();

    const avatar = req.body?.avatar === undefined ? undefined : normalizeAvatarUrl(req.body.avatar);

    const now = getAgencySqlDateTime();



    const requester = req.authUser || null;

    if (!id) return res.status(400).json({ error: 'Utilisateur introuvable' });

    if (!requester || (requester.role !== 'admin' && String(requester.id || '') !== String(id))) {

      void logSecurityEvent({

        req,

        eventType: 'social_profile_update_denied',

        severity: 'warning',

        success: false,

        statusCode: 403,

        message: 'Social profile update denied by ownership check',

        metadata: { targetUserId: id, requesterUserId: requester?.id || null },

      });

      return res.status(403).json({ error: 'Action non autorisee' });

    }

    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom et prenom obligatoires' });

    if (!telephone) return res.status(400).json({ error: 'Numero de telephone obligatoire' });

    if (!['proprietaire', 'locataire', 'acheteur', 'agent_amicale'].includes(clientType)) {

      return res.status(400).json({ error: 'Type client obligatoire (proprietaire, locataire, acheteur ou agent_amicale)' });

    }



    const [existingRows] = await pool.query('SELECT id FROM utilisateurs WHERE id = ? LIMIT 1', [id]);

    if (!existingRows[0]) {

      return res.status(404).json({ error: 'Utilisateur non trouve' });

    }



    if (email) {

      const [emailRows] = await pool.query('SELECT id FROM utilisateurs WHERE email = ? AND id <> ? LIMIT 1', [email, id]);

      if (emailRows[0]) {

        return res.status(409).json({ error: 'Cet email est deja utilise' });

      }

    }



    const [currentRows] = await pool.query('SELECT email FROM utilisateurs WHERE id = ? LIMIT 1', [id]);

    const currentEmail = String(currentRows?.[0]?.email || '').trim().toLowerCase();

    const resolvedEmail = email || currentEmail;



    await pool.query(

      `UPDATE utilisateurs

       SET nom = ?, email = ?, telephone = ?, client_type = ?, cin = ?, cin_image_url = ?, avatar = COALESCE(?, avatar),

           profile_completed_at = ?, updated_at = ?

       WHERE id = ?`,

      [nom, resolvedEmail, telephone, clientType || null, cin || null, cinImageUrl || null, avatar || null, now, now, id]

    );



    const [rows] = await pool.query(

      `SELECT id, nom, email, role, avatar, telephone, client_type, cin, cin_image_url, profile_completed_at,

              auth_provider, provider_user_id, last_login_at, updated_at

       FROM utilisateurs

       WHERE id = ? LIMIT 1`,

      [id]

    );

    const user = rows[0];

    if (!user) {

      return res.status(404).json({ error: 'Utilisateur non trouve apres mise a jour' });

    }



    const identityName = splitFullName(user.nom || '');

    await bindDeviceToUser(req, id, {

      reason: 'profile_completed',

      identity: {

        firstName: identityName.firstName || null,

        lastName: identityName.lastName || null,

        fullName: user.nom || null,

        telephone: user.telephone || null,

        cin: user.cin || null,

        email: user.email || null,

      },

    });

    const authUser = buildAuthUser({

      id: user.id,

      email: user.email,

      name: user.nom,

      firstName: identityName.firstName || null,

      lastName: identityName.lastName || null,

      role: user.role,

      avatar: user.avatar || null,

      clientType: user.client_type || null,

      telephone: user.telephone || null,

      cin: user.cin || null,

      cinImageUrl: user.cin_image_url || null,

      profileCompleted: isLegalIdentityProfileCompleted(user),

    });

    setAuthSessionCookie(req, res, authUser);

    res.json({ user: authUser });

  } catch (error) {

    console.error('Error completing social profile:', error);

    res.status(500).json({ error: 'Erreur lors de la sauvegarde du profil client' });

  }

});



app.get('/api/utilisateurs', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query('SELECT * FROM utilisateurs ORDER BY created_at DESC');

    res.json(rows);

  } catch (error) {

    res.status(500).json({ error: 'Failed to fetch utilisateurs' });

  }

});



app.post('/api/utilisateurs', requireAdminSession, async (req, res) => {

  try {

    const { id, nom, email, role, avatar, telephone, client_type, cin, cin_image_url } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!nom || !normalizedEmail) {

      return res.status(400).json({ error: 'nom and email are required' });

    }

    const [emailRows] = await pool.query('SELECT id FROM utilisateurs WHERE email = ? LIMIT 1', [normalizedEmail]);

    if (emailRows[0]) {

      return res.status(409).json({ error: 'Cet email/utilisateur existe deja', existingId: emailRows[0].id });

    }

    const newId = id || 'u' + Date.now();

    const created_at = new Date().toISOString().split('T')[0];

    await pool.query(

      `INSERT INTO utilisateurs (id, nom, email, role, avatar, telephone, client_type, cin, cin_image_url, created_at)

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [newId, nom, normalizedEmail, role || 'user', avatar || null, telephone || null, client_type || null, cin || null, cin_image_url || null, created_at]

    );

    const [newUser] = await pool.query('SELECT * FROM utilisateurs WHERE id = ?', [newId]);

    res.status(201).json(newUser[0]);

  } catch (error) {

    console.error('Error creating utilisateur:', error);

    res.status(500).json({ error: 'Failed to create utilisateur', details: String(error?.message || error) });

  }

});



app.put('/api/utilisateurs/:id', requireAdminSession, async (req, res) => {

  try {

    const { nom, email, role, avatar, telephone, client_type, cin, cin_image_url } = req.body;

    await pool.query(

      `UPDATE utilisateurs

       SET nom = ?, email = ?, role = ?, avatar = ?, telephone = ?, client_type = ?, cin = ?, cin_image_url = ?, updated_at = ?

       WHERE id = ?`,

      [

        nom,

        email,

        role || 'user',

        avatar || null,

        telephone || null,

        client_type || null,

        cin || null,

        cin_image_url || null,

        new Date().toISOString().slice(0, 19).replace('T', ' '),

        req.params.id,

      ]

    );

    const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE id = ? LIMIT 1', [req.params.id]);

    res.json(rows[0] || null);

  } catch (error) {

    console.error('Error updating utilisateur:', error);

    res.status(500).json({ error: 'Failed to update utilisateur' });

  }

});



app.delete('/api/utilisateurs/:id', requireAdminSession, async (req, res) => {

  try {

    await pool.query('DELETE FROM agent_amicale_profiles WHERE user_id = ?', [req.params.id]);

    await pool.query('DELETE FROM utilisateurs WHERE id = ?', [req.params.id]);

    res.json({ success: true });

  } catch (error) {

    console.error('Error deleting utilisateur:', error);

    res.status(500).json({ error: 'Failed to delete utilisateur' });

  }

});



app.get('/api/public/amicales', async (req, res) => {

  try {

    await cleanupNamelessAmicalesAndTheirDemands();

    const [rows] = await pool.query(

      `SELECT id, name, code, logo_url

       FROM amicales

       WHERE name IS NOT NULL

         AND TRIM(name) <> ''

       ORDER BY updated_at DESC, created_at DESC`

    );

    res.json(Array.isArray(rows) ? rows : []);

  } catch (error) {

    console.error('Error fetching public amicales:', error);

    res.status(500).json({ error: 'Failed to fetch amicales' });

  }

});



app.get('/api/amicales', requireAdminSession, async (req, res) => {

  try {

    await cleanupNamelessAmicalesAndTheirDemands();

    const [rows] = await pool.query(

      `SELECT id, name, code, logo_url, created_at, updated_at

       FROM amicales

       WHERE name IS NOT NULL

         AND TRIM(name) <> ''

       ORDER BY updated_at DESC, created_at DESC`

    );

    res.json(Array.isArray(rows) ? rows : []);

  } catch (error) {

    console.error('Error fetching amicales:', error);

    res.status(500).json({ error: 'Failed to fetch amicales' });

  }

});



app.post('/api/amicales', requireAdminSession, async (req, res) => {

  try {

    const id = String(req.body?.id || `am_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).trim();

    const name = String(req.body?.name || '').trim();

    const code = String(req.body?.code || '').trim();

    const logoUrl = String(req.body?.logo_url || req.body?.logoUrl || '').trim() || null;

    if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

    const now = getAgencySqlDateTime();

    await pool.query(

      `INSERT INTO amicales (id, name, code, logo_url, created_at, updated_at)

       VALUES (?, ?, ?, ?, ?, ?)`,

      [id, name, code, logoUrl, now, now]

    );

    const [rows] = await pool.query('SELECT * FROM amicales WHERE id = ? LIMIT 1', [id]);

    res.status(201).json(rows?.[0] || null);

  } catch (error) {

    console.error('Error creating amicale:', error);

    if (String(error?.code || '') === 'ER_DUP_ENTRY') {

      return res.status(409).json({ error: 'Ce nom d amicale existe deja' });

    }

    res.status(500).json({ error: 'Failed to create amicale' });

  }

});



app.put('/api/amicales/:id', requireAdminSession, async (req, res) => {

  try {

    const id = String(req.params.id || '').trim();

    const name = String(req.body?.name || '').trim();

    const code = String(req.body?.code || '').trim();

    const logoUrl = String(req.body?.logo_url || req.body?.logoUrl || '').trim() || null;

    if (!id) return res.status(400).json({ error: 'id is required' });

    if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

    const now = getAgencySqlDateTime();

    await pool.query(

      `UPDATE amicales

       SET name = ?, code = ?, logo_url = ?, updated_at = ?

       WHERE id = ?`,

      [name, code, logoUrl, now, id]

    );

    const [rows] = await pool.query('SELECT * FROM amicales WHERE id = ? LIMIT 1', [id]);

    res.json(rows?.[0] || null);

  } catch (error) {

    console.error('Error updating amicale:', error);

    res.status(500).json({ error: 'Failed to update amicale' });

  }

});



app.delete('/api/amicales/:id', requireAdminSession, async (req, res) => {

  try {

    const id = String(req.params.id || '').trim();

    if (!id) return res.status(400).json({ error: 'id is required' });

    const [demandRows] = await pool.query('SELECT * FROM reservation_demands WHERE pricing_amicale_id = ?', [id]);

    const connection = await pool.getConnection();

    try {

      await connection.beginTransaction();

      for (const demandRow of demandRows || []) {

        await deleteReservationDemandArtifacts(connection, demandRow);

      }

      await connection.query('DELETE FROM agent_amicale_profiles WHERE amicale_id = ?', [id]);

      await connection.query('DELETE FROM amicales WHERE id = ?', [id]);

      await connection.commit();

    } catch (error) {

      await connection.rollback();

      throw error;

    } finally {

      connection.release();

    }

    res.json({ success: true });

  } catch (error) {

    console.error('Error deleting amicale:', error);

    res.status(500).json({ error: 'Failed to delete amicale' });

  }

});



app.get('/api/agents-amicale', requireAdminSession, async (req, res) => {

  try {

    const [rows] = await pool.query(

      `SELECT p.user_id, p.amicale_id, p.username, p.password_text, p.created_at, p.updated_at, a.name AS amicale_name

       FROM agent_amicale_profiles p

       LEFT JOIN amicales a ON a.id = p.amicale_id

       ORDER BY p.updated_at DESC, p.created_at DESC`

    );

    res.json(Array.isArray(rows) ? rows : []);

  } catch (error) {

    console.error('Error fetching agents amicale:', error);

    res.status(500).json({ error: 'Failed to fetch agents amicale' });

  }

});



app.post('/api/agents-amicale', requireAdminSession, async (req, res) => {

  try {

    const userId = String(req.body?.user_id || req.body?.userId || '').trim();

    const amicaleId = String(req.body?.amicale_id || req.body?.amicaleId || '').trim();

    const username = String(req.body?.username || '').trim();

    const passwordText = String(req.body?.password_text || req.body?.password || '').trim();

    if (!userId || !amicaleId || !username || !passwordText) {

      return res.status(400).json({ error: 'user_id, amicale_id, username and password are required' });

    }

    const now = getAgencySqlDateTime();

    await pool.query(

      `INSERT INTO agent_amicale_profiles (user_id, amicale_id, username, password_text, created_at, updated_at)

       VALUES (?, ?, ?, ?, ?, ?)

       ON DUPLICATE KEY UPDATE

         amicale_id = VALUES(amicale_id),

         username = VALUES(username),

         password_text = VALUES(password_text),

         updated_at = VALUES(updated_at)`,

      [userId, amicaleId, username, passwordText, now, now]

    );

    const [rows] = await pool.query(

      `SELECT p.user_id, p.amicale_id, p.username, p.password_text, p.created_at, p.updated_at, a.name AS amicale_name

       FROM agent_amicale_profiles p

       LEFT JOIN amicales a ON a.id = p.amicale_id

       WHERE p.user_id = ?

       LIMIT 1`,

      [userId]

    );

    res.status(201).json(rows?.[0] || null);

  } catch (error) {

    console.error('Error saving agent amicale profile:', error);

    res.status(500).json({ error: 'Failed to save agent amicale profile' });

  }

});



app.get('/api/client-interactions/export', requireAdminSession, async (req, res) => {

  try {

    const format = String(req.query.format || 'xlsx').trim().toLowerCase();

    const limitRaw = Number(req.query.limit || 10000);

    const limit = Number.isFinite(limitRaw) ? Math.min(100000, Math.max(1, limitRaw)) : 10000;

    const segment = String(req.query.segment || 'all').trim().toLowerCase();

    const dateFrom = toSqlDateBoundary(req.query.date_from || req.query.dateFrom, false);

    const dateTo = toSqlDateBoundary(req.query.date_to || req.query.dateTo, true);

    const where = [];

    const params = [];

    if (segment === 'anonymous') {

      where.push(`(client_user_id IS NULL OR client_user_id = '') AND (client_email IS NULL OR client_email = '')`);

    } else if (segment === 'known') {

      where.push(`(client_user_id IS NOT NULL AND client_user_id <> '') OR (client_email IS NOT NULL AND client_email <> '')`);

    }

    if (dateFrom) {

      where.push('event_at >= ?');

      params.push(dateFrom);

    }

    if (dateTo) {

      where.push('event_at <= ?');

      params.push(dateTo);

    }

    const [rows] = await pool.query(

      `SELECT

         id, client_user_id, client_email, client_name, type, bien_id, property_title,

         source, device_id, session_id, path, metadata_json,

         DATE_FORMAT(event_at, '%Y-%m-%d %H:%i:%s') AS event_at,

         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at

       FROM client_interactions

       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}

       ORDER BY event_at DESC

       LIMIT ?`,

      [...params, limit]

    );

    const normalizedRows = (rows || []).map((row) => ({

      id: row.id,

      client_user_id: row.client_user_id || null,

      client_email: row.client_email || null,

      client_name: row.client_name || null,

      type: row.type,

      bien_id: row.bien_id || null,

      property_title: row.property_title || null,

      source: row.source,

      device_id: row.device_id || null,

      session_id: row.session_id || null,

      path: row.path || null,

      metadata_json: row.metadata_json || null,

      event_at: row.event_at || null,

      created_at: row.created_at || null,

    }));

    const exportedAt = getAgencySqlDateTime();

    await recordAdminDataExport({

      dataset: `client_interactions_${segment}`,

      format,

      dateFrom,

      dateTo,

      rowCount: normalizedRows.length,

      req,

    });

    if (format === 'xlsx') {

      const buffer = buildXlsxBufferFromRows(normalizedRows, `Interactions_${segment}`);

      const fileName = `client-interactions-${segment}-${String(exportedAt).replace(/[^0-9]/g, '').slice(0, 14)}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      return res.status(200).send(buffer);

    }

    const csv = buildCsvFromRows(normalizedRows, [

      { key: 'id', label: 'id' },

      { key: 'client_user_id', label: 'client_user_id' },

      { key: 'client_email', label: 'client_email' },

      { key: 'client_name', label: 'client_name' },

      { key: 'type', label: 'type' },

      { key: 'bien_id', label: 'bien_id' },

      { key: 'property_title', label: 'property_title' },

      { key: 'source', label: 'source' },

      { key: 'device_id', label: 'device_id' },

      { key: 'session_id', label: 'session_id' },

      { key: 'path', label: 'path' },

      { key: 'metadata_json', label: 'metadata_json' },

      { key: 'event_at', label: 'event_at' },

      { key: 'created_at', label: 'created_at' },

    ], { delimiter: '\t', includeExcelSeparatorHint: false });

    const fileName = `client-interactions-${segment}-${String(exportedAt).replace(/[^0-9]/g, '').slice(0, 14)}.tsv`;

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.status(200).send(csv);

  } catch (error) {

    console.error('Error exporting client interactions:', error);

    res.status(500).json({ error: 'Impossible d exporter les interactions clients' });

  }

});



app.delete('/api/client-interactions', requireAdminSession, async (req, res) => {

  try {

    const olderThanDays = Math.min(3650, Math.max(1, Number(req.query.older_than_days || req.body?.older_than_days || 30)));

    const segment = String(req.query.segment || req.body?.segment || 'all').trim().toLowerCase();

    const where = ['event_at < DATE_SUB(NOW(), INTERVAL ? DAY)'];

    const params = [olderThanDays];

    if (segment === 'anonymous') {

      where.push(`(client_user_id IS NULL OR client_user_id = '') AND (client_email IS NULL OR client_email = '')`);

    } else if (segment === 'known') {

      where.push(`(client_user_id IS NOT NULL AND client_user_id <> '') OR (client_email IS NOT NULL AND client_email <> '')`);

    }

    const [result] = await pool.query(

      `DELETE FROM client_interactions

       WHERE ${where.join(' AND ')}`,

      params

    );

    res.json({

      success: true,

      deleted: Number(result?.affectedRows || 0),

      olderThanDays,

      segment,

    });

  } catch (error) {

    console.error('Error deleting client interactions:', error);

    res.status(500).json({ error: 'Impossible de nettoyer les interactions clients' });

  }

});



app.get('/api/statistiques/resume', requireAdminSession, async (req, res) => {

  try {

    await ensureAdminDataExportsSchema();

    const [[securityCountRow]] = await pool.query('SELECT COUNT(*) AS total FROM security_audit_logs');

    const [[interactionCountRow]] = await pool.query('SELECT COUNT(*) AS total FROM client_interactions');

    const [[anonymousCountRow]] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM client_interactions

       WHERE (client_user_id IS NULL OR client_user_id = '')

         AND (client_email IS NULL OR client_email = '')`

    );

    const [[knownCountRow]] = await pool.query(

      `SELECT COUNT(*) AS total

       FROM client_interactions

       WHERE (client_user_id IS NOT NULL AND client_user_id <> '')

          OR (client_email IS NOT NULL AND client_email <> '')`

    );

    const [topVisitedRows] = await pool.query(

      `SELECT

         COALESCE(NULLIF(ci.bien_id, ''), 'unknown') AS bien_id,

         COALESCE(MAX(NULLIF(ci.property_title, '')), MAX(NULLIF(b.titre, '')), 'Bien inconnu') AS property_title,

         COUNT(*) AS visits

       FROM client_interactions ci

       LEFT JOIN biens b ON b.id = ci.bien_id

       WHERE ci.type = 'visite'

       GROUP BY COALESCE(NULLIF(ci.bien_id, ''), 'unknown')

       ORDER BY visits DESC

       LIMIT 10`

    );

    const [securityByEventRows] = await pool.query(

      `SELECT event_type, COUNT(*) AS total, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures

       FROM security_audit_logs

       GROUP BY event_type

       ORDER BY failures DESC, total DESC

       LIMIT 12`

    );

    const [securityBlockRows] = await pool.query(

      `SELECT

         SUM(CASE WHEN http_status = 401 THEN 1 ELSE 0 END) AS http_401,

         SUM(CASE WHEN http_status = 403 THEN 1 ELSE 0 END) AS http_403,

         SUM(CASE WHEN http_status = 429 THEN 1 ELSE 0 END) AS http_429

       FROM security_audit_logs`

    );

    const [[oldestSecurityRow]] = await pool.query(

      `SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d %H:%i:%s') AS oldest FROM security_audit_logs`

    );

    const [[oldestInteractionRow]] = await pool.query(

      `SELECT DATE_FORMAT(MIN(event_at), '%Y-%m-%d %H:%i:%s') AS oldest FROM client_interactions`

    );

    const [lastExportsRows] = await pool.query(

      `SELECT dataset, DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i:%s') AS last_export_at

       FROM admin_data_exports

       GROUP BY dataset`

    );

    const lastExports = {};

    for (const row of (lastExportsRows || [])) {

      lastExports[String(row.dataset || '').trim()] = row.last_export_at || null;

    }



    res.json({

      generatedAt: getAgencySqlDateTime(),

      volume: {

        securityLogs: Number(securityCountRow?.total || 0),

        interactionsTotal: Number(interactionCountRow?.total || 0),

        interactionsAnonymous: Number(anonymousCountRow?.total || 0),

        interactionsKnown: Number(knownCountRow?.total || 0),

        oldestSecurityLogAt: oldestSecurityRow?.oldest || null,

        oldestInteractionAt: oldestInteractionRow?.oldest || null,

      },

      topVisitedProperties: (topVisitedRows || []).map((row) => ({

        bienId: row.bien_id,

        propertyTitle: row.property_title,

        visits: Number(row.visits || 0),

      })),

      security: {

        byEvent: (securityByEventRows || []).map((row) => ({

          eventType: row.event_type,

          total: Number(row.total || 0),

          failures: Number(row.failures || 0),

        })),

        blocking: {

          http401: Number(securityBlockRows?.[0]?.http_401 || 0),

          http403: Number(securityBlockRows?.[0]?.http_403 || 0),

          http429: Number(securityBlockRows?.[0]?.http_429 || 0),

        },

      },

      lastExports,

    });

  } catch (error) {

    console.error('Error fetching statistiques resume:', error);

    res.status(500).json({ error: 'Impossible de charger le resume statistiques' });

  }

});



// ClickToPay callback endpoints (bank form: notification + default return URLs)

const clickToPayUrlencodedParser = express.urlencoded({ extended: false });



app.get('/api/payments/clicktopay/notification', async (req, res) => {

  try {

    const payload = req.query || {};

    console.log('[ClickToPay] notification (GET):', payload);

    return res.status(200).send('OK');

  } catch (error) {

    console.error('ClickToPay notification GET failed:', error);

    return res.status(200).send('OK');

  }

});



app.post('/api/payments/clicktopay/notification', clickToPayUrlencodedParser, async (req, res) => {

  try {

    const payload = req.body && Object.keys(req.body).length ? req.body : (req.query || {});

    console.log('[ClickToPay] notification (POST):', payload);

    return res.status(200).send('OK');

  } catch (error) {

    console.error('ClickToPay notification POST failed:', error);

    return res.status(200).send('OK');

  }

});



app.get('/api/payments/clicktopay/return/success', (req, res) => {

  const redirectUrl = new URL('/mes-reservations', CANONICAL_FRONTEND_URL);

  redirectUrl.searchParams.set('payment', 'success');

  const reference = String(req.query?.reference || req.query?.order_id || req.query?.payment_id || '').trim();

  if (reference) redirectUrl.searchParams.set('reference', reference);

  return res.redirect(302, redirectUrl.toString());

});



app.post('/api/payments/clicktopay/return/success', clickToPayUrlencodedParser, (req, res) => {

  const redirectUrl = new URL('/mes-reservations', CANONICAL_FRONTEND_URL);

  redirectUrl.searchParams.set('payment', 'success');

  const reference = String(req.body?.reference || req.body?.order_id || req.body?.payment_id || '').trim();

  if (reference) redirectUrl.searchParams.set('reference', reference);

  return res.redirect(302, redirectUrl.toString());

});



app.get('/api/payments/clicktopay/return/fail', (req, res) => {

  const redirectUrl = new URL('/mes-reservations', CANONICAL_FRONTEND_URL);

  redirectUrl.searchParams.set('payment', 'failed');

  const reason = String(req.query?.error || req.query?.message || req.query?.reason || '').trim();

  if (reason) redirectUrl.searchParams.set('reason', reason.slice(0, 200));

  return res.redirect(302, redirectUrl.toString());

});



app.post('/api/payments/clicktopay/return/fail', clickToPayUrlencodedParser, (req, res) => {

  const redirectUrl = new URL('/mes-reservations', CANONICAL_FRONTEND_URL);

  redirectUrl.searchParams.set('payment', 'failed');

  const reason = String(req.body?.error || req.body?.message || req.body?.reason || '').trim();

  if (reason) redirectUrl.searchParams.set('reason', reason.slice(0, 200));

  return res.redirect(302, redirectUrl.toString());

});



app.use((error, req, res, next) => {

  if (res.headersSent) {

    return next(error);

  }



  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {

    return res.status(413).json({ error: MEDIA_UPLOAD_MAX_MESSAGE });

  }



  if (error?.type === 'entity.too.large' || error?.status === 413) {

    return res.status(413).json({ error: MEDIA_UPLOAD_MAX_MESSAGE });

  }



  return next(error);

});



setInterval(() => {

  runOwnerCalendarPromptSchedulerTick();

}, 60 * 1000).unref?.();



// Start server

app.listen(PORT, () => {

  console.log(`ð Server running on http://localhost:${PORT}`);

  console.log('ð Available endpoints:');

  console.log('   - GET    /api/biens');

  console.log('   - POST   /api/biens');

  console.log('   - PUT    /api/biens/:id');

  console.log('   - DELETE /api/biens/:id');

  console.log('   - GET    /api/zones');

  console.log('   - GET    /api/proprietaires');

  console.log('   - GET    /api/locataires');

  console.log('   - GET    /api/contrats');

  console.log('   - GET    /api/paiements');

  console.log('   - GET    /api/maintenance');

  console.log('   - GET    /api/notifications');

  console.log('   - POST   /api/reservation-demands/:id/request-owner-availability');

  console.log('   - POST   /api/mobile/owners/:ownerId/push-token');

  console.log('   - GET    /api/mobile/owners/:ownerId/availability-requests');

  console.log('   - POST   /api/mobile/owners/:ownerId/availability-requests/:demandId/respond');

  console.log('   - GET    /api/mobile/admin/calendar-prompt-schedule');

  console.log('   - PUT    /api/mobile/admin/calendar-prompt-schedule');

  console.log('   - POST   /api/mobile/admin/calendar-prompt-schedule/dispatch-now');

  console.log('   - GET    /api/mobile/admin/owner-calendar-prompt-statuses');

  console.log('   - GET    /api/mobile/admin/calendar-requests');

  console.log('   - GET    /api/mobile/admin/calendar-requests/:id/diff');

  console.log('   - GET    /api/mobile/owners/:ownerId/calendar-prompts/pending');

  console.log('   - POST   /api/mobile/owners/:ownerId/calendar-prompts/:promptId/respond');

  runOwnerCalendarPromptSchedulerTick();

});





























