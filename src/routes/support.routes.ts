import { Router } from "express";
import {
  submitContactForm,
  submitCallRequest,
  getContactForms,
  getCallRequests,
  getSupportNotifications,
  markSupportNotificationAsRead,
  deleteContactForm,
  deleteCallRequest,
  replyToContactForm,
} from "../controllers/support.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireAdmin } from "../middlewares/admin.middleware";

const router = Router();

/**
 * POST /api/support/contact-form
 * Enviar formulario de contacto por email
 * No requiere autenticación
 */
router.post("/contact-form", submitContactForm);

/**
 * POST /api/support/call-request
 * Solicitar una llamada
 * No requiere autenticación
 */
router.post("/call-request", submitCallRequest);

/**
 * GET /api/support/contact-forms
 * Obtener todos los formularios de contacto (solo admin)
 * Requiere autenticación
 */
router.get("/contact-forms", authMiddleware, getContactForms);

/**
 * GET /api/support/call-requests
 * Obtener todas las solicitudes de llamada (solo admin)
 * Requiere autenticación
 */
router.get("/call-requests", authMiddleware, getCallRequests);

/**
 * GET /api/support/notifications
 * Obtener notificaciones de soporte para el admin
 * Requiere autenticación
 */
router.get("/notifications", authMiddleware, getSupportNotifications);

/**
 * PATCH /api/support/notifications/:id
 * Marcar notificación como leída
 * Requiere autenticación
 */
router.patch("/notifications/:id", authMiddleware, markSupportNotificationAsRead);

/**
 * DELETE /api/support/contact-forms/:id
 * Eliminar formulario de contacto (solo admin)
 * Requiere autenticación y rol admin
 */
router.delete("/contact-forms/:id", authMiddleware, requireAdmin, deleteContactForm);

/**
 * POST /api/support/contact-forms/:id/reply
 * Responder a un formulario de contacto por email (solo admin)
 * Requiere autenticación y rol admin
 */
router.post("/contact-forms/:id/reply", authMiddleware, requireAdmin, replyToContactForm);

/**
 * DELETE /api/support/call-requests/:id
 * Eliminar solicitud de llamada (solo admin)
 * Requiere autenticación y rol admin
 */
router.delete("/call-requests/:id", authMiddleware, requireAdmin, deleteCallRequest);

export default router;
