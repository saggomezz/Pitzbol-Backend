import { db } from '../config/firebase';
import { Rating, GuideRatingStats, CreateRatingRequest } from '../models/rating.model';

const GUIDE_STATS_CACHE_TTL_MS = 30 * 60 * 1000;
const guideStatsCache = new Map<string, { data: GuideRatingStats; expiresAt: number; inFlight?: Promise<GuideRatingStats> }>();

const isQuotaExceeded = (error: any) => error?.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(error?.message || error));

const emptyGuideStats = (guideId: string): GuideRatingStats => ({
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
});

const normalizeGuideStats = (guideId: string, data: any): GuideRatingStats => ({
  ...emptyGuideStats(guideId),
  ...data,
  guideId,
  distribucion: {
    ...emptyGuideStats(guideId).distribucion,
    ...(data?.distribucion || {}),
  },
  ultimasCalificaciones: Array.isArray(data?.ultimasCalificaciones) ? data.ultimasCalificaciones : [],
});

const setGuideStatsCache = (guideId: string, data: GuideRatingStats) => {
  guideStatsCache.set(guideId, { data, expiresAt: Date.now() + GUIDE_STATS_CACHE_TTL_MS });
};

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
    // orderBy('createdAt') sobre un campo distinto al del where() requiere
    // un índice compuesto en Firestore. Ordenamos en memoria para evitarlo.
    const snapshot = await ratingsRef
      .where('guideId', '==', guideId)
      .limit(limit)
      .get();

    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }) as Rating)
      .sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis?.() ?? new Date(a.createdAt).getTime();
        const tb = b.createdAt?.toMillis?.() ?? new Date(b.createdAt).getTime();
        return tb - ta;
      });
  }

  // Obtener estadísticas de calificación de un guía
  static async getGuideRatingStats(guideId: string): Promise<GuideRatingStats> {
    const cached = guideStatsCache.get(guideId);
    if (cached?.data && cached.expiresAt > Date.now()) return cached.data;
    if (cached?.inFlight) return cached.inFlight;

    const inFlight = this.loadGuideRatingStats(guideId, cached?.data);
    guideStatsCache.set(guideId, {
      data: cached?.data || emptyGuideStats(guideId),
      expiresAt: cached?.expiresAt || 0,
      inFlight,
    });

    try {
      const stats = await inFlight;
      setGuideStatsCache(guideId, stats);
      return stats;
    } catch (error) {
      guideStatsCache.delete(guideId);
      throw error;
    }
  }

  private static async loadGuideRatingStats(guideId: string, fallback?: GuideRatingStats): Promise<GuideRatingStats> {
    try {
      const statsDoc = await db.collection('guide_rating_stats').doc(guideId).get();
      if (statsDoc.exists) {
        return normalizeGuideStats(guideId, statsDoc.data());
      }

      const stats = await this.calculateGuideRatingStats(guideId);
      await db.collection('guide_rating_stats').doc(guideId).set({
        ...stats,
        updatedAt: new Date(),
      }, { merge: true });
      return stats;
    } catch (error) {
      if (isQuotaExceeded(error)) return fallback || emptyGuideStats(guideId);
      throw error;
    }
  }

  private static async calculateGuideRatingStats(guideId: string): Promise<GuideRatingStats> {
    const ratingsRef = db.collection('ratings');
    const snapshot = await ratingsRef
      .where('guideId', '==', guideId)
      .get();

    if (snapshot.empty) {
      return emptyGuideStats(guideId);
    }

    const ratings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Rating[];

    const sortedRatings = ratings.sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis?.() ?? new Date(a.createdAt).getTime();
      const tb = b.createdAt?.toMillis?.() ?? new Date(b.createdAt).getTime();
      return tb - ta;
    });

    // Calcular distribución
    const distribucion = {
      estrellas1: 0,
      estrellas2: 0,
      estrellas3: 0,
      estrellas4: 0,
      estrellas5: 0,
    };

    let sumaEstrellas = 0;
    sortedRatings.forEach(rating => {
      sumaEstrellas += rating.estrellas;
      distribucion[`estrellas${rating.estrellas}` as keyof typeof distribucion]++;
    });

    const promedioEstrellas = sumaEstrellas / sortedRatings.length;

    // Obtener últimas 5 calificaciones
    const ultimasCalificaciones = sortedRatings.slice(0, 5);

    return {
      guideId,
      promedioEstrellas: Math.round(promedioEstrellas * 10) / 10, // Redondear a 1 decimal
      totalCalificaciones: sortedRatings.length,
      distribucion,
      ultimasCalificaciones,
    };
  }

  // Actualizar estadísticas del guía en su perfil
  static async updateGuideRatingStats(guideId: string): Promise<void> {
    const stats = await this.calculateGuideRatingStats(guideId);
    await db.collection('guide_rating_stats').doc(guideId).set({
      ...stats,
      updatedAt: new Date(),
    }, { merge: true });
    setGuideStatsCache(guideId, stats);
    
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
