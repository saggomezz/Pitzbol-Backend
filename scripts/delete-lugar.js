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

function normalizeName(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
}

const LUGARES_A_ELIMINAR = [
  'Casa Dolores - Av. Chapultepec, Guadalajara',
];

async function deletePlaces() {
  for (const nombre of LUGARES_A_ELIMINAR) {
    const id = normalizeName(nombre);
    const ref = db.collection('lugares').doc(id);
    const doc = await ref.get();
    if (doc.exists) {
      await ref.delete();
      console.log(`✓ Eliminado: ${nombre} (id: ${id})`);
    } else {
      console.log(`⚠ No encontrado: ${nombre} (id: ${id})`);
    }
  }
  console.log('\nListo.');
  process.exit(0);
}

deletePlaces().catch(e => { console.error(e); process.exit(1); });
