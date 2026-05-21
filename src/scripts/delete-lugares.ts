/**
 * Script: delete-lugares.ts
 * Elimina lugares específicos de Firestore (todas las colecciones relevantes).
 * Ejecutar: npx ts-node src/scripts/delete-lugares.ts
 */
import { db } from '../config/firebase';

const LUGARES_A_ELIMINAR = [
  "Nieves de Garrafa Chapalita Gourmet, Guadalajara",
  "vxcvxcvxcvx",
];

const COLLECTIONS = [
  db.collection('lugares'),
  db.collection('negocios'),
  db.collection('usuarios').doc('turistas').collection('lista'),
  db.collection('usuarios').doc('guias').collection('lista'),
];

async function deleteFromCollection(col: FirebaseFirestore.CollectionReference, nombre: string) {
  const snap = await col.where('nombre', '==', nombre).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function main() {
  for (const nombre of LUGARES_A_ELIMINAR) {
    let total = 0;
    for (const col of COLLECTIONS) {
      const n = await deleteFromCollection(col as any, nombre);
      if (n > 0) console.log(`  ✓ Eliminado de ${(col as any).path}: ${n} doc(s)`);
      total += n;
    }
    if (total === 0) {
      console.warn(`⚠️  No encontrado en ninguna colección: "${nombre}"`);
    } else {
      console.log(`✅ "${nombre}" eliminado (${total} doc total)`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
