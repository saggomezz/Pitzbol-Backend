import { Router } from 'express';
import {
  createRating,
  getGuideRatings,
  getGuideRatingStats,
  checkCanRate,
  getRatingByBooking,
} from '../controllers/rating.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Crear calificación (requiere autenticación)
router.post('/create', authMiddleware, createRating);

// Obtener calificaciones de un guía (público)
router.get('/guide/:guideId', getGuideRatings);

// Obtener estadísticas de calificación de un guía (público)
router.get('/guide/:guideId/stats', getGuideRatingStats);

// Verificar si puede calificar una reserva (requiere autenticación)
router.get('/can-rate/:bookingId', authMiddleware, checkCanRate);

// Obtener calificación por reserva
router.get('/booking/:bookingId', getRatingByBooking);

export default router;
