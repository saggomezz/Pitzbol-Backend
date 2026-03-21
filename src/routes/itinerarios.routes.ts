import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { obtenerItinerarios, guardarEntrada, eliminarEntrada } from '../controllers/itinerarios.controller';

const router = express.Router();
router.use(authMiddleware);

router.get('/', obtenerItinerarios);
router.post('/', guardarEntrada);
router.delete('/:docId', eliminarEntrada);

export default router;
