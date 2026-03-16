import { db } from '../config/firebase';
import { Booking } from '../models/booking.model';
import { AvailabilityService } from './availability.service';

export class BookingService {
  static async createBooking(bookingData: Omit<Booking, 'id'>): Promise<Booking> {
    const bookingsRef = db.collection('bookings');

    const isAvailable = await AvailabilityService.isTimeSlotAvailable(
      bookingData.guideId,
      bookingData.fecha,
      bookingData.horaInicio
    );

    if (!isAvailable) {
      throw new Error('El guia no esta disponible en ese horario');
    }

    const newBooking = {
      ...bookingData,
      calificado: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const bookingDoc = await bookingsRef.add(newBooking);

    await AvailabilityService.incrementBookingCount(
      bookingData.guideId,
      bookingData.fecha,
      bookingData.horaInicio
    );

    return { id: bookingDoc.id, ...newBooking };
  }

  static async getBookingById(bookingId: string): Promise<Booking | null> {
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();

    if (!bookingDoc.exists) return null;

    return { id: bookingDoc.id, ...bookingDoc.data() } as Booking;
  }

  static async getTouristBookings(touristId: string): Promise<Booking[]> {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef
      .where('touristId', '==', touristId)
      .get();

    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];

    return bookings.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }

  static async getGuideBookings(guideId: string): Promise<Booking[]> {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef
      .where('guideId', '==', guideId)
      .get();

    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];

    return bookings.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }

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

  static async cancelBooking(bookingId: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);

    if (!booking) {
      throw new Error('Reserva no encontrada');
    }

    await db.collection('bookings').doc(bookingId).update({
      status: 'cancelado',
      updatedAt: new Date(),
    });

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

    if (snapshot.empty) return true;

    return snapshot.empty;
  }
}