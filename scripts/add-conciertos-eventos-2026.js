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

function normalizeName(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
}

const lugares = [
  {
    nombre: 'Julieta Venegas - Teatro Diana',
    categoria: 'Eventos',
    categorias: ['Eventos'],
    ubicacion: 'Av. 16 de Septiembre 710, Centro Histórico, Guadalajara',
    latitud: '20.6744',
    longitud: '-103.3680',
    descripcion: 'Julieta Venegas se presenta dos noches consecutivas en el Teatro Diana de Guadalajara. La primera fecha (20 jun) está agotada; la segunda fecha (21 jun) tiene boletos disponibles en Ticketmaster. Una de las artistas más importantes del pop y rock en español.',
    costoEstimado: 'Desde $800 MXN',
    tiempoEstancia: 150,
    horariosJson: JSON.stringify({
      lunes: 'cerrado', martes: 'cerrado', miercoles: 'cerrado', jueves: 'cerrado',
      viernes: { apertura: '20:00', cierre: '23:30' },
      sabado: { apertura: '20:00', cierre: '23:30' },
      domingo: 'cerrado',
    }),
    fotos: [],
  },
  {
    nombre: 'Sebastián Yatra - Auditorio Telmex',
    categoria: 'Eventos',
    categorias: ['Eventos'],
    ubicacion: 'Av. Adolfo López Mateos Sur 2000, Arcos Vallarta, Guadalajara',
    latitud: '20.6781',
    longitud: '-103.3822',
    descripcion: 'Sebastián Yatra presenta "Entre tanta gente Tour" en el Auditorio Telmex de Guadalajara el 20 de junio. Boletos disponibles en Ticketmaster. El artista colombiano llega en plena temporada mundialista con su gira latinoamericana.',
    costoEstimado: 'Desde $950 MXN',
    tiempoEstancia: 150,
    horariosJson: JSON.stringify({
      lunes: 'cerrado', martes: 'cerrado', miercoles: 'cerrado', jueves: 'cerrado',
      viernes: { apertura: '20:00', cierre: '23:30' },
      sabado: 'cerrado', domingo: 'cerrado',
    }),
    fotos: [],
  },
  {
    nombre: 'Conciertos en el Fan Fest 2026',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Eventos'],
    ubicacion: 'Parque Agua Azul, Calz. Independencia Sur 973, Guadalajara',
    latitud: '20.6603',
    longitud: '-103.3430',
    descripcion: 'Durante los 39 días del Mundial (11 jun – 19 jul), el Gobierno de Jalisco presenta conciertos gratuitos en el Fan Fest con Maná, Carlos Santana, Alejandro Fernández "El Potrillo" y Mariachi Vargas de Tecalitlán. También se estudia un palomazo especial en la Glorieta de la Minerva. Acceso gratuito sujeto a disponibilidad.',
    costoEstimado: 'Gratuito',
    tiempoEstancia: 180,
    horariosJson: JSON.stringify({
      lunes: { apertura: '12:00', cierre: '23:00' },
      martes: { apertura: '12:00', cierre: '23:00' },
      miercoles: { apertura: '12:00', cierre: '23:00' },
      jueves: { apertura: '12:00', cierre: '23:00' },
      viernes: { apertura: '12:00', cierre: '00:00' },
      sabado: { apertura: '10:00', cierre: '00:00' },
      domingo: { apertura: '10:00', cierre: '23:00' },
    }),
    fotos: [],
  },
  {
    nombre: 'Programa LATE 2026',
    categoria: 'Eventos',
    categorias: ['Eventos', 'Cultura / Historia'],
    ubicacion: 'Centro Histórico y espacios públicos, Guadalajara',
    latitud: '20.6760',
    longitud: '-103.3470',
    descripcion: 'El programa Guadalajara LATE 2026 reúne más de 75 actividades artísticas y recreativas en museos, barrios y espacios públicos durante todo el año, con un capítulo especial dedicado al Mundial. Incluye exposiciones, intervenciones urbanas, talleres, performances y recorridos culturales gratuitos en distintos puntos de la ciudad.',
    costoEstimado: 'Gratuito (mayoría de actividades)',
    tiempoEstancia: 120,
    horariosJson: JSON.stringify({
      lunes: { apertura: '09:00', cierre: '20:00' },
      martes: { apertura: '09:00', cierre: '20:00' },
      miercoles: { apertura: '09:00', cierre: '20:00' },
      jueves: { apertura: '09:00', cierre: '20:00' },
      viernes: { apertura: '09:00', cierre: '21:00' },
      sabado: { apertura: '09:00', cierre: '21:00' },
      domingo: { apertura: '10:00', cierre: '18:00' },
    }),
    fotos: [],
  },
  {
    nombre: 'Orquesta Filarmónica de Jalisco - Teatro Degollado',
    categoria: 'Eventos',
    categorias: ['Eventos', 'Cultura / Historia'],
    ubicacion: 'Plaza de la Liberación s/n, Centro Histórico, Guadalajara',
    latitud: '20.6762',
    longitud: '-103.3463',
    descripcion: 'La OFJ presenta tres funciones especiales en el Teatro Degollado durante el verano 2026: Ballet Giselle (junio, coreografía de Irina Marcano), "Concierto de Campeones" el 5 de julio con obras de Brahms, Villa-Lobos, Offenbach, Elgar y Moncayo, y el Programa 5 de la Segunda Temporada el 12 de julio. Boletos en taquilla del Teatro Degollado con 30% de descuento para estudiantes, maestros y adultos mayores.',
    costoEstimado: 'Desde $150 MXN (30% dcto estudiantes)',
    tiempoEstancia: 120,
    horariosJson: JSON.stringify({
      lunes: 'cerrado', martes: 'cerrado', miercoles: 'cerrado', jueves: 'cerrado',
      viernes: { apertura: '20:00', cierre: '22:30' },
      sabado: { apertura: '20:00', cierre: '22:30' },
      domingo: { apertura: '13:00', cierre: '15:30' },
    }),
    fotos: [],
  },
];

async function addPlaces() {
  let added = 0;
  for (const lugar of lugares) {
    const id = normalizeName(lugar.nombre);
    const existing = await db.collection('lugares').doc(id).get();
    if (existing.exists) { console.log(`⏭  Ya existe: ${lugar.nombre}`); continue; }
    await db.collection('lugares').doc(id).set({ ...lugar, createdAt: new Date().toISOString(), ultimaActualizacion: new Date().toISOString() });
    console.log(`✓ Agregado: ${lugar.nombre}`);
    added++;
  }
  console.log(`\nListo — ${added} lugares nuevos agregados.`);
  process.exit(0);
}

addPlaces().catch(e => { console.error(e); process.exit(1); });
