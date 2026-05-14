/**
 * fix-lugares-sin-categoria.js
 *
 * Tres acciones sobre los lugares de Firebase sin categoría:
 *   1. ELIMINAR  — entradas basura o que no pertenecen a la app turística
 *   2. CATEGORIZAR — lugares legítimos que solo les falta categoría
 *   3. REPORTAR   — lugares que requieren decisión manual
 *
 * Uso:
 *   node scripts/fix-lugares-sin-categoria.js          (dry-run, solo muestra qué haría)
 *   node scripts/fix-lugares-sin-categoria.js --apply  (aplica los cambios)
 */

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

const APPLY = process.argv.includes('--apply');

function normalizeName(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ── 1. ELIMINAR ───────────────────────────────────────────────────────────────
// Entradas basura (test data) y lugares que no son turísticos (hospitales,
// casas de cambio, servicios de salud).

const ELIMINAR = [
  // Basura / test data
  'd gd g dfg d',
  'fgfhfdf s',
  'wegtrve',

  // Hospitales — no son destinos turísticos
  'Hospital Ángeles del Carmen, Guadalajara',
  'Hospital Civil Fray Antonio Alcalde, Guadalajara',
  'Hospital Colonias, Guadalajara',
  'Hospital Country 2000, Guadalajara',
  'Hospital Hispano, Guadalajara',
  'Hospital Jardines, Guadalajara',
  'Hospital Lomas Providencia, Guadalajara',
  'Hospital México Americano, Guadalajara',
  'Hospital Real San José, Guadalajara',
  'Hospital Real San José Valle Real, Guadalajara',
  'Hospital San Javier, Guadalajara',
  'Puerta de Hierro Medical Center, Guadalajara',

  // Casas de cambio — servicio financiero, no turístico
  'Casa de Cambio Dólares Acueducto, Guadalajara',
  'Casa de Cambio Minerva, Guadalajara',
  'Casa de Cambio Patria, Guadalajara',
  'Centro Cambiario Delfino, Guadalajara',
  'Centro Cambiario Remus, Guadalajara',
  'Centro Cambiario Torres Barón, Guadalajara',
  'Dólar Azteca, Guadalajara',
  'Dólares Américas, Guadalajara',
  'Dólares Manhattan, Guadalajara',
  'Foreign Exchange Center West Pearl, Guadalajara',
  'Globo Cambio, Guadalajara',
  'We Cash Centro, Guadalajara',

  // Estadio Akron — ya está en la BLACKLIST del motor IA
  'Estadio Akron, Guadalajara',
];

// ── 2. CATEGORIZAR ────────────────────────────────────────────────────────────
// Formato: { nombre: 'nombre exacto en Firebase', categorias: ['Cat1', 'Cat2'] }

const CATEGORIZAR = [
  // ── Gastronomía ──
  { nombre: 'Angelina Bistro, Guadalajara',                        categorias: ['Gastronomía'] },
  { nombre: 'Argento Americana, Guadalajara',                      categorias: ['Gastronomía'] },
  { nombre: 'Birriería Las Nueve Esquinas, Guadalajara',           categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Churros "La Bombilla", Guadalajara',                  categorias: ['Gastronomía, Postre'] },
  { nombre: 'Cotidiano - Restaurante en La Perla',                 categorias: ['Gastronomía'] },
  { nombre: 'CRAFT Americana, Guadalajara',                        categorias: ['Gastronomía', 'Vida Nocturna'] },
  { nombre: 'Choclo y Maiz Cocina Vegana',                        categorias: ['Gastronomía Vegana'] },
  { nombre: 'Dulces Regionales "Nuestros Dulces", Guadalajara',   categorias: ['Gastronomía, Postre'] },
  { nombre: 'El Sacromonte, Guadalajara',                          categorias: ['Gastronomía'] },
  { nombre: 'El Vegano',                                           categorias: ['Gastronomía Vegana'] },
  { nombre: 'Hueso Restaurante',                                   categorias: ['Gastronomía'] },
  { nombre: 'Hueso Restaurante, Guadalajara',                      categorias: ['Gastronomía'] },
  { nombre: 'Karne Garibaldi (Santa Tere), Guadalajara',          categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Karne Garibaldi Sucursal Plaza Del Sol, Guadalajara', categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Karne Garibaldi Sucursal Tlaquepaque, Guadalajara',  categorias: ['Gastronomía Mexicana'] },
  { nombre: 'La Boca Parrilla Rustica, Guadalajara',              categorias: ['Gastronomía'] },
  { nombre: 'La Chata, Guadalajara',                               categorias: ['Gastronomía Mexicana'] },
  { nombre: 'La Chata Terranova, Guadalajara',                     categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Mutante Restaurante, Guadalajara',                    categorias: ['Gastronomía'] },
  { nombre: 'Nieves Chapalita Tepeyac, Guadalajara',              categorias: ['Gastronomía, Postre'] },
  { nombre: 'Nieves de Garrafa Chapalita Juárez, Guadalajara',    categorias: ['Gastronomía, Postre'] },
  { nombre: 'Nieves de Garrafa Chapalita Nueva Escocia, Guadalajara', categorias: ['Gastronomía, Postre'] },
  { nombre: 'PINOCCHIO - Pedro Moreno, Guadalajara',              categorias: ['Gastronomía, Postre'] },
  { nombre: 'Recoleta Confitería Argentina La Perla, Guadalajara', categorias: ['Gastronomía, Postre'] },
  { nombre: 'Recoleta Confitería Argentina Tepeyac, Guadalajara',  categorias: ['Gastronomía, Postre'] },
  { nombre: 'Restaurante Casa Caborca Asador de Carnes Zapopan, Guadalajara', categorias: ['Gastronomía'] },
  { nombre: 'Romea, Guadalajara',                                  categorias: ['Gastronomía'] },
  { nombre: 'Rosarito, Guadalajara',                               categorias: ['Gastronomía'] },
  { nombre: 'Santo Coyote, Guadalajara',                           categorias: ['Gastronomía'] },
  { nombre: 'Santo Coyote Real, Guadalajara',                      categorias: ['Gastronomía'] },
  { nombre: 'Tacos Providencia, Guadalajara',                      categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Tacos Providencia Ruben Daria, Guadalajara',         categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Tía Ofe Pozole Vegano, Guadalajara',                 categorias: ['Gastronomía Vegana'] },
  { nombre: 'Tikuun comedor, Guadalajara',                         categorias: ['Gastronomía'] },
  { nombre: 'Tortas Ahogadas Don Jose El De La Bicicleta, Guadalajara', categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Tortas Ahogadas "El Güerito", Guadalajara',          categorias: ['Gastronomía Mexicana'] },
  { nombre: 'Tyrano, Guadalajara',                                 categorias: ['Gastronomía'] },
  { nombre: 'Wings Army (Sucursal Chapultepec), Guadalajara',     categorias: ['Gastronomía'] },

  // ── Cafeterías ──
  { nombre: 'Café Sinergia, Guadalajara',                          categorias: ['Cafeterías'] },
  { nombre: 'Fika, Guadalajara',                                   categorias: ['Cafeterías'] },
  { nombre: 'Happy Coffee, Guadalajara',                           categorias: ['Cafeterías'] },
  { nombre: 'The Coffee Aledén Puerta, Guadalajara',              categorias: ['Cafeterías'] },
  { nombre: 'The Coffee Cd. Granja, Guadalajara',                 categorias: ['Cafeterías'] },
  { nombre: 'The Coffee Legacy Tower, Guadalajara',               categorias: ['Cafeterías'] },

  // ── Vida Nocturna / Cantinas / Bares ──
  { nombre: 'Ay! Caguamas Ciudad Granja, Guadalajara',            categorias: ['Vida Nocturna'] },
  { nombre: 'Bar Barba Negra 1988, Guadalajara',                  categorias: ['Vida Nocturna'] },
  { nombre: 'Búnker Brew Club, Guadalajara',                      categorias: ['Vida Nocturna'] },
  { nombre: 'Cantina La Fuente, Guadalajara',                     categorias: ['Cantina, Vida Nocturna'] },
  { nombre: 'De La O Cantina, Guadalajara',                       categorias: ['Cantina, Vida Nocturna'] },
  { nombre: 'El Gallo Altanero, Guadalajara',                     categorias: ['Vida Nocturna'] },
  { nombre: 'El Gallo Cantina, Guadalajara',                      categorias: ['Cantina, Vida Nocturna'] },
  { nombre: 'El Gallo D\' Oro, Guadalajara',                      categorias: ['Cantina, Vida Nocturna'] },
  { nombre: 'Gallo Cervecero Sportsbar , Guadalajara',            categorias: ['Vida Nocturna'] },
  { nombre: 'La Bodega de León, Guadalajara',                     categorias: ['Vida Nocturna'] },
  { nombre: 'Los Famosos Equipales, Guadalajara',                 categorias: ['Cantina, Vida Nocturna'] },
  { nombre: 'Maldito Consuelo, Guadalajara',                      categorias: ['Vida Nocturna'] },
  { nombre: 'Mika Bar, Guadalajara',                              categorias: ['Vida Nocturna'] },
  { nombre: 'Taberna Central, Guadalajara',                       categorias: ['Vida Nocturna'] },

  // ── Naturaleza ──
  { nombre: 'Bosque Colomos, Guadalajara',                        categorias: ['Naturaleza, Parque'] },
  { nombre: 'Parque Agua Azul, Guadalajara',                      categorias: ['Naturaleza, Parque'] },

  // ── Cultura / Museos / Arte e Historia ──
  { nombre: 'Instituto Cultural Cabañas, Guadalajara',            categorias: ['Cultura, Museos'] },
  { nombre: 'Museo del Periodismo y las Artes Gráficas, Guadalajara', categorias: ['Cultura, Museos'] },
  { nombre: 'Palacio de Gobierno de Jalisco, Guadalajara',        categorias: ['Cultura, Arte e Historia, Arquitectura'] },
  { nombre: 'Rotonda de los Jaliscienses Ilustres, Guadalajara',  categorias: ['Cultura, Arte e Historia'] },
  { nombre: 'Expiatorio del Santísimo Sacramento, Guadalajara',   categorias: ['Cultura, Arquitectura'] },

  // ── Compras / Artesanías ──
  { nombre: 'El Parián de Tlaquepaque, Guadalajara',              categorias: ['Compras'] },

  // ── Fútbol / Estadios ──
  { nombre: 'Estadio Jalisco, Guadalajara',                       categorias: ['Fútbol, Deportivo'] },

  // ── Sin clasificar claro — asignamos genérico ──
  { nombre: 'Casa Prime Puerta de Hierro',                        categorias: ['Gastronomía'] },
  { nombre: 'Jamaica Records',                                     categorias: ['Compras'] },
  { nombre: 'Los Laureles (Av. México), Guadalajara',             categorias: ['Gastronomía'] },
];

// ── 3. REPORTAR (sin tocar) ──────────────────────────────────────────────────
// Los que no están en ELIMINAR ni CATEGORIZAR se reportan al final.

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(APPLY ? '🔥 MODO APPLY — escribiendo en Firebase\n' : '🔍 DRY-RUN — sin cambios\n');

  // Fetch all Firebase lugares
  const snap = await db.collection('lugares').get();
  const allDocs = new Map();
  snap.forEach(doc => allDocs.set(doc.id, { id: doc.id, ...doc.data() }));

  // Identificar los que ya tienen categoría
  const sinCat = [...allDocs.values()].filter(l => {
    if (!l.nombre) return false;
    return !(l.categorias?.length > 0 || !!l.categoria);
  });

  console.log(`Lugares sin categoría encontrados: ${sinCat.length}\n`);

  let eliminados = 0, categorizados = 0, errores = 0;

  // ── Eliminar ──
  console.log('── ELIMINANDO ──────────────────────────────────────────────');
  for (const nombre of ELIMINAR) {
    const id = normalizeName(nombre);
    const doc = allDocs.get(id);
    if (!doc) {
      console.log(`  [NO EXISTE]  ${nombre}`);
      continue;
    }
    console.log(`  [ELIMINAR]   ${nombre}`);
    if (APPLY) {
      try {
        await db.collection('lugares').doc(id).delete();
        eliminados++;
      } catch (e) {
        console.error(`  [ERROR]      ${nombre}: ${e.message}`);
        errores++;
      }
    } else {
      eliminados++;
    }
  }

  // ── Categorizar ──
  console.log('\n── CATEGORIZANDO ───────────────────────────────────────────');
  for (const { nombre, categorias } of CATEGORIZAR) {
    const id = normalizeName(nombre);
    const doc = allDocs.get(id);
    if (!doc) {
      console.log(`  [NO EXISTE]  ${nombre}`);
      continue;
    }
    const existentes = doc.categorias ?? (doc.categoria ? [doc.categoria] : []);
    if (existentes.length > 0) {
      console.log(`  [YA TIENE]   ${nombre} → ${existentes.join(', ')}`);
      continue;
    }
    console.log(`  [CATEGORIZAR] ${nombre} → ${categorias.join(', ')}`);
    if (APPLY) {
      try {
        await db.collection('lugares').doc(id).set({
          categorias,
          categoria: categorias[0],
          ultimaActualizacion: new Date().toISOString(),
        }, { merge: true });
        categorizados++;
      } catch (e) {
        console.error(`  [ERROR]       ${nombre}: ${e.message}`);
        errores++;
      }
    } else {
      categorizados++;
    }
  }

  // ── Reportar los que no tocamos ──
  const nombresEliminados  = new Set(ELIMINAR.map(normalizeName));
  const nombresCategorizados = new Set(CATEGORIZAR.map(e => normalizeName(e.nombre)));
  const sinResolver = sinCat.filter(l =>
    !nombresEliminados.has(l.id) && !nombresCategorizados.has(l.id)
  );

  if (sinResolver.length > 0) {
    console.log('\n── REQUIEREN DECISIÓN MANUAL ───────────────────────────────');
    sinResolver.forEach(l => console.log(`  ⚠️  ${l.nombre}`));
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`Resultado${APPLY ? '' : ' (dry-run)'}: ${eliminados} eliminados, ${categorizados} categorizados, ${errores} errores`);
  if (!APPLY) console.log('\nEjecuta con --apply para aplicar los cambios.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
