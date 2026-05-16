/**
 * Middleware para validación de inputs geográficos en requests
 * Rechaza requests con datos inválidos antes de procesamiento costoso
 */

import { Request, Response, NextFunction } from 'express';
import { 
  isValidCoordinate, 
  isValidRadius, 
  isValidWaypoints,
  parseGeoPoint,
  isValidTransportMode,
  isValidHour 
} from '../utils/geoValidation';

/**
 * Middleware para validar entrada de coordinates (lat/lng en body)
 */
export const validateGeoCoordinates = (req: Request, res: Response, next: NextFunction) => {
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({
      success: false,
      msg: 'Latitud y longitud son requeridas en body'
    });
  }

  if (!isValidCoordinate(parseFloat(lat), parseFloat(lng))) {
    return res.status(400).json({
      success: false,
      msg: 'Coordenadas inválidas. Latitud debe estar entre -90 y 90, longitud entre -180 y 180.'
    });
  }

  next();
};

/**
 * Middleware para validar radius en búsquedas geográficas
 */
export const validateGeoRadius = (req: Request, res: Response, next: NextFunction) => {
  const { radiusKm } = req.body || req.query;

  if (radiusKm === undefined) {
    return res.status(400).json({
      success: false,
      msg: 'radiusKm es requerido'
    });
  }

  const radius = typeof radiusKm === 'string' ? parseFloat(radiusKm) : radiusKm;

  if (!isValidRadius(radius)) {
    return res.status(400).json({
      success: false,
      msg: 'radiusKm debe estar entre 0 y 50 km'
    });
  }

  next();
};

/**
 * Middleware para validar modo de transporte
 */
export const validateTransportMode = (req: Request, res: Response, next: NextFunction) => {
  const { mode } = req.body || req.query;

  if (mode === undefined) {
    return res.status(400).json({
      success: false,
      msg: 'mode es requerido'
    });
  }

  if (!isValidTransportMode(mode)) {
    return res.status(400).json({
      success: false,
      msg: `mode debe ser uno de: driving, walking, cycling, transit-like, rideshare-like`
    });
  }

  next();
};

/**
 * Middleware para validar hour (para cálculo de tráfico)
 */
export const validateHour = (req: Request, res: Response, next: NextFunction) => {
  const { hour } = req.body || req.query;

  if (hour !== undefined && !isValidHour(parseInt(hour))) {
    return res.status(400).json({
      success: false,
      msg: 'hour debe ser un número entero entre 0 y 23'
    });
  }

  next();
};

/**
 * Middleware para validar waypoints (si existen)
 */
export const validateWaypoints = (req: Request, res: Response, next: NextFunction) => {
  const { waypoints } = req.body;

  if (waypoints && !isValidWaypoints(waypoints)) {
    return res.status(400).json({
      success: false,
      msg: 'Waypoints inválidos. Máximo 20 puntos, cada uno con lat/lng válidos.'
    });
  }

  next();
};

/**
 * Middleware para sanitizar nombres/categorías
 */
export const sanitizeStrings = (req: Request, res: Response, next: NextFunction) => {
  // Limite de caracteres para strings peligrosos
  const MAX_STRING_LEN = 500;

  // Revisar parámetros de URL
  Object.keys(req.params).forEach((key) => {
    if (typeof req.params[key] === 'string' && req.params[key].length > MAX_STRING_LEN) {
      return res.status(400).json({
        success: false,
        msg: `Parámetro ${key} demasiado largo`
      });
    }
  });

  // Revisar body
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string' && req.body[key].length > MAX_STRING_LEN) {
        return res.status(400).json({
          success: false,
          msg: `Campo ${key} demasiado largo (máximo ${MAX_STRING_LEN} caracteres)`
        });
      }
    });
  }

  next();
};
