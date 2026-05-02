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

const lugares = [
  // ── FÚTBOL ────────────────────────────────────────────────────────────────
  {
    nombre: 'FIFA Fan Festival Guadalajara 2026',
    categoria: 'Fútbol',
    categorias: ['Fútbol', 'Fan zone'],
    ubicacion: 'Parque Agua Azul, Calz. Independencia Sur 973, Guadalajara',
    latitud: '20.6603',
    longitud: '-103.3430',
    descripcion: 'Zona oficial de la FIFA para aficionados del Mundial 2026 en Guadalajara. Entrada gratuita con actividades interactivas, transmisiones en pantallas gigantes, food trucks y experiencias de marca durante todo el torneo.',
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

  // ── EVENTOS ───────────────────────────────────────────────────────────────
  {
    nombre: 'Noche de Museos Guadalajara',
    categoria: 'Eventos',
    categorias: ['Eventos', 'Cultura / Historia'],
    ubicacion: 'Museo Regional de Guadalajara, Liceo 60, Centro Histórico, Guadalajara',
    latitud: '20.6766',
    longitud: '-103.3466',
    descripcion: 'El primer miércoles de cada mes los museos de Guadalajara abren sus puertas de forma gratuita en horario nocturno. Durante junio y julio, el evento cobra especial relevancia con exhibiciones especiales temáticas del Mundial 2026 y actividades culturales en el Centro Histórico.',
    costoEstimado: 'Gratuito',
    tiempoEstancia: 120,
    horariosJson: JSON.stringify({
      lunes: 'cerrado',
      martes: 'cerrado',
      miercoles: { apertura: '18:00', cierre: '22:00' },
      jueves: 'cerrado',
      viernes: 'cerrado',
      sabado: 'cerrado',
      domingo: 'cerrado',
    }),
    fotos: [],
  },
  {
    nombre: 'Mercado del Arte Tlaquepaque',
    categoria: 'Eventos',
    categorias: ['Eventos', 'Artesanías / Souvenirs'],
    ubicacion: 'Jardín Hidalgo, Independencia s/n, San Pedro Tlaquepaque',
    latitud: '20.6434',
    longitud: '-103.3124',
    descripcion: 'Mercado artesanal al aire libre que se instala cada fin de semana en el corazón de Tlaquepaque. Pintores, escultores, fotógrafos y artesanos locales exhiben y venden su obra. Durante el verano del Mundial 2026 incluye piezas de arte inspiradas en el fútbol y la cultura jalisciense.',
    costoEstimado: 'Gratuito (compras opcionales)',
    tiempoEstancia: 90,
    horariosJson: JSON.stringify({
      lunes: 'cerrado',
      martes: 'cerrado',
      miercoles: 'cerrado',
      jueves: 'cerrado',
      viernes: 'cerrado',
      sabado: { apertura: '10:00', cierre: '19:00' },
      domingo: { apertura: '10:00', cierre: '18:00' },
    }),
    fotos: [],
  },
  {
    nombre: 'Conciertos de Verano Parque Colomos',
    categoria: 'Eventos',
    categorias: ['Eventos'],
    ubicacion: 'Bosque Colomos, Av. Eulogio Parra s/n, Guadalajara',
    latitud: '20.7048',
    longitud: '-103.3980',
    descripcion: 'Serie de conciertos gratuitos al aire libre que el Gobierno de Guadalajara organiza cada verano en el Bosque Colomos. En junio y julio 2026 el cartel incluye música en vivo de artistas locales y regionales los fines de semana, con un ambiente familiar rodeado de naturaleza.',
    costoEstimado: 'Gratuito',
    tiempoEstancia: 120,
    horariosJson: JSON.stringify({
      lunes: 'cerrado',
      martes: 'cerrado',
      miercoles: 'cerrado',
      jueves: 'cerrado',
      viernes: 'cerrado',
      sabado: { apertura: '17:00', cierre: '21:00' },
      domingo: { apertura: '12:00', cierre: '18:00' },
    }),
    fotos: [],
  },
  {
    nombre: 'Feria de San Juan de Dios',
    categoria: 'Eventos',
    categorias: ['Eventos'],
    ubicacion: 'Calz. Independencia Sur, Centro, Guadalajara',
    latitud: '20.6673',
    longitud: '-103.3371',
    descripcion: 'Feria popular tradicional que se celebra en junio en los alrededores del Mercado San Juan de Dios, el mercado cubierto más grande de América Latina. Artesanías, gastronomía típica jalisciense, juegos mecánicos y entretenimiento familiar forman parte de esta festividad con décadas de historia en la ciudad.',
    costoEstimado: 'Gratuito (consumo opcional)',
    tiempoEstancia: 120,
    horariosJson: JSON.stringify({
      lunes: { apertura: '10:00', cierre: '22:00' },
      martes: { apertura: '10:00', cierre: '22:00' },
      miercoles: { apertura: '10:00', cierre: '22:00' },
      jueves: { apertura: '10:00', cierre: '22:00' },
      viernes: { apertura: '10:00', cierre: '23:00' },
      sabado: { apertura: '09:00', cierre: '23:00' },
      domingo: { apertura: '09:00', cierre: '22:00' },
    }),
    fotos: [],
  },
  {
    nombre: 'Exposición de Arte Contemporáneo Jalisco',
    categoria: 'Eventos',
    categorias: ['Eventos', 'Cultura / Historia'],
    ubicacion: 'Instituto Cultural Cabañas, Cabañas 8, Centro Histórico, Guadalajara',
    latitud: '20.6776',
    longitud: '-103.3436',
    descripcion: 'Muestra temporal de artistas contemporáneos jaliscienses que se realiza cada verano en el Cabañas, Patrimonio de la Humanidad. La edición 2026 incorpora obra visual, instalaciones y arte digital en torno a los temas de identidad, fútbol y cultura mexicana en el contexto del Mundial.',
    costoEstimado: '$80 MXN',
    tiempoEstancia: 90,
    horariosJson: JSON.stringify({
      lunes: 'cerrado',
      martes: { apertura: '10:00', cierre: '18:00' },
      miercoles: { apertura: '10:00', cierre: '18:00' },
      jueves: { apertura: '10:00', cierre: '18:00' },
      viernes: { apertura: '10:00', cierre: '18:00' },
      sabado: { apertura: '10:00', cierre: '18:00' },
      domingo: { apertura: '10:00', cierre: '15:00' },
    }),
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
