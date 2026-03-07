import { db } from '../config/firebase';
import { GuideAvailability, SetAvailabilityRequest, TimeSlot } from '../models/guide-availability.model';

export class AvailabilityService {
  // Establecer disponibilidad del guía para una fecha
  static async setGuideAvailability(request: SetAvailabilityRequest): Promise<GuideAvailability> {
    const availabilityRef = db.collection('guide_availability');
    
    // Verificar si ya existe disponibilidad para esa fecha
    const existingQuery = await availabilityRef
      .where('guideId', '==', request.guideId)
      .where('fecha', '==', request.fecha)
      .limit(1)
      .get();

    const horasDisponibles: TimeSlot[] = request.horasDisponibles.map(slot => ({
      horaInicio: slot.horaInicio,
      horaFin: slot.horaFin,
      disponible: true,
      reservasActuales: 0,
    }));

    const availabilityData = {
      guideId: request.guideId,
      fecha: request.fecha,
      horasDisponibles,
      maxReservasPorHora: request.maxReservasPorHora || 1,
      updatedAt: new Date(),
    };

    // Si ya existe, actualizar
    if (!existingQuery.empty && existingQuery.docs[0]) {
      const docId = existingQuery.docs[0].id;
      const existingData = existingQuery.docs[0].data();
      await availabilityRef.doc(docId).update(availabilityData);
      return { id: docId, ...availabilityData, createdAt: existingData.createdAt || new Date() };
    }

    // Si no existe, crear nuevo
    const newAvailability = {
      ...availabilityData,
      createdAt: new Date(),
    };

    const docRef = await availabilityRef.add(newAvailability);
    return { id: docRef.id, ...newAvailability };
  }

  // Obtener disponibilidad del guía para una fecha
  static async getGuideAvailability(guideId: string, fecha: string): Promise<GuideAvailability | null> {
    const snapshot = await db.collection('guide_availability')
      .where('guideId', '==', guideId)
      .where('fecha', '==', fecha)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (!doc || !doc.exists) return null;
    
    return { id: doc.id, ...doc.data() } as GuideAvailability;
  }

  // Obtener todas las disponibilidades del guía
  static async getGuideAvailabilities(guideId: string, desde?: string): Promise<GuideAvailability[]> {
    let query = db.collection('guide_availability')
      .where('guideId', '==', guideId);

    if (desde) {
      query = query.where('fecha', '>=', desde);
    }

    const snapshot = await query
      .orderBy('fecha', 'asc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as GuideAvailability[];
  }

  // Eliminar disponibilidad
  static async deleteAvailability(availabilityId: string): Promise<void> {
    await db.collection('guide_availability').doc(availabilityId).delete();
  }

  // Verificar si un horario específico está disponible
  static async isTimeSlotAvailable(
    guideId: string,
    fecha: string,
    horaInicio: string
  ): Promise<boolean> {
    const availability = await this.getGuideAvailability(guideId, fecha);
    
    // Si el guía no ha configurado disponibilidad, se asume disponible
    if (!availability) return true;

    const timeSlot = availability.horasDisponibles.find(
      slot => slot.horaInicio === horaInicio
    );

    // Si el horario no está en la lista configurada, se asume disponible
    if (!timeSlot) return true;

    return timeSlot.disponible && timeSlot.reservasActuales < availability.maxReservasPorHora;
  }

  // Incrementar contador de reservas para un horario
  static async incrementBookingCount(
    guideId: string,
    fecha: string,
    horaInicio: string
  ): Promise<void> {
    const availability = await this.getGuideAvailability(guideId, fecha);
    
    // Si no hay disponibilidad configurada, no hay nada que incrementar
    if (!availability) return;

    const timeSlotIndex = availability.horasDisponibles.findIndex(
      slot => slot.horaInicio === horaInicio
    );

    if (timeSlotIndex === -1 || !availability.horasDisponibles[timeSlotIndex]) {
      throw new Error('Horario no encontrado');
    }

    availability.horasDisponibles[timeSlotIndex].reservasActuales++;
    
    // Marcar como no disponible si alcanzó el máximo
    if (availability.horasDisponibles[timeSlotIndex].reservasActuales >= availability.maxReservasPorHora) {
      availability.horasDisponibles[timeSlotIndex].disponible = false;
    }

    await db.collection('guide_availability').doc(availability.id).update({
      horasDisponibles: availability.horasDisponibles,
      updatedAt: new Date(),
    });
  }

  // Decrementar contador de reservas (cuando se cancela)
  static async decrementBookingCount(
    guideId: string,
    fecha: string,
    horaInicio: string
  ): Promise<void> {
    const availability = await this.getGuideAvailability(guideId, fecha);
    
    if (!availability) return;

    const timeSlotIndex = availability.horasDisponibles.findIndex(
      slot => slot.horaInicio === horaInicio
    );

    if (timeSlotIndex === -1 || !availability.horasDisponibles[timeSlotIndex]) return;

    if (availability.horasDisponibles[timeSlotIndex].reservasActuales > 0) {
      availability.horasDisponibles[timeSlotIndex].reservasActuales--;
      availability.horasDisponibles[timeSlotIndex].disponible = true;
    }

    await db.collection('guide_availability').doc(availability.id).update({
      horasDisponibles: availability.horasDisponibles,
      updatedAt: new Date(),
    });
  }
}
