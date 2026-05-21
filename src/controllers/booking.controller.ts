import { Request, Response } from 'express';
import { BookingService } from '../services/booking.service';
import { PaymentService } from '../services/payment.service';
import { sendNotificationToUser } from '../services/notification.service';
import { db } from '../config/firebase';
import { v2 as cloudinary } from 'cloudinary';

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

    // Validate date is not in the past (compare against start of today to allow same-day bookings)
    const bookingDate = new Date(bookingData.fecha);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(bookingDate.getTime()) || bookingDate < today) {
      return res.status(400).json({ success: false, message: 'La fecha debe ser futura y válida' });
    }

    // Para paquetes grupales: verificar capacidad en lugar de disponibilidad exclusiva
    let skipAvailabilityCheck = false;

    if (bookingData.paqueteId) {
      const paqueteDoc = await db.collection('paquetes').doc(bookingData.paqueteId).get();
      if (!paqueteDoc.exists) {
        return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
      }
      const paquete = paqueteDoc.data()!;
      const capacidad = Number(paquete.capacidad) || 0;

      if (capacidad > 0) {
        // Sumar personas ya reservadas para este paquete en esa fecha
        const activeSnap = await db.collection('bookings')
          .where('paqueteId', '==', bookingData.paqueteId)
          .where('fecha', '==', bookingData.fecha)
          .get();

        const personasOcupadas = activeSnap.docs
          .filter(doc => ['pendiente', 'confirmado', 'pagado'].includes(doc.data().status))
          .reduce((sum, doc) => sum + (Number(doc.data().numPersonas) || 1), 0);

        const numPersonasSolicitadas = Number(bookingData.numPersonas) || 1;

        if (personasOcupadas + numPersonasSolicitadas > capacidad) {
          return res.status(409).json({
            success: false,
            message: `No hay suficientes plazas disponibles. Plazas ocupadas: ${personasOcupadas}/${capacidad}`,
            code: 'TOUR_FULL',
            disponibles: Math.max(0, capacidad - personasOcupadas),
            capacidad,
          });
        }
      }
      // Paquete grupal: no usar el sistema de disponibilidad exclusiva por slot
      skipAvailabilityCheck = true;
    } else {
      // Tour personalizado: verificar disponibilidad exclusiva del guía
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
    }

    // Crear reserva
    const booking = await BookingService.createBooking(
      { ...bookingData, status: 'pendiente' },
      { skipAvailabilityCheck },
    );

    // Notificar al guía sobre la nueva reserva
    try {
      const fechaFormateada = new Date(booking.fecha + 'T00:00:00').toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      await sendNotificationToUser(booking.guideId, {
        tipo: 'nueva_reserva',
        titulo: '📅 Nueva reserva recibida',
        mensaje: `${booking.touristName} ha reservado un tour para el ${fechaFormateada} (${booking.duracion === 'completo' ? 'día completo' : 'medio día'}).`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: '/guide/solicitudes',
        bookingId: booking.id,
      });
    } catch (notifErr) {
      console.warn('⚠️ Error al notificar al guía sobre nueva reserva:', notifErr);
    }

    // Notificar al turista que su reserva fue creada con éxito
    try {
      const fechaFormateada = new Date(booking.fecha + 'T00:00:00').toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      await sendNotificationToUser(booking.touristId, {
        tipo: 'reserva_confirmada',
        titulo: '✅ ¡Reserva realizada con éxito!',
        mensaje: `Tu reserva con ${booking.guideName} para el ${fechaFormateada} fue creada. El guía confirmará tu solicitud en breve.`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: '/perfil',
        bookingId: booking.id,
      });
    } catch (notifErr) {
      console.warn('⚠️ Error al notificar al turista sobre reserva creada:', notifErr);
    }

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

// Cancelar tour con reembolso (iniciado por el guía)
export const cancelTourByGuide = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const guideUid = (req as any).user?.uid;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({ success: false, message: 'bookingId es requerido' });
    }

    const booking = await BookingService.getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }
    if (booking.guideId !== guideUid) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para cancelar esta reserva' });
    }
    if (booking.status === 'cancelado') {
      return res.status(400).json({ success: false, message: 'La reserva ya está cancelada' });
    }
    if (booking.status === 'completado') {
      return res.status(400).json({ success: false, message: 'No se puede cancelar un tour ya completado' });
    }

    // If paid, issue Stripe refund before cancelling
    if (booking.status === 'pagado') {
      await PaymentService.refundForBooking(bookingId);
    } else {
      await BookingService.cancelBooking(bookingId);
    }

    // Notificar al turista que el guía canceló su tour
    try {
      const fechaFormateada = new Date(booking.fecha + 'T00:00:00').toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const mensajeReembolso = booking.status === 'pagado'
        ? ' Tu pago ha sido reembolsado.'
        : '';
      await sendNotificationToUser(booking.touristId, {
        tipo: 'tour_cancelado_guia',
        titulo: '❌ Tu tour fue cancelado',
        mensaje: `El guía ${booking.guideName} canceló el tour del ${fechaFormateada}.${mensajeReembolso}`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: '/tours',
        bookingId,
      });
    } catch (notifErr) {
      console.warn('⚠️ Error al notificar al turista sobre cancelación por guía:', notifErr);
    }

    return res.status(200).json({
      success: true,
      message: booking.status === 'pagado'
        ? 'Tour cancelado y reembolso emitido al turista'
        : 'Reserva cancelada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al cancelar tour por guía:', error);
    return res.status(500).json({ success: false, message: 'Error al cancelar el tour' });
  }
};

// Cancelar reserva (iniciado por el turista)
export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const touristUid = (req as any).user?.uid;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'bookingId es requerido',
      });
    }

    if (!touristUid) {
      return res.status(401).json({ success: false, message: 'Autenticación requerida' });
    }

    const booking = await BookingService.getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    // IDOR: solo el turista dueño puede cancelar
    if (booking.touristId !== touristUid) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para cancelar esta reserva' });
    }

    if (booking.status === 'cancelado') {
      return res.status(400).json({ success: false, message: 'La reserva ya está cancelada' });
    }

    if (booking.status === 'completado') {
      return res.status(400).json({ success: false, message: 'No se puede cancelar un tour ya completado' });
    }

    // Si estaba pagada, emitir reembolso
    if (booking.status === 'pagado') {
      await PaymentService.refundForBooking(bookingId);
    } else {
      await BookingService.cancelBooking(bookingId);
    }

    // Notificar al guía que el turista canceló
    try {
      const fechaFormateada = new Date(booking.fecha + 'T00:00:00').toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      await sendNotificationToUser(booking.guideId, {
        tipo: 'reserva_cancelada_turista',
        titulo: '❌ Reserva cancelada por el turista',
        mensaje: `${booking.touristName} canceló su reserva del ${fechaFormateada}${booking.status === 'pagado' ? '. El reembolso fue emitido.' : '.'}`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: '/guide/solicitudes',
        bookingId,
      });
    } catch (notifErr) {
      console.warn('⚠️ Error al notificar al guía sobre cancelación por turista:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: booking.status === 'pagado'
        ? 'Reserva cancelada y reembolso emitido'
        : 'Reserva cancelada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al cancelar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar reserva',
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

// GET /api/bookings/guia/:guideId/experiencias/public
// Retorna experiencias completadas del guía visibles al público (sin auth)
export const getGuiaExperienciasPublic = async (req: Request, res: Response) => {
  try {
    const { guideId } = req.params;
    const { db } = await import('../config/firebase');

    const snap = await db.collection('bookings')
      .where('guideId', '==', guideId)
      .where('status', '==', 'completado')
      .get();

    const experiencias: any[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      // Solo incluir si el guía subió fotos o descripción
      if (!data.fotosExperiencia?.length && !data.descripcionExperiencia) continue;

      experiencias.push({
        id: doc.id,
        fecha: data.fecha || '',
        tourTitulo: data.tourTitulo || 'Tour',
        tourFoto: data.tourFoto || null,
        fotosExperiencia: data.fotosExperiencia || [],
        descripcionExperiencia: data.descripcionExperiencia || '',
      });
    }

    experiencias.sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
    return res.json({ success: true, experiencias });
  } catch (error: any) {
    console.error('Error getGuiaExperienciasPublic:', error);
    return res.status(500).json({ success: false, experiencias: [] });
  }
};

// PATCH /api/bookings/:bookingId/experiencia
// El guía puede guardar fotos y descripción en una experiencia completada
export const updateExperiencia = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const authUid = (req as any).user?.uid;

    if (!authUid) {
      return res.status(401).json({ success: false, message: 'Autenticación requerida' });
    }

    const bookingRef = db.collection('bookings').doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: 'Experiencia no encontrada' });
    }

    const booking = snap.data()!;
    if (booking.guideId !== authUid) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para editar esta experiencia' });
    }

    const { descripcion, titulo, fotosBase64 } = req.body as { descripcion?: string; titulo?: string; fotosBase64?: string[] };

    const updates: Record<string, any> = {};

    if (typeof titulo === 'string' && titulo.trim()) {
      updates.tourTitulo = titulo.trim();
    }

    if (typeof descripcion === 'string') {
      updates.descripcionExperiencia = descripcion.trim();
    }

    if (Array.isArray(fotosBase64) && fotosBase64.length > 0) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
        api_key: process.env.CLOUDINARY_API_KEY || '',
        api_secret: process.env.CLOUDINARY_API_SECRET || '',
      });

      const uploadedUrls: string[] = [];
      for (const base64 of fotosBase64.slice(0, 5)) {
        const result = await cloudinary.uploader.upload(base64, {
          folder: `pitzbol/experiencias/${authUid}`,
          resource_type: 'auto',
          format: 'webp',
          transformation: [{ width: 1200, height: 900, crop: 'fill' }, { quality: 'auto:good' }],
        });
        if (result.secure_url) uploadedUrls.push(result.secure_url);
      }
      // Merge with existing photos
      const existingFotos: string[] = booking.fotosExperiencia || [];
      updates.fotosExperiencia = [...existingFotos, ...uploadedUrls].slice(0, 5);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No hay datos para actualizar' });
    }

    await bookingRef.update(updates);
    return res.json({ success: true, message: 'Experiencia actualizada', updates });
  } catch (error: any) {
    console.error('Error updateExperiencia:', error);
    return res.status(500).json({ success: false, message: 'Error al actualizar la experiencia' });
  }
};

// PATCH /api/bookings/:bookingId/experiencia/foto
// Eliminar una foto específica de la experiencia
export const deleteExperienciaFoto = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const authUid = (req as any).user?.uid;

    if (!authUid) {
      return res.status(401).json({ success: false, message: 'Autenticación requerida' });
    }

    const bookingRef = db.collection('bookings').doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: 'Experiencia no encontrada' });
    }

    const booking = snap.data()!;
    if (booking.guideId !== authUid) {
      return res.status(403).json({ success: false, message: 'No tienes permiso' });
    }

    const { fotoUrl } = req.body as { fotoUrl: string };
    const fotosExistentes: string[] = booking.fotosExperiencia || [];
    const nuevasFotos = fotosExistentes.filter((f: string) => f !== fotoUrl);
    await bookingRef.update({ fotosExperiencia: nuevasFotos });
    return res.json({ success: true, fotosExperiencia: nuevasFotos });
  } catch (error: any) {
    console.error('Error deleteExperienciaFoto:', error);
    return res.status(500).json({ success: false, message: 'Error al eliminar la foto' });
  }
};
