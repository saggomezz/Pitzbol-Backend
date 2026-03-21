import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  obtenerItinerarios, guardarItinerario, eliminarItinerario,
  obtenerNotas, guardarNota, eliminarNota
} from '../controllers/itinerarios.controller';

const router = express.Router();
router.use(authMiddleware);

router.get('/itinerarios', obtenerItinerarios);
router.post('/itinerarios', guardarItinerario);
router.delete('/itinerarios/:docId', eliminarItinerario);

router.get('/notas', obtenerNotas);
router.post('/notas', guardarNota);
router.delete('/notas/:docId', eliminarNota);

export default router;
