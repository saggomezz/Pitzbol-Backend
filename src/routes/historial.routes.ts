import { Router } from 'express';
import { registrarHistorialSolicitud, obtenerHistorialSolicitudes } from '../controllers/historial.controller';
import { requireAdmin } from '../middlewares/admin.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Solo accesible para admins
router.post('/admin/historial-solicitudes', authMiddleware, requireAdmin, registrarHistorialSolicitud);
router.get('/admin/historial-solicitudes', authMiddleware, requireAdmin, obtenerHistorialSolicitudes);

export default router;
