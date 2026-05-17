import { Request, Response } from 'express';
import { AvailabilityService } from '../services/availability.service';

// Establecer disponibilidad del guía
export const setGuideAvailability = async (req: Request, res: Response) => {
  try {
    const { guideId, fecha, horasDisponibles, maxReservasPorHora } = req.body;
    const authUid = (req as any).user?.uid as string | undefined;
    const targetGuideId = authUid ?? guideId;

    // Validaciones
    if (!targetGuideId || !fecha || !horasDisponibles || !Array.isArray(horasDisponibles)) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos o formato inválido',
      });
    }

    if (!authUid) {
      return res.status(403).json({
        success: false,
        message: 'Solo el guía autenticado puede establecer su disponibilidad',
      });
    }

    if (guideId && guideId !== authUid) {
      return res.status(403).json({
        success: false,
        message: 'No puedes establecer disponibilidad para otro guía',
      });
    }

    // Validar formato de fecha (YYYY-MM-DD)
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fecha)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha inválido. Use YYYY-MM-DD',
      });
    }

    // Validar horarios
    for (const slot of horasDisponibles) {
      if (!slot.horaInicio || !slot.horaFin) {
        return res.status(400).json({
          success: false,
          message: 'Cada horario debe tener horaInicio y horaFin',
        });
      }
    }

    const availability = await AvailabilityService.setGuideAvailability({
      guideId: targetGuideId,
      fecha,
      horasDisponibles,
      maxReservasPorHora,
    });

    res.status(201).json({
      success: true,
      message: 'Disponibilidad establecida exitosamente',
      availability,
    });
  } catch (error: any) {
    console.error('Error al establecer disponibilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al establecer disponibilidad' ,
    });
  }
};

// Obtener disponibilidad del guía para una fecha específica
export const getGuideAvailabilityByDate = async (req: Request, res: Response) => {
  try {
    const { guideId, fecha } = req.params;

    if (!guideId || Array.isArray(guideId) || !fecha || Array.isArray(fecha)) {
      return res.status(400).json({
        success: false,
        message: 'guideId y fecha son requeridos',
      });
    }

    const availability = await AvailabilityService.getGuideAvailability(guideId, fecha);

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró disponibilidad para esa fecha',
      });
    }

    res.status(200).json({
      success: true,
      availability,
    });
  } catch (error: any) {
    console.error('Error al obtener disponibilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener disponibilidad' ,
    });
  }
};

// Obtener todas las disponibilidades del guía
export const getGuideAvailabilities = async (req: Request, res: Response) => {
  try {
    const { guideId } = req.params;
    const { desde } = req.query;

    if (!guideId || Array.isArray(guideId)) {
      return res.status(400).json({
        success: false,
        message: 'guideId es requerido',
      });
    }

    const availabilities = await AvailabilityService.getGuideAvailabilities(
      guideId,
      desde as string
    );

    res.status(200).json({
      success: true,
      availabilities,
      total: availabilities.length,
    });
  } catch (error: any) {
    console.error('Error al obtener disponibilidades:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener disponibilidades' ,
    });
  }
};

// Eliminar disponibilidad
export const deleteAvailability = async (req: Request, res: Response) => {
  try {
    const { availabilityId } = req.params;
    const authUid = (req as any).user?.uid as string | undefined;

    if (!availabilityId || Array.isArray(availabilityId)) {
      return res.status(400).json({
        success: false,
        message: 'availabilityId es requerido',
      });
    }

    if (!authUid) {
      return res.status(403).json({
        success: false,
        message: 'Solo el guía autenticado puede eliminar disponibilidad',
      });
    }

    const availability = await AvailabilityService.getAvailabilityById(availabilityId);

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Disponibilidad no encontrada',
      });
    }

    if (availability.guideId !== authUid) {
      return res.status(403).json({
        success: false,
        message: 'No puedes eliminar disponibilidad de otro guía',
      });
    }

    await AvailabilityService.deleteAvailability(availabilityId);

    res.status(200).json({
      success: true,
      message: 'Disponibilidad eliminada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al eliminar disponibilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar disponibilidad' ,
    });
  }
};

// Verificar si un horario está disponible
export const checkTimeSlotAvailability = async (req: Request, res: Response) => {
  try {
    const { guideId, fecha, horaInicio } = req.query;

    if (!guideId || !fecha || !horaInicio) {
      return res.status(400).json({
        success: false,
        message: 'guideId, fecha y horaInicio son requeridos',
      });
    }

    const isAvailable = await AvailabilityService.isTimeSlotAvailable(
      guideId as string,
      fecha as string,
      horaInicio as string
    );

    res.status(200).json({
      success: true,
      isAvailable,
    });
  } catch (error: any) {
    console.error('Error al verificar disponibilidad de horario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar disponibilidad' ,
    });
  }
};
