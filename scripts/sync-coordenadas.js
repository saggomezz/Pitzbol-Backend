/**
 * Sincroniza latitud, longitud y ubicacion desde el CSV del frontend a Firestore
 * para todos los lugares que tengan esos campos vacíos en la BD.
 *
 * Uso: cd ~/Pitzbol-Backend && node scripts/sync-coordenadas.js
 */
require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ credential: admin.credential.cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
}) });
const db = admin.firestore();

// Leer CSV del frontend (ruta relativa desde el home del VPS)
const CSV_PATHS = [
  path.join(process.env.HOME || '/home/shai', 'Pitzbol-Frontend/public/datosLugares.csv'),
  path.join(__dirname, '../../../Pitzbol-Frontend/public/datosLugares.csv'),
];

function parseLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function parseCoord(s) {
  if (!s) return null;
  const v = parseFloat(String(s).replace(',', '.'));
  return isNaN(v) ? null : v;
}

function loadCsv() {
  for (const p of CSV_PATHS) {
    if (fs.existsSync(p)) {
      console.log('CSV encontrado en:', p);
      const lines = fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim());
      const headers = parseLine(lines[0]);
      return lines.slice(1).map(line => {
        const vals = parseLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      }).filter(r => r['Nombre del Lugar']);
    }
  }
  throw new Error('No se encontró datosLugares.csv. Rutas probadas:\n' + CSV_PATHS.join('\n'));
}

async function run() {
  const csvRows = loadCsv();
  console.log(`CSV: ${csvRows.length} lugares cargados\n`);

  // Crear mapa CSV por nombre normalizado
  const csvMap = new Map();
  for (const row of csvRows) {
    const nombre = row['Nombre del Lugar'] || '';
    if (!nombre) continue;
    const lat = parseCoord(row['Latitud']);
    const lng = parseCoord(row['Longitud']);
    const dir = row['Dirección'] || '';
    if (lat && lng) {
      csvMap.set(norm(nombre), { lat, lng, dir, nombre });
      // También sin ciudad al final
      const sinCiudad = nombre.replace(/,\s*(Guadalajara|Zapopan|Tlaquepaque|Tonalá|Tonala)[^,]*/i, '').trim();
      if (!csvMap.has(norm(sinCiudad))) {
        csvMap.set(norm(sinCiudad), { lat, lng, dir, nombre });
      }
    }
  }
  console.log(`CSV: ${csvMap.size} entradas con coordenadas\n`);

  const snap = await db.collection('lugares').get();
  console.log(`Firestore: ${snap.size} lugares\n`);

  let actualizados = 0;
  let sinCoords = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const nombre = data.nombre || '';
    if (!nombre) continue;

    const tieneLat = data.latitud && String(data.latitud).trim();
    const tieneLng = data.longitud && String(data.longitud).trim();

    if (tieneLat && tieneLng) continue; // ya tiene coordenadas

    sinCoords++;

    // Buscar en CSV
    const found = csvMap.get(norm(nombre)) || csvMap.get(norm(nombre.replace(/,\s*(Guadalajara|Zapopan|Tlaquepaque|Tonalá|Tonala)[^,]*/i, '').trim()));

    if (!found) {
      console.log('Sin coord en CSV:', nombre);
      continue;
    }

    const update = {
      latitud: String(found.lat),
      longitud: String(found.lng),
      ultimaActualizacion: new Date().toISOString(),
    };
    // Solo actualizar ubicacion si está vacía
    if (!data.ubicacion?.trim() && found.dir) {
      update.ubicacion = found.dir;
    }

    await doc.ref.update(update);
    console.log(`✓ ${nombre} → ${found.lat}, ${found.lng}`);
    actualizados++;
  }

  console.log(`\n✅ ${actualizados} de ${sinCoords} lugares sin coordenadas actualizados.`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
