import { Router } from 'express';
import {
  ratePlaceController,
  getUserPlaceRatingController,
  getPlaceStatsController,
  incrementPlaceViewsController,
} from '../controllers/place-rating.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Calificar o actualizar calificación de un lugar (requiere autenticación)
router.post('/rate', authMiddleware, ratePlaceController);

// Obtener calificación del usuario para un lugar (requiere autenticación)
router.get('/:placeName', authMiddleware, getUserPlaceRatingController);

// Obtener estadísticas de calificación de un lugar (público)
router.get('/:placeName/stats', getPlaceStatsController);

// Incrementar contador de vistas (público)
router.post('/:placeName/view', incrementPlaceViewsController);

export default router;
