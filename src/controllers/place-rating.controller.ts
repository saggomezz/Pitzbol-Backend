import { Request, Response } from 'express';
import { db } from '../config/firebase';

/**
 * Normalizar nombre de lugar para usar como ID
 */
function normalizePlaceName(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * POST /api/place-ratings/rate
 * Crear o actualizar calificación de un lugar
 */
export const ratePlaceController = async (req: Request, res: Response) => {
  try {
    const { placeName, rating } = req.body;
    const userId = (req as any).user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
    }

    if (!placeName || !rating) {
      return res.status(400).json({
        success: false,
        message: 'placeName y rating son requeridos',
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'La calificación debe ser entre 1 y 5 estrellas',
      });
    }

    const placeId = normalizePlaceName(placeName);

    // Verificar si el usuario ya calificó este lugar
    const existingRatingQuery = await db
      .collection('place_ratings')
      .where('placeId', '==', placeId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    const timestamp = new Date().toISOString();

    if (!existingRatingQuery.empty && existingRatingQuery.docs.length > 0) {
      // Actualizar calificación existente
      const firstDoc = existingRatingQuery.docs[0]!; // length > 0 garantiza que existe
      await firstDoc.ref.update({
        rating,
        updatedAt: timestamp,
      });

      console.log(`✅ Calificación actualizada: ${placeName} por usuario ${userId}`);
    } else {
      // Crear nueva calificación
      await db.collection('place_ratings').add({
        placeId,
        placeName,
        userId,
        rating,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      console.log(`✅ Nueva calificación: ${placeName} por usuario ${userId} - ${rating} estrellas`);
    }

    // Recalcular estadísticas del lugar
    await recalculatePlaceStats(placeId, placeName);

    // Obtener estadísticas actualizadas
    const stats = await getPlaceStatsFromDB(placeId);

    return res.status(200).json({
      success: true,
      message: existingRatingQuery.empty ? 'Calificación agregada' : 'Calificación actualizada',
      stats,
    });
  } catch (error: any) {
    console.error('Error al calificar lugar:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar calificación',
      error: error.message,
    });
  }
};

/**
 * GET /api/place-ratings/:placeName
 * Obtener calificación de un usuario para un lugar específico
 */
export const getUserPlaceRatingController = async (req: Request, res: Response) => {
  try {
    const { placeName } = req.params;
    const userId = (req as any).user?.uid;

    // Validar placeName y userId
    if (!placeName || typeof placeName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Nombre de lugar inválido',
      });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
    }

    // Después de las validaciones, usamos ! para asegurar a TypeScript que no son undefined
    const placeId = normalizePlaceName(placeName!);

    const ratingQuery = await db
      .collection('place_ratings')
      .where('placeId', '==', placeId)
      .where('userId', '==', userId!)
      .limit(1)
      .get();

    if (ratingQuery.empty || ratingQuery.docs.length === 0) {
      return res.status(200).json({
        success: true,
        userRating: null,
      });
    }

    const ratingDoc = ratingQuery.docs[0]?.data();

    return res.status(200).json({
      success: true,
      userRating: ratingDoc?.rating || null,
    });
  } catch (error: any) {
    console.error('Error al obtener calificación del usuario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener calificación',
      error: error.message,
    });
  }
};

/**
 * GET /api/place-ratings/:placeName/stats
 * Obtener estadísticas de calificación de un lugar
 */
export const getPlaceStatsController = async (req: Request, res: Response) => {
  try {
    const { placeName } = req.params;

    // Validar placeName
    if (!placeName || typeof placeName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Nombre de lugar inválido',
      });
    }

    // Después de la validación, usamos ! para asegurar a TypeScript
    const placeId = normalizePlaceName(placeName!);

    const stats = await getPlaceStatsFromDB(placeId);

    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Error al obtener estadísticas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message,
    });
  }
};

/**
 * POST /api/place-ratings/:placeName/view
 * Incrementar el contador de vistas de un lugar
 */
export const incrementPlaceViewsController = async (req: Request, res: Response) => {
  try {
    const { placeName } = req.params;

    // Validar placeName
    if (!placeName || typeof placeName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Nombre de lugar inválido',
      });
    }

    // Después de la validación, usamos ! para asegurar a TypeScript
    const placeId = normalizePlaceName(placeName!);

    const placeRef = db.collection('lugares').doc(placeId);
    const placeDoc = await placeRef.get();

    if (!placeDoc.exists) {
      // Crear documento si no existe
      await placeRef.set({
        nombre: placeName,
        views: 1,
        createdAt: new Date().toISOString(),
      });
    } else {
      const currentViews = placeDoc.data()?.views || 0;
      await placeRef.update({
        views: currentViews + 1,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vista registrada',
    });
  } catch (error: any) {
    console.error('Error al incrementar vistas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar vista',
      error: error.message,
    });
  }
};

/**
 * Recalcular estadísticas de rating de un lugar
 */
async function recalculatePlaceStats(placeId: string, placeName: string) {
  try {
    const ratingsSnapshot = await db
      .collection('place_ratings')
      .where('placeId', '==', placeId)
      .get();

    const totalRatings = ratingsSnapshot.size;
    
    if (totalRatings === 0) {
      return;
    }

    let sumRatings = 0;
    ratingsSnapshot.docs.forEach(doc => {
      sumRatings += doc.data().rating;
    });

    const averageRating = sumRatings / totalRatings;

    // Actualizar en la colección de lugares
    const placeRef = db.collection('lugares').doc(placeId);
    const placeDoc = await placeRef.get();

    if (!placeDoc.exists) {
      // Crear documento si no existe
      await placeRef.set({
        nombre: placeName,
        averageRating,
        totalRatings,
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      await placeRef.update({
        averageRating,
        totalRatings,
        updatedAt: new Date().toISOString(),
      });
    }

    console.log(`✅ Estadísticas actualizadas para ${placeName}: ${averageRating.toFixed(1)} (${totalRatings} ratings)`);
  } catch (error) {
    console.error('Error recalculando estadísticas:', error);
  }
}

/**
 * Obtener estadísticas de un lugar desde la DB
 */
async function getPlaceStatsFromDB(placeId: string) {
  const placeDoc = await db.collection('lugares').doc(placeId).get();

  if (!placeDoc.exists) {
    return {
      averageRating: 0,
      totalRatings: 0,
      views: 0,
    };
  }

  const data = placeDoc.data();
  return {
    averageRating: data?.averageRating || 0,
    totalRatings: data?.totalRatings || 0,
    views: data?.views || 0,
  };
}
