import { Router } from 'express';
import {
  createBooking,
  getBookingById,
  getTouristBookings,
  getGuideBookings,
  updateBookingStatus,
  cancelBooking,
  completeTour,
  confirmBooking,
} from '../controllers/booking.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Crear reserva
router.post('/create', createBooking);

// Obtener reservas de un turista
router.get('/tourist/:touristId', authMiddleware, getTouristBookings);

// Obtener reservas de un guía
router.get('/guide/:guideId', authMiddleware, getGuideBookings);

// Obtener reserva por ID (debe ir DESPUÉS de las rutas con prefijo)
router.get('/:bookingId', getBookingById);

// Confirmar o rechazar reserva (guía)
router.put('/:bookingId/confirm', authMiddleware, confirmBooking);

// Actualizar estado de reserva
router.put('/:bookingId/status', authMiddleware, updateBookingStatus);

// Completar tour (finalizar)
router.put('/:bookingId/complete', authMiddleware, completeTour);

// Cancelar reserva
router.delete('/:bookingId', authMiddleware, cancelBooking);

export default router;
