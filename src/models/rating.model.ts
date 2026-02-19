export interface Rating {
  id: string;
  bookingId: string;
  guideId: string;
  guideName: string;
  touristId: string;
  touristName: string;
  estrellas: 1 | 2 | 3 | 4 | 5; // Calificación de 1 a 5 estrellas
  comentario?: string;
  fecha: string; // Formato: YYYY-MM-DD
  createdAt: Date;
  updatedAt: Date;
}

export interface GuideRatingStats {
  guideId: string;
  promedioEstrellas: number; // Promedio de todas las calificaciones
  totalCalificaciones: number;
  distribucion: {
    estrellas1: number;
    estrellas2: number;
    estrellas3: number;
    estrellas4: number;
    estrellas5: number;
  };
  ultimasCalificaciones: Rating[];
}

export interface CreateRatingRequest {
  bookingId: string;
  guideId: string;
  touristId: string;
  estrellas: 1 | 2 | 3 | 4 | 5;
  comentario?: string;
}
