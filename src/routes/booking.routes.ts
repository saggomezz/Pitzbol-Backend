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
  getGuiaExperiencias,
  cancelTourByGuide,
} from '../controllers/booking.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Crear reserva (requiere autenticación)
router.post('/create', authMiddleware, createBooking);

// Obtener reservas de un turista
router.get('/tourist/:touristId', authMiddleware, getTouristBookings);

// Obtener reservas de un guia
router.get('/guide/:guideId', authMiddleware, getGuideBookings);

// Obtener reserva por ID (requiere autenticación)
router.get('/:bookingId', authMiddleware, getBookingById);

// Confirmar o rechazar reserva (guia)
router.put('/:bookingId/confirm', authMiddleware, confirmBooking);

// Actualizar estado de reserva
router.put('/:bookingId/status', authMiddleware, updateBookingStatus);

// Completar tour (finalizar)
router.put('/:bookingId/complete', authMiddleware, completeTour);

// Cancelar tour con reembolso (inciado por el guía)
router.put('/:bookingId/cancel-by-guide', authMiddleware, cancelTourByGuide);

// Cancelar reserva
router.delete('/:bookingId', authMiddleware, cancelBooking);

// Historial de experiencias completadas del guía (auto-finaliza tours cuya fecha ya pasó)
router.get('/guia/:guideId/experiencias', authMiddleware, getGuiaExperiencias);

export default router;