import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';

const router = Router();

/**
 * TODAS las rutas admin requieren:
 * 1. Autenticación JWT (authMiddleware)
 * 2. Rol de administrador (requireAdmin)
 */

// PROTEGIDO - Obtener solicitudes pendientes de guías
router.get(
  '/solicitudes-pendientes',
  authMiddleware,
  requireAdmin,
  adminController.getSolicitudesPendientes
);

// PROTEGIDO - Aprobar o rechazar solicitud de guía
router.post(
  '/gestionar-guia',
  authMiddleware,
  requireAdmin,
  adminController.gestionarSolicitudGuia
);

// PROTEGIDO - Verificar estado de un usuario (puede ser el mismo usuario)
router.get(
  '/verificar-estado/:uid',
  authMiddleware,
  adminController.verificarEstadoUsuario
);

// PROTEGIDO - Obtener notificaciones (del usuario autenticado)
router.get(
  '/notificaciones/:uid',
  authMiddleware,
  adminController.obtenerNotificacionesUsuario
);

// PROTEGIDO - Marcar notificación como leída
router.put(
  '/notifications/:id/marcar-leida',
  authMiddleware,
  adminController.marcarNotificacionComoLeida
);

// PROTEGIDO - Eliminar notificación
router.delete(
  '/notifications/:id',
  authMiddleware,
  adminController.eliminarNotificacion
);

// PROTEGIDO - Limpiar todas las notificaciones
router.delete(
  '/notifications/usuario/:uid/limpiar',
  authMiddleware,
  adminController.limpiarNotificacionesUsuario
);

export default router;