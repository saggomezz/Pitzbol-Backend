import { Router } from 'express';
import { registrarHistorialSolicitud, obtenerHistorialSolicitudes } from '../controllers/historial.controller';
import { requireAdmin } from '../middlewares/admin.middleware';

const router = Router();

// Solo accesible para admins
router.post('/admin/historial-solicitudes', requireAdmin, registrarHistorialSolicitud);
router.get('/admin/historial-solicitudes', requireAdmin, obtenerHistorialSolicitudes);

export default router;
