/**
 * Restaura el tour de Claudio el Gallo que fue eliminado por el script de limpieza.
 * Uso: npx tsx scripts/restore-claudio-tour.ts
 */
import dotenv from "dotenv";
dotenv.config();
import { db } from "../src/config/firebase";
import admin from "firebase-admin";

async function main() {
  console.log("[restore] Buscando guía Claudio en Firestore...");

  // Buscar a Claudio en la colección de guías
  const guiaSnap = await db.collection("usuarios").doc("guias").collection("lista")
    .where("01_nombre", "==", "Claudio").limit(1).get();

  let guiaUid = "";
  let guiaNombre = "Claudio el Gallo";
  let guiaFoto = "";

  if (!guiaSnap.empty) {
    const g = guiaSnap.docs[0].data();
    guiaUid = g["uid"] || guiaSnap.docs[0].id;
    guiaNombre = `${g["01_nombre"] || ""} ${g["02_apellido"] || ""}`.trim() || "Claudio el Gallo";
    guiaFoto = g["14_foto_perfil"]?.url || "";
    console.log(`[restore] Guía encontrado: ${guiaNombre} (${guiaUid})`);
  } else {
    // Intentar buscar por apellido
    const snap2 = await db.collection("usuarios").doc("guias").collection("lista")
      .where("02_apellido", "==", "Gallo").limit(1).get();
    if (!snap2.empty) {
      const g = snap2.docs[0].data();
      guiaUid = g["uid"] || snap2.docs[0].id;
      guiaNombre = `${g["01_nombre"] || ""} ${g["02_apellido"] || ""}`.trim();
      guiaFoto = g["14_foto_perfil"]?.url || "";
      console.log(`[restore] Guía encontrado por apellido: ${guiaNombre} (${guiaUid})`);
    } else {
      console.error("[restore] ❌ No se encontró a Claudio en la colección de guías.");
      console.log("[restore] Listando guías disponibles...");
      const todos = await db.collection("usuarios").doc("guias").collection("lista").limit(10).get();
      todos.docs.forEach(d => {
        const g = d.data();
        console.log(`  - ${g["01_nombre"]} ${g["02_apellido"]} (uid: ${g["uid"] || d.id})`);
      });
      process.exit(1);
    }
  }

  // Recrear el tour con los datos que se veían en pantalla
  const ref = db.collection("tours").doc();
  const tourData = {
    id: ref.id,
    guiaId: guiaUid,
    tipoGuia: "persona",
    empresaNombre: guiaNombre,
    empresaLogo: guiaFoto,
    titulo: "Recorrido panteon de belen",
    descripcion: "Recorrido guiado por el histórico Panteón de Belén en Guadalajara.",
    destino: "Centro Histórico",
    duracion: "2 horas",
    precio: "$100 MXN",
    fotoPrincipal: "",
    fotos: [],
    queIncluye: ["Comida"],
    idiomas: ["Español"],
    puntoRecogida: "",
    capacidad: "",
    status: "activo",
    createdAt: new Date().toISOString(),
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await ref.set(tourData);
  console.log(`[restore] ✅ Tour restaurado con ID: ${ref.id}`);
  console.log(`[restore] Título: ${tourData.titulo}`);
  console.log(`[restore] Guía: ${guiaNombre} (${guiaUid})`);
  console.log(`[restore] NOTA: La foto del tour se perdió. Claudio puede subirla desde su perfil.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
