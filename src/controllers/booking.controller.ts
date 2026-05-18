import { Request, Response } from 'express';
import { BookingService } from '../services/booking.service';

// Crear una reserva
export const createBooking = async (req: Request, res: Response) => {
  try {
    const bookingData = req.body;
    const authUser = (req as any).user;

    if (!authUser?.uid) {
      return res.status(401).json({ success: false, message: 'Autenticación requerida' });
    }

    // Validaciones
    if (!bookingData.guideId || !bookingData.touristId || !bookingData.fecha) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos',
      });
    }

    // IDOR protection: touristId must match authenticated user
    if (bookingData.touristId !== authUser.uid) {
      return res.status(403).json({ success: false, message: 'No puedes crear reservas para otro usuario' });
    }

    // Validate date is not in the past
    const bookingDate = new Date(bookingData.fecha);
    if (isNaN(bookingDate.getTime()) || bookingDate < new Date()) {
      return res.status(400).json({ success: false, message: 'La fecha debe ser futura y válida' });
    }

    // Verificar disponibilidad
    const isAvailable = await BookingService.checkGuideAvailability(
      bookingData.guideId,
      bookingData.fecha,
      bookingData.horaInicio
    );

    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: 'El guía no está disponible en esa fecha y hora',
      });
    }

    // Crear reserva
    const booking = await BookingService.createBooking({
      ...bookingData,
      status: 'pendiente',
    });

    res.status(201).json({
      success: true,
      message: 'Reserva creada exitosamente',
      bookingId: booking.id,
      booking,
    });
  } catch (error: any) {
    console.error('Error al crear reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear reserva' ,
    });
  }
};

// Obtener reserva por ID
export const getBookingById = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'bookingId es requerido',
      });
    }

    const booking = await BookingService.getBookingById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    res.status(200).json({
      success: true,
      booking,
    });
  } catch (error: any) {
    console.error('Error al obtener reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reserva' ,
    });
  }
};

// Obtener reservas de un turista
export const getTouristBookings = async (req: Request, res: Response) => {
  try {
    const { touristId } = req.params;

    if (!touristId || Array.isArray(touristId)) {
      return res.status(400).json({
        success: false,
        message: 'touristId es requerido',
      });
    }

    // IDOR protection: only the tourist can see their own bookings
    if ((req as any).user?.uid !== touristId) {
      return res.status(403).json({ success: false, message: 'No puedes ver reservas de otro turista' });
    }

    const bookings = await BookingService.getTouristBookings(touristId);

    res.status(200).json({
      success: true,
      bookings,
      total: bookings.length,
    });
  } catch (error: any) {
    console.error('Error al obtener reservas del turista:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reservas' ,
    });
  }
};

// Obtener reservas de un guía
export const getGuideBookings = async (req: Request, res: Response) => {
  try {
    const { guideId } = req.params;

    if (!guideId || Array.isArray(guideId)) {
      return res.status(400).json({
        success: false,
        message: 'guideId es requerido',
      });
    }

    // IDOR protection: only the guide can see their own bookings
    if ((req as any).user?.uid !== guideId) {
      return res.status(403).json({ success: false, message: 'No puedes ver reservas de otro guía' });
    }

    const bookings = await BookingService.getGuideBookings(guideId);

    res.status(200).json({
      success: true,
      bookings,
      total: bookings.length,
    });
  } catch (error: any) {
    console.error('Error al obtener reservas del guía:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reservas' ,
    });
  }
};

// Actualizar estado de reserva
export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { status, paymentId } = req.body;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'bookingId es requerido',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Estado es requerido',
      });
    }

    await BookingService.updateBookingStatus(bookingId, status, paymentId);

    res.status(200).json({
      success: true,
      message: 'Estado de reserva actualizado',
    });
  } catch (error: any) {
    console.error('Error al actualizar estado de reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estado' ,
    });
  }
};

// Cancelar reserva
export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'bookingId es requerido',
      });
    }

    await BookingService.cancelBooking(bookingId);

    res.status(200).json({
      success: true,
      message: 'Reserva cancelada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al cancelar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar reserva' ,
    });
  }
};

// Finalizar/Completar un tour (solo el guía puede hacerlo)
export const completeTour = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { guideId } = req.body;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'bookingId es requerido',
      });
    }

    if (!guideId) {
      return res.status(400).json({
        success: false,
        message: 'guideId es requerido',
      });
    }

    // Use JWT uid, not body guideId, to prevent spoofing
    const authUid = (req as any).user?.uid;
    if (!authUid || authUid !== guideId) {
      return res.status(403).json({ success: false, message: 'Solo el guía asignado puede completar el tour' });
    }

    // Verificar que la reserva existe y pertenece al guía
    const booking = await BookingService.getBookingById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    if (booking.guideId !== guideId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para finalizar este tour',
      });
    }

    if (booking.status === 'completado') {
      return res.status(400).json({
        success: false,
        message: 'Este tour ya fue completado',
      });
    }

    if (booking.status === 'cancelado') {
      return res.status(400).json({
        success: false,
        message: 'No puedes completar un tour cancelado',
      });
    }

    // Marcar como completado
    await BookingService.updateBookingStatus(bookingId, 'completado');

    res.status(200).json({
      success: true,
      message: 'Tour completado exitosamente. El turista ahora puede calificarte.',
    });
  } catch (error: any) {
    console.error('Error al completar tour:', error);
    res.status(500).json({
      success: false,
      message: 'Error al completar tour' ,
    });
  }
};

// Confirmar o rechazar una solicitud de reserva (guia)
export const confirmBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { guideId, action } = req.body as { guideId?: string; action?: 'confirmar' | 'rechazar' };

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({ success: false, message: 'bookingId es requerido' });
    }

    if (!guideId) {
      return res.status(400).json({ success: false, message: 'guideId es requerido' });
    }

    // Use JWT uid to verify the guide identity
    const confirmAuthUid = (req as any).user?.uid;
    if (!confirmAuthUid || confirmAuthUid !== guideId) {
      return res.status(403).json({ success: false, message: 'Solo el guía puede confirmar/rechazar reservas' });
    }

    if (!action || !['confirmar', 'rechazar'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action debe ser "confirmar" o "rechazar"' });
    }

    const booking = await BookingService.getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    if (booking.guideId !== guideId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para gestionar esta reserva' });
    }

    if (booking.status !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: `No se puede ${action} una reserva con estado "${booking.status}"`,
      });
    }

    const newStatus = action === 'confirmar' ? 'confirmado' : 'cancelado';
    await BookingService.updateBookingStatus(bookingId, newStatus);

    if (action === 'rechazar') {
      try {
        await BookingService.cancelBooking(bookingId);
      } catch {
        // Evitar romper respuesta si solo falla el ajuste de disponibilidad.
      }
    }

    return res.status(200).json({
      success: true,
      message: action === 'confirmar' ? 'Reserva confirmada exitosamente' : 'Reserva rechazada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al confirmar/rechazar reserva:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud' ,
    });
  }
};

// GET /api/bookings/guia/:guideId/experiencias
// Retorna bookings completados del guía. Auto-marca como completado los que ya pasaron su fecha/hora.
export const getGuiaExperiencias = async (req: Request, res: Response) => {
  try {
    const guideId = req.params.guideId;
    const authUid = (req as any).user?.uid;
    if (!authUid || authUid !== guideId) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const { db } = await import('../config/firebase');
    const now = new Date();
    const hoy = now.toISOString().split('T')[0];
    const horaActual = now.toTimeString().slice(0, 5);

    // Obtener todos los bookings del guía que están confirmados o completados
    const snap = await db.collection('bookings')
      .where('guideId', '==', guideId)
      .where('status', 'in', ['confirmado', 'completado'])
      .get();

    const experiencias: any[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const fecha: string = data.fecha || '';
      const hora: string = data.horaInicio || '00:00';

      // Auto-completar si la fecha+hora ya pasó
      if (data.status === 'confirmado') {
        const tourPaso = fecha < hoy || (fecha === hoy && hora <= horaActual);
        if (tourPaso) {
          await doc.ref.update({ status: 'completado' });
          data.status = 'completado';
        }
      }

      if (data.status === 'completado') {
        experiencias.push({ id: doc.id, ...data });
      }
    }

    experiencias.sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
    return res.json({ success: true, experiencias });
  } catch (error: any) {
    console.error('Error getGuiaExperiencias:', error);
    return res.status(500).json({ success: false, experiencias: [] });
  }
};
