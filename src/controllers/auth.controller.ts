import axios from "axios";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { auth, db } from "../config/firebase";
import nodemailer from 'nodemailer';
import { FieldValue } from "@google-cloud/firestore";

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!FIREBASE_WEB_API_KEY || !JWT_SECRET) {
  throw new Error("Faltan variables de entorno (JWT o Firebase API KEY)");
}

// Nota: Gmail se configurará cuando se use, no en el inicio
let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (!transporter && process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });
  }
  return transporter;
};

//REGISTRO DE USUARIO
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, telefono, nacionalidad, role } = req.body;

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });

    const aspiracion = role || "turista"; 
    const carpetaMaestra = "turistas"; 

    const apellidoStr = apellido ? `_${apellido}` : "";
    const customId = `${nombre}${apellidoStr}`.replace(/\s+/g, '_').toLowerCase();

    await db.collection("usuarios")
      .doc("turistas") 
      .collection("lista")   
      .doc(customId)
      .set({
        uid: userRecord.uid,
        "01_nombre": nombre,
        "02_apellido": apellido || "",
        "03_rol": "turista",
        "04_correo": email,
        "05_nacionalidad": nacionalidad || "",
        "06_telefono": telefono || "",
        "07_especialidades": [],
        role: "turista", 
        solicitudStatus: (aspiracion === "guia") ? "pendiente" : "ninguno",
        tipoAspirante: aspiracion,
        descripcion: "",
        createdAt: new Date().toISOString(),
      });

    // Guardar notificación de bienvenida en Firestore
    try {
      await db.collection('usuarios')
        .doc('notificaciones')
        .collection(userRecord.uid)
        .add({
          tipo: 'info',
          titulo: '¡Bienvenido a Pitzbol! 🎉',
          mensaje: 'Tu registro ha sido exitoso. Ahora puedes explorar nuestras guías turísticas y experiencias únicas.',
          fecha: new Date().toISOString(),
          leido: false,
          enlace: '/futbol'
        });
      console.log(`📬 Notificación de bienvenida guardada para uid: ${userRecord.uid}`);
    } catch (notifError) {
      console.warn(`⚠️ Error al guardar notificación de bienvenida: ${notifError}`);
    }

    res.status(201).json({
      msg: "Usuario creado correctamente",
      user: {
        uid: userRecord.uid,
        email,
        nombre,
        role: "turista", 
        solicitudStatus: (aspiracion === "guia" || aspiracion === "negocio") ? "pendiente" : "ninguno"
      }
    });

  } catch (error: any) {
    console.error("ERROR DETALLADO EN REGISTRO:", error);
    if (error.code === 'auth/email-already-exists') {
        return res.status(400).json({ msg: "El correo ya está registrado en Pitzbol" });
    }
    res.status(500).json({ msg: "Error interno al registrar", error: error.message });
  }
};

// LOGIN + JWT 
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 INTENTO DE LOGIN');
    console.log('📧 Email:', email);
    console.log('🔑 Password length:', password?.length, 'caracteres');
    console.log('🌐 Firebase API Key configurada:', FIREBASE_WEB_API_KEY ? 'Sí ✅' : 'NO ❌');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
    
    console.log('🔄 Intentando autenticar con Firebase...');
    const response = await axios.post(url, { email, password, returnSecureToken: true });
    const { localId } = response.data;
    
    console.log('✅ Firebase autenticó correctamente');
    console.log('👤 UID:', localId);
    
    let userData: any = null;
    let userRole: string = "";
    let guideCollection: "lista" | "pendientes" | null = null;

    const categorias = ["turistas", "admins", "negocios"];
    const subCarpetasGuia = ["lista", "pendientes"];

    for (const cat of categorias) {
        const snap = await db.collection("usuarios").doc(cat).collection("lista").where("uid", "==", localId).limit(1).get();
        
        if (!snap.empty && snap.docs.length > 0) {
            const doc = snap.docs[0];
            if (doc && doc.exists) {
                userData = doc.data();
                userRole = cat === "turistas" ? "turista" : cat === "admins" ? "admin" : "negociante";
                break; 
            }
        }
    }

    if (!userData) {
        for (const sub of subCarpetasGuia) {
            const snap = await db.collection("usuarios").doc("guias").collection(sub).where("uid", "==", localId).limit(1).get();
            
            if (!snap.empty && snap.docs.length > 0) {
                const doc = snap.docs[0];
                if (doc && doc.exists) {
                    userData = doc.data();
                    userRole = sub === "lista" ? "guia" : "turista";
                    guideCollection = sub as any;
                    break;
                }
            }
        }
    }

    if (!userData) {
      return res.status(404).json({
        msg: "No se encontró el perfil del usuario en Firestore.",
        details: "El usuario existe en Firebase Auth pero no tiene documento en la base de datos.",
      });
    }

    // Normalizar campos para cualquier colección (turistas / guias lista / guias pendientes / admins / negocios)
    const nombre = userData?.nombre || userData?.["01_nombre"] || "";
    const apellido = userData?.apellido || userData?.["02_apellido"] || "";
    const nacionalidad = userData?.nacionalidad || userData?.["05_nacionalidad"] || "No registrado";
    const telefono = userData?.telefono || userData?.["06_telefono"] || "No registrado";
    const especialidadesUnificadas = userData?.especialidades || userData?.["07_especialidades"] || [];
    const guideStatusRaw = userData?.solicitudStatus || userData?.status || userData?.guide_status;
    const guideStatus = guideStatusRaw || (guideCollection === "pendientes" ? "pendiente" : "ninguno");

    const token = jwt.sign(
      { uid: localId, email, role: userRole },
      JWT_SECRET!,
      { expiresIn: "7d" }
    );

    // Establecer HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en milisegundos
      secure: process.env.NODE_ENV === 'production' // Solo en HTTPS en producción
    });

    // Logging seguro (sin revelar datos sensibles)
    console.log(`✅ Login exitoso para usuario: ${localId}`);

    res.json({
      success: true,
      token,
      user: {
        uid: localId,
        email,
        nombre,
        apellido,
        telefono,
        nacionalidad,
        fotoPerfil: userData.fotoPerfil || userData["14_foto_perfil"]?.url || "",
        descripcion: userData.descripcion || userData["15_descripcion"] || "",
        guide_status: userData.guide_status || userData["16_status"] || guideStatus,
        tarifa: userData.tarifa_mxn || userData["17_tarifa_mxn"] || 0,
        "01_nombre": userData["01_nombre"],
        "06_telefono": userData["06_telefono"],
        "15_descripcion": userData["15_descripcion"],
        "14_foto_perfil": userData["14_foto_perfil"],
        role: userRole,
      },
    });;
  }   
  
  catch (error: any) {
    const firebaseError = error.response?.data?.error;
    const code = firebaseError?.message;

    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR EN LOGIN');
    console.error('📋 Email intentado:', req.body.email);
    console.error('🔥 Código de error Firebase:', code || 'Sin código');
    console.error('📝 Mensaje de error:', error.message);
    console.error('📊 Respuesta completa de Firebase:', JSON.stringify(error.response?.data, null, 2));
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Mensajes de error más descriptivos
    if (code === "INVALID_LOGIN_CREDENTIALS") {
      return res.status(401).json({ 
        msg: "Correo o contraseña incorrectos. Por favor verifica tus credenciales.",
        error_code: "INVALID_CREDENTIALS"
      });
    }
    
    if (code === "EMAIL_NOT_FOUND") {
      return res.status(401).json({ 
        msg: "No existe una cuenta con este correo electrónico.",
        error_code: "EMAIL_NOT_FOUND"
      });
    }
    
    if (code === "INVALID_PASSWORD") {
      return res.status(401).json({ 
        msg: "Contraseña incorrecta.",
        error_code: "INVALID_PASSWORD"
      });
    }
    
    if (code === "USER_DISABLED") {
      return res.status(403).json({ 
        msg: "Esta cuenta ha sido deshabilitada.",
        error_code: "USER_DISABLED"
      });
    }
    
    if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      return res.status(429).json({ 
        msg: "Demasiados intentos fallidos. Por favor intenta más tarde.",
        error_code: "TOO_MANY_ATTEMPTS"
      });
    }

    return res.status(500).json({ 
      msg: "Error interno en el servidor", 
      error: code || error.message,
      details: "Revisa los logs del servidor para más información"
    });
  }
};

// Recuperar contraseña
export const recoverPassword = async (req: Request, res: Response) => {
  console.log("🚀 Petición de recuperación recibida para:", req.body.email);
  
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "El correo es obligatorio" });
    }

    const categorias = ["turistas", "admins", "negocios"];
    let usuarioEncontrado = false;

    for (const cat of categorias) {
      const snap = await db.collection("usuarios")
        .doc(cat)
        .collection("lista")
        .where("email", "==", email)
        .limit(1)
        .get();
      
      if (!snap.empty) {
        usuarioEncontrado = true;
        break;
      }
    }

    if (!usuarioEncontrado) {
      const guiaSnapshot = await db.collection("usuarios")
        .doc("guias")
        .collection("lista")
        .where("04_correo", "==", email)
        .limit(1)
        .get();
      
      if (!guiaSnapshot.empty) {
        usuarioEncontrado = true;
      }
    }
    
    if (!usuarioEncontrado) {
      return res.json({ msg: "Si el correo existe, recibirás un enlace de recuperación." });
    }

    const resetLink = await auth.generatePasswordResetLink(email, {
      url: "http://localhost:3000/reset-password",
    });

    const mailOptions = {
      from: '"PITZBOL" <pitzbol2026@gmail.com>',
      to: email,
      subject: 'Restablecer tu contraseña - Pitzbol',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 30px; border-radius: 20px;">
          <h2 style="color: #1A4D2E; text-align: center;">Recupera tu acceso</h2>
          <p>Hola,</p>
          <p>Has solicitado restablecer tu contraseña para tu cuenta en <b>Pitzbol</b>. Haz clic en el botón de abajo para continuar:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #0D601E; color: white; padding: 15px 25px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">RESTABLECER CONTRASEÑA</a>
          </div>
          <p style="font-size: 12px; color: #769C7B;">Este enlace expirará pronto. Si no solicitaste este cambio, puedes ignorar este mensaje de forma segura.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 10px; color: #aaa; text-align: center;">© 2026 Pitzbol - Tu aventura comienza aquí</p>
        </div>
      `,
    };

    const mailTransporter = getTransporter();
    if (!mailTransporter) {
      throw new Error("Servicio de correo no configurado");
    }
    
    await mailTransporter.sendMail(mailOptions);
    console.log(`Correo enviado con éxito a: ${email}`);

    return res.json({
      msg: "Si el correo existe, recibirás un enlace de recuperación",
    });

  } catch (error: any) {
    console.error("Error en recoverPassword:", error);
    return res.status(500).json({ msg: "Error al procesar la solicitud", error: error.message });
  }
};

export const updateProfile = async (req: any, res: Response) => {
  try {
    // 1. Mantenemos la extracción original y añadimos 'descripcion'
    const uid = req.user?.uid;
    const { telefono, nacionalidad, especialidades, descripcion, tarifa, tarifaDiaCompleto, rutaTour } = req.body;

    if (!uid) {
      return res.status(401).json({ msg: "Usuario no autenticado" });
    }

    // 2. LÓGICA ORIGINAL DE TU COMPAÑERA: Validación de teléfono duplicado
    if (telefono) {
      const categorias = ["turistas", "guias", "admins", "negocios"];
      for (const cat of categorias) {
        const querySnapshot = await db.collection("usuarios")
          .doc(cat)
          .collection("lista")
          .where("06_telefono", "==", telefono) // Buscamos en el campo numerado
          .get();

        const duplicados = querySnapshot.docs.filter(doc => doc.data().uid !== uid);
        if (duplicados.length > 0) {
          return res.status(400).json({ msg: "Este teléfono ya está registrado" });
        }
      }
    }

    // 3. BUSQUEDA ORIGINAL: Localizar el documento
    const categorias = ["turistas", "guias", "admins", "negocios"];
    let docRef: any = null;

    for (const cat of categorias) {
      const querySnapshot = await db.collection("usuarios").doc(cat).collection("lista")
        .where("uid", "==", uid).limit(1).get();

      if (!querySnapshot.empty) {
        docRef = querySnapshot.docs[0]?.ref;
        break;
      }

      if (cat === "guias") {
        const queryPendientes = await db.collection("usuarios").doc("guias").collection("pendientes")
          .where("uid", "==", uid).limit(1).get();
        if (!queryPendientes.empty) {
          docRef = queryPendientes.docs[0]?.ref;
          break;
        }
      }
    }

    if (!docRef) {
      return res.status(404).json({ msg: "Usuario no encontrado" });
    }

    const userData = (await docRef.get()).data() || {};

    const updateData: any = {
      "05_nacionalidad": nacionalidad || userData["05_nacionalidad"] || "",
      "06_telefono": telefono !== undefined ? telefono : (userData["06_telefono"] || userData.telefono || ""),
      "07_especialidades": especialidades !== undefined ? especialidades : (userData["07_especialidades"] || []),
      "14_foto_perfil": {
        url: userData.fotoPerfil || userData["14_foto_perfil"]?.url || "",
        cloudinary_id: userData.fotoPerfilCloudinary || userData["14_foto_perfil"]?.cloudinary_id || "",
        subida_en: userData.fotoPerfilSubidaEn || userData["14_foto_perfil"]?.subida_en || ""
      },
      "15_descripcion": descripcion !== undefined ? descripcion : (userData["15_descripcion"] || userData.descripcion || ""),
      "16_status": userData.status || userData["16_status"] || "en_revision",
      "17_tarifa_mxn": tarifa !== undefined ? Number(tarifa) : (userData["17_tarifa_mxn"] || 0),
      "18_validacion_biometrica": {
        porcentaje: userData.validacion_biometrica?.porcentaje || userData["18_validacion_biometrica"]?.porcentaje || "0",
        mensaje: userData.validacion_biometrica?.mensaje || userData["18_validacion_biometrica"]?.mensaje || ""
      },
      "19_tarifa_dia_completo": tarifaDiaCompleto !== undefined ? Number(tarifaDiaCompleto) : (userData["19_tarifa_dia_completo"] || 0),
      "20_ruta_tour": rutaTour !== undefined ? rutaTour : (userData["20_ruta_tour"] || ""),
    };

    await docRef.update(updateData);

    res.json({ msg: "Perfil actualizado correctamente", data: updateData });

  } catch (error: any) {
    console.error("Error en updateProfile:", error);
    res.status(500).json({ msg: "Error interno del servidor", error: error.message });
  }
};

// Solicitar convertirse en guía
export const solicitarGuia = async (req: any, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { especialidades, experiencia } = req.body;

    if (!uid) {
      return res.status(401).json({ msg: "Usuario no autenticado" });
    }

    console.log(`📋 Solicitud de guía para uid: ${uid}`);

    // Buscar el usuario en turistas para obtener sus datos
    const turistaSnapshot = await db.collection("usuarios")
      .doc("turistas")
      .collection("lista")
      .where("uid", "==", uid)
      .limit(1)
      .get();

    if (turistaSnapshot.empty) {
      return res.status(404).json({ msg: "Usuario turista no encontrado" });
    }

    const turistaDoc = turistaSnapshot.docs[0];
    if (!turistaDoc) {
      return res.status(404).json({ msg: "Usuario turista no encontrado" });
    }
    
    const turistaData = turistaDoc.data();

    // Crear documento en guías/pendientes
    const docId = `solicitud_${uid}_${Date.now()}`;
    
    await db.collection("usuarios")
      .doc("guias")
      .collection("pendientes")
      .doc(docId)
      .set({
        uid: uid,
        nombre: turistaData.nombre,
        apellido: turistaData.apellido,
        email: turistaData.email,
        telefono: turistaData.telefono,
        nacionalidad: turistaData.nacionalidad,
        especialidades: especialidades || [],
        experiencia: experiencia || "",
        solicitudStatus: "pendiente",
        guide_status: "pendiente",
        "03_rol": "turista",
        createdAt: new Date().toISOString(),
        requestedAt: new Date().toISOString()
      });

    // Actualizar el usuario turista con el estado de solicitud
    await turistaDoc.ref.update({
      solicitudStatus: "pendiente",
      guide_status: "pendiente",
      tipoAspirante: "guia"
    });


    // Notificar a todos los administradores SOLO si la solicitud está pendiente
    try {
      if (true) { // Siempre es pendiente en este flujo
        const adminsSnapshot = await db.collection('usuarios').doc('admins').collection('lista').get();
        const notificacion = {
          tipo: 'solicitud_guia_pendiente',
          titulo: 'Nueva solicitud de guía pendiente',
          mensaje: `El usuario ${turistaData.nombre} ${turistaData.apellido} ha enviado una solicitud para ser guía.`,
          fecha: new Date().toISOString(),
          leido: false,
          enlace: `/admin/solicitud-guia/${docId}`,
          solicitudId: docId,
          uidSolicitante: uid
        };
        const batch = db.batch();
        adminsSnapshot.forEach(adminDoc => {
          const adminUid = adminDoc.data().uid;
          if (adminUid) {
            const notifRef = db.collection('usuarios').doc('notificaciones').collection(adminUid).doc();
            batch.set(notifRef, notificacion);
          }
        });
        await batch.commit();
        console.log('✅ Notificación enviada a administradores');
      }
    } catch (notifError) {
      console.warn('⚠️ Error al notificar a administradores:', notifError);
    }

    console.log(`✅ Solicitud de guía creada para uid: ${uid}`);

    res.status(201).json({
      msg: "Solicitud de guía enviada correctamente",
      solicitudId: docId,
      status: "pendiente"
    });

  } catch (error: any) {
    console.error("Error en solicitarGuia:", error);
    res.status(500).json({ msg: "Error interno del servidor", error: error.message });
  }
};