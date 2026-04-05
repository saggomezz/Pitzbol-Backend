import { Request, Response } from "express";
import { db } from "../config/firebase";
import nodemailer from "nodemailer";
import { DocumentData, QueryDocumentSnapshot } from "@google-cloud/firestore";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "pitzbol2026@gmail.com";

// Configurar el transporter de email (Gmail con App Password)
const getEmailTransporter = () => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      "Faltan credenciales de Gmail. Define GMAIL_USER y GMAIL_APP_PASSWORD (o GMAIL_PASS) en .env"
    );
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: { user, pass },
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

    // Crear notificación para el admin en la BD
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.collection("notificaciones").doc(notificationId).set({
      id: notificationId,
      tipo: "contacto",
      titulo: `Nuevo contacto: ${subject}`,
      mensaje: `${name} (${category}) ha enviado un mensaje de contacto`,
      fecha: timestamp,
      leido: false,
      usuarioId: "admin",
      enlace: `/admin/mensajes?id=${contactId}`,
    });

    console.log(`Formulario de contacto guardado: ${contactId}`);

    // Intentar enviar email (opcional, no bloquea si falla)
    try {
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
      console.log(`Email de contacto enviado al admin`);
    } catch (emailError: any) {
      console.warn(`No se pudo enviar email (no crítico):`, emailError.message);
    }

    res.status(200).json({
      msg: "Formulario enviado exitosamente",
      contactId,
    });
  } catch (error: any) {
    console.error("Error al procesar formulario de contacto:", error);

    const isAuthError = error?.code === "EAUTH" || /Invalid login/i.test(String(error?.message));
    const hint = isAuthError
      ? "Autenticación SMTP fallida. Verifica GMAIL_USER y usa un App Password (cuenta con 2FA)."
      : undefined;

    res.status(500).json({
      msg: "Error al enviar el formulario" ,
      hint,
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

    console.log(`Solicitud de llamada guardada: ${callId}`);

    // Intentar enviar email (opcional, no bloquea si falla)
    try {
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
      console.log(`Email de llamada enviado al admin`);
    } catch (emailError: any) {
      console.warn(`No se pudo enviar email (no crítico):`, emailError.message);
    }

    res.status(200).json({
      msg: "Solicitud de llamada enviada exitosamente",
      callId,
    });
  } catch (error: any) {
    console.error("Error al procesar solicitud de llamada:", error);

    const isAuthError = error?.code === "EAUTH" || /Invalid login/i.test(String(error?.message));
    const hint = isAuthError
      ? "Autenticación SMTP fallida. Verifica GMAIL_USER y usa un App Password (cuenta con 2FA)."
      : undefined;

    res.status(500).json({
      msg: "Error al enviar la solicitud de llamada" ,
      hint,
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
    console.error("Error al obtener formularios:", error);
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
    console.error("Error al obtener solicitudes de llamada:", error);
    res.status(500).json({ msg: "Error al obtener solicitudes de llamada" });
  }
};

/**
 * Obtener notificaciones de soporte para el admin
 * GET /api/support/notifications
 */
export const getSupportNotifications = async (req: Request, res: Response) => {
  try {
    // Primero hacemos el where, luego el sort en memoria para evitar índices compuestos
    const snapshot = await db
      .collection("notificaciones")
      .where("usuarioId", "==", "admin")
      .get();

    const notifications = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a: any, b: any) => {
        // Ordenar por fecha descendente
        const fechaA = new Date(a.fecha).getTime();
        const fechaB = new Date(b.fecha).getTime();
        return fechaB - fechaA;
      });

    res.status(200).json({
      success: true,
      notificaciones: notifications,
    });
  } catch (error: any) {
    console.error("Error al obtener notificaciones:", error);
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
    console.error("Error al actualizar notificación:", error);
    res.status(500).json({
      success: false,
      msg: "Error al actualizar notificación",
    });
  }
};

/**
 * Eliminar formulario de contacto
 * DELETE /api/support/contact-forms/:id
 */
export const deleteContactForm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    console.log(`Intentando eliminar formulario: ${id}`);

    if (!id) {
      console.warn("ID de formulario no proporcionado");
      return res.status(400).json({
        success: false,
        msg: "ID de formulario requerido",
      });
    }

    // Verificar que el documento existe
    const docRef = db.collection("support_contactForms").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.warn(`Formulario no encontrado: ${id}`);
      return res.status(404).json({
        success: false,
        msg: "Formulario no encontrado",
      });
    }

    await docRef.delete();

    console.log(`Formulario de contacto eliminado: ${id}`);

    res.status(200).json({
      success: true,
      msg: "Formulario eliminado exitosamente",
    });
  } catch (error: any) {
    console.error("Error al eliminar formulario:", error);
    res.status(500).json({
      success: false,
      msg: "Error al eliminar formulario" ,
    });
  }
};

/**
 * Eliminar solicitud de llamada
 * DELETE /api/support/call-requests/:id
 */
export const deleteCallRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    console.log(`Intentando eliminar solicitud: ${id}`);

    if (!id) {
      console.warn("ID de solicitud no proporcionado");
      return res.status(400).json({
        success: false,
        msg: "ID de solicitud requerido",
      });
    }

    // Verificar que el documento existe
    const docRef = db.collection("support_callRequests").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.warn(`Solicitud no encontrada: ${id}`);
      return res.status(404).json({
        success: false,
        msg: "Solicitud no encontrada",
      });
    }

    await docRef.delete();

    console.log(`Solicitud de llamada eliminada: ${id}`);

    res.status(200).json({
      success: true,
      msg: "Solicitud eliminada exitosamente",
    });
  } catch (error: any) {
    console.error("Error al eliminar solicitud:", error);
    res.status(500).json({
      success: false,
      msg: "Error al eliminar solicitud" ,
    });
  }
};

/**
 * Responder a un mensaje de soporte por email
 * POST /api/support/contact-forms/:id/reply
 */
export const replyToContactForm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { replyMessage } = req.body;

    if (!id || !replyMessage) {
      return res.status(400).json({ success: false, msg: "ID y mensaje de respuesta requeridos" });
    }

    // Obtener el formulario original
    const docRef = db.collection("support_contactForms").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, msg: "Formulario no encontrado" });
    }

    const formData = doc.data()!;
    const timestamp = new Date().toISOString();

    // Enviar email de respuesta al usuario
    try {
      const transporter = getEmailTransporter();
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1A4D2E, #0D601E); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Pitzbol - Soporte</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151;">Hola <strong>${formData.name}</strong>,</p>
            <p style="color: #374151;">Gracias por contactarnos. Aquí está nuestra respuesta a tu mensaje sobre: <strong>${formData.subject}</strong></p>
            <div style="background: #f0fdf4; border-left: 4px solid #0D601E; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #1A4D2E; margin: 0; white-space: pre-wrap;">${replyMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Si necesitas más ayuda, no dudes en contactarnos nuevamente.</p>
            <p style="color: #374151;">Saludos,<br><strong>Equipo Pitzbol</strong></p>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: formData.email,
        subject: `[Pitzbol] Re: ${formData.subject}`,
        html: emailContent,
      });
      console.log(`📧 Respuesta enviada a ${formData.email}`);
    } catch (emailError: any) {
      console.error("❌ Error al enviar email de respuesta:", emailError.message);
      return res.status(500).json({ success: false, msg: "Error al enviar el email de respuesta" });
    }

    // Actualizar el formulario con la respuesta
    const replies = formData.replies || [];
    replies.push({
      message: replyMessage,
      timestamp,
      sentBy: "admin",
    });

    await docRef.update({
      replies,
      status: "respondido",
      lastReplyAt: timestamp,
    });

    console.log(`✅ Respuesta enviada para formulario: ${id}`);

    res.status(200).json({
      success: true,
      msg: "Respuesta enviada exitosamente",
    });
  } catch (error: any) {
    console.error("❌ Error al responder formulario:", error);
    res.status(500).json({
      success: false,
      msg: "Error al enviar la respuesta" ,
    });
  }
};
