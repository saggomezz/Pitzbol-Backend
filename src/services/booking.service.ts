import { db } from '../config/firebase';
import { Booking } from '../models/booking.model';
import { AvailabilityService } from './availability.service';

export class BookingService {
  // Crear una reserva
  static async createBooking(bookingData: Omit<Booking, 'id'>): Promise<Booking> {
    const bookingsRef = db.collection('bookings');
    
    // Verificar disponibilidad usando el nuevo sistema
    const isAvailable = await AvailabilityService.isTimeSlotAvailable(
      bookingData.guideId,
      bookingData.fecha,
      bookingData.horaInicio
    );

    if (!isAvailable) {
      throw new Error('El guía no está disponible en ese horario');
    }

    const newBooking = {
      ...bookingData,
      calificado: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const bookingDoc = await bookingsRef.add(newBooking);
    
    // Incrementar el contador de reservas para ese horario
    await AvailabilityService.incrementBookingCount(
      bookingData.guideId,
      bookingData.fecha,
      bookingData.horaInicio
    );
    
    return { id: bookingDoc.id, ...newBooking };
  }

  // Obtener reserva por ID
  static async getBookingById(bookingId: string): Promise<Booking | null> {
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    
    if (!bookingDoc.exists) return null;
    
    return { id: bookingDoc.id, ...bookingDoc.data() } as Booking;
  }

  // Obtener reservas de un turista
  static async getTouristBookings(touristId: string): Promise<Booking[]> {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef
      .where('touristId', '==', touristId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];
  }

  // Obtener reservas de un guía
  static async getGuideBookings(guideId: string): Promise<Booking[]> {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef
      .where('guideId', '==', guideId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];
  }

  // Actualizar estado de reserva
  static async updateBookingStatus(
    bookingId: string, 
    status: Booking['status'],
    paymentId?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (paymentId) {
      updateData.paymentId = paymentId;
    }

    await db.collection('bookings').doc(bookingId).update(updateData);
  }

  // Cancelar reserva
  static async cancelBooking(bookingId: string): Promise<void> {
    // Obtener la reserva antes de cancelarla
    const booking = await this.getBookingById(bookingId);
    
    if (!booking) {
      throw new Error('Reserva no encontrada');
    }

    await db.collection('bookings').doc(bookingId).update({
      status: 'cancelado',
      updatedAt: new Date(),
    });

    // Decrementar el contador de disponibilidad si la reserva no estaba cancelada
    if (booking.status !== 'cancelado') {
      try {
        await AvailabilityService.decrementBookingCount(
          booking.guideId,
          booking.fecha,
          booking.horaInicio
        );
      } catch (error) {
        console.warn('No se pudo actualizar disponibilidad al cancelar:', error);
      }
    }
  }

  // Verificar disponibilidad del guía
  static async checkGuideAvailability(
    guideId: string,
    fecha: string,
    horaInicio: string
  ): Promise<boolean> {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef
      .where('guideId', '==', guideId)
      .where('fecha', '==', fecha)
      .where('status', 'in', ['pendiente', 'confirmado', 'pagado'])
      .get();

    // Si no hay reservas para esa fecha, está disponible
    if (snapshot.empty) return true;

    // Verificar conflictos de horario
    // Por simplicidad, consideramos que si hay alguna reserva ese día, no está disponible
    // En una implementación más compleja, verificarías las horas exactas
    return snapshot.empty;
  }
}
