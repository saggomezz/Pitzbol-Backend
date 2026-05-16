import { db } from '../config/firebase';
import { GuideAvailability, SetAvailabilityRequest, TimeSlot } from '../models/guide-availability.model';

export class AvailabilityService {
  static async getAvailabilityById(availabilityId: string): Promise<GuideAvailability | null> {
    const doc = await db.collection('guide_availability').doc(availabilityId).get();

    if (!doc.exists) {
      return null;
    }

    return { id: doc.id, ...doc.data() } as GuideAvailability;
  }

  static async setGuideAvailability(request: SetAvailabilityRequest): Promise<GuideAvailability> {
    const availabilityRef = db.collection('guide_availability');

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

    if (!existingQuery.empty && existingQuery.docs[0]) {
      const docId = existingQuery.docs[0].id;
      const existingData = existingQuery.docs[0].data();
      await availabilityRef.doc(docId).update(availabilityData);
      return { id: docId, ...availabilityData, createdAt: existingData.createdAt || new Date() };
    }

    const newAvailability = {
      ...availabilityData,
      createdAt: new Date(),
    };

    const docRef = await availabilityRef.add(newAvailability);
    return { id: docRef.id, ...newAvailability };
  }

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

  static async getGuideAvailabilities(guideId: string, desde?: string): Promise<GuideAvailability[]> {
    // orderBy('fecha') + where() requeriría índice compuesto en Firestore.
    // Filtramos por fecha en memoria para evitar el error de índice.
    let query = db.collection('guide_availability')
      .where('guideId', '==', guideId);

    const snapshot = await query.get();

    const results = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }) as GuideAvailability)
      .filter(a => !desde || a.fecha >= desde)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    return results;
  }

  static async deleteAvailability(availabilityId: string): Promise<void> {
    await db.collection('guide_availability').doc(availabilityId).delete();
  }

  static async isTimeSlotAvailable(
    guideId: string,
    fecha: string,
    horaInicio: string
  ): Promise<boolean> {
    const availability = await this.getGuideAvailability(guideId, fecha);

    // Compatibilidad: si no hay disponibilidad configurada, se asume disponible.
    if (!availability) return true;

    const timeSlot = availability.horasDisponibles.find(
      slot => slot.horaInicio === horaInicio
    );

    if (!timeSlot) return true;

    return timeSlot.disponible && timeSlot.reservasActuales < availability.maxReservasPorHora;
  }

  static async incrementBookingCount(
    guideId: string,
    fecha: string,
    horaInicio: string
  ): Promise<void> {
    const availability = await this.getGuideAvailability(guideId, fecha);

    if (!availability) return;

    const timeSlotIndex = availability.horasDisponibles.findIndex(
      slot => slot.horaInicio === horaInicio
    );

    if (timeSlotIndex === -1 || !availability.horasDisponibles[timeSlotIndex]) {
      throw new Error('Horario no encontrado');
    }

    availability.horasDisponibles[timeSlotIndex].reservasActuales++;

    if (availability.horasDisponibles[timeSlotIndex].reservasActuales >= availability.maxReservasPorHora) {
      availability.horasDisponibles[timeSlotIndex].disponible = false;
    }

    await db.collection('guide_availability').doc(availability.id).update({
      horasDisponibles: availability.horasDisponibles,
      updatedAt: new Date(),
    });
  }

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