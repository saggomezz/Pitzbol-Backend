import { Request, Response } from "express";
import { db } from "../config/firebase";
import nodemailer from "nodemailer";
import { DocumentData, QueryDocumentSnapshot } from "@google-cloud/firestore";

const ADMIN_EMAIL = "pitzbol2026@gmail.com";

// Configurar el transporter de email
const getEmailTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
};

/**
 * Enviar formulario de contacto por email
 * POST /api/support/contact-form
 */
export const submitContactForm = async (req: Request, res: Response) => {
  try {
    const { name, email, countryCode, phone, category, subject, message } =
      req.body;

    // Validar campos requeridos
    if (!name || !email || !phone || !category || !subject || !message) {
      return res.status(400).json({ msg: "Faltan campos requeridos" });
    }

    const fullPhone = `${countryCode}${phone}`;
    const timestamp = new Date().toISOString();
    const contactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Guardar en Firestore 
    await db.collection("support_contactForms").doc(contactId).set({
      id: contactId,
      name,
      email,
      phone: fullPhone,
      category,
      subject,
      message,
      timestamp,
      status: "nuevo",
      leido: false,
    });

    // Enviar email de notificación al admin
    const transporter = getEmailTransporter();
    const emailContent = `
      <h2>📧 Nuevo Formulario de Contacto en Pitzbol</h2>
      <p><strong>Nombre:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Teléfono:</strong> ${fullPhone}</p>
      <p><strong>Categoría:</strong> ${category}</p>
      <p><strong>Asunto:</strong> ${subject}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
      <p><strong>Fecha:</strong> ${new Date(timestamp).toLocaleString("es-MX")}</p>
    `;

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: ADMIN_EMAIL,
      subject: `[Pitzbol] Nuevo contacto: ${subject}`,
      html: emailContent,
    });

    // Crear notificación para el admin en la BD
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.collection("notificaciones").doc(notificationId).set({
      id: notificationId,
      tipo: "contacto",
      titulo: `Nuevo contacto: ${subject}`,
      mensaje: `${name} (${category}) ha enviado un mensaje de contacto`,
      fecha: timestamp,
      leido: false,
      usuarioId: "admin", // Para el administrador
      enlace: `/admin/mensajes?id=${contactId}`,
    });

    console.log(`Formulario de contacto guardado: ${contactId}`);

    res.status(200).json({
      msg: "Formulario enviado exitosamente",
      contactId,
    });
  } catch (error: any) {
    console.error("Error al procesar formulario de contacto:", error);
    res.status(500).json({
      msg: "Error al enviar el formulario",
      error: error.message,
    });
  }
};

/**
 * Solicitar llamada telefónica
 * POST /api/support/call-request
 */
export const submitCallRequest = async (req: Request, res: Response) => {
  try {
    const { name, countryCode, phone, reason } = req.body;

    // Validar campos requeridos
    if (!name || !phone || !reason) {
      return res.status(400).json({ msg: "Faltan campos requeridos" });
    }

    const fullPhone = `${countryCode}${phone}`;
    const timestamp = new Date().toISOString();
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Guardar en Firestore
    await db.collection("support_callRequests").doc(callId).set({
      id: callId,
      name,
      phone: fullPhone,
      reason,
      timestamp,
      status: "nuevo",
      leido: false,
    });

    // Enviar email de notificación al admin
    const transporter = getEmailTransporter();
    const emailContent = `
      <h2>📞 Nueva Solicitud de Llamada en Pitzbol</h2>
      <p><strong>Nombre:</strong> ${name}</p>
      <p><strong>Teléfono:</strong> ${fullPhone}</p>
      <p><strong>Motivo:</strong> ${reason}</p>
      <p><strong>Fecha:</strong> ${new Date(timestamp).toLocaleString("es-MX")}</p>
      <p style="color: #0D601E; font-weight: bold;">👉 Por favor, contacta al usuario lo antes posible.</p>
    `;

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: ADMIN_EMAIL,
      subject: `[Pitzbol] Solicitud de llamada de ${name}`,
      html: emailContent,
    });

    // Crear notificación para el admin en la BD
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.collection("notificaciones").doc(notificationId).set({
      id: notificationId,
      tipo: "llamada",
      titulo: `Solicitud de llamada: ${name}`,
      mensaje: `${name} ha solicitado una llamada. Teléfono: ${fullPhone}`,
      fecha: timestamp,
      leido: false,
      usuarioId: "admin",
      enlace: `/admin/llamadas?id=${callId}`,
    });

    console.log(`✅ Solicitud de llamada guardada: ${callId}`);

    res.status(200).json({
      msg: "Solicitud de llamada enviada exitosamente",
      callId,
    });
  } catch (error: any) {
    console.error("❌ Error al procesar solicitud de llamada:", error);
    res.status(500).json({
      msg: "Error al enviar la solicitud de llamada",
      error: error.message,
    });
  }
};

/**
 * Obtener mensajes de contacto (solo admin)
 * GET /api/support/contact-forms
 */
export const getContactForms = async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("support_contactForms")
      .orderBy("timestamp", "desc")
      .get();

    const forms = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(forms);
  } catch (error: any) {
    console.error("❌ Error al obtener formularios:", error);
    res.status(500).json({ msg: "Error al obtener formularios" });
  }
};

/**
 * Obtener solicitudes de llamada (solo admin)
 * GET /api/support/call-requests
 */
export const getCallRequests = async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("support_callRequests")
      .orderBy("timestamp", "desc")
      .get();

    const calls = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(calls);
  } catch (error: any) {
    console.error("❌ Error al obtener solicitudes de llamada:", error);
    res.status(500).json({ msg: "Error al obtener solicitudes de llamada" });
  }
};

/**
 * Obtener notificaciones de soporte para el admin
 * GET /api/support/notifications
 */
export const getSupportNotifications = async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("notificaciones")
      .where("usuarioId", "==", "admin")
      .orderBy("fecha", "desc")
      .get();

    const notifications = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      success: true,
      notificaciones: notifications,
    });
  } catch (error: any) {
    console.error("❌ Error al obtener notificaciones:", error);
    res.status(500).json({
      success: false,
      msg: "Error al obtener notificaciones",
    });
  }
};

/**
 * Marcar notificación de soporte como leída
 * PATCH /api/support/notifications/:id
 */
export const markSupportNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    if (!id) {
      return res.status(400).json({
        success: false,
        msg: "ID de notificación requerido",
      });
    }

    await db.collection("notificaciones").doc(id).update({
      leido: true,
    });

    res.status(200).json({
      success: true,
      msg: "Notificación marcada como leída",
    });
  } catch (error: any) {
    console.error("❌ Error al actualizar notificación:", error);
    res.status(500).json({
      success: false,
      msg: "Error al actualizar notificación",
    });
  }
};
