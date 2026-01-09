import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';

const router = Router();

router.get('/solicitudes-pendientes', adminController.getSolicitudesPendientes);
router.post('/gestionar-guia', adminController.gestionarSolicitudGuia);

export default router;