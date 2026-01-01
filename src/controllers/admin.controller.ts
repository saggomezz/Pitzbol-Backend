import { Request, Response } from "express";
import { auth, db } from "../config/firebase";

export const createMasterAdmin = async (req: Request, res: Response) => {
  try {
    const adminEmail = "pitzbol2026@gmail.com";
    const adminPassword = "pitzbol"; // <--- ESTA SERÁ TU CONTRASEÑA

    // 1. Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: "Admin Pitzbol",
    });

    // 2. Guardar en Firestore
    await db.collection("usuarios")
      .doc("admins")
      .collection("lista")
      .doc("Admin_Pitzbol")
      .set({
        uid: userRecord.uid,
        nombre: "Admin",
        apellido: "Pitzbol",
        email: adminEmail,
        role: "admin",
        createdAt: new Date().toISOString(),
      });

    res.status(201).json({ msg: "✅ Admin Maestro creado con éxito" });
  } catch (error: any) {
    console.error("Error creando admin:", error);
    res.status(500).json({ msg: "Error al crear admin", error: error.message });
  }
};