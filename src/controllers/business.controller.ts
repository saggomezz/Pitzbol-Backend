import { Request, Response } from "express";
import { auth, db } from "../config/firebase";
import admin from "firebase-admin";
import { sendNotificationToAdmins } from "../services/notification.service";

export const registerBusiness = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      businessName,
      category,
      phone,
      location,
      website,
      rfc,
      cp,
    } = req.body;

    if (!email || !password || !businessName || !rfc || !cp) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    // Crear usuario
    const userRecord = await auth.createUser({
      email,
      password,
    });

    const uid = userRecord.uid;

    // Guardar negocio
    await db.collection("business").doc(uid).set({
      uid,
      email,
      role: "BUSINESS",
      status: "PENDING",
      business: {
        name: businessName,
        category,
        phone,
        location,
        website,
        rfc,
        cp,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    // Notificar a los administradores de nueva solicitud de negocio
    await sendNotificationToAdmins({
      tipo: 'nueva_solicitud_negocio',
      titulo: 'Nueva solicitud de negocio',
      mensaje: `Se ha recibido una nueva solicitud de negocio: ${businessName}`,
      fecha: new Date().toISOString(),
      leido: false,
      enlace: `/admin/historial-solicitudes` // Ajusta la ruta si es necesario
    });

    return res.status(201).json({
      message: "Business registrado correctamente",
      uid,
    });
  } catch (error: any) {
    console.error("Error registerBusiness:", error);

    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ message: "Correo ya registrado" });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
};