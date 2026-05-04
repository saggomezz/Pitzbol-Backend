/**
 * Script de limpieza general:
 * - Elimina todos los tours de la colección "tours"
 * - Elimina todos los negocios y solicitudes de cua@hotmail.com
 * Uso: npx tsx scripts/cleanup-all-test-data.ts
 */
import dotenv from "dotenv";
dotenv.config();
import { db } from "../src/config/firebase";
import admin from "firebase-admin";

const TARGET_EMAIL = "cua@hotmail.com";

async function deleteCollection(ref: FirebaseFirestore.CollectionReference) {
  const snap = await ref.get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function main() {
  let total = 0;

  // 1. Eliminar todos los tours
  console.log("[cleanup] Eliminando colección tours...");
  const toursSnap = await db.collection("tours").get();
  if (!toursSnap.empty) {
    const batch = db.batch();
    toursSnap.docs.forEach(doc => {
      console.log(`  - Tour: ${doc.data()?.titulo || doc.id}`);
      batch.delete(doc.ref);
    });
    await batch.commit();
    total += toursSnap.size;
    console.log(`[cleanup] ✅ ${toursSnap.size} tours eliminados`);
  } else {
    console.log("[cleanup] No hay tours en la colección");
  }

  // 2. Eliminar negocios y publicaciones de cua@hotmail.com
  console.log(`\n[cleanup] Buscando usuario ${TARGET_EMAIL}...`);
  let uid: string | null = null;
  try {
    const userRecord = await admin.auth().getUserByEmail(TARGET_EMAIL);
    uid = userRecord.uid;
    console.log(`[cleanup] UID: ${uid}`);
  } catch {
    console.warn(`[cleanup] No se encontró usuario ${TARGET_EMAIL} en Auth`);
  }

  if (uid) {
    for (const estado of ["Activos", "Pendientes", "Rechazados", "Archivados"]) {
      const snap = await db.collection("negocios").doc(estado).collection("items")
        .where("business.owner", "==", uid).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach(doc => {
          console.log(`  - Negocio ${estado}: ${doc.data()?.business?.name || doc.id}`);
          batch.delete(doc.ref);
        });
        await batch.commit();
        total += snap.size;
      }
    }

    // Remover de colección negocios/lista
    const negSnap = await db.collection("usuarios").doc("negocios").collection("lista")
      .where("uid", "==", uid).get();
    if (!negSnap.empty) {
      const batch = db.batch();
      negSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      total += negSnap.size;
      console.log(`[cleanup] ✅ Removido de usuarios/negocios/lista`);
    }

    // Confirmar que sigue como guía
    const guiaSnap = await db.collection("usuarios").doc("guias").collection("lista")
      .where("uid", "==", uid).limit(1).get();
    console.log(guiaSnap.empty
      ? "[cleanup] ⚠️  cua NO está en colección de guías"
      : "[cleanup] ✅ cua sigue registrado como guía");
  }

  console.log(`\n[cleanup] ✅ Total eliminados: ${total} documentos`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
