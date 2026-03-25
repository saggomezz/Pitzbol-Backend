import { Request, Response } from 'express';
import { RatingService } from '../services/rating.service';

// Crear una calificación
export const createRating = async (req: Request, res: Response) => {
  try {
    const { bookingId, guideId, touristId, estrellas, comentario } = req.body;

    // Validaciones
    if (!bookingId || !guideId || !touristId || !estrellas) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos',
      });
    }

    if (estrellas < 1 || estrellas > 5) {
      return res.status(400).json({
        success: false,
        message: 'La calificación debe ser entre 1 y 5 estrellas',
      });
    }

    // Verificar si puede calificar
    const canRate = await RatingService.canRateBooking(bookingId, touristId);
    if (!canRate) {
      return res.status(403).json({
        success: false,
        message: 'No puedes calificar este tour. Verifica que esté completado y no lo hayas calificado antes.',
      });
    }

    const rating = await RatingService.createRating({
      bookingId,
      guideId,
      touristId,
      estrellas,
      comentario,
    });

    res.status(201).json({
      success: true,
      message: 'Calificación creada exitosamente',
      rating,
    });
  } catch (error: any) {
    console.error('Error al crear calificación:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear calificación',
    });
  }
};

// Obtener calificaciones de un guía
export const getGuideRatings = async (req: Request, res: Response) => {
  try {
    const { guideId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    if (!guideId || Array.isArray(guideId)) {
      return res.status(400).json({
        success: false,
        message: 'guideId es requerido',
      });
    }

    const ratings = await RatingService.getGuideRatings(guideId, limit);

    res.status(200).json({
      success: true,
      ratings,
      total: ratings.length,
    });
  } catch (error: any) {
    console.error('Error al obtener calificaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener calificaciones',
      error: error.message,
    });
  }
};

// Obtener estadísticas de calificación de un guía
export const getGuideRatingStats = async (req: Request, res: Response) => {
  try {
    const { guideId } = req.params;

    if (!guideId || Array.isArray(guideId)) {
      return res.status(400).json({
        success: false,
        message: 'guideId es requerido',
      });
    }

    const stats = await RatingService.getGuideRatingStats(guideId);

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message,
    });
  }
};

// Verificar si puede calificar una reserva
export const checkCanRate = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const touristId = req.query.touristId as string;

    if (!bookingId || Array.isArray(bookingId) || !touristId) {
      return res.status(400).json({
        success: false,
        message: 'bookingId y touristId son requeridos',
      });
    }

    const canRate = await RatingService.canRateBooking(bookingId, touristId);

    res.status(200).json({
      success: true,
      canRate,
    });
  } catch (error: any) {
    console.error('Error al verificar calificación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar calificación',
      error: error.message,
    });
  }
};

// Obtener calificación por reserva
export const getRatingByBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'bookingId es requerido',
      });
    }

    const rating = await RatingService.getRatingByBooking(bookingId);

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró calificación para esta reserva',
      });
    }

    res.status(200).json({
      success: true,
      rating,
    });
  } catch (error: any) {
    console.error('Error al obtener calificación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener calificación',
      error: error.message,
    });
  }
};
