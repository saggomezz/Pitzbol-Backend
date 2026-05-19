/**
 * retry-fotos-fallidas.js — reintenta las fotos que fallaron con estrategias especiales
 */
const admin   = require('firebase-admin');
const { v2: cloudinary } = require('cloudinary');
const https   = require('https');
const http    = require('http');
const { Readable } = require('stream');
require('dotenv').config();

const svc = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinary = u => u && u.startsWith('https://res.cloudinary.com');
const isFacebook   = u => u && (u.includes('fbcdn.net') || u.includes('instagram.com'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Para Wikipedia: usar URL de miniatura
function getWikipediaThumb(url) {
  const match = url.match(/\/wikipedia\/commons\/([^/]+\/[^/]+\/([^/]+))$/);
  if (!match) return url;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${match[1]}/800px-${match[2]}`;
}

function downloadBuffer(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.google.com/',
      },
      timeout: 20000,
      rejectUnauthorized: opts.skipSSL ? false : true,
    };
    proto.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location, opts).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function uploadBuffer(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'pitzbol/lugares', public_id: publicId, overwrite: true, resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function run() {
  const snap = await db.collection('lugares').get();
  let ok = 0, skip = 0, err = 0;

  for (const doc of snap.docs) {
    const data  = doc.data();
    const fotos = Array.isArray(data.fotos) ? data.fotos : [];
    const pending = fotos.filter(u => !isCloudinary(u) && !isFacebook(u));
    if (!pending.length) continue;

    console.log(`\n📍 ${data.nombre || doc.id}`);
    const newFotos = [...fotos];

    for (let i = 0; i < fotos.length; i++) {
      const url = fotos[i];
      if (isCloudinary(url) || isFacebook(url)) continue;

      const publicId = `${doc.id}_${i}`;
      let finalUrl = url;

      // Wikipedia → miniatura
      if (url.includes('upload.wikimedia.org')) {
        finalUrl = getWikipediaThumb(url);
        console.log(`  [wiki] usando thumb: ${finalUrl.substring(0, 70)}`);
      } else {
        console.log(`  [retry] ${url.substring(0, 70)}`);
      }

      try {
        const skipSSL = url.includes('tlaquepaque.gob.mx');
        const buf = await downloadBuffer(finalUrl, { skipSSL });
        const result = await uploadBuffer(buf, publicId);
        newFotos[i] = result.secure_url;
        console.log(`  ✅ ${result.secure_url.substring(0, 70)}`);
        ok++;
        await sleep(400);
      } catch (e) {
        console.log(`  ❌ ${e.message}`);
        err++;
      }
    }

    if (JSON.stringify(newFotos) !== JSON.stringify(fotos)) {
      await doc.ref.update({ fotos: newFotos, ultimaActualizacion: new Date().toISOString() });
      console.log(`  💾 Firestore actualizado`);
    }
  }

  console.log(`\nOK: ${ok} | Errores: ${err}`);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
