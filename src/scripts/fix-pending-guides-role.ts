import { db } from "../config/firebase";

/**
 * Script para corregir el rol de guias pendientes
 * Cambia "03_rol": "guia_pendiente" a "03_rol": "turista"
 * en todos los documentos de guias/pendientes
 */
async function fixPendingGuidesRole() {
  try {
    console.log("Iniciando correccion de roles...");

    const pendientesRef = db.collection("usuarios")
      .doc("guias")
      .collection("pendientes");

    const snapshot = await pendientesRef.get();

    if (snapshot.empty) {
      console.log("No hay guias pendientes para actualizar");
      return;
    }

    console.log(`Encontrados ${snapshot.size} documentos en pendientes`);

    let updated = 0;
    let unchanged = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const currentRole = data["03_rol"];

      if (currentRole === "guia_pendiente") {
        await doc.ref.update({
          "03_rol": "turista"
        });
        console.log(`Actualizado: ${doc.id} -> role: turista`);
        updated++;
      } else {
        console.log(`Omitido: ${doc.id} -> role ya es: ${currentRole}`);
        unchanged++;
      }
    }

    console.log("\nResumen:");
    console.log(`   Actualizados: ${updated}`);
    console.log(`   Sin cambios: ${unchanged}`);
    console.log(`   Total: ${snapshot.size}`);
    console.log("Correccion completada");
  } catch (error) {
    console.error("Error al corregir roles:", error);
    throw error;
  }
}

fixPendingGuidesRole()
  .then(() => {
    console.log("\nScript finalizado exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript fallo:", error);
    process.exit(1);
  });