import axios from "axios";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { auth, db } from "../config/firebase";

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!FIREBASE_WEB_API_KEY || !JWT_SECRET) {
  throw new Error("Faltan variables de entorno (JWT o Firebase API KEY)");
}

//REGISTRO DE USUARIO
export const register = async (req: Request, res: Response) => {
  
  try {
    const { email, password, nombre, apellido, telefono, nacionalidad, role } = req.body;

    // 1. Crear usuario en Firebase Auth (Genera el UID oficial)
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });

    // 2. Definir el rol dinámico
    // Si desde el frontend mandas "admin", "negociante" o "turista", se guardará ese.
    // Si no se manda nada, por defecto será "turista".
    const finalRole = role || "turista";

  const customId = `${nombre}_${apellido}`.replace(/\s+/g, '_');
    // 3. Guardar en Firestore usando el UID como ID del documento
    // Esto crea el documento en la raíz 'usuarios/' que viste en tu consola
  await db.collection("usuarios")
    .doc("turistas")       // Carpeta Maestra
    .collection("lista")   // Subcolección
    .doc(customId)
    .set({
      uid: userRecord.uid,
      nombre,
      apellido,
      email,
      telefono,
      nacionalidad,
      role: finalRole,
      createdAt: new Date().toISOString(),
    });

    // 4. Respuesta al Frontend
    res.status(201).json({
      msg: "Usuario creado correctamente",
      user: {
        uid: userRecord.uid,
        email,
        nombre,
        role: finalRole
      }
    });

  } catch (error: any) {
    console.error("🔥 ERROR DETALLADO EN REGISTRO:", error);
    
    // Manejo de errores comunes de Firebase
    if (error.code === 'auth/email-already-exists') {
        return res.status(400).json({ msg: "El correo ya está registrado en Pitzbol" });
    }
    if (error.code === 'auth/invalid-password') {
        return res.status(400).json({ msg: "La contraseña debe tener al menos 6 caracteres" });
    }
    
    res.status(500).json({ msg: "Error interno al registrar", error: error.message });
  }
};

/* =========================
   LOGIN + JWT
========================= */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // 1. Validar credenciales con Firebase (Obtenemos el localId/UID)
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
    const response = await axios.post(url, { email, password, returnSecureToken: true });
    const { localId } = response.data;

    // 2. Variables para almacenar los datos encontrados
    let userData: any = null;
    let userRole: string = "";

    // --- AQUÍ VA EL BLOQUE QUE ME PASASTE (CON CORRECCIONES) ---
    const categorias = ["turistas", "guias", "admins", "negocios"];

    for (const cat of categorias) {
      const querySnapshot = await db.collection("usuarios")
        .doc(cat)
        .collection("lista")
        .where("uid", "==", localId) 
        .limit(1)
        .get();

      if (!querySnapshot.empty && querySnapshot.docs.length > 0) {
        const docSnap = querySnapshot.docs[0];
        if (docSnap) {
          userData = docSnap.data();
          // Mapeo dinámico del rol según la carpeta
          userRole = cat === "turistas" ? "turista" : 
                     cat === "admins" ? "admin" : 
                     cat === "guias" ? "guia" : "negociante";
          break; // Si lo encuentra, deja de buscar en las demás carpetas
        }
      }
    }

    // 3. Si después de buscar en todas no hay datos
    if (!userData) {
      return res.status(404).json({ msg: "Perfil de usuario no encontrado en la base de datos" });
    }

    // 4. Generar JWT con el rol detectado
    const token = jwt.sign(
      { uid: localId, email, role: userRole },
      JWT_SECRET!,
      { expiresIn: "1d" }
    );

    // 5. Respuesta al Frontend
    res.json({
      token,
      user: {
        uid: localId,
        email,
        role: userRole,
        // Adaptamos los nombres según el esquema (Turista o Guía)
        nombre: userData.nombre || userData["01_nombre"],
        apellido: userData.apellido || userData["02_apellido"],
        telefono: userData.telefono || "",
        nacionalidad: userData.nacionalidad || "",
        especialidades: userData.especialidades || userData["07_especialidades"] || [],
      },
    });

  } catch (error: any) {
    const firebaseError = error.response?.data?.error;
    const code = firebaseError?.message;

    console.error("🔥 ERROR EN LOGIN:", code || error.message);

    if (code === "INVALID_LOGIN_CREDENTIALS" || code === "EMAIL_NOT_FOUND" || code === "INVALID_PASSWORD") {
      return res.status(401).json({ msg: "Credenciales inválidas" });
    }

    return res.status(500).json({ msg: "Error interno en el servidor", error: code || error.message });
  }
};

// Recuperar contraseña
export const recoverPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "El correo es obligatorio" });
    }

    // 1. BUSCAR AL USUARIO EN TODAS LAS POSIBLES UBICACIONES
    // Intento A: Usuarios generales (Admin, Turista, Negociante)
    const userSnapshot = await db.collection("usuarios").where("email", "==", email).limit(1).get();
    
    // Intento B: Guías (que están en la subcolección que definimos antes)
    const guiaSnapshot = await db.collection("usuarios")
      .doc("guias")
      .collection("lista")
      .where("04_correo", "==", email)
      .limit(1)
      .get();

    // 2. VERIFICAR SI EXISTE EN ALGUNO
    const existeComoUsuario = !userSnapshot.empty;
    const existeComoGuia = !guiaSnapshot.empty;

    if (!existeComoUsuario && !existeComoGuia) {
      // Por seguridad, devolvemos el mismo mensaje aunque no exista
      return res.json({ msg: "Si el correo existe, se enviará un enlace de recuperación" });
    }

    // 3. ENVIAR EL CORREO AUTOMÁTICO DE FIREBASE
    // Importante: No uses generatePasswordResetLink si quieres que Firebase mande el mail solo.
    // El envío de correos automáticos se hace normalmente desde el FRONTEND con 
    // sendPasswordResetEmail(auth, email).
    
    // Si decides hacerlo desde el BACKEND (Admin SDK), Firebase Admin NO envía correos directamente.
    // Tendrías que enviarlo tú con el link generado:
    const resetLink = await auth.generatePasswordResetLink(email, {
      url: "http://localhost:3000/login",
    });

    console.log(`🔗 Enlace para ${email}:`, resetLink);
    
    // AQUÍ DEBERÍAS USAR NODEMAILER PARA ENVIAR resetLink AL USUARIO
    // O simplemente decirle al frontend que use el cliente de Firebase.

    return res.json({
      msg: "Si el correo existe, se enviará un enlace de recuperación",
    });

  } catch (error) {
    console.error("Error en recoverPassword:", error);
    return res.json({ msg: "Error al procesar la solicitud" });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { uid, telefono, nacionalidad, especialidades } = req.body;

    if (!uid) {
      return res.status(400).json({ msg: "UID requerido" });
    }

    // Construir objeto de actualización solo con campos presentes
    const updateData: any = {};
    if (telefono !== undefined) updateData.telefono = telefono;
    if (nacionalidad !== undefined) updateData.nacionalidad = nacionalidad;
    if (especialidades !== undefined) updateData.especialidades = especialidades;

    // Si se actualiza teléfono, validar que sea único (SIN ÍNDICE COMPUESTO)
    if (telefono) {
      const categorias = ["turistas", "guias", "admins", "negocios"];
      
      for (const cat of categorias) {
        // PASO 1: Buscar todos con ese teléfono
        const querySnapshot = await db.collection("usuarios")
          .doc(cat)
          .collection("lista")
          .where("telefono", "==", telefono)
          .get();

        // PASO 2: Filtrar en JavaScript (evita índice compuesto)
        const duplicados = querySnapshot.docs.filter(doc => doc.data().uid !== uid);
        
        if (duplicados.length > 0) {
          return res.status(400).json({ msg: "Este teléfono ya está registrado" });
        }
      }
    }

    // Buscar documento del usuario en todas las categorías
    const categorias = ["turistas", "guias", "admins", "negocios"];
    let documentoActualizado = false;

    for (const cat of categorias) {
      const querySnapshot = await db.collection("usuarios")
        .doc(cat)
        .collection("lista")
        .where("uid", "==", uid)
        .limit(1)
        .get();

      if (!querySnapshot.empty && querySnapshot.docs[0]) {
        const docRef = querySnapshot.docs[0].ref;
        await docRef.update(updateData);
        documentoActualizado = true;
        break;
      }
    }

    if (!documentoActualizado) {
      return res.status(404).json({ msg: "Usuario no encontrado" });
    }

    res.json({ msg: "Perfil actualizado correctamente", data: updateData });

  } catch (error: any) {
    console.error("Error en updateProfile:", error);
    res.status(500).json({ msg: "Error interno del servidor", error: error.message });
  }
};