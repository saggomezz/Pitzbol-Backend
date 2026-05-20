/**
 * Script: set-subcategoria-aviso.ts
 * Marca los avisos de fútbol con subcategoria: "Aviso" en Firestore.
 * Ejecutar: npx ts-node src/scripts/set-subcategoria-aviso.ts
 */
import { db } from '../config/firebase';

const AVISOS = [
  "Capacidad y Logística en el Estadio Akron",
  "¿Cuánto cuestan los boletos oficiales para Guadalajara?",
];

async function main() {
  const collections = [
    db.collection('lugares'),
    db.collection('negocios'),
  ];

  for (const nombre of AVISOS) {
    let found = false;
    for (const col of collections) {
      const snap = await col.where('nombre', '==', nombre).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({
          subcategoria: 'Aviso',
          subcategorias: ['Aviso'],
        });
        console.log(`✅ Marcado como Aviso: "${nombre}" (col: ${col.path})`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`⚠️  No encontrado: "${nombre}"`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
