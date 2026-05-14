const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

function normalizeName(nombre) {
  return nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// Cafeterías a actualizar: nombre exacto en Firebase → categorías que deben tener
const CAFETERIAS = [
  { nombre: 'Aloó Café, Guadalajara',                       agregar: ['Cafeterías'] },
  { nombre: 'Café Boutique Teatro Degollado, Guadalajara',   agregar: ['Cafeterías'] },
  { nombre: 'El Terrible Juan Café La Estancia, Guadalajara',agregar: ['Cafeterías'] },
  { nombre: 'Entre Matices Café, Guadalajara',               agregar: ['Cafeterías'] },
  { nombre: 'Estresso Café, Guadalajara',                    agregar: ['Cafeterías'] },
  { nombre: 'Fragante Café, Guadalajara',                    agregar: ['Cafeterías'] },
  { nombre: 'Gufo Café, Guadalajara',                        agregar: ['Cafeterías'] },
  { nombre: 'Jardín Cafeto Chapalita, Guadalajara',          agregar: ['Cafeterías'] },
  { nombre: 'Jardín Cafeto La Americana, Guadalajara',       agregar: ['Cafeterías'] },
  { nombre: 'Jardín Cafeto Providencia, Guadalajara',        agregar: ['Cafeterías'] },
  { nombre: 'Moka Moments Cafetería, Guadalajara',           agregar: ['Cafeterías'] },
  { nombre: 'Mono Café GDL, Guadalajara',                    agregar: ['Cafeterías'] },
  { nombre: 'The Spot Café, Guadalajara',                    agregar: ['Cafeterías'] },
  { nombre: 'Café Rozita, Guadalajara',                      agregar: ['Cafeterías'] },
  { nombre: 'Kalido Café, Guadalajara',                      agregar: ['Cafeterías'] },
];

async function run() {
  let ok = 0, skip = 0, err = 0;

  for (const { nombre, agregar } of CAFETERIAS) {
    const id = normalizeName(nombre);
    const ref = db.collection('lugares').doc(id);

    try {
      const snap = await ref.get();

      if (!snap.exists) {
        console.log(`[NO EXISTE] ${nombre} (id: ${id})`);
        skip++;
        continue;
      }

      const data = snap.data();
      const existentes = Array.isArray(data.categorias) ? data.categorias : (data.categoria ? [data.categoria] : []);

      // Merge sin duplicados
      const merged = [...new Set([...existentes, ...agregar])];

      // Si ya tiene todas las categorías, saltar
      const yaCompleto = agregar.every(c => existentes.includes(c));
      if (yaCompleto) {
        console.log(`[YA OK]    ${nombre} → ${existentes.join(', ')}`);
        skip++;
        continue;
      }

      await ref.set({
        categorias: merged,
        categoria: merged[0],
        ultimaActualizacion: new Date().toISOString(),
      }, { merge: true });

      console.log(`[UPDATED]  ${nombre}`);
      console.log(`           ${existentes.join(', ')||'(vacío)'} → ${merged.join(', ')}`);
      ok++;

    } catch (e) {
      console.error(`[ERROR]    ${nombre}: ${e.message}`);
      err++;
    }
  }

  console.log(`\nResultado: ${ok} actualizados, ${skip} sin cambio, ${err} errores`);
  process.exit(0);
}

run();
