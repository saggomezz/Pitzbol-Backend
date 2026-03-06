import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';
import { Booking } from '../models/booking.model';
import { BookingService } from '../services/booking.service';
import { sendBookingConfirmationEmail } from '../services/email.service';

const getTouristContact = async (uid: string) => {
  const snapshot = await db
    .collection('usuarios')
    .doc('turistas')
    .collection('lista')
    .where('uid', '==', uid)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const data = snapshot.docs[0]?.data();
  if (!data) {
    return null;
  }

  const nombre = data['01_nombre'] || data.nombre || '';
  const apellido = data['02_apellido'] || data.apellido || '';
  const email = data['04_correo'] || data.email || '';

  return {
    nombre: `${nombre} ${apellido}`.trim() || nombre || 'Turista',
    email,
  };
};

const notifyBookingByEmail = async (booking: Booking) => {
  try {
    const contact = await getTouristContact(booking.touristId);
    let email = contact?.email;
    const nombre = contact?.nombre || booking.touristName || 'Turista';

    if (!email) {
      try {
        const userRecord = await auth.getUser(booking.touristId);
        email = userRecord.email || undefined;
      } catch (authError) {
        console.warn('No se pudo recuperar el correo desde Firebase Auth:', authError);
      }
    }

    if (!email) {
      console.warn(`No se envió correo: turista ${booking.touristId} sin email`);
      return;
    }

    await sendBookingConfirmationEmail({
      to: email,
      touristName: nombre,
      guideName: booking.guideName,
      fecha: booking.fecha,
      horaInicio: booking.horaInicio,
      duracion: booking.duracion,
      numPersonas: booking.numPersonas,
      total: booking.total,
    });
  } catch (notifyError) {
    console.warn('No se pudo enviar la notificación por correo de la reserva:', notifyError);
  }
};

// Crear una reserva
export const createBooking = async (req: Request, res: Response) => {
  try {
    const bookingData = req.body;

    // Validaciones
    if (!bookingData.guideId || !bookingData.touristId || !bookingData.fecha) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos',
      });
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

    notifyBookingByEmail(booking);

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
      message: 'Error al crear reserva',
      error: error.message,
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
      message: 'Error al obtener reserva',
      error: error.message,
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
      message: 'Error al obtener reservas',
      error: error.message,
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
      message: 'Error al obtener reservas',
      error: error.message,
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
      message: 'Error al actualizar estado',
      error: error.message,
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
      message: 'Error al cancelar reserva',
      error: error.message,
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
      message: 'Error al completar tour',
      error: error.message,
    });
  }
};
