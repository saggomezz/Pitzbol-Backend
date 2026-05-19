/**
 * migrate-fotos-cloudinary.js — descarga imagen y sube a Cloudinary como buffer
 * Uso:
 *   node scripts/migrate-fotos-cloudinary.js           (dry-run)
 *   node scripts/migrate-fotos-cloudinary.js --apply   (aplica cambios)
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

const APPLY  = process.argv.includes('--apply');
const DELAY  = 400;
const FOLDER = 'pitzbol/lugares';

const isCloudinary = u => u && u.startsWith('https://res.cloudinary.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.google.com/',
      },
      timeout: 15000,
    };
    proto.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
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
      { folder: FOLDER, public_id: publicId, overwrite: false, resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function run() {
  console.log(APPLY ? '🔥 MODO APPLY\n' : '🔍 DRY-RUN\n');
  const snap = await db.collection('lugares').get();
  let migradas = 0, omitidas = 0, errores = 0, yaCloud = 0;

  for (const doc of snap.docs) {
    const data  = doc.data();
    const fotos = Array.isArray(data.fotos) ? data.fotos : [];
    if (!fotos.length) continue;

    const pending = fotos.filter(u => !isCloudinary(u));
    if (!pending.length) { yaCloud += fotos.length; continue; }

    console.log(`\n📍 ${data.nombre || doc.id} (${pending.length} pendiente(s))`);
    const newFotos = [...fotos];

    for (let i = 0; i < fotos.length; i++) {
      const url = fotos[i];
      if (isCloudinary(url)) continue;

      const publicId = `${doc.id}_${i}`;
      console.log(`  [${i+1}] ${url.substring(0, 70)}...`);

      if (!APPLY) { migradas++; console.log(`       → ${FOLDER}/${publicId}`); continue; }

      try {
        const buf = await downloadBuffer(url);
        const result = await uploadBuffer(buf, publicId);
        newFotos[i] = result.secure_url;
        console.log(`       ✅ ${result.secure_url.substring(0, 70)}`);
        migradas++;
      } catch (err) {
        console.log(`       ❌ ${err.message}`);
        errores++;
      }
      await sleep(DELAY);
    }

    if (APPLY && JSON.stringify(newFotos) !== JSON.stringify(fotos)) {
      await doc.ref.update({ fotos: newFotos, ultimaActualizacion: new Date().toISOString() });
      console.log(`  💾 Firestore actualizado`);
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`Ya en Cloudinary : ${yaCloud}`);
  console.log(`Migradas         : ${migradas}`);
  console.log(`Errores (URL rota): ${errores}`);
  if (!APPLY) console.log('\nEjecuta con --apply para aplicar.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
