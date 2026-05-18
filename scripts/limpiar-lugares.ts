/**
 * Script de limpieza de lugares en Firestore.
 *
 * 1. Centro Histórico de Tlaquepaque → quitar categorías de gastronomía (conservar Cultura)
 * 2. Eliminar: Nieves de Garrafa Chapalita Nueva Escocia, The Coffee Zapopan, Tacos El Super
 *
 * Uso: cd ~/Pitzbol-Backend && npx ts-node ./scripts/limpiar-lugares.ts
 */
import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const GASTRONOMIA_CATS = [
  "gastronomía", "gastronomia", "gastronomía mexicana", "gastronomia mexicana",
  "cafeterías", "cafeterias", "comida", "restaurante", "postre", "dulces",
];

function normalizarStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function esGastronomia(cat: string): boolean {
  return GASTRONOMIA_CATS.some(g => normalizarStr(cat).includes(g));
}

const LUGARES_ELIMINAR = [
  "nieves de garrafa chapalita nueva escocia",
  "the coffee zapopan",
  "tacos el super",
];

function debeEliminar(nombre: string): boolean {
  const n = normalizarStr(nombre);
  return LUGARES_ELIMINAR.some(l => n.includes(normalizarStr(l)));
}

async function run() {
  const snap = await db.collection("lugares").get();
  console.log(`\n🔍 Revisando ${snap.size} lugares en Firestore...\n`);

  let modificados = 0;
  let eliminados = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const nombre: string = data.nombre || doc.id;

    // ── Eliminar lugares ────────────────────────────────────────────────────
    if (debeEliminar(nombre)) {
      await doc.ref.delete();
      console.log(`🗑️  Eliminado: "${nombre}" (${doc.id})`);
      eliminados++;
      continue;
    }

    // ── Quitar gastronomía de Tlaquepaque ───────────────────────────────────
    if (normalizarStr(nombre).includes("tlaquepaque") && normalizarStr(nombre).includes("centro")) {
      const categoriasActuales: string[] = data.categorias || (data.categoria ? [data.categoria] : []);
      const nuevasCats = categoriasActuales.filter(c => !esGastronomia(c));

      if (nuevasCats.length !== categoriasActuales.length) {
        const updateData: any = {
          categorias: nuevasCats,
          ultimaActualizacion: new Date().toISOString(),
        };
        if (nuevasCats.length > 0) {
          updateData.categoria = nuevasCats[0];
        }
        await doc.ref.update(updateData);
        console.log(`✏️  Categorías actualizadas para "${nombre}":`);
        console.log(`   Antes: [${categoriasActuales.join(", ")}]`);
        console.log(`   Ahora: [${nuevasCats.join(", ")}]`);
        modificados++;
      } else {
        console.log(`ℹ️  "${nombre}" ya no tiene categorías de gastronomía — sin cambios`);
      }
    }
  }

  console.log(`\n✅ Proceso completado: ${modificados} modificado(s), ${eliminados} eliminado(s).`);
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
