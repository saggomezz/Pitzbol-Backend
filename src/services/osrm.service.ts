/**
 * Servicio de integración con OSRM (Open Source Routing Machine)
 * Servidor público: https://router.project-osrm.org/
 * Devuelve geometría de ruta, distancia, duración e instrucciones paso a paso
 */

import { GeoPoint, calculateETA, TransportMode } from '../utils/geoValidation';

export interface OSRMRoute {
  geometry: string; // Polyline codificado
  distance: number; // metros
  duration: number; // segundos
  legs: OSRMLeg[];
}

export interface OSRMLeg {
  distance: number;
  duration: number;
  steps: OSRMStep[];
}

export interface OSRMStep {
  distance: number;
  duration: number;
  name: string;
  instruction: string;
  maneuver?: {
    type: string;
    modifier?: string;
    bearing_before?: number;
    bearing_after?: number;
    location?: [number, number];
  };
}

export interface RouteOption {
  geometry: any; // GeoJSON LineString
  distance: number; // km
  duration: number; // minutos
  durationWithTraffic?: number;
  steps: RoutingStep[];
  polyline?: string; // JSON.stringify([[lng, lat], ...])
}

export interface RoutingResponse {
  success: boolean;
  route?: RouteOption; // Primera ruta (compat)
  routes?: RouteOption[]; // Todas las alternativas
  error?: string;
  fallback?: boolean;
}

export interface RoutingStep {
  distance: number; // km
  duration: number; // minutos
  instruction: string;
  road?: string;
  maneuver?: string;
  location?: [number, number]; // [lng, lat] — coords where this maneuver occurs
}

// URL base de OSRM público
const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

/** Mapear modo de la app al perfil OSRM soportado */
function toOSRMProfile(mode: TransportMode): string {
  if (mode === 'walking') return 'walking';
  if (mode === 'cycling') return 'cycling';
  return 'driving'; // driving, transit-like, rideshare-like
}

/** Convertir un objeto ruta de OSRM a RouteOption */
function processOSRMRoute(
  osrmRoute: any,
  mode: TransportMode,
  departureHour?: number
): RouteOption {
  const distanceKm = osrmRoute.distance / 1000;
  const durationMinutes = Math.ceil(osrmRoute.duration / 60);
  let durationWithTraffic = durationMinutes;
  if (departureHour !== undefined) {
    durationWithTraffic = calculateETA(distanceKm, mode, departureHour);
  }
  const steps: RoutingStep[] = [];
  if (osrmRoute.legs?.length) {
    for (const leg of osrmRoute.legs) {
      if (leg.steps) {
        for (const step of leg.steps) {
          steps.push({
            distance: step.distance / 1000,
            duration: Math.ceil(step.duration / 60),
            instruction: parseInstruction(step),
            road: step.name || 'Vía desconocida',
            maneuver: step.maneuver?.type || undefined,
            location: step.maneuver?.location || undefined
          });
        }
      }
    }
  }
  return {
    geometry: osrmRoute.geometry,
    distance: distanceKm,
    duration: durationMinutes,
    durationWithTraffic,
    steps,
    polyline: encodeGeoJSONToPolyline(osrmRoute.geometry)
  };
}

// Timeouts y configuración
const OSRM_TIMEOUT_MS = 10000; // 10s timeout
const MAX_WAYPOINTS = 20;
const MAX_RETRIES = 2;

/**
 * Llamar a OSRM con reintentos y timeout
 */
async function callOSRM(
  url: string,
  retries: number = MAX_RETRIES
): Promise<any> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Pitzbol-Navigation/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OSRM HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`[OSRM] Reintentando... (${retries} reintentos restantes)`);
      await new Promise(r => setTimeout(r, 500)); // Esperar 500ms antes de reintentar
      return callOSRM(url, retries - 1);
    }
    throw error;
  }
}

/**
 * Obtener ruta entre origen y destino (sin waypoints)
 */
export async function getRoute(
  origin: GeoPoint,
  destination: GeoPoint,
  mode: TransportMode = 'driving',
  departureHour?: number
): Promise<RoutingResponse> {
  try {
    const osrmProfile = toOSRMProfile(mode);
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `${OSRM_BASE}/${osrmProfile}/${coords}?geometries=geojson&steps=true&alternatives=3`;

    console.log(`[OSRM] Consultando ruta (${osrmProfile}): ${url}`);

    const data = await callOSRM(url);

    if (data.code !== 'Ok') {
      console.warn(`[OSRM] Respuesta no OK: ${data.code}`);
      return { success: false, error: data.message || 'Error en OSRM', fallback: true };
    }

    if (!data.routes || data.routes.length === 0) {
      return { success: false, error: 'No se encontró ruta', fallback: true };
    }

    const routes: RouteOption[] = data.routes.map((r: any) => processOSRMRoute(r, mode, departureHour));

    return { success: true, route: routes[0]!, routes };
  } catch (error: any) {
    console.error('[OSRM] Error obteniendo ruta:', error.message);
    return { success: false, error: error.message || 'Error al consultar OSRM', fallback: true };
  }
}

/**
 * Obtener ruta con múltiples waypoints
 */
export async function getRouteWithWaypoints(
  origin: GeoPoint,
  destination: GeoPoint,
  waypoints: GeoPoint[],
  mode: TransportMode = 'driving',
  departureHour?: number
): Promise<RoutingResponse> {
  if (waypoints.length > MAX_WAYPOINTS - 2) {
    return {
      success: false,
      error: `Máximo ${MAX_WAYPOINTS - 2} waypoints permitidos`,
      fallback: true
    };
  }

  try {
    const osrmProfile = toOSRMProfile(mode);
    const allPoints = [origin, ...waypoints, destination];
    const coords = allPoints.map(p => `${p.lng},${p.lat}`).join(';');

    const url = `${OSRM_BASE}/${osrmProfile}/${coords}?geometries=geojson&steps=true&alternatives=3`;

    console.log(`[OSRM] Consultando ruta con ${waypoints.length} waypoints (${osrmProfile})`);

    const data = await callOSRM(url);

    if (data.code !== 'Ok') {
      return { success: false, error: data.message || 'Error en OSRM', fallback: true };
    }

    if (!data.routes || data.routes.length === 0) {
      return { success: false, error: 'No se encontró ruta', fallback: true };
    }

    const routes: RouteOption[] = data.routes.map((r: any) => processOSRMRoute(r, mode, departureHour));
    return { success: true, route: routes[0]!, routes };
  } catch (error: any) {
    console.error('[OSRM] Error con waypoints:', error.message);
    return { success: false, error: error.message || 'Error al consultar OSRM', fallback: true };
  }
}

/**
 * Parsear instrucción de OSRM a texto legible en español
 */
function parseInstruction(step: OSRMStep): string {
  const maneuver = step.maneuver?.type;
  const modifier = step.maneuver?.modifier;
  const name = step.name || 'vía desconocida';
  const distance = Math.round(step.distance);

  const directionMap: Record<string, string> = {
    'straight': 'continúa recto',
    'left': 'gira a la izquierda',
    'right': 'gira a la derecha',
    'sharp left': 'gira fuertemente a la izquierda',
    'sharp right': 'gira fuertemente a la derecha',
    'slight left': 'tuerce suavemente a la izquierda',
    'slight right': 'tuerce suavemente a la derecha',
    'uturn': 'haz un giro de retorno'
  };

  let direction = 'continúa';
  if (maneuver && modifier) {
    direction = directionMap[`${maneuver} ${modifier}`] || directionMap[maneuver] || direction;
  } else if (maneuver) {
    direction = directionMap[maneuver] || direction;
  }

  return `${direction} en ${name} por ${distance}m`;
}

/**
 * Convertir geometría GeoJSON a polilínea codificada (compatible con Leaflet)
 */
function encodeGeoJSONToPolyline(geometry: any): string {
  // Si geometry es string, parsearlo
  if (typeof geometry === 'string') {
    geometry = JSON.parse(geometry);
  }

  if (!geometry || geometry.type !== 'LineString' || !geometry.coordinates) {
    return '';
  }

  // Aquí simplificado: devolver JSON stringified
  // En producción, usar librería polyline para encoding real
  return JSON.stringify(geometry.coordinates);
}
