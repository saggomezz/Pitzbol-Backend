/**
 * Verifica paquetes existentes en Firestore y estado de guías
 * Uso: npx tsx scripts/check-paquetes.ts
 */
import dotenv from "dotenv";
dotenv.config();
import { db } from "../src/config/firebase";

async function main() {
  console.log("=== PAQUETES EN FIRESTORE ===");
  const paqSnap = await db.collection("paquetes").get();
  if (paqSnap.empty) {
    console.log("❌ No hay paquetes en la colección");
  } else {
    paqSnap.docs.forEach(d => {
      const p = d.data();
      console.log(`  ✅ ID: ${d.id}`);
      console.log(`     Título: ${p.titulo}`);
      console.log(`     Guía: ${p.guiaNombre} (${p.guiaId})`);
      console.log(`     Status: ${p.status}`);
      console.log(`     Fotos: ${p.fotos?.length || 0}`);
    });
  }

  console.log("\n=== GUÍAS VERIFICADOS ===");
  const guiasSnap = await db.collection("usuarios").doc("guias").collection("lista").get();
  guiasSnap.docs.forEach(d => {
    const g = d.data();
    console.log(`  - ${g["01_nombre"]} ${g["02_apellido"]} | uid: ${g.uid || d.id}`);
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
