export interface Booking {
  id: string;
  guideId: string;
  guideName: string;
  touristId: string;
  touristName: string;
  fecha: string;
  duracion: 'medio' | 'completo';
  horaInicio: string;
  horaFin?: string;
  numPersonas: number;
  notas?: string;
  total: number;
  status: 'pendiente' | 'confirmado' | 'pagado' | 'completado' | 'cancelado';
  paymentId?: string;
  calificado?: boolean; // Si el turista ya calificó este tour
  createdAt: Date;
  updatedAt: Date;
}
