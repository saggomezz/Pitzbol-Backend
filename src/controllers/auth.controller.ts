import axios from "axios";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { auth, db } from "../config/firebase";
import nodemailer from 'nodemailer';

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
        nombre,
        apellido: apellido || "",
        email,
        telefono: telefono || "",
        nacionalidad: nacionalidad || "",
        role: "turista", 
        solicitudStatus: (aspiracion === "guia") ? "pendiente" : "ninguno",
        tipoAspirante: aspiracion, 
        createdAt: new Date().toISOString(),
      });

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
    
    console.log('📧 Intento de login para email:', email);
    console.log('🔑 Password length:', password?.length, 'chars');

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
    const response = await axios.post(url, { email, password, returnSecureToken: true });
    const { localId } = response.data;
    
    console.log('✅ Firebase autenticó correctamente, UID:', localId);
    
    let userData: any = null;
    let userRole: string = "";

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
                    break;
                }
            }
        }
    }

    const especialidadesUnificadas = userData.especialidades || userData["07_especialidades"] || [];

    const token = jwt.sign(
      { uid: localId, email, role: userRole },
      JWT_SECRET!,
      { expiresIn: "1d" }
    );

    // Establecer HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 horas en milisegundos
      secure: process.env.NODE_ENV === 'production' // Solo en HTTPS en producción
    });

    // Logging seguro (sin revelar datos sensibles)
    console.log(`✅ Login exitoso para usuario: ${localId}`);
    
    // Retorna token con datos completos del usuario
    res.json({
      success: true,
      token,
      user: {
        uid: localId,
        email,
        nombre: userData.nombre || "",
        apellido: userData.apellido || "",
        telefono: userData.telefono || "No registrado",
        nacionalidad: userData.nacionalidad || "No registrado",
        especialidades: especialidadesUnificadas,
        role: userRole,
        guide_status: userData.solicitudStatus || "ninguno",
      },
    });
  }   
  
  catch (error: any) {
    const firebaseError = error.response?.data?.error;
    const code = firebaseError?.message;

    console.error("🔥 ERROR EN LOGIN:", code || error.message);
    console.error("📋 Request email:", req.body.email);
    console.error("📋 Firebase response:", JSON.stringify(error.response?.data, null, 2));

    if (code === "INVALID_LOGIN_CREDENTIALS" || code === "EMAIL_NOT_FOUND" || code === "INVALID_PASSWORD") {
      return res.status(401).json({ msg: "Credenciales inválidas" });
    }

    return res.status(500).json({ msg: "Error interno en el servidor", error: code || error.message });
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
    // Obtener uid del middleware de autenticación (JWT)
    const uid = req.user?.uid;
    const { telefono, nacionalidad, especialidades } = req.body;

    if (!uid) {
      return res.status(401).json({ msg: "Usuario no autenticado" });
    }

    const updateData: any = {};
    if (telefono !== undefined) updateData.telefono = telefono;
    if (nacionalidad !== undefined) updateData.nacionalidad = nacionalidad;
    if (especialidades !== undefined) updateData.especialidades = especialidades;
    if (telefono) {
      const categorias = ["turistas", "guias", "admins", "negocios"];
      
      for (const cat of categorias) {
        const querySnapshot = await db.collection("usuarios")
          .doc(cat)
          .collection("lista")
          .where("telefono", "==", telefono)
          .get();

        const duplicados = querySnapshot.docs.filter(doc => doc.data().uid !== uid);
        
        if (duplicados.length > 0) {
          return res.status(400).json({ msg: "Este teléfono ya está registrado" });
        }
      }
    }

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