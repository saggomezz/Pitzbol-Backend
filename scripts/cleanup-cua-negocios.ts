/**
 * Script de limpieza: elimina negocios y solicitudes de negocio del usuario cua@hotmail.com
 * Uso: npx tsx scripts/cleanup-cua-negocios.ts
 */
import dotenv from "dotenv";
dotenv.config();
import { db } from "../src/config/firebase";
import admin from "firebase-admin";

const TARGET_EMAIL = "cua@hotmail.com";

async function main() {
  console.log(`[cleanup] Buscando usuario con email: ${TARGET_EMAIL}`);

  // Obtener UID desde Firebase Auth
  let uid: string;
  try {
    const userRecord = await admin.auth().getUserByEmail(TARGET_EMAIL);
    uid = userRecord.uid;
    console.log(`[cleanup] UID encontrado: ${uid}`);
  } catch (e: any) {
    console.error(`[cleanup] No se encontró usuario con email ${TARGET_EMAIL}:`, e.message);
    process.exit(1);
  }

  let totalDeleted = 0;

  // Eliminar negocios Activos
  const activos = await db.collection("negocios").doc("Activos").collection("items")
    .where("business.owner", "==", uid).get();
  for (const doc of activos.docs) {
    console.log(`[cleanup] Eliminando negocio Activo: ${doc.id} - ${doc.data()?.business?.name}`);
    await doc.ref.delete();
    totalDeleted++;
  }

  // Eliminar negocios Pendientes
  const pendientes = await db.collection("negocios").doc("Pendientes").collection("items")
    .where("business.owner", "==", uid).get();
  for (const doc of pendientes.docs) {
    console.log(`[cleanup] Eliminando negocio Pendiente: ${doc.id} - ${doc.data()?.business?.name}`);
    await doc.ref.delete();
    totalDeleted++;
  }

  // Eliminar negocios Rechazados
  const rechazados = await db.collection("negocios").doc("Rechazados").collection("items")
    .where("business.owner", "==", uid).get();
  for (const doc of rechazados.docs) {
    console.log(`[cleanup] Eliminando negocio Rechazado: ${doc.id}`);
    await doc.ref.delete();
    totalDeleted++;
  }

  // Eliminar solicitudes de negocio del usuario en la colección de usuarios negocios
  const userNegocio = await db.collection("usuarios").doc("negocios").collection("lista")
    .where("uid", "==", uid).get();
  for (const doc of userNegocio.docs) {
    console.log(`[cleanup] Eliminando usuario de colección negocios: ${doc.id}`);
    await doc.ref.delete();
    totalDeleted++;
  }

  // Actualizar el rol del usuario en turistas/guias si es necesario (asegurarse que queda como guia)
  const guiaSnap = await db.collection("usuarios").doc("guias").collection("lista")
    .where("uid", "==", uid).limit(1).get();
  if (!guiaSnap.empty) {
    console.log(`[cleanup] Usuario confirmado como guía en la colección de guías ✓`);
  } else {
    console.warn(`[cleanup] ⚠️ Usuario no encontrado en colección de guías`);
  }

  console.log(`\n[cleanup] ✅ Completado. ${totalDeleted} documentos de negocio eliminados para ${TARGET_EMAIL}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
