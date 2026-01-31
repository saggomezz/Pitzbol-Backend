import { Router } from 'express';
import {
  createBooking,
  getBookingById,
  getTouristBookings,
  getGuideBookings,
  updateBookingStatus,
  cancelBooking,
} from '../controllers/booking.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Crear reserva
router.post('/create', createBooking);

// Obtener reserva por ID
router.get('/:bookingId', getBookingById);

// Obtener reservas de un turista
router.get('/tourist/:touristId', authMiddleware, getTouristBookings);

// Obtener reservas de un guía
router.get('/guide/:guideId', authMiddleware, getGuideBookings);

// Actualizar estado de reserva
router.put('/:bookingId/status', authMiddleware, updateBookingStatus);

// Cancelar reserva
router.delete('/:bookingId', authMiddleware, cancelBooking);

export default router;
