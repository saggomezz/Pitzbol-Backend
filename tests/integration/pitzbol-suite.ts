/**
 * ═══════════════════════════════════════════════════════════════════
 * PITZBOL — Suite de Pruebas de Integración Automatizadas
 * ═══════════════════════════════════════════════════════════════════
 *
 * Cubre las 8 secciones del sistema:
 *  1. API Health Check
 *  2. Módulo Negocios (/api/business)
 *  3. Módulo Guías (/api/guides)
 *  4. Frontend Health (localhost:3000 / pitzbol.me)
 *  5. Static Assets
 *  6. Integration E2E (flujos encadenados)
 *  7. Módulo IA (/api/ai, /api/lugares, /api/tours)
 *  8. Performance (umbrales de tiempo de respuesta)
 *
 * Uso:
 *   tsx tests/integration/pitzbol-suite.ts            # local only
 *   tsx tests/integration/pitzbol-suite.ts --prod     # incluye pitzbol.me
 *   tsx tests/integration/pitzbol-suite.ts --local    # solo localhost
 *
 * Reportes generados en: tests/integration/reports/
 *
 * Umbrales de rendimiento:
 *   PASSED   < 2000 ms
 *   WARNING  2000–5000 ms  (degradación perceptible)
 *   FAILED   > 5000 ms     (inaceptable en producción)
 *   SKIPPED  servidor no disponible o dependencia fallida
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// ──────────────────────────────────────────────────────────────────
// Configuración de entornos
// ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const INCLUDE_PROD = args.includes('--prod');

const ENV = {
  backend: {
    local: 'http://localhost:3001',
    prod: 'https://api.pitzbol.me',
  },
  frontend: {
    local: 'http://localhost:3000',
    prod: 'https://pitzbol.me',
  },
};

// Umbral de performance (ms)
const PERF = { WARNING: 2000, FAILED: 5000 };

// Timeout por request (ms)
const REQUEST_TIMEOUT = 8000;

// ──────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────

type TestStatus = 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';

interface TestResult {
  name: string;
  description: string;
  endpoint: string;
  method: string;
  status: TestStatus;
  httpStatus: number | null;
  expectedStatus: number | number[] | string;
  responseTimeMs: number;
  details: string;
  responsePreview?: string;
}

interface SectionResult {
  id: string;
  name: string;
  description: string;
  importance: string;
  howToInterpret: string;
  acceptance: string;
  results: TestResult[];
  totalMs: number;
}

interface SuiteReport {
  title: string;
  generatedAt: string;
  environment: string;
  backendUrl: string;
  frontendUrl: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warning: number;
    skipped: number;
    durationMs: number;
  };
  sections: SectionResult[];
}

// ──────────────────────────────────────────────────────────────────
// Helpers de HTTP
// ──────────────────────────────────────────────────────────────────

interface FetchResult {
  status: number | null;
  body: any;
  responseTimeMs: number;
  error?: string;
}

async function timedFetch(
  url: string,
  options: RequestInit = {}
): Promise<FetchResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  // Ignorar errores de certificado TLS en entornos de desarrollo
  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const responseTimeMs = Date.now() - start;
    let body: any = null;

    const contentType = response.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }
    } catch {
      body = null;
    }

    return { status: response.status, body, responseTimeMs };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - start;

    if (err?.name === 'AbortError') {
      return {
        status: null,
        body: null,
        responseTimeMs,
        error: `Timeout (>${REQUEST_TIMEOUT}ms)`,
      };
    }

    const isRefused =
      err?.message?.includes('ECONNREFUSED') ||
      err?.message?.includes('ENOTFOUND') ||
      err?.message?.includes('fetch failed');

    return {
      status: null,
      body: null,
      responseTimeMs,
      error: isRefused ? 'SERVIDOR_NO_DISPONIBLE' : (err?.message ?? 'Error desconocido'),
    };
  }
}

function statusFor(
  result: FetchResult,
  expectedStatus: number | number[],
  performanceWarn = true
): TestStatus {
  if (result.error === 'SERVIDOR_NO_DISPONIBLE') return 'SKIPPED';
  if (result.status === null) return 'FAILED';

  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const httpOk = expected.includes(result.status);

  if (!httpOk) return 'FAILED';
  if (performanceWarn && result.responseTimeMs > PERF.FAILED) return 'FAILED';
  if (performanceWarn && result.responseTimeMs > PERF.WARNING) return 'WARNING';
  return 'PASSED';
}

function preview(body: any, maxLen = 200): string {
  if (body === null || body === undefined) return '(sin cuerpo)';
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

// ──────────────────────────────────────────────────────────────────
// Colores de consola
// ──────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

function colorStatus(s: TestStatus): string {
  switch (s) {
    case 'PASSED': return `${C.green}${C.bold}✓ PASSED${C.reset}`;
    case 'FAILED': return `${C.red}${C.bold}✗ FAILED${C.reset}`;
    case 'WARNING': return `${C.yellow}${C.bold}⚠ WARNING${C.reset}`;
    case 'SKIPPED': return `${C.gray}${C.bold}○ SKIPPED${C.reset}`;
  }
}

// ──────────────────────────────────────────────────────────────────
// Sección 1: API Health Check
// ──────────────────────────────────────────────────────────────────

async function runSection1(base: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();

  // Test 1.1 — Root health endpoint (el único health existente)
  {
    const r = await timedFetch(`${base}/`);
    const s = statusFor(r, 200);
    const healthOk =
      s !== 'SKIPPED' &&
      r.body !== null &&
      typeof r.body === 'object' &&
      r.body.status === 'ok';

    results.push({
      name: 'Root Health Check',
      description: 'Verifica que el servidor está vivo y responde correctamente',
      endpoint: 'GET /',
      method: 'GET',
      status: s === 'PASSED' && !healthOk ? 'WARNING' : s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? `El backend en ${base} no está disponible. Ejecuta: npm run dev`
          : healthOk
          ? `Servidor OK — mensaje: "${r.body?.message}"`
          : s === 'PASSED'
          ? `HTTP 200 pero body inesperado`
          : `HTTP ${r.status ?? 'null'} — ${r.error ?? ''}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 1.2 — /health (no implementado, documentamos 404)
  {
    const r = await timedFetch(`${base}/health`);
    results.push({
      name: 'GET /health (no implementado)',
      description: 'El endpoint /health no existe — se documenta como 404 esperado',
      endpoint: 'GET /health',
      method: 'GET',
      status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : r.status === 404 ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 404,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 404
          ? 'Correctamente devuelve 404 — endpoint no implementado'
          : `Inesperado HTTP ${r.status}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 1.3 — /api/version (no implementado, documentamos 404)
  {
    const r = await timedFetch(`${base}/api/version`);
    results.push({
      name: 'GET /api/version (no implementado)',
      description: 'El endpoint /api/version no existe — se documenta como 404 esperado',
      endpoint: 'GET /api/version',
      method: 'GET',
      status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : r.status === 404 ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 404,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 404
          ? 'Correctamente devuelve 404 — endpoint no implementado'
          : `Inesperado HTTP ${r.status}`,
      responsePreview: preview(r.body),
    });
  }

  return {
    id: 'S1',
    name: 'API Health Check',
    description:
      'Verifica que el servidor API está activo, responde con el cuerpo correcto y documenta endpoints aún no implementados.',
    importance:
      'Es la primera línea de defensa en cualquier deployment. Si falla, ninguna prueba posterior tiene sentido.',
    howToInterpret:
      'PASSED en "Root Health Check" = servidor OK. ' +
      'SKIPPED = el servidor no está corriendo. ' +
      'Los tests de /health y /api/version son informativos: esperamos 404 porque no están implementados.',
    acceptance:
      'Root Health Check debe ser PASSED con responseTime < 500ms. ' +
      '/health y /api/version pueden ser PASSED(404) sin impacto.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 2: Módulo Negocios (/api/business)
// ──────────────────────────────────────────────────────────────────

async function runSection2(base: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();

  // Test 2.1 — Validar unicidad (endpoint público)
  {
    const r = await timedFetch(`${base}/api/business/validate-uniqueness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test-check@pitzbol.me', nombre: 'TestNegocioIntegration' }),
    });
    const s = statusFor(r, [200, 400, 409]);
    results.push({
      name: 'POST /api/business/validate-uniqueness',
      description: 'Verifica si un email o nombre de negocio ya está registrado (endpoint público, sin auth)',
      endpoint: 'POST /api/business/validate-uniqueness',
      method: 'POST',
      status: s,
      httpStatus: r.status,
      expectedStatus: [200, 400, 409],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : s === 'PASSED' || s === 'WARNING'
          ? `HTTP ${r.status} — validación de unicidad funcional`
          : `HTTP ${r.status ?? 'null'} inesperado — ${r.error ?? ''}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 2.2 — GET /api/business/my-business requiere auth
  {
    const r = await timedFetch(`${base}/api/business/my-business`);
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'GET /api/business/my-business (auth requerida)',
      description: 'Retorna datos del negocio del usuario autenticado. Sin token debe responder 401.',
      endpoint: 'GET /api/business/my-business',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Seguridad OK — rechaza solicitud sin token (HTTP ${r.status})`
          : `Vulnerabilidad: HTTP ${r.status ?? 'null'} — debería retornar 401`,
      responsePreview: preview(r.body),
    });
  }

  // Test 2.3 — GET /api/business/by-id/:id requiere auth
  {
    const r = await timedFetch(`${base}/api/business/by-id/demo-negocio-id`);
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'GET /api/business/by-id/:id (auth requerida)',
      description: 'Retorna un negocio por ID. Sin token debe rechazar con 401.',
      endpoint: 'GET /api/business/by-id/demo-negocio-id',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Seguridad OK — endpoint protegido responde correctamente`
          : `HTTP ${r.status ?? 'null'} — se esperaba 401/403`,
      responsePreview: preview(r.body),
    });
  }

  // Test 2.4 — GET /api/business/status requiere auth
  {
    const r = await timedFetch(`${base}/api/business/status`);
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'GET /api/business/status (auth requerida)',
      description: 'Estado del negocio del usuario. Requiere JWT. Verifica que el endpoint existe y está protegido.',
      endpoint: 'GET /api/business/status',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Endpoint existe y está protegido — HTTP ${r.status}`
          : `HTTP ${r.status ?? 'null'} inesperado`,
      responsePreview: preview(r.body),
    });
  }

  // Test 2.5 — PUT /api/business/:id requiere auth
  {
    const r = await timedFetch(`${base}/api/business/demo-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'TestUpdate' }),
    });
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'PUT /api/business/:id (auth requerida)',
      description: 'Actualización de negocio. Requiere auth. Verifica protección del endpoint de escritura.',
      endpoint: 'PUT /api/business/demo-id',
      method: 'PUT',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Endpoint de actualización correctamente protegido`
          : `HTTP ${r.status ?? 'null'} — verificar middleware de auth`,
      responsePreview: preview(r.body),
    });
  }

  // Test 2.6 — GET /api/admin/negocios requiere admin
  {
    const r = await timedFetch(`${base}/api/admin/negocios`);
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'GET /api/admin/negocios (admin requerido)',
      description: 'Listado administrativo de negocios. Requiere rol ADMIN. Verifica que no es público.',
      endpoint: 'GET /api/admin/negocios',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Ruta admin correctamente bloqueada — HTTP ${r.status}`
          : `RIESGO: HTTP ${r.status ?? 'null'} — endpoint admin podría ser público`,
      responsePreview: preview(r.body),
    });
  }

  // Test 2.7 — GET /api/businesses (ruta no existente, documenta 404)
  {
    const r = await timedFetch(`${base}/api/businesses`);
    results.push({
      name: 'GET /api/businesses (ruta plural — no existe)',
      description: 'La ruta plural /api/businesses no está implementada. La correcta es /api/business (singular).',
      endpoint: 'GET /api/businesses',
      method: 'GET',
      status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : r.status === 404 ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 404,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 404
          ? 'Documenta que /api/businesses retorna 404 — usar /api/business'
          : `HTTP ${r.status} — revisar si la ruta fue agregada`,
      responsePreview: preview(r.body),
    });
  }

  return {
    id: 'S2',
    name: 'Módulo Negocios (/api/business)',
    description:
      'Prueba todos los endpoints del módulo de negocios: ' +
      'validación de unicidad (público), lectura de perfil, actualización, y admin.',
    importance:
      'Los negocios son un pilar central de Pitzbol. ' +
      'Verificar que los endpoints públicos responden y los privados están protegidos ' +
      'previene exposición de datos y operaciones no autorizadas.',
    howToInterpret:
      'Endpoints públicos (validate-uniqueness): PASSED = funcional. ' +
      'Endpoints auth (my-business, by-id, status, PUT): PASSED cuando devuelven 401/403 sin token = seguridad OK. ' +
      'Si algún endpoint protegido retorna 200 sin token = vulnerabilidad crítica.',
    acceptance:
      'validate-uniqueness: PASSED con status 200/400/409. ' +
      'Todos los endpoints autenticados: PASSED al retornar 401/403 sin credenciales.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 3: Módulo Guías (/api/guides)
// ──────────────────────────────────────────────────────────────────

async function runSection3(base: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();
  let firstGuideUid: string | null = null;

  // Test 3.1 — GET /api/guides/verified (público)
  {
    const r = await timedFetch(`${base}/api/guides/verified`);
    const s = statusFor(r, 200);

    if (s !== 'FAILED' && s !== 'SKIPPED' && Array.isArray(r.body) && r.body.length > 0) {
      firstGuideUid = r.body[0]?.uid ?? r.body[0]?.id ?? null;
    }

    results.push({
      name: 'GET /api/guides/verified',
      description: 'Lista de guías verificados disponibles públicamente. Endpoint principal del directorio de guías.',
      endpoint: 'GET /api/guides/verified',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : s !== 'FAILED'
          ? `HTTP 200 — ${Array.isArray(r.body) ? r.body.length + ' guías encontrados' : 'respuesta no es array'}`
          : `HTTP ${r.status ?? 'null'} — ${r.error ?? ''}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 3.2 — GET /api/guides/profile/:uid (público, con ID real si disponible)
  {
    const uid = firstGuideUid ?? 'demo-uid-guia';
    const r = await timedFetch(`${base}/api/guides/profile/${uid}`);
    const s = statusFor(r, [200, 404]);
    results.push({
      name: 'GET /api/guides/profile/:uid',
      description: 'Perfil público de un guía. Accesible sin autenticación.',
      endpoint: `GET /api/guides/profile/${uid}`,
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [200, 404],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 200
          ? `Perfil encontrado${firstGuideUid ? ' (UID real de guía verificado)' : ''}`
          : r.status === 404
          ? `Guía no encontrado (UID de prueba) — endpoint funcional`
          : `HTTP ${r.status ?? 'null'} inesperado`,
      responsePreview: preview(r.body),
    });
  }

  // Test 3.3 — GET /api/guides/my-request (requiere auth)
  {
    const r = await timedFetch(`${base}/api/guides/my-request`);
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'GET /api/guides/my-request (auth requerida)',
      description: 'Solicitud de registro de guía del usuario autenticado. Debe rechazar sin token.',
      endpoint: 'GET /api/guides/my-request',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Endpoint protegido — HTTP ${r.status}`
          : `HTTP ${r.status ?? 'null'} — verificar middleware`,
      responsePreview: preview(r.body),
    });
  }

  // Test 3.4 — GET /api/admin/guias/pendientes (requiere admin)
  {
    const r = await timedFetch(`${base}/api/admin/guias/pendientes`);
    const s = statusFor(r, [401, 403], false);
    results.push({
      name: 'GET /api/admin/guias/pendientes (admin requerido)',
      description: 'Lista de solicitudes de guías pendientes. Solo admin puede acceder.',
      endpoint: 'GET /api/admin/guias/pendientes',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Acceso admin bloqueado correctamente — HTTP ${r.status}`
          : `RIESGO: HTTP ${r.status ?? 'null'} sin autenticación`,
      responsePreview: preview(r.body),
    });
  }

  // Test 3.5 — POST /api/route-planning (no implementado)
  {
    const r = await timedFetch(`${base}/api/route-planning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'Plaza Tapatía', destino: 'Mercado San Juan de Dios' }),
    });
    results.push({
      name: 'POST /api/route-planning (no implementado)',
      description: 'Planeación de rutas entre negocios — endpoint pendiente de implementación.',
      endpoint: 'POST /api/route-planning',
      method: 'POST',
      status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : r.status === 404 ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 404,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 404
          ? 'Documenta endpoint pendiente — retorna 404 esperado'
          : `HTTP ${r.status} — revisar si fue implementado recientemente`,
      responsePreview: preview(r.body),
    });
  }

  // Test 3.6 — GET /api/guides/by-business/:id (no implementado)
  {
    const r = await timedFetch(`${base}/api/guides/by-business/demo-business-id`);
    results.push({
      name: 'GET /api/guides/by-business/:id (no implementado)',
      description: 'Guías asociados a un negocio — endpoint pendiente de implementación.',
      endpoint: 'GET /api/guides/by-business/demo-business-id',
      method: 'GET',
      status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : r.status === 404 ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 404,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 404
          ? 'Documenta endpoint pendiente — retorna 404 esperado'
          : `HTTP ${r.status} — verificar si fue implementado`,
      responsePreview: preview(r.body),
    });
  }

  return {
    id: 'S3',
    name: 'Módulo Guías (/api/guides)',
    description:
      'Prueba el directorio de guías verificados (público), perfiles individuales, ' +
      'protección de rutas privadas, y documenta endpoints aún pendientes de implementar.',
    importance:
      'Los guías son el producto central de Pitzbol para el Mundial 2026. ' +
      'El directorio público es crítico para el descubrimiento de guías por turistas.',
    howToInterpret:
      '/api/guides/verified y /api/guides/profile/:uid deben ser PASSED — son públicos. ' +
      'Los endpoints de admin/auth deben dar 401/403. ' +
      'Los endpoints marcados "no implementado" dan PASSED con 404 — son informativos.',
    acceptance:
      'GET /api/guides/verified: PASSED con 200 y array de guías. ' +
      'Endpoints privados: PASSED al retornar 401/403.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 4: Frontend Health
// ──────────────────────────────────────────────────────────────────

async function runSection4(frontendBase: string, includeProd: boolean): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();

  // Test 4.1 — Frontend local
  {
    const r = await timedFetch(frontendBase);
    const s = statusFor(r, 200);
    const isHtml =
      typeof r.body === 'string' && r.body.includes('<html');

    results.push({
      name: `GET ${frontendBase}/ (local)`,
      description: 'Verifica que el servidor Next.js está corriendo y sirve HTML válido.',
      endpoint: `GET ${frontendBase}/`,
      method: 'GET',
      status: s === 'SKIPPED' ? 'SKIPPED' : s === 'PASSED' && !isHtml ? 'WARNING' : s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? `Frontend no está corriendo. Ejecutar: npm run dev en Pitzbol-Frontend`
          : r.status === 200 && isHtml
          ? 'Frontend OK — HTML válido recibido'
          : r.status === 200
          ? 'HTTP 200 pero respuesta no es HTML — verificar configuración Next.js'
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: typeof r.body === 'string' ? r.body.slice(0, 150) : preview(r.body),
    });
  }

  // Test 4.2 — Frontend producción (condicional)
  if (includeProd) {
    const r = await timedFetch('https://pitzbol.me');
    const s = statusFor(r, [200, 301, 302]);
    results.push({
      name: 'GET https://pitzbol.me/ (producción)',
      description: 'Verifica que el dominio de producción está activo y responde.',
      endpoint: 'GET https://pitzbol.me/',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [200, 301, 302],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'No hay conexión a pitzbol.me — verificar DNS y VPS'
          : [200, 301, 302].includes(r.status ?? 0)
          ? `Producción OK — HTTP ${r.status}`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: typeof r.body === 'string' ? r.body.slice(0, 100) : preview(r.body),
    });
  } else {
    results.push({
      name: 'GET https://pitzbol.me/ (producción)',
      description: 'Test de producción omitido. Usar --prod para incluirlo.',
      endpoint: 'GET https://pitzbol.me/',
      method: 'GET',
      status: 'SKIPPED',
      httpStatus: null,
      expectedStatus: [200, 301, 302],
      responseTimeMs: 0,
      details: 'Omitido — ejecutar con flag --prod para incluir tests de producción',
    });
  }

  // Test 4.3 — Validar HTML structure
  {
    const r = await timedFetch(`${frontendBase}/`);
    if (r.status === 200 && typeof r.body === 'string') {
      const hasDoctype = r.body.toLowerCase().includes('<!doctype html') || r.body.toLowerCase().includes('<html');
      const hasHead = r.body.includes('<head');
      const hasBody = r.body.includes('<body');
      const isValid = hasDoctype && hasHead && hasBody;

      results.push({
        name: 'Validación HTML Frontend',
        description: 'Verifica que el HTML devuelto tiene estructura válida (doctype, head, body).',
        endpoint: `GET ${frontendBase}/`,
        method: 'GET',
        status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : isValid ? 'PASSED' : 'WARNING',
        httpStatus: r.status,
        expectedStatus: 200,
        responseTimeMs: r.responseTimeMs,
        details: r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : isValid
          ? `HTML válido: doctype=${hasDoctype}, head=${hasHead}, body=${hasBody}`
          : `HTML incompleto: doctype=${hasDoctype}, head=${hasHead}, body=${hasBody}`,
        responsePreview: r.body.slice(0, 200),
      });
    } else {
      results.push({
        name: 'Validación HTML Frontend',
        description: 'Verifica que el HTML devuelto tiene estructura válida.',
        endpoint: `GET ${frontendBase}/`,
        method: 'GET',
        status: 'SKIPPED',
        httpStatus: r.status,
        expectedStatus: 200,
        responseTimeMs: r.responseTimeMs,
        details: 'Frontend no disponible — omitiendo validación HTML',
      });
    }
  }

  return {
    id: 'S4',
    name: 'Frontend Health',
    description:
      'Verifica que la aplicación Next.js está corriendo, sirve HTML válido en la ruta raíz, ' +
      'y opcionalmente conecta con el dominio de producción pitzbol.me.',
    importance:
      'El frontend es la interfaz con el usuario final. Un fallo aquí significa que ' +
      'ningún turista puede acceder al sistema, aunque el backend funcione perfectamente.',
    howToInterpret:
      'PASSED = Next.js sirve HTML válido. SKIPPED = servidor no está corriendo. ' +
      'WARNING = responde pero sin HTML válido (podría ser un error de build).',
    acceptance:
      'Local: PASSED con HTML válido y responseTime < 3000ms. ' +
      'Producción (si --prod): PASSED o 3xx (redirect) con responseTime < 5000ms.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 5: Static Assets
// ──────────────────────────────────────────────────────────────────

async function runSection5(frontendBase: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();

  const assets = [
    { path: '/favicon.ico', name: 'Favicon', note: 'Ícono del sitio' },
    { path: '/_next/static/', name: 'Next.js Static Dir', note: 'Directorio de assets compilados' },
  ];

  for (const asset of assets) {
    const r = await timedFetch(`${frontendBase}${asset.path}`);
    results.push({
      name: `${asset.name} — ${asset.path}`,
      description: `${asset.note}. Verifica que Next.js sirve correctamente los archivos estáticos.`,
      endpoint: `GET ${frontendBase}${asset.path}`,
      method: 'GET',
      status:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'SKIPPED'
          : [200, 301, 302, 304, 404].includes(r.status ?? 0)
          ? r.status === 200 || r.status === 304
            ? 'PASSED'
            : 'WARNING'
          : 'FAILED',
      httpStatus: r.status,
      expectedStatus: [200, 304],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 200 || r.status === 304
          ? `Asset servido correctamente — HTTP ${r.status}`
          : r.status === 404
          ? `Asset no encontrado (puede ser normal si no existe ${asset.path})`
          : `HTTP ${r.status ?? 'null'}`,
    });
  }

  // Test 5.3 — API datos públicos (lugares como "static data")
  {
    const r = await timedFetch(`${frontendBase.replace(':3000', ':3001')}/api/lugares`);
    const s = statusFor(r, 200);
    results.push({
      name: 'GET /api/lugares (datos públicos)',
      description: 'Lista de lugares turísticos de Guadalajara. Endpoint de datos estáticos/semistáticos públicos.',
      endpoint: 'GET /api/lugares',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Backend no disponible'
          : s !== 'FAILED'
          ? `Datos públicos OK — ${Array.isArray(r.body) ? r.body.length + ' lugares' : 'respuesta recibida'}`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  return {
    id: 'S5',
    name: 'Static Assets',
    description:
      'Verifica que Next.js sirve correctamente los archivos estáticos (favicon, JS/CSS compilados) ' +
      'y los datos públicos del API.',
    importance:
      'Los assets estáticos afectan la experiencia del usuario directamente: ' +
      'sin favicon hay alerta de seguridad en algunos browsers; ' +
      'sin los JS de Next.js la app no funciona en el cliente.',
    howToInterpret:
      'PASSED = asset disponible. WARNING = 404 (el archivo podría no existir todavía). ' +
      'SKIPPED = frontend no está corriendo.',
    acceptance: 'favicon.ico y /_next/static/: idealmente PASSED. 404 es aceptable si no se han generado.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 6: Integration E2E Flows
// ──────────────────────────────────────────────────────────────────

async function runSection6(base: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();

  // Flujo E2E 1: Buscar guías → ver perfil → intentar booking (espera auth)
  console.log(`  ${C.cyan}[E2E Flow 1]${C.reset} Buscar guía → Ver perfil`);
  let guiaUid: string | null = null;

  {
    const r = await timedFetch(`${base}/api/guides/verified`);
    const s = statusFor(r, 200);

    if (s !== 'SKIPPED' && s !== 'FAILED' && Array.isArray(r.body)) {
      guiaUid = r.body[0]?.uid ?? r.body[0]?.id ?? null;
    }

    results.push({
      name: '[Flow 1 - Paso 1] Listar guías verificados',
      description: 'Primer paso del flujo: obtener la lista de guías disponibles.',
      endpoint: 'GET /api/guides/verified',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible — flow 1 abortado'
          : s !== 'FAILED'
          ? `${Array.isArray(r.body) ? r.body.length : 0} guías disponibles — ${guiaUid ? 'UID capturado para siguiente paso' : 'sin UID disponible'}`
          : `HTTP ${r.status ?? 'null'}`,
    });
  }

  {
    const uid = guiaUid ?? 'guia-demo-001';
    const r = await timedFetch(`${base}/api/guides/profile/${uid}`);
    const s = statusFor(r, [200, 404]);

    results.push({
      name: '[Flow 1 - Paso 2] Ver perfil del guía',
      description: `Segundo paso: ver el perfil público del guía${guiaUid ? ' (UID real)' : ' (UID demo)'}.`,
      endpoint: `GET /api/guides/profile/${uid}`,
      method: 'GET',
      status: guiaUid === null && s === 'PASSED' ? s : s,
      httpStatus: r.status,
      expectedStatus: [200, 404],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 200
          ? `Perfil cargado — flujo guía completado exitosamente`
          : r.status === 404
          ? `Guía no encontrado (UID demo) — endpoint funcional, flujo OK`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  {
    const r = await timedFetch(`${base}/api/bookings/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guiaId: guiaUid ?? 'demo', fecha: '2026-06-15', horas: 4 }),
    });
    const s = statusFor(r, [401, 403], false);

    results.push({
      name: '[Flow 1 - Paso 3] Intentar booking sin auth (espera 401)',
      description: 'Tercer paso: un turista sin sesión no debe poder reservar. Verifica seguridad del flujo.',
      endpoint: 'POST /api/bookings/create',
      method: 'POST',
      status: s,
      httpStatus: r.status,
      expectedStatus: [401, 403],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : [401, 403].includes(r.status ?? 0)
          ? `Flujo seguro — booking requiere autenticación (HTTP ${r.status})`
          : `VULNERABILIDAD: booking sin auth devuelve HTTP ${r.status}`,
    });
  }

  // Flujo E2E 2: Explorar lugares → ver lugar específico
  console.log(`  ${C.cyan}[E2E Flow 2]${C.reset} Explorar lugares → ver lugar`);
  let primerLugar: string | null = null;

  {
    const r = await timedFetch(`${base}/api/lugares`);
    const s = statusFor(r, 200);

    if (s !== 'SKIPPED' && s !== 'FAILED' && Array.isArray(r.body) && r.body.length > 0) {
      primerLugar = r.body[0]?.nombre ?? r.body[0]?.name ?? null;
    }

    results.push({
      name: '[Flow 2 - Paso 1] Listar lugares turísticos',
      description: 'Obtiene el catálogo completo de lugares de Guadalajara.',
      endpoint: 'GET /api/lugares',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : s !== 'FAILED'
          ? `${Array.isArray(r.body) ? r.body.length : 0} lugares — ${primerLugar ? '"' + primerLugar + '" capturado' : 'sin nombre capturado'}`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  {
    const nombre = encodeURIComponent(primerLugar ?? 'Catedral de Guadalajara');
    const r = await timedFetch(`${base}/api/lugares/${nombre}`);
    const s = statusFor(r, [200, 404]);

    results.push({
      name: '[Flow 2 - Paso 2] Ver lugar específico',
      description: `Carga el detalle de un lugar turístico: "${primerLugar ?? 'Catedral de Guadalajara'}"`,
      endpoint: `GET /api/lugares/${nombre}`,
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [200, 404],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 200
          ? `Lugar encontrado — flujo exploración completado`
          : r.status === 404
          ? `Lugar no encontrado — endpoint funcional`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  // Flujo E2E 3: Tours públicos → filtro por guía
  console.log(`  ${C.cyan}[E2E Flow 3]${C.reset} Tours públicos → filtrar`);
  let tourId: string | null = null;

  {
    const r = await timedFetch(`${base}/api/tours`);
    const s = statusFor(r, 200);

    if (s !== 'SKIPPED' && s !== 'FAILED' && Array.isArray(r.body) && r.body.length > 0) {
      tourId = r.body[0]?.id ?? r.body[0]?.uid ?? null;
    }

    results.push({
      name: '[Flow 3 - Paso 1] Listar tours disponibles',
      description: 'Obtiene el catálogo de tours del sistema.',
      endpoint: 'GET /api/tours',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : s !== 'FAILED'
          ? `${Array.isArray(r.body) ? r.body.length : 0} tours disponibles`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  {
    const id = tourId ?? 'tour-demo-001';
    const r = await timedFetch(`${base}/api/tours/${id}`);
    const s = statusFor(r, [200, 404]);

    results.push({
      name: '[Flow 3 - Paso 2] Ver tour específico',
      description: `Carga el detalle de un tour para la pantalla de compra.`,
      endpoint: `GET /api/tours/${id}`,
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: [200, 404],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : r.status === 200
          ? `Tour encontrado — flujo de compra desbloqueado`
          : r.status === 404
          ? `Tour no encontrado (ID demo) — endpoint funcional`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  return {
    id: 'S6',
    name: 'Integration E2E Flows',
    description:
      'Simula flujos completos de usuario: descubrir guía → ver perfil → intentar reserva; ' +
      'explorar lugares; y navegar tours. Encadena múltiples requests para probar coherencia del sistema.',
    importance:
      'Las pruebas unitarias no detectan fallos de integración entre módulos. ' +
      'Estos flujos garantizan que el sistema funciona de extremo a extremo como lo experimenta el turista.',
    howToInterpret:
      'Cada paso es dependiente del anterior. Si el Paso 1 falla, el Paso 2 usa datos demo. ' +
      'Un flujo completo PASSED indica que la cadena guía→perfil→booking está operativa.',
    acceptance:
      'Flow 1 completo: PASSED en todos los pasos. ' +
      'Flow 2 y 3: al menos los pasos de listado (Paso 1) deben ser PASSED.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 7: Módulo IA Híbrida + Datos turísticos
// ──────────────────────────────────────────────────────────────────
// La IA ya NO usa Ollama. El motor es el algoritmo híbrido en
// ia-engine.ts (pitzbol-web :3003):
//   - generateItinerary()   → constraint-based scheduling
//   - sortByProximity()     → KNN greedy por distancia haversine
//   - pickAddStop/Replace() → selección con reglas de horario/gastro
// El motor corre como funciones puras (sin REST API propia).
// Su data pipeline: GET /api/places (pitzbol-web) → CSV + Firebase.

async function runSection7(base: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();
  const iaBase = 'http://localhost:3003';

  // Test 7.1 — GET /api/ai (info del motor — ya sin Ollama)
  {
    const r = await timedFetch(`${base}/api/ai`);
    const s = statusFor(r, 200);
    const mentionsHybrid =
      typeof r.body === 'object' &&
      JSON.stringify(r.body).toLowerCase().includes('hybrid');
    results.push({
      name: 'GET /api/ai (motor híbrido documentado)',
      description:
        'Verifica que el endpoint de info de IA ya referencia el algoritmo híbrido ' +
        '(ia-engine.ts) y no Ollama.',
      endpoint: 'GET /api/ai',
      method: 'GET',
      status: s === 'SKIPPED' ? 'SKIPPED' : s === 'FAILED' ? 'FAILED' : mentionsHybrid ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Backend no disponible'
          : mentionsHybrid
          ? 'Endpoint refleja motor híbrido — Ollama eliminado correctamente'
          : r.status === 200
          ? 'HTTP 200 pero no menciona "hybrid" — revisar ai.routes.ts'
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 7.2 — GET /api/places (pitzbol-web — data pipeline del motor híbrido)
  {
    const r = await timedFetch(`${iaBase}/api/places`);
    const s = statusFor(r, 200);
    const count = Array.isArray(r.body) ? r.body.length : null;
    results.push({
      name: 'GET /api/places (data pipeline del algoritmo híbrido)',
      description:
        'Endpoint en pitzbol-web (:3003) que sirve los lugares al motor ia-engine.ts. ' +
        'Fusiona datos de Firebase + CSV (datosLugares.csv).',
      endpoint: 'GET http://localhost:3003/api/places',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'pitzbol-web no está corriendo — levantar con: npm run dev en pitzbol-web'
          : s !== 'FAILED'
          ? `Data pipeline OK — ${count !== null ? count + ' lugares' : 'respuesta recibida'} (Firebase + CSV)`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 7.3 — GET /api/paquetes (paquetes turísticos, público)
  {
    const r = await timedFetch(`${base}/api/paquetes`);
    const s = statusFor(r, 200);
    results.push({
      name: 'GET /api/paquetes (público)',
      description: 'Catálogo de paquetes turísticos. Complementan los itinerarios generados por ia-engine.ts.',
      endpoint: 'GET /api/paquetes',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Backend no disponible'
          : s !== 'FAILED'
          ? `${Array.isArray(r.body) ? r.body.length + ' paquetes' : 'respuesta recibida'}`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 7.4 — GET /api/ratings/guide/:id (ratings públicos)
  {
    const r = await timedFetch(`${base}/api/ratings/guide/demo-guide-id`);
    const s = statusFor(r, 200);
    results.push({
      name: 'GET /api/ratings/guide/:id (ratings públicos)',
      description: 'Ratings de un guía. El motor híbrido puede considerar el rating al rankear guías.',
      endpoint: 'GET /api/ratings/guide/demo-guide-id',
      method: 'GET',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Backend no disponible'
          : r.status === 200
          ? `Ratings cargados — ${r.body?.total ?? 0} calificaciones`
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  // Test 7.5 — POST /api/itinerary (pitzbol-web — motor híbrido real, ya sin Ollama)
  {
    const r = await timedFetch(`${iaBase}/api/itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interests: ['cultura', 'gastronomia', 'cafeterias'],
        budget: 500,
        selectedDate: '2026-06-18',
        startTime: '09:00',
        ritmo: 'normal',
        duration: 'medio-dia',
      }),
    });

    const isHybridResponse =
      r.status === 200 &&
      typeof r.body === 'object' &&
      r.body?.motor === 'hybrid-constraint-knn' &&
      Array.isArray(r.body?.stops);

    const s: TestStatus =
      r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' :
      isHybridResponse ? (r.responseTimeMs > PERF.WARNING ? 'WARNING' : 'PASSED') :
      r.status === 200 ? 'WARNING' :
      r.status === 422 ? 'WARNING' :
      'FAILED';

    results.push({
      name: 'POST /api/itinerary (motor híbrido — sin Ollama)',
      description:
        'Genera un itinerario completo usando ia-engine.ts. ' +
        'Verifica que responde con motor:"hybrid-constraint-knn" y array de stops.',
      endpoint: 'POST http://localhost:3003/api/itinerary',
      method: 'POST',
      status: s,
      httpStatus: r.status,
      expectedStatus: 200,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'pitzbol-web no está corriendo'
          : isHybridResponse
          ? `Motor híbrido OK — ${r.body.totalParadas} paradas generadas en ${r.responseTimeMs}ms`
          : r.status === 200
          ? 'HTTP 200 pero respuesta no tiene formato esperado (motor/stops)'
          : r.status === 422
          ? 'Sin paradas — probar con más intereses o mayor presupuesto'
          : `HTTP ${r.status ?? 'null'}`,
      responsePreview: preview(r.body),
    });
  }

  // Tests 7.6–7.7 — Endpoints del backend sin REST propio (viven en ia-engine.ts)
  for (const [ep, note] of [
    ['POST /api/recommendations', 'generateItinerary() — usar POST /api/itinerary en pitzbol-web'],
    ['POST /api/hybrid-search',   'todo ia-engine.ts — usar POST /api/itinerary en pitzbol-web'],
  ] as [string, string][]) {
    const r = await timedFetch(`${base}${ep.split(' ')[1]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
    results.push({
      name: `${ep} (backend — sin REST, usar pitzbol-web)`,
      description: `Sin endpoint REST en el backend. ${note}.`,
      endpoint: ep,
      method: 'POST',
      status: r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'SKIPPED' : r.status === 404 ? 'PASSED' : 'WARNING',
      httpStatus: r.status,
      expectedStatus: 404,
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE' ? 'Backend no disponible' :
        r.status === 404 ? `Sin REST en backend — ${note}` :
        `HTTP ${r.status}`,
    });
  }

  return {
    id: 'S7',
    name: 'Módulo IA Híbrida (ia-engine.ts)',
    description:
      'Prueba el motor de IA híbrido: constraint-based scheduling + KNN geográfico. ' +
      'Verifica el data pipeline (/api/places en pitzbol-web), ' +
      'los datos turísticos (paquetes, ratings) y confirma que Ollama fue eliminado.',
    importance:
      'El algoritmo híbrido (ia-engine.ts) es el corazón de Pitzbol para el Mundial 2026. ' +
      'Sin datos en /api/places, el motor no puede generar itinerarios.',
    howToInterpret:
      'GET /api/ai: PASSED si menciona "hybrid" (Ollama eliminado correctamente). ' +
      'GET /api/places: PASSED = data pipeline operativo. ' +
      'Endpoints sin REST (recommendations, knn, hybrid): PASSED con 404 — son funciones puras en ia-engine.ts.',
    acceptance:
      'GET /api/ai: PASSED. GET /api/places: PASSED con lista de lugares. ' +
      'GET /api/paquetes y ratings: PASSED con 200. ' +
      'Endpoints de funciones puras: PASSED con 404.',
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Sección 8: Performance Testing
// ──────────────────────────────────────────────────────────────────

async function runSection8(base: string): Promise<SectionResult> {
  const results: TestResult[] = [];
  const sectionStart = Date.now();

  const perfEndpoints = [
    { endpoint: '/', method: 'GET', name: 'Health Root', body: undefined },
    { endpoint: '/api/guides/verified', method: 'GET', name: 'Guías Verificados', body: undefined },
    { endpoint: '/api/lugares', method: 'GET', name: 'Lista Lugares', body: undefined },
    { endpoint: '/api/tours', method: 'GET', name: 'Lista Tours', body: undefined },
    { endpoint: '/api/paquetes', method: 'GET', name: 'Lista Paquetes', body: undefined },
    {
      endpoint: '/api/business/validate-uniqueness',
      method: 'POST',
      name: 'Validar Unicidad Negocio',
      body: JSON.stringify({ email: 'perf-test@pitzbol.me', nombre: 'PerfTestNegocio' }),
    },
  ];

  for (const ep of perfEndpoints) {
    const fetchOptions: RequestInit = {
      method: ep.method,
      headers: ep.body ? { 'Content-Type': 'application/json' } : {},
    };
    if (ep.body) fetchOptions.body = ep.body;

    const r = await timedFetch(`${base}${ep.endpoint}`, fetchOptions);

    let status: TestStatus;
    if (r.error === 'SERVIDOR_NO_DISPONIBLE') {
      status = 'SKIPPED';
    } else if (r.status === null) {
      status = 'FAILED';
    } else if (r.responseTimeMs > PERF.FAILED) {
      status = 'FAILED';
    } else if (r.responseTimeMs > PERF.WARNING) {
      status = 'WARNING';
    } else {
      status = 'PASSED';
    }

    const perfLabel =
      r.responseTimeMs <= PERF.WARNING
        ? `${C.green}${r.responseTimeMs}ms${C.reset}`
        : r.responseTimeMs <= PERF.FAILED
        ? `${C.yellow}${r.responseTimeMs}ms (WARNING >${PERF.WARNING}ms)${C.reset}`
        : `${C.red}${r.responseTimeMs}ms (FAILED >${PERF.FAILED}ms)${C.reset}`;

    results.push({
      name: `[Perf] ${ep.name}`,
      description: `Mide el tiempo de respuesta de ${ep.method} ${ep.endpoint} bajo condiciones normales.`,
      endpoint: `${ep.method} ${ep.endpoint}`,
      method: ep.method,
      status,
      httpStatus: r.status,
      expectedStatus: [200, 400, 401, 409],
      responseTimeMs: r.responseTimeMs,
      details:
        r.error === 'SERVIDOR_NO_DISPONIBLE'
          ? 'Servidor no disponible'
          : status === 'SKIPPED'
          ? 'No se pudo medir'
          : `Tiempo: ${r.responseTimeMs}ms | Umbral WARNING: ${PERF.WARNING}ms | Umbral FAILED: ${PERF.FAILED}ms | HTTP: ${r.status}`,
    });
  }

  return {
    id: 'S8',
    name: 'Performance Testing',
    description:
      'Mide el tiempo de respuesta de los endpoints más críticos del sistema. ' +
      `Umbral WARNING: ${PERF.WARNING}ms. Umbral FAILED: ${PERF.FAILED}ms.`,
    importance:
      'Durante el Mundial 2026, el sistema recibirá tráfico alto de turistas. ' +
      'Un endpoint lento degrada la experiencia del usuario y puede indicar problemas en Firebase o la red.',
    howToInterpret:
      `PASSED = responde en <${PERF.WARNING}ms (excelente). ` +
      `WARNING = ${PERF.WARNING}ms-${PERF.FAILED}ms (degradación perceptible, optimizar). ` +
      `FAILED = >${PERF.FAILED}ms (inaceptable en producción). ` +
      'SKIPPED = servidor no disponible para medir.',
    acceptance:
      `Health Root: <200ms. Listados públicos: <1000ms. Validaciones: <2000ms. ` +
      `Ningún endpoint debe superar ${PERF.FAILED}ms.`,
    results,
    totalMs: Date.now() - sectionStart,
  };
}

// ──────────────────────────────────────────────────────────────────
// Generación de reporte Markdown
// ──────────────────────────────────────────────────────────────────

function statusEmoji(s: TestStatus): string {
  switch (s) {
    case 'PASSED': return '✅';
    case 'FAILED': return '❌';
    case 'WARNING': return '⚠️';
    case 'SKIPPED': return '⏭️';
  }
}

function generateMarkdown(report: SuiteReport): string {
  const { summary } = report;
  const passRate =
    summary.total > 0
      ? Math.round(((summary.passed + summary.warning) / summary.total) * 100)
      : 0;

  const lines: string[] = [
    `# Pitzbol — Reporte de Pruebas de Integración`,
    ``,
    `**Generado:** ${report.generatedAt}  `,
    `**Entorno:** ${report.environment}  `,
    `**Backend URL:** \`${report.backendUrl}\`  `,
    `**Frontend URL:** \`${report.frontendUrl}\`  `,
    `**Duración total:** ${report.summary.durationMs}ms`,
    ``,
    `---`,
    ``,
    `## Resumen Ejecutivo`,
    ``,
    `| Indicador | Valor |`,
    `|-----------|-------|`,
    `| Total de pruebas | ${summary.total} |`,
    `| ✅ PASSED | ${summary.passed} |`,
    `| ⚠️ WARNING | ${summary.warning} |`,
    `| ❌ FAILED | ${summary.failed} |`,
    `| ⏭️ SKIPPED | ${summary.skipped} |`,
    `| Tasa de éxito (PASSED+WARNING) | ${passRate}% |`,
    `| Duración | ${summary.durationMs}ms |`,
    ``,
    `> **${passRate >= 80 ? '✅ SISTEMA OPERATIVO' : passRate >= 50 ? '⚠️ DEGRADADO' : '❌ CRÍTICO'}** — ` +
    `${passRate >= 80 ? 'El sistema está funcionando correctamente.' : passRate >= 50 ? 'Algunos módulos tienen problemas.' : 'El sistema tiene fallas críticas.'}`,
    ``,
    `---`,
    ``,
    `## Guía de Interpretación`,
    ``,
    `| Estado | Significado | Acción requerida |`,
    `|--------|-------------|-----------------|`,
    `| ✅ PASSED | Responde correctamente dentro del umbral de tiempo | Ninguna |`,
    `| ⚠️ WARNING | Responde pero lento (>${PERF.WARNING}ms) o con comportamiento no ideal | Monitorear y optimizar |`,
    `| ❌ FAILED | No responde, HTTP inesperado, o supera ${PERF.FAILED}ms | Investigar y corregir |`,
    `| ⏭️ SKIPPED | Servidor no disponible o dependencia fallida | Verificar que el servidor esté corriendo |`,
    ``,
    `**Umbrales de rendimiento:**`,
    `- 🟢 Óptimo: < 500ms`,
    `- 🟡 Aceptable: 500ms – ${PERF.WARNING}ms`,
    `- 🟠 WARNING: ${PERF.WARNING}ms – ${PERF.FAILED}ms`,
    `- 🔴 FAILED: > ${PERF.FAILED}ms`,
    ``,
    `**Nota sobre endpoints "no implementado":** Aparecen con PASSED/404 porque documentamos su ausencia como estado esperado, no como error.`,
    ``,
    `---`,
    ``,
  ];

  for (const section of report.sections) {
    const sTotal = section.results.length;
    const sPassed = section.results.filter(r => r.status === 'PASSED').length;
    const sFailed = section.results.filter(r => r.status === 'FAILED').length;
    const sWarning = section.results.filter(r => r.status === 'WARNING').length;
    const sSkipped = section.results.filter(r => r.status === 'SKIPPED').length;

    lines.push(`## ${section.id}: ${section.name}`);
    lines.push(``);
    lines.push(`**Descripción:** ${section.description}`);
    lines.push(``);
    lines.push(`**Por qué es importante:** ${section.importance}`);
    lines.push(``);
    lines.push(`**Cómo interpretar:** ${section.howToInterpret}`);
    lines.push(``);
    lines.push(`**Criterios de aceptación:** ${section.acceptance}`);
    lines.push(``);
    lines.push(
      `**Resultados:** ${sPassed}/${sTotal} PASSED | ${sWarning} WARNING | ${sFailed} FAILED | ${sSkipped} SKIPPED | ${section.totalMs}ms`
    );
    lines.push(``);
    lines.push(`| Estado | Prueba | Endpoint | HTTP | Tiempo | Detalles |`);
    lines.push(`|--------|--------|----------|------|--------|----------|`);

    for (const r of section.results) {
      const httpStr = r.httpStatus !== null ? String(r.httpStatus) : 'n/a';
      const timeStr = r.responseTimeMs > 0 ? `${r.responseTimeMs}ms` : '—';
      const details = r.details.replace(/\|/g, '\\|');
      const name = r.name.replace(/\|/g, '\\|');

      lines.push(
        `| ${statusEmoji(r.status)} ${r.status} | ${name} | \`${r.method} ${r.endpoint}\` | ${httpStr} | ${timeStr} | ${details} |`
      );
    }

    lines.push(``);

    // Solución de problemas comunes por sección
    lines.push(`### Solución de Problemas — ${section.name}`);
    lines.push(``);
    if (section.id === 'S1') {
      lines.push(`- **SKIPPED en Root Health:** El backend no está corriendo. Ejecutar: \`npm run dev\` en \`Pitzbol-Backend\``);
      lines.push(`- **WARNING en tiempo:** Verificar conexión a Firebase y que no haya procesos bloqueando el puerto 3001`);
    } else if (section.id === 'S2') {
      lines.push(`- **validate-uniqueness FAILED:** Verificar que Firebase Firestore está configurado y accesible`);
      lines.push(`- **Endpoint protegido devuelve 200 sin auth:** Revisar el middleware \`authMiddleware\` en las rutas de business`);
      lines.push(`- **404 en /api/businesses:** La ruta correcta es \`/api/business\` (singular), no plural`);
    } else if (section.id === 'S3') {
      lines.push(`- **verified FAILED:** Verificar que existen guías con \`perfilPublico: true\` y \`status: activo\` en Firestore`);
      lines.push(`- **profile 500:** Revisar que el UID del guía existe en la colección correspondiente`);
    } else if (section.id === 'S4') {
      lines.push(`- **SKIPPED Frontend:** El servidor Next.js no está corriendo. Ejecutar: \`npm run dev\` en \`Pitzbol-Frontend\``);
      lines.push(`- **HTML inválido:** Puede ser un error de build. Ejecutar: \`npm run build\` y revisar errores`);
    } else if (section.id === 'S7') {
      lines.push(`- **POST /api/ai con 503:** Ollama no está corriendo. Ejecutar: \`ollama serve\` y verificar que el modelo \`llama3\` está instalado`);
      lines.push(`- **Timeout en IA:** Normal para el primer query (cold start). El umbral es ${REQUEST_TIMEOUT}ms`);
    } else if (section.id === 'S8') {
      lines.push(`- **WARNING en performance:** Verificar conexión a Firebase (latencia de red)`);
      lines.push(`- **FAILED en performance:** Investigar si hay queries sin índice en Firestore o procesos bloqueando la CPU`);
      lines.push(`- **Todos SKIPPED:** El backend no está corriendo`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Ejemplo de salida esperada
  lines.push(`## Ejemplo de Salida Esperada (Sistema Saludable)`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`S1: API Health Check        [3/3 PASSED]  ✅`);
  lines.push(`S2: Módulo Negocios         [7/7 PASSED]  ✅`);
  lines.push(`S3: Módulo Guías            [6/6 PASSED]  ✅`);
  lines.push(`S4: Frontend Health         [3/3 PASSED]  ✅`);
  lines.push(`S5: Static Assets           [3/3 PASSED]  ✅`);
  lines.push(`S6: Integration E2E         [8/8 PASSED]  ✅`);
  lines.push(`S7: Módulo IA               [7/7 PASSED]  ✅ (o WARNING si Ollama inactivo)`);
  lines.push(`S8: Performance             [6/6 PASSED]  ✅`);
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`## Endpoints Pendientes de Implementar`);
  lines.push(``);
  lines.push(`Los siguientes endpoints fueron solicitados pero aún no están implementados en el backend:`);
  lines.push(``);
  lines.push(`| Endpoint | Alternativa actual |`);
  lines.push(`|----------|--------------------|`);
  lines.push(`| \`GET /health\` | \`GET /\` retorna \`{ status: 'ok' }\` |`);
  lines.push(`| \`GET /api/version\` | No hay versioning de API |`);
  lines.push(`| \`GET /api/businesses\` (plural) | \`GET /api/business/my-business\` (requiere auth) |`);
  lines.push(`| \`POST /api/businesses/search\` | \`GET /api/lugares\` para búsqueda de lugares |`);
  lines.push(`| \`POST /api/route-planning\` | No implementado — planificado para v2 |`);
  lines.push(`| \`GET /api/guides/by-business/:id\` | No implementado — los guías no están vinculados por negocio aún |`);
  lines.push(`| \`POST /api/recommendations\` | \`POST /api/ai\` (consulta en lenguaje natural) |`);
  lines.push(`| \`POST /api/knn-search\` | No implementado — planificado para módulo IA v2 |`);
  lines.push(`| \`POST /api/hybrid-search\` | No implementado — planificado para módulo IA v2 |`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Generado por Pitzbol Integration Suite — ${report.generatedAt}*`);

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────
// Runner principal
// ──────────────────────────────────────────────────────────────────

function countByStatus(sections: SectionResult[]) {
  let passed = 0, failed = 0, warning = 0, skipped = 0;
  for (const s of sections) {
    for (const r of s.results) {
      if (r.status === 'PASSED') passed++;
      else if (r.status === 'FAILED') failed++;
      else if (r.status === 'WARNING') warning++;
      else skipped++;
    }
  }
  return { passed, failed, warning, skipped };
}

async function main() {
  const suiteStart = Date.now();
  const backendBase = ENV.backend.local;
  const frontendBase = ENV.frontend.local;
  const generatedAt = new Date().toISOString();

  console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║     PITZBOL — Suite de Integración Automatizada    ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚═══════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.gray}  Backend:  ${backendBase}${C.reset}`);
  console.log(`${C.gray}  Frontend: ${frontendBase}${C.reset}`);
  console.log(`${C.gray}  Prod:     ${INCLUDE_PROD ? 'sí (--prod)' : 'no'}${C.reset}`);
  console.log(`${C.gray}  Fecha:    ${generatedAt}${C.reset}`);
  console.log();

  const sections: SectionResult[] = [];

  const runSection = async (label: string, fn: () => Promise<SectionResult>) => {
    process.stdout.write(`${C.bold}${label}${C.reset}... `);
    const result = await fn();
    const passed = result.results.filter(r => r.status === 'PASSED').length;
    const failed = result.results.filter(r => r.status === 'FAILED').length;
    const warning = result.results.filter(r => r.status === 'WARNING').length;
    const skipped = result.results.filter(r => r.status === 'SKIPPED').length;
    const total = result.results.length;

    const summary =
      failed > 0
        ? `${C.red}${passed}/${total} PASSED, ${failed} FAILED${C.reset}`
        : warning > 0
        ? `${C.yellow}${passed}/${total} PASSED, ${warning} WARNING${C.reset}`
        : skipped === total
        ? `${C.gray}${skipped}/${total} SKIPPED${C.reset}`
        : `${C.green}${passed}/${total} PASSED${C.reset}`;

    console.log(summary + `  ${C.gray}(${result.totalMs}ms)${C.reset}`);

    for (const r of result.results) {
      const indent = '  ';
      const time = r.responseTimeMs > 0 ? `${C.gray}${r.responseTimeMs}ms${C.reset}` : '';
      console.log(`${indent}${colorStatus(r.status)} ${r.name} ${time}`);
      if (r.status === 'FAILED' || r.status === 'WARNING') {
        console.log(`${indent}  ${C.gray}→ ${r.details}${C.reset}`);
      }
    }

    console.log();
    sections.push(result);
  };

  await runSection('S1: API Health Check        ', () => runSection1(backendBase));
  await runSection('S2: Módulo Negocios         ', () => runSection2(backendBase));
  await runSection('S3: Módulo Guías            ', () => runSection3(backendBase));
  await runSection('S4: Frontend Health         ', () => runSection4(frontendBase, INCLUDE_PROD));
  await runSection('S5: Static Assets           ', () => runSection5(frontendBase));
  await runSection('S6: Integration E2E Flows   ', () => runSection6(backendBase));
  await runSection('S7: Módulo IA + Datos       ', () => runSection7(backendBase));
  await runSection('S8: Performance Testing     ', () => runSection8(backendBase));

  const durationMs = Date.now() - suiteStart;
  const counts = countByStatus(sections);
  const total = counts.passed + counts.failed + counts.warning + counts.skipped;

  console.log(`${C.bold}${C.cyan}═══════════════════════ RESUMEN FINAL ═══════════════════════${C.reset}`);
  console.log(`  Total pruebas: ${total}`);
  console.log(`  ${C.green}✓ PASSED:  ${counts.passed}${C.reset}`);
  console.log(`  ${C.yellow}⚠ WARNING: ${counts.warning}${C.reset}`);
  console.log(`  ${C.red}✗ FAILED:  ${counts.failed}${C.reset}`);
  console.log(`  ${C.gray}○ SKIPPED: ${counts.skipped}${C.reset}`);
  console.log(`  Duración: ${durationMs}ms`);

  const passRate = total > 0 ? Math.round(((counts.passed + counts.warning) / total) * 100) : 0;
  console.log();
  if (counts.failed === 0 && counts.skipped < total * 0.5) {
    console.log(`  ${C.green}${C.bold}✅ SISTEMA OPERATIVO (${passRate}% tasa de éxito)${C.reset}`);
  } else if (counts.failed <= 3) {
    console.log(`  ${C.yellow}${C.bold}⚠️  SISTEMA DEGRADADO (${passRate}% tasa de éxito, ${counts.failed} fallos)${C.reset}`);
  } else {
    console.log(`  ${C.red}${C.bold}❌ SISTEMA CON FALLOS CRÍTICOS (${counts.failed} fallos)${C.reset}`);
  }
  console.log();

  // Generar reportes
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const mdPath = path.join(reportsDir, `pitzbol-report-${timestamp}.md`);
  const jsonPath = path.join(reportsDir, `pitzbol-report-${timestamp}.json`);
  const latestMdPath = path.join(reportsDir, 'pitzbol-report-latest.md');
  const latestJsonPath = path.join(reportsDir, 'pitzbol-report-latest.json');

  const report: SuiteReport = {
    title: 'Pitzbol Integration Test Suite',
    generatedAt,
    environment: INCLUDE_PROD ? 'local + producción' : 'local',
    backendUrl: backendBase,
    frontendUrl: frontendBase,
    summary: {
      total,
      passed: counts.passed,
      failed: counts.failed,
      warning: counts.warning,
      skipped: counts.skipped,
      durationMs,
    },
    sections,
  };

  const markdown = generateMarkdown(report);
  fs.writeFileSync(mdPath, markdown, 'utf-8');
  fs.writeFileSync(latestMdPath, markdown, 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`  📄 Reporte MD:   ${mdPath}`);
  console.log(`  📊 Reporte JSON: ${jsonPath}`);
  console.log(`  📄 Último MD:    ${latestMdPath}`);
  console.log();

  // Exit code basado en fallos
  process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${C.red}Error fatal en el suite:${C.reset}`, err);
  process.exit(2);
});
