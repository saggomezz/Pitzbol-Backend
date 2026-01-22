import { Router } from "express";
import {
  submitContactForm,
  submitCallRequest,
  getContactForms,
  getCallRequests,
  getSupportNotifications,
  markSupportNotificationAsRead,
} from "../controllers/support.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

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

export default router;
