/**
 * Script de limpieza: elimina usuarios de Firestore y Firebase Auth por nombre.
 * Uso en el VPS: cd ~/Pitzbol-Backend && npx ts-node scripts/eliminar-usuarios.ts
 */
import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID!,
      clientEmail: FIREBASE_CLIENT_EMAIL!,
      privateKey: FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

// Nombres a eliminar (insensible a mayúsculas/acentos para mayor cobertura)
const NOMBRES_A_ELIMINAR = ["xim mor", "josue alvarez", "aaron fuenamayor", "aaron fuenamayor"];

function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function coincideNombre(nombre: string, apellido: string): boolean {
  const nombreCompleto = normalizarNombre(`${nombre} ${apellido}`);
  return NOMBRES_A_ELIMINAR.some(n => nombreCompleto.includes(normalizarNombre(n)));
}

async function buscarYEliminar() {
  const colecciones = [
    db.collection("usuarios").doc("turistas").collection("lista"),
    db.collection("usuarios").doc("admins").collection("lista"),
    db.collection("usuarios").doc("negocios").collection("lista"),
    db.collection("usuarios").doc("guias").collection("lista"),
    db.collection("usuarios").doc("guias").collection("pendientes"),
  ];

  const encontrados: { uid: string; nombre: string; coleccion: string; ref: FirebaseFirestore.DocumentReference }[] = [];

  for (const col of colecciones) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const nombre = data["01_nombre"] || data.nombre || "";
      const apellido = data["02_apellido"] || data.apellido || "";
      if (coincideNombre(nombre, apellido)) {
        encontrados.push({
          uid: data.uid || doc.id,
          nombre: `${nombre} ${apellido}`.trim(),
          coleccion: col.path,
          ref: doc.ref,
        });
      }
    }
  }

  if (encontrados.length === 0) {
    console.log("✅ No se encontraron usuarios con esos nombres.");
    return;
  }

  console.log(`\n🔍 Usuarios encontrados (${encontrados.length}):`);
  encontrados.forEach(u => console.log(`  - ${u.nombre} (UID: ${u.uid}) en ${u.coleccion}`));
  console.log("\n🗑️  Eliminando...\n");

  const uidsEliminados = new Set<string>();

  for (const usuario of encontrados) {
    try {
      await usuario.ref.delete();
      console.log(`  ✅ Documento Firestore eliminado: ${usuario.nombre} de ${usuario.coleccion}`);

      if (usuario.uid && !uidsEliminados.has(usuario.uid)) {
        try {
          await auth.deleteUser(usuario.uid);
          console.log(`  ✅ Firebase Auth eliminado: ${usuario.uid}`);
          uidsEliminados.add(usuario.uid);
        } catch (authErr: any) {
          if (authErr.code === "auth/user-not-found") {
            console.log(`  ℹ️  Firebase Auth ya no existía: ${usuario.uid}`);
          } else {
            console.warn(`  ⚠️  Error eliminando de Auth: ${authErr.message}`);
          }
          uidsEliminados.add(usuario.uid);
        }
      }
    } catch (err: any) {
      console.error(`  ❌ Error eliminando ${usuario.nombre}: ${err.message}`);
    }
  }

  console.log(`\n✅ Proceso completado. ${uidsEliminados.size} usuario(s) eliminado(s).`);
  process.exit(0);
}

buscarYEliminar().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
