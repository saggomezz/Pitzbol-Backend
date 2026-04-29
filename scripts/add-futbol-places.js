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

const horarioEstadio = JSON.stringify({
  lunes: 'cerrado',
  martes: { apertura: '10:00', cierre: '18:00' },
  miercoles: { apertura: '10:00', cierre: '18:00' },
  jueves: { apertura: '10:00', cierre: '18:00' },
  viernes: { apertura: '10:00', cierre: '18:00' },
  sabado: { apertura: '10:00', cierre: '20:00' },
  domingo: { apertura: '10:00', cierre: '18:00' },
});

const horarioTienda = JSON.stringify({
  lunes: { apertura: '11:00', cierre: '20:00' },
  martes: { apertura: '11:00', cierre: '20:00' },
  miercoles: { apertura: '11:00', cierre: '20:00' },
  jueves: { apertura: '11:00', cierre: '20:00' },
  viernes: { apertura: '11:00', cierre: '21:00' },
  sabado: { apertura: '10:00', cierre: '21:00' },
  domingo: { apertura: '10:00', cierre: '20:00' },
});

const lugares = [
  {
    nombre: 'Estadio Akron',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Estadio'],
    ubicacion: 'Av. Paseo de la Innovación 2500, Rancho Contento, Zapopan',
    latitud: '20.6926',
    longitud: '-103.4671',
    descripcion: 'Estadio de las Chivas de Guadalajara con capacidad para 49,000 aficionados. Sede oficial de la Copa del Mundo 2026 en Guadalajara. Uno de los recintos más modernos de México, inaugurado en 2010.',
    costoEstimado: 'Según evento',
    tiempoEstancia: 180,
    horariosJson: horarioEstadio,
    fotos: [],
  },
  {
    nombre: 'Estadio Jalisco',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Estadio'],
    ubicacion: 'Av. Constitución 1380, Sector Reforma, Guadalajara',
    latitud: '20.6919',
    longitud: '-103.3283',
    descripcion: 'Icónico estadio inaugurado en 1960. Sede de los Mundiales de 1970 y 1986, y hogar histórico de Chivas y Atlas. Escenario de partidos legendarios del fútbol internacional.',
    costoEstimado: 'Según evento',
    tiempoEstancia: 150,
    horariosJson: horarioEstadio,
    fotos: [],
  },
  {
    nombre: 'Museo Chivas',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Museo'],
    ubicacion: 'Estadio Akron, Av. Paseo de la Innovación 2500, Zapopan',
    latitud: '20.6928',
    longitud: '-103.4673',
    descripcion: 'Recorrido interactivo por la historia de las Chivas del Guadalajara, el equipo más popular de México. Exhibe trofeos, uniformes históricos y momentos emblemáticos del club fundado en 1906.',
    costoEstimado: '$150 MXN',
    tiempoEstancia: 90,
    horariosJson: horarioEstadio,
    fotos: [],
  },
  {
    nombre: 'Tienda Oficial Chivas',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Tienda oficial'],
    ubicacion: 'Estadio Akron, Av. Paseo de la Innovación 2500, Zapopan',
    latitud: '20.6925',
    longitud: '-103.4669',
    descripcion: 'Tienda oficial del Club Deportivo Guadalajara con jerseys, playeras, accesorios y todo tipo de merchandising de las Chivas. Ideal para llevarte el recuerdo del equipo del Mundial 2026.',
    costoEstimado: '$300 - $1,500 MXN',
    tiempoEstancia: 45,
    horariosJson: horarioTienda,
    fotos: [],
  },
  {
    nombre: 'Complejo Verde Valle',
    categoria: 'Fútbol',
    categorias: ['Fútbol'],
    ubicacion: 'Verde Valle, Guadalajara, Jalisco',
    latitud: '20.7048',
    longitud: '-103.3886',
    descripcion: 'Centro de entrenamiento oficial de las Chivas de Guadalajara. Instalaciones de primer nivel donde entrena el primer equipo y las fuerzas básicas. Durante el Mundial 2026 funcionará como base de selecciones nacionales.',
    costoEstimado: 'Gratuito (exterior)',
    tiempoEstancia: 60,
    horariosJson: JSON.stringify({
      lunes: { apertura: '08:00', cierre: '18:00' },
      martes: { apertura: '08:00', cierre: '18:00' },
      miercoles: { apertura: '08:00', cierre: '18:00' },
      jueves: { apertura: '08:00', cierre: '18:00' },
      viernes: { apertura: '08:00', cierre: '18:00' },
      sabado: 'cerrado',
      domingo: 'cerrado',
    }),
    fotos: [],
  },
  {
    nombre: 'Estadio Universitario UdeG',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Estadio'],
    ubicacion: 'Av. Juárez 976, Centro, Guadalajara',
    latitud: '20.6612',
    longitud: '-103.3292',
    descripcion: 'Estadio de la Universidad de Guadalajara, casa de Leones Negros. Recinto con capacidad para 12,000 aficionados, escenario frecuente de partidos de Liga de Expansión y eventos universitarios deportivos.',
    costoEstimado: 'Según evento',
    tiempoEstancia: 120,
    horariosJson: horarioEstadio,
    fotos: [],
  },
];

async function addPlaces() {
  let added = 0;
  for (const lugar of lugares) {
    const id = normalizeName(lugar.nombre);
    const existing = await db.collection('lugares').doc(id).get();
    if (existing.exists) {
      console.log(`⏭  Ya existe: ${lugar.nombre}`);
      continue;
    }
    await db.collection('lugares').doc(id).set({
      ...lugar,
      createdAt: new Date().toISOString(),
      ultimaActualizacion: new Date().toISOString(),
    });
    console.log(`✓ Agregado: ${lugar.nombre}`);
    added++;
  }
  console.log(`\nListo — ${added} lugares nuevos agregados.`);
  process.exit(0);
}

addPlaces().catch(e => { console.error(e); process.exit(1); });
