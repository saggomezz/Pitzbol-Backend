import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';

const router = Router();

// Ruta para obtener la lista de guías en revisión
router.get('/solicitudes-pendientes', adminController.getSolicitudesPendientes);

// Ruta para aprobar o rechazar a un guía
router.post('/gestionar-guia', adminController.gestionarSolicitudGuia);

export default router;