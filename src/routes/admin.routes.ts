
import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { recibirNotificacion } from '../controllers/admin.controller';

const router = Router();

// PROTEGIDO - Obtener todos los negocios
router.get(
  '/negocios',
  authMiddleware,
  requireAdmin,
  adminController.obtenerNegocios
);

// PROTEGIDO - Obtener negocios pendientes
router.get(
  '/negocios/pendientes',
  authMiddleware,
  requireAdmin,
  adminController.obtenerNegociosPendientes
);

// PROTEGIDO - Obtener negocios archivados
router.get(
  '/negocios/archivados',
  authMiddleware,
  requireAdmin,
  adminController.obtenerNegociosArchivados
);
// PROTEGIDO - Editar negocio manualmente
router.patch(
  '/negocios/:negocioId/editar',
  authMiddleware,
  requireAdmin,
  adminController.editarNegocio
);
// PROTEGIDO - Aprobar o rechazar negocio pendiente
router.post(
  '/negocios/gestionar',
  authMiddleware,
  requireAdmin,
  adminController.gestionarNegocioPendiente
);
// PROTEGIDO - Archivar (eliminar) un negocio
router.post(
  '/negocios/:negocioId/archivar',
  authMiddleware,
  requireAdmin,
  adminController.archivarNegocio
);

// Recibir notificación desde frontend y guardarla para el usuario
router.post('/notificaciones/:userId', recibirNotificacion);

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

// PROTEGIDO - Obtener guías y negociantes para gestión
router.get(
  '/usuarios-gestionables',
  authMiddleware,
  requireAdmin,
  adminController.obtenerUsuariosGestionables
);

// PROTEGIDO - Obtener detalle completo de un usuario
router.get(
  '/usuarios/:uid/detalle',
  authMiddleware,
  requireAdmin,
  adminController.obtenerDetalleUsuarioAdmin
);

// PROTEGIDO - Eliminar usuario guía o negociante
router.delete(
  '/usuarios/:uid',
  authMiddleware,
  requireAdmin,
  adminController.eliminarUsuarioGestionable
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
  '/notifications/:id/marcar-leida/:uid',
  authMiddleware,
  adminController.marcarNotificacionComoLeida
);

// PROTEGIDO - Eliminar notificación
router.delete(
  '/notifications/:id',
  authMiddleware,
  adminController.eliminarNotificacion
);

export default router;