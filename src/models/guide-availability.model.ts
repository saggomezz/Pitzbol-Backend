export interface GuideAvailability {
  id: string;
  guideId: string;
  fecha: string; // Formato: YYYY-MM-DD
  horasDisponibles: TimeSlot[];
  maxReservasPorHora: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeSlot {
  horaInicio: string; // Formato: HH:mm (ej: "09:00")
  horaFin: string;    // Formato: HH:mm (ej: "10:00")
  disponible: boolean;
  reservasActuales: number;
}

export interface SetAvailabilityRequest {
  guideId: string;
  fecha: string;
  horasDisponibles: {
    horaInicio: string;
    horaFin: string;
  }[];
  maxReservasPorHora?: number;
}
