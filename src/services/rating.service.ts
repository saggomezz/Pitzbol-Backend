import { db } from '../config/firebase';
import { Rating, GuideRatingStats, CreateRatingRequest } from '../models/rating.model';

export class RatingService {
  // Crear una calificación
  static async createRating(ratingData: CreateRatingRequest): Promise<Rating> {
    const ratingsRef = db.collection('ratings');
    
    // Verificar si el turista ya calificó esta reserva
    const existingRating = await ratingsRef
      .where('bookingId', '==', ratingData.bookingId)
      .where('touristId', '==', ratingData.touristId)
      .limit(1)
      .get();

    if (!existingRating.empty) {
      throw new Error('Ya has calificado este tour');
    }

    // Obtener información adicional
    const bookingDoc = await db.collection('bookings').doc(ratingData.bookingId).get();
    if (!bookingDoc.exists) {
      throw new Error('Reserva no encontrada');
    }
    const bookingData = bookingDoc.data();

    const today = new Date().toISOString().split('T')[0];
    
    const newRating = {
      bookingId: ratingData.bookingId,
      guideId: ratingData.guideId,
      guideName: bookingData?.guideName || 'Guía',
      touristId: ratingData.touristId,
      touristName: bookingData?.touristName || 'Turista',
      estrellas: ratingData.estrellas,
      comentario: ratingData.comentario || '',
      fecha: today!,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ratingDoc = await ratingsRef.add(newRating);
    
    // Actualizar promedio de calificaciones del guía
    await this.updateGuideRatingStats(ratingData.guideId);
    
    return { id: ratingDoc.id, ...newRating };
  }

  // Obtener calificaciones de un guía
  static async getGuideRatings(guideId: string, limit: number = 10): Promise<Rating[]> {
    const ratingsRef = db.collection('ratings');
    const snapshot = await ratingsRef
      .where('guideId', '==', guideId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Rating[];
  }

  // Obtener estadísticas de calificación de un guía
  static async getGuideRatingStats(guideId: string): Promise<GuideRatingStats> {
    const ratingsRef = db.collection('ratings');
    const snapshot = await ratingsRef
      .where('guideId', '==', guideId)
      .get();

    if (snapshot.empty) {
      return {
        guideId,
        promedioEstrellas: 0,
        totalCalificaciones: 0,
        distribucion: {
          estrellas1: 0,
          estrellas2: 0,
          estrellas3: 0,
          estrellas4: 0,
          estrellas5: 0,
        },
        ultimasCalificaciones: [],
      };
    }

    const ratings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Rating[];

    // Calcular distribución
    const distribucion = {
      estrellas1: 0,
      estrellas2: 0,
      estrellas3: 0,
      estrellas4: 0,
      estrellas5: 0,
    };

    let sumaEstrellas = 0;
    ratings.forEach(rating => {
      sumaEstrellas += rating.estrellas;
      distribucion[`estrellas${rating.estrellas}` as keyof typeof distribucion]++;
    });

    const promedioEstrellas = sumaEstrellas / ratings.length;

    // Obtener últimas 5 calificaciones
    const ultimasCalificaciones = ratings.slice(0, 5);

    return {
      guideId,
      promedioEstrellas: Math.round(promedioEstrellas * 10) / 10, // Redondear a 1 decimal
      totalCalificaciones: ratings.length,
      distribucion,
      ultimasCalificaciones,
    };
  }

  // Actualizar estadísticas del guía en su perfil
  static async updateGuideRatingStats(guideId: string): Promise<void> {
    const stats = await this.getGuideRatingStats(guideId);
    
    // Buscar el guía en las diferentes colecciones
    const categories = ['guias/lista', 'guias/pendientes'];
    
    for (const category of categories) {
      const parts = category.split('/');
      const mainCollection = parts[0];
      const subCollection = parts[1];
      
      if (!mainCollection || !subCollection) continue;
      
      const guideQuery = await db
        .collection('usuarios')
        .doc(mainCollection)
        .collection(subCollection)
        .where('uid', '==', guideId)
        .limit(1)
        .get();

      if (!guideQuery.empty && guideQuery.docs[0]) {
        const guideDoc = guideQuery.docs[0];
        await guideDoc.ref.update({
          calificacion: stats.promedioEstrellas,
          totalCalificaciones: stats.totalCalificaciones,
          updatedAt: new Date(),
        });
        break;
      }
    }
  }

  // Verificar si un turista puede calificar una reserva
  static async canRateBooking(bookingId: string, touristId: string): Promise<boolean> {
    // Verificar que la reserva existe y está completada
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      return false;
    }

    const bookingData = bookingDoc.data();
    if (bookingData?.status !== 'completado') {
      return false;
    }

    if (bookingData?.touristId !== touristId) {
      return false;
    }

    // Verificar que no haya calificado ya
    const existingRating = await db.collection('ratings')
      .where('bookingId', '==', bookingId)
      .where('touristId', '==', touristId)
      .limit(1)
      .get();

    return existingRating.empty;
  }

  // Obtener calificación por reserva
  static async getRatingByBooking(bookingId: string): Promise<Rating | null> {
    const snapshot = await db.collection('ratings')
      .where('bookingId', '==', bookingId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (!doc || !doc.exists) return null;
    
    return { id: doc.id, ...doc.data() } as Rating;
  }
}
