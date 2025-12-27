import { Request, Response } from "express";
import { db, auth } from "../config/firebase";
import axios from "axios";
import jwt from "jsonwebtoken";

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!FIREBASE_WEB_API_KEY || !JWT_SECRET) {
  throw new Error("Faltan variables de entorno (JWT o Firebase API KEY)");
}


//REGISTRO DE USUARIO
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, telefono, nacionalidad } = req.body;

    // 1. Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });

    // 2. Guardar datos adicionales en Firestore
    await db.collection("usuarios").doc(userRecord.uid).set({
      uid: userRecord.uid,
      nombre,
      apellido,
      email,
      telefono,
      nacionalidad,
      role: "user",
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      msg: "Usuario creado correctamente",
    });

  } catch (error: any) {
    console.error("ERROR EN REGISTRO:", error);
    res.status(500).json({ msg: "Error al registrar", error: error.message });
  }
};

/* =========================
   LOGIN + JWT
========================= */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // 1. Validar credenciales con Firebase REST API
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;

    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true,
    });

    const { localId } = response.data;

    // 2. Obtener datos del usuario desde Firestore
    const userDoc = await db.collection("usuarios").doc(localId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ msg: "Usuario no encontrado" });
    }

    const userData = userDoc.data();

    // 3. Generar JWT propio
    const token = jwt.sign(
      {
        uid: localId,
        email,
        role: userData?.role,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 4. Respuesta
    res.json({
      token,
      user: {
        uid: localId,
        email,
        role: userData?.role,
        nombre: userData?.nombre,
        apellido: userData?.apellido,
      },
    });

  } catch (error: any) {
    console.error("ERROR EN LOGIN:", error);

    const msg = error.response?.data?.error?.message || error.message;

    if (msg === "EMAIL_NOT_FOUND" || msg === "INVALID_PASSWORD") {
      return res.status(401).json({ msg: "Credenciales inválidas" });
    }

    res.status(500).json({ msg: "Error en login", error: msg });
  }
};
