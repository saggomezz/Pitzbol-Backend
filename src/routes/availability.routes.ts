import { Router } from 'express';
import {
  setGuideAvailability,
  getGuideAvailabilityByDate,
  getGuideAvailabilities,
  deleteAvailability,
  checkTimeSlotAvailability,
} from '../controllers/availability.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Establecer disponibilidad (requiere autenticación - solo guías)
router.post('/set', authMiddleware, setGuideAvailability);

// Obtener disponibilidad por fecha (público)
router.get('/:guideId/:fecha', getGuideAvailabilityByDate);

// Obtener todas las disponibilidades del guía (público)
router.get('/:guideId', getGuideAvailabilities);

// Verificar disponibilidad de un horario específico (público)
router.get('/check/timeslot', checkTimeSlotAvailability);

// Eliminar disponibilidad (requiere autenticación)
router.delete('/:availabilityId', authMiddleware, deleteAvailability);

export default router;
