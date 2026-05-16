/**
 * Utilidades de validación geográfica para Pitzbol
 * Protege contra inputs inválidos, valores extremos y DDoS en geonavegación
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Validar coordenadas (latitud y longitud dentro de rango)
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !isNaN(lat) &&
    !isNaN(lng)
  );
}

/**
 * Validar que el radio está dentro de límites operativos
 * Máximo 50 km para evitar consultas masivas
 */
export function isValidRadius(radiusKm: number): boolean {
  return (
    typeof radiusKm === 'number' &&
    radiusKm > 0 &&
    radiusKm <= 50 &&
    !isNaN(radiusKm)
  );
}

/**
 * Validar rango de hora (0-23) para factor de tráfico
 */
export function isValidHour(hour: number): boolean {
  return (
    typeof hour === 'number' &&
    hour >= 0 &&
    hour < 24 &&
    Number.isInteger(hour)
  );
}

/**
 * Validar modo de transporte conocido
 */
export const VALID_TRANSPORT_MODES = ['driving', 'walking', 'cycling', 'transit-like', 'rideshare-like'] as const;
export type TransportMode = typeof VALID_TRANSPORT_MODES[number];

export function isValidTransportMode(mode: unknown): mode is TransportMode {
  return VALID_TRANSPORT_MODES.includes(mode as TransportMode);
}

/**
 * Parsear y validar coordenadas desde body request
 * Devuelve null si inválido (nunca tira excepción)
 */
export function parseGeoPoint(lat: unknown, lng: unknown): GeoPoint | null {
  try {
    const parsedLat = typeof lat === 'string' ? parseFloat(lat) : lat;
    const parsedLng = typeof lng === 'string' ? parseFloat(lng) : lng;

    if (isValidCoordinate(parsedLat as number, parsedLng as number)) {
      return { lat: parsedLat as number, lng: parsedLng as number };
    }
  } catch {
    // Ignorar
  }
  return null;
}

/**
 * Calcular distancia Haversine entre dos puntos (km)
 */
export function calculateDistance(point1: GeoPoint, point2: GeoPoint): number {
  const R = 6371; // Radio Tierra en km
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Validar que un punto está dentro de un radio desde el centro
 */
export function isWithinRadius(
  center: GeoPoint,
  point: GeoPoint,
  radiusKm: number
): boolean {
  const distance = calculateDistance(center, point);
  return distance <= radiusKm;
}

/**
 * Validar que waypoints no superan límite
 */
export function isValidWaypoints(waypoints: unknown[]): boolean {
  return (
    Array.isArray(waypoints) &&
    waypoints.length <= 20 && // Máximo 20 waypoints
    waypoints.every(
      (wp) =>
        typeof wp === 'object' &&
        wp !== null &&
        'lat' in wp &&
        'lng' in wp &&
        isValidCoordinate((wp as any).lat, (wp as any).lng)
    )
  );
}

/**
 * Sanitizar string de categoría (máximo 100 chars, sin caracteres peligrosos)
 */
export function sanitizeCategory(category: unknown): string | null {
  if (typeof category !== 'string') return null;

  const sanitized = category
    .trim()
    .substring(0, 100)
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-]/g, '');

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Calcular factor de tráfico por hora (1.0 = normal, >1.0 = congestion)
 * Basado en patrones típicos de GDL
 */
export function getTrafficFactor(hour: number): number {
  if (!isValidHour(hour)) return 1.0;

  // Hora punta matutina: 7-9 AM (factor 1.8)
  if (hour >= 7 && hour < 9) return 1.8;
  
  // Hora punta vespertina: 5-8 PM (factor 2.2)
  if (hour >= 17 && hour < 20) return 2.2;
  
  // Tarde baja: 2-5 PM (factor 1.3)
  if (hour >= 14 && hour < 17) return 1.3;
  
  // Madrugada/baja: otro (factor 1.0)
  return 1.0;
}

/**
 * Calcular ETA en minutos ajustada por tráfico
 * @param distanceKm distancia en km
 * @param mode modo de transporte
 * @param hour hora del día (0-23)
 */
export function calculateETA(
  distanceKm: number,
  mode: TransportMode,
  hour: number
): number {
  if (distanceKm <= 0) return 0;

  // Velocidades base por modo (km/h) sin tráfico
  const baseSpeeds: Record<TransportMode, number> = {
    driving: 30, // GDL urbano promedio
    walking: 5,
    cycling: 15,
    'transit-like': 20, // Aproximado transporte público
    'rideshare-like': 25, // Uber/DiDi aproximado
  };

  const baseSpeed = baseSpeeds[mode];
  const baseDurationHours = distanceKm / baseSpeed;

  // Aplicar factor de tráfico (solo para driving y rideshare)
  let finalSpeed = baseSpeed;
  if ((mode === 'driving' || mode === 'rideshare-like') && isValidHour(hour)) {
    const factor = getTrafficFactor(hour);
    finalSpeed = baseSpeed / factor;
  }

  const finalDurationHours = distanceKm / finalSpeed;
  return Math.ceil(finalDurationHours * 60); // Convertir a minutos, redondear arriba
}
