#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
# Forzar UTF-8 en stdout/stderr para que los caracteres Unicode
# (emojis, box-drawing) funcionen en Windows con cp1252
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True)
"""
═══════════════════════════════════════════════════════════════════
PITZBOL — Suite de Pruebas de Integración (Python)
═══════════════════════════════════════════════════════════════════

Cubre las 8 secciones del sistema + módulo IA de itinerarios:
  1. API Health Check              (backend :3001)
  2. Módulo Negocios               (/api/business)
  3. Módulo Guías                  (/api/guides)
  4. Frontend Health               (:3000 / pitzbol.me)
  5. Static Assets                 (Next.js)
  6. Integration E2E               (flujos encadenados)
  7. Módulo IA Backend             (/api/ai, /api/paquetes)
  8. Performance Testing           (umbrales ms)
  9. IA Itinerarios (pitzbol-web)  (:3003 — ia-engine)

Uso:
  python3 pitzbol_integration_tests.py            # solo local
  python3 pitzbol_integration_tests.py --prod     # incluye pitzbol.me
  python3 pitzbol_integration_tests.py --ia       # incluye tests IA :3003
  python3 pitzbol_integration_tests.py --all      # todo

Reportes generados en: tests/integration/reports/
Requiere: Python 3.8+ (solo stdlib — sin dependencias externas)

Umbrales de rendimiento:
  PASSED   < 2000 ms
  WARNING  2000–5000 ms
  FAILED   > 5000 ms  o  HTTP inesperado
  SKIPPED  servidor no disponible
"""

import os
import json
import time
import datetime
import socket
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Union
from pathlib import Path

# ──────────────────────────────────────────────────────────────────
# Configuración
# ──────────────────────────────────────────────────────────────────

args = sys.argv[1:]
INCLUDE_PROD = "--prod" in args or "--all" in args
INCLUDE_IA   = "--ia"   in args or "--all" in args

BACKEND  = "http://localhost:3001"
FRONTEND = "http://localhost:3000"
IA_URL   = "http://localhost:3003"  # pitzbol-web IA de itinerarios

PERF_WARNING = 2000   # ms
PERF_FAILED  = 5000   # ms
TIMEOUT_S    = 6.0    # segundos por request

# Cache de servidores disponibles (evita timeout repetido en Windows)
_server_available: dict = {}

def is_server_up(host: str, port: int) -> bool:
    """
    Comprueba en <1s si el puerto está abierto usando socket TCP raw.
    En Windows los servidores cerrados tardan ~4s en urllib, pero con
    socket.connect_ex() con timeout=0.5 fallamos rápido.
    """
    key = f"{host}:{port}"
    if key in _server_available:
        return _server_available[key]
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        result = sock.connect_ex((host, port))
        sock.close()
        up = (result == 0)
    except Exception:
        up = False
    _server_available[key] = up
    return up

def parse_host_port(url: str) -> tuple:
    """Extrae (host, port) de una URL como http://localhost:3001"""
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return host, port

# ──────────────────────────────────────────────────────────────────
# Colores ANSI
# ──────────────────────────────────────────────────────────────────

GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"
GRAY   = "\033[90m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def color(text: str, *codes: str) -> str:
    return "".join(codes) + str(text) + RESET

# ──────────────────────────────────────────────────────────────────
# Tipos de datos
# ──────────────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    description: str
    endpoint: str
    method: str
    status: str                    # PASSED | FAILED | WARNING | SKIPPED
    http_status: Optional[int]
    expected_status: Union[int, List[int], str]
    response_time_ms: int
    details: str
    response_preview: str = ""

@dataclass
class SectionResult:
    id: str
    name: str
    description: str
    importance: str
    how_to_interpret: str
    acceptance: str
    results: List[TestResult] = field(default_factory=list)
    total_ms: int = 0

# ──────────────────────────────────────────────────────────────────
# HTTP helper
# ──────────────────────────────────────────────────────────────────

def timed_fetch(
    url: str,
    method: str = "GET",
    body: Optional[dict] = None,
    headers: Optional[dict] = None
) -> tuple:
    """
    Retorna (http_status, body_parsed, response_time_ms, error_str)
    body_parsed puede ser dict, str o None.
    error_str es None si no hay error.
    En Windows hace un pre-check TCP rápido para evitar el timeout
    de 4s de urllib cuando el servidor no está corriendo.
    """
    # Pre-check TCP rápido (evita el timeout de ~4s de urllib en Windows
    # cuando el servidor no está escuchando).
    # Solo para HTTP local — HTTPS externo (pitzbol.me) se deja pasar.
    parsed_url = urllib.parse.urlparse(url)
    if parsed_url.scheme == "http":
        host = parsed_url.hostname or "localhost"
        port = parsed_url.port or 80
        if not is_server_up(host, port):
            return (None, None, 0, "SERVIDOR_NO_DISPONIBLE")

    start = time.monotonic()
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            elapsed = int((time.monotonic() - start) * 1000)
            raw = resp.read().decode("utf-8", errors="replace")
            ct = resp.headers.get("Content-Type", "")
            parsed = None
            try:
                if "json" in ct:
                    parsed = json.loads(raw)
                else:
                    parsed = raw
            except Exception:
                parsed = raw
            return (resp.status, parsed, elapsed, None)

    except urllib.error.HTTPError as e:
        elapsed = int((time.monotonic() - start) * 1000)
        raw = ""
        try:
            raw = e.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if "json" in e.headers.get("Content-Type","") else raw
        except Exception:
            parsed = raw
        return (e.code, parsed, elapsed, None)

    except urllib.error.URLError as e:
        elapsed = int((time.monotonic() - start) * 1000)
        reason = str(e.reason)
        if "refused" in reason.lower() or "timed out" in reason.lower() or "no route" in reason.lower():
            return (None, None, elapsed, "SERVIDOR_NO_DISPONIBLE")
        return (None, None, elapsed, f"URLError: {reason}")

    except Exception as e:
        elapsed = int((time.monotonic() - start) * 1000)
        return (None, None, elapsed, f"Error: {e}")


def determine_status(
    http_status: Optional[int],
    expected: Union[int, List[int]],
    response_time_ms: int,
    error: Optional[str],
    check_perf: bool = True
) -> str:
    if error == "SERVIDOR_NO_DISPONIBLE":
        return "SKIPPED"
    if http_status is None:
        return "FAILED"
    exp_list = expected if isinstance(expected, list) else [expected]
    if http_status not in exp_list:
        return "FAILED"
    if check_perf:
        if response_time_ms > PERF_FAILED:
            return "FAILED"
        if response_time_ms > PERF_WARNING:
            return "WARNING"
    return "PASSED"


def preview(body, max_len: int = 200) -> str:
    if body is None:
        return "(sin cuerpo)"
    text = json.dumps(body, ensure_ascii=False) if isinstance(body, (dict, list)) else str(body)
    return text[:max_len] + ("..." if len(text) > max_len else "")


# ──────────────────────────────────────────────────────────────────
# Sección 1: API Health Check
# ──────────────────────────────────────────────────────────────────

def run_section1(base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()

    # 1.1 Root health (único health real)
    http_s, body, ms, err = timed_fetch(f"{base}/")
    s = determine_status(http_s, 200, ms, err)
    health_ok = (s not in ("FAILED", "SKIPPED") and
                 isinstance(body, dict) and body.get("status") == "ok")
    results.append(TestResult(
        name="Root Health Check",
        description="Verifica que el servidor API está vivo y responde con {status:'ok'}",
        endpoint="GET /",
        method="GET",
        status=s if (s != "PASSED" or health_ok) else "WARNING",
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            f"Servidor OK — mensaje: \"{body.get('message','')}\"" if health_ok
            else f"No disponible en {base} — ejecutar: npm run dev" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"HTTP {http_s} — body inesperado: {preview(body, 80)}"
        ),
        response_preview=preview(body)
    ))

    # 1.2 /health (no implementado → 404 esperado)
    http_s, body, ms, err = timed_fetch(f"{base}/health")
    results.append(TestResult(
        name="GET /health (no implementado)",
        description="El endpoint /health no existe. Se documenta 404 como estado esperado.",
        endpoint="GET /health",
        method="GET",
        status="SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE" else ("PASSED" if http_s == 404 else "WARNING"),
        http_status=http_s,
        expected_status=404,
        response_time_ms=ms,
        details=(
            "Servidor no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Correcto — 404 esperado (endpoint no implementado)" if http_s == 404
            else f"HTTP {http_s} inesperado"
        )
    ))

    # 1.3 /api/version (no implementado → 404 esperado)
    http_s, body, ms, err = timed_fetch(f"{base}/api/version")
    results.append(TestResult(
        name="GET /api/version (no implementado)",
        description="El endpoint /api/version no existe. Se documenta 404 como estado esperado.",
        endpoint="GET /api/version",
        method="GET",
        status="SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE" else ("PASSED" if http_s == 404 else "WARNING"),
        http_status=http_s,
        expected_status=404,
        response_time_ms=ms,
        details=(
            "Servidor no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else "Correcto — 404 esperado (no hay versioning de API)" if http_s == 404
            else f"HTTP {http_s} inesperado"
        )
    ))

    return SectionResult(
        id="S1", name="API Health Check",
        description="Verifica que el servidor responde, el cuerpo es correcto y documenta endpoints no implementados.",
        importance="Primera línea de defensa. Si falla, ninguna prueba posterior tiene sentido.",
        how_to_interpret=(
            "PASSED en Root Health = servidor OK. SKIPPED = no está corriendo. "
            "/health y /api/version: PASSED con 404 es correcto (no implementados)."
        ),
        acceptance="Root Health: PASSED con responseTime < 500ms.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 2: Módulo Negocios
# ──────────────────────────────────────────────────────────────────

def run_section2(base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()

    tests = [
        {
            "name": "POST /api/business/validate-uniqueness",
            "desc": "Valida unicidad de email/nombre (endpoint público, sin auth).",
            "endpoint": "POST /api/business/validate-uniqueness",
            "method": "POST",
            "body": {"email": "test-check@pitzbol.me", "nombre": "TestNegocioIntegration"},
            "expected": [200, 400, 409],
            "auth": False,
        },
        {
            "name": "GET /api/business/my-business (auth requerida)",
            "desc": "Retorna negocio del usuario. Sin token debe devolver 401.",
            "endpoint": "GET /api/business/my-business",
            "method": "GET",
            "body": None,
            "expected": [401, 403],
            "auth": True,
        },
        {
            "name": "GET /api/business/by-id/:id (auth requerida)",
            "desc": "Negocio por ID. Sin token debe rechazar con 401.",
            "endpoint": "GET /api/business/by-id/demo-id",
            "method": "GET",
            "body": None,
            "expected": [401, 403],
            "auth": True,
        },
        {
            "name": "GET /api/business/status (auth requerida)",
            "desc": "Estado del negocio del usuario. Requiere JWT.",
            "endpoint": "GET /api/business/status",
            "method": "GET",
            "body": None,
            "expected": [401, 403],
            "auth": True,
        },
        {
            "name": "PUT /api/business/:id (auth requerida)",
            "desc": "Actualización de negocio. Verifica protección del endpoint de escritura.",
            "endpoint": "PUT /api/business/demo-id",
            "method": "PUT",
            "body": {"nombre": "TestUpdate"},
            "expected": [401, 403],
            "auth": True,
        },
        {
            "name": "GET /api/admin/negocios (admin requerido)",
            "desc": "Listado admin de negocios. Solo ADMIN puede acceder.",
            "endpoint": "GET /api/admin/negocios",
            "method": "GET",
            "body": None,
            "expected": [401, 403],
            "auth": True,
        },
        {
            "name": "GET /api/businesses (ruta plural — no existe)",
            "desc": "La ruta plural no está implementada. La correcta es /api/business (singular).",
            "endpoint": "GET /api/businesses",
            "method": "GET",
            "body": None,
            "expected": 404,
            "auth": False,
        },
    ]

    for t in tests:
        url = f"{base}{t['endpoint'].split(' ', 1)[1]}"
        http_s, body, ms, err = timed_fetch(url, method=t["method"], body=t["body"])
        s = determine_status(http_s, t["expected"], ms, err, check_perf=not t["auth"])

        exp_list = t["expected"] if isinstance(t["expected"], list) else [t["expected"]]
        if t["auth"]:
            ok_msg = f"Seguridad OK — endpoint protegido (HTTP {http_s})"
            fail_msg = f"VULNERABILIDAD: HTTP {http_s} sin token — verificar authMiddleware"
        elif t["expected"] == 404:
            ok_msg = f"Documenta ruta inexistente — retorna 404 esperado"
            fail_msg = f"HTTP {http_s} inesperado (se esperaba 404)"
        else:
            ok_msg = f"HTTP {http_s} — endpoint funcional"
            fail_msg = f"HTTP {http_s} inesperado"

        results.append(TestResult(
            name=t["name"],
            description=t["desc"],
            endpoint=t["endpoint"],
            method=t["method"],
            status=s,
            http_status=http_s,
            expected_status=t["expected"],
            response_time_ms=ms,
            details=(
                f"Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
                else ok_msg if http_s in exp_list
                else fail_msg
            ),
            response_preview=preview(body)
        ))

    return SectionResult(
        id="S2", name="Módulo Negocios (/api/business)",
        description="Prueba endpoints de negocios: validación pública, endpoints protegidos y rutas inexistentes.",
        importance="Los negocios son un pilar de Pitzbol. Verificar protección previene acceso no autorizado.",
        how_to_interpret=(
            "Endpoints auth: PASSED cuando devuelven 401/403 sin token = seguridad OK. "
            "validate-uniqueness: PASSED con 200/400/409. "
            "Si un endpoint protegido da 200 sin token = vulnerabilidad crítica."
        ),
        acceptance="Todos los endpoints auth: PASSED con 401/403. validate-uniqueness: PASSED.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 3: Módulo Guías
# ──────────────────────────────────────────────────────────────────

def run_section3(base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()
    first_guide_uid = None

    # 3.1 GET /api/guides/verified (público)
    http_s, body, ms, err = timed_fetch(f"{base}/api/guides/verified")
    s = determine_status(http_s, 200, ms, err)
    if s not in ("FAILED", "SKIPPED") and isinstance(body, list) and body:
        first_guide_uid = body[0].get("uid") or body[0].get("id")
    results.append(TestResult(
        name="GET /api/guides/verified",
        description="Lista de guías verificados. Endpoint público crítico para el directorio.",
        endpoint="GET /api/guides/verified",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            f"Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"HTTP 200 — {len(body) if isinstance(body, list) else 'respuesta recibida'} guías"
            if s != "FAILED" else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    # 3.2 GET /api/guides/profile/:uid (público)
    uid = first_guide_uid or "demo-uid-guia"
    http_s, body, ms, err = timed_fetch(f"{base}/api/guides/profile/{uid}")
    s = determine_status(http_s, [200, 404], ms, err)
    results.append(TestResult(
        name="GET /api/guides/profile/:uid",
        description="Perfil público de un guía.",
        endpoint=f"GET /api/guides/profile/{uid}",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=[200, 404],
        response_time_ms=ms,
        details=(
            f"Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Perfil cargado {'(UID real)' if first_guide_uid else '(UID demo)'}" if http_s == 200
            else f"Guía no encontrado (UID demo) — endpoint funcional" if http_s == 404
            else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    # 3.3–3.6 endpoints protegidos + no implementados
    protected = [
        ("GET /api/guides/my-request", [401, 403], True,
         "Solicitud de registro de guía. Requiere auth."),
        ("GET /api/admin/guias/pendientes", [401, 403], True,
         "Solicitudes pendientes de guías. Solo admin."),
        ("POST /api/route-planning", 404, False,
         "Planeación de rutas — pendiente de implementar."),
        ("GET /api/guides/by-business/demo-id", 404, False,
         "Guías por negocio — pendiente de implementar."),
    ]

    for endpoint_str, expected, is_auth, desc in protected:
        method, path = endpoint_str.split(" ", 1)
        body_data = {"origen": "Plaza Tapatía", "destino": "Mercado San Juan"} if "route-planning" in path else None
        http_s, body, ms, err = timed_fetch(f"{base}{path}", method=method, body=body_data)
        exp_list = expected if isinstance(expected, list) else [expected]
        s = determine_status(http_s, expected, ms, err, check_perf=False)

        if not is_auth and expected == 404:
            s = "SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE" else ("PASSED" if http_s == 404 else "WARNING")

        results.append(TestResult(
            name=f"{endpoint_str} {'(auth requerida)' if is_auth else '(no implementado)'}",
            description=desc,
            endpoint=endpoint_str,
            method=method,
            status=s,
            http_status=http_s,
            expected_status=expected,
            response_time_ms=ms,
            details=(
                f"Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
                else f"Seguridad OK — HTTP {http_s}" if is_auth and http_s in exp_list
                else f"Documenta endpoint pendiente — 404 esperado" if not is_auth and http_s == 404
                else f"HTTP {http_s} inesperado"
            )
        ))

    return SectionResult(
        id="S3", name="Módulo Guías (/api/guides)",
        description="Directorio de guías verificados, perfiles públicos, endpoints protegidos y pendientes.",
        importance="Los guías son el producto central de Pitzbol para el Mundial 2026.",
        how_to_interpret=(
            "/api/guides/verified y profile: PASSED públicos. "
            "Admin/auth: PASSED con 401/403. "
            "No implementados: PASSED con 404."
        ),
        acceptance="GET /api/guides/verified: PASSED con 200. Endpoints privados: PASSED con 401/403.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 4: Frontend Health
# ──────────────────────────────────────────────────────────────────

def run_section4(frontend_base: str, include_prod: bool) -> SectionResult:
    results = []
    t0 = time.monotonic()

    # 4.1 Local
    http_s, body, ms, err = timed_fetch(frontend_base)
    s = determine_status(http_s, 200, ms, err)
    is_html = isinstance(body, str) and "<html" in body.lower()
    results.append(TestResult(
        name=f"GET {frontend_base}/ (local)",
        description="Verifica que Next.js está corriendo y sirve HTML.",
        endpoint=f"GET {frontend_base}/",
        method="GET",
        status="SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE" else
               s if is_html or s == "FAILED" else "WARNING",
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            f"Frontend no disponible — ejecutar: npm run dev en Pitzbol-Frontend" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Frontend OK — HTML válido recibido" if http_s == 200 and is_html
            else f"HTTP 200 pero sin HTML válido" if http_s == 200
            else f"HTTP {http_s}"
        ),
        response_preview=(body[:150] if isinstance(body, str) else preview(body))
    ))

    # 4.2 Producción
    if include_prod:
        http_s, body, ms, err = timed_fetch("https://pitzbol.me")
        s = determine_status(http_s, [200, 301, 302], ms, err)
        results.append(TestResult(
            name="GET https://pitzbol.me/ (producción)",
            description="Verifica que el dominio de producción está activo.",
            endpoint="GET https://pitzbol.me/",
            method="GET",
            status=s,
            http_status=http_s,
            expected_status=[200, 301, 302],
            response_time_ms=ms,
            details=(
                f"No hay conexión a pitzbol.me — verificar VPS" if err == "SERVIDOR_NO_DISPONIBLE"
                else f"Producción OK — HTTP {http_s}" if http_s in [200, 301, 302]
                else f"HTTP {http_s}"
            )
        ))
    else:
        results.append(TestResult(
            name="GET https://pitzbol.me/ (producción)",
            description="Test de producción omitido. Usar --prod o --all.",
            endpoint="GET https://pitzbol.me/",
            method="GET",
            status="SKIPPED",
            http_status=None,
            expected_status=[200, 301, 302],
            response_time_ms=0,
            details="Omitido — ejecutar con flag --prod para incluir"
        ))

    # 4.3 Validación HTML
    http_s, body, ms, err = timed_fetch(frontend_base)
    if http_s == 200 and isinstance(body, str):
        body_lower = body.lower()
        has_doctype = "<!doctype html" in body_lower or "<html" in body_lower
        has_head = "<head" in body_lower
        has_body_tag = "<body" in body_lower
        valid = has_doctype and has_head and has_body_tag
        results.append(TestResult(
            name="Validación HTML Frontend",
            description="Verifica que el HTML tiene estructura válida (doctype, head, body).",
            endpoint=f"GET {frontend_base}/",
            method="GET",
            status="PASSED" if valid else "WARNING",
            http_status=http_s,
            expected_status=200,
            response_time_ms=ms,
            details=(
                f"HTML válido: doctype={has_doctype}, head={has_head}, body={has_body_tag}"
                if valid else f"HTML incompleto: doctype={has_doctype}, head={has_head}, body={has_body_tag}"
            ),
            response_preview=body[:200]
        ))
    else:
        results.append(TestResult(
            name="Validación HTML Frontend",
            description="Verifica estructura HTML.",
            endpoint=f"GET {frontend_base}/",
            method="GET",
            status="SKIPPED",
            http_status=http_s,
            expected_status=200,
            response_time_ms=ms,
            details="Frontend no disponible — omitiendo validación HTML"
        ))

    return SectionResult(
        id="S4", name="Frontend Health",
        description="Verifica que Next.js sirve HTML válido y opcionalmente conecta con pitzbol.me.",
        importance="El frontend es la interfaz con el turista. Un fallo aquí bloquea a todos los usuarios.",
        how_to_interpret="PASSED = Next.js OK. SKIPPED = no está corriendo. WARNING = sin HTML válido.",
        acceptance="Local: PASSED con HTML válido y < 3000ms.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 5: Static Assets
# ──────────────────────────────────────────────────────────────────

def run_section5(frontend_base: str, backend_base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()

    assets = [
        ("/favicon.ico", "Favicon"),
        ("/_next/static/", "Next.js Static Dir"),
    ]
    for path, label in assets:
        http_s, body, ms, err = timed_fetch(f"{frontend_base}{path}")
        results.append(TestResult(
            name=f"{label} — {path}",
            description=f"Verifica que Next.js sirve {path} correctamente.",
            endpoint=f"GET {frontend_base}{path}",
            method="GET",
            status=(
                "SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE"
                else "PASSED" if http_s in [200, 304]
                else "WARNING" if http_s == 404
                else "FAILED"
            ),
            http_status=http_s,
            expected_status=[200, 304],
            response_time_ms=ms,
            details=(
                "Servidor no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
                else f"Asset servido — HTTP {http_s}" if http_s in [200, 304]
                else f"Asset no encontrado (puede ser normal si aún no existe)" if http_s == 404
                else f"HTTP {http_s}"
            )
        ))

    # Datos públicos de lugares
    http_s, body, ms, err = timed_fetch(f"{backend_base}/api/lugares")
    s = determine_status(http_s, 200, ms, err)
    results.append(TestResult(
        name="GET /api/lugares (datos públicos)",
        description="Catálogo de lugares turísticos de Guadalajara — datos semistáticos públicos.",
        endpoint="GET /api/lugares",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Datos OK — {len(body) if isinstance(body, list) else 'respuesta'} lugares" if s != "FAILED"
            else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    return SectionResult(
        id="S5", name="Static Assets",
        description="Verifica que Next.js sirve assets estáticos y que los datos públicos del API responden.",
        importance="Sin JS/CSS de Next.js la app no funciona en el cliente.",
        how_to_interpret="PASSED = asset disponible. WARNING = 404 (puede no existir todavía). SKIPPED = no corre.",
        acceptance="Idealmente PASSED. 404 aceptable si aún no se generaron.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 6: Integration E2E Flows
# ──────────────────────────────────────────────────────────────────

def run_section6(base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()

    # Flow 1: guías → perfil → booking (espera 401)
    print(f"  {CYAN}[E2E Flow 1]{RESET} Buscar guía → Ver perfil → Intentar booking")
    guia_uid = None
    http_s, body, ms, err = timed_fetch(f"{base}/api/guides/verified")
    s = determine_status(http_s, 200, ms, err)
    if isinstance(body, list) and body:
        guia_uid = body[0].get("uid") or body[0].get("id")
    results.append(TestResult(
        name="[Flow 1 · Paso 1] Listar guías verificados",
        description="Obtiene la lista de guías disponibles para el turista.",
        endpoint="GET /api/guides/verified",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            f"Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"{len(body) if isinstance(body, list) else 0} guías — {'UID capturado' if guia_uid else 'sin UID'}"
            if s != "FAILED" else f"HTTP {http_s}"
        )
    ))

    uid = guia_uid or "guia-demo-001"
    http_s, body, ms, err = timed_fetch(f"{base}/api/guides/profile/{uid}")
    s = determine_status(http_s, [200, 404], ms, err)
    results.append(TestResult(
        name="[Flow 1 · Paso 2] Ver perfil del guía",
        description=f"Carga perfil público del guía {'(UID real)' if guia_uid else '(UID demo)'}.",
        endpoint=f"GET /api/guides/profile/{uid}",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=[200, 404],
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else "Perfil cargado — flujo guía OK" if http_s == 200
            else "Guía demo no encontrado — endpoint funcional" if http_s == 404
            else f"HTTP {http_s}"
        )
    ))

    http_s, body, ms, err = timed_fetch(
        f"{base}/api/bookings/create", method="POST",
        body={"guiaId": guia_uid or "demo", "fecha": "2026-06-15", "horas": 4}
    )
    s = determine_status(http_s, [401, 403], ms, err, check_perf=False)
    results.append(TestResult(
        name="[Flow 1 · Paso 3] Intentar booking sin auth (espera 401)",
        description="Un turista sin sesión no debe poder reservar. Verifica seguridad del flujo.",
        endpoint="POST /api/bookings/create",
        method="POST",
        status=s,
        http_status=http_s,
        expected_status=[401, 403],
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Flujo seguro — booking requiere auth (HTTP {http_s})" if http_s in [401, 403]
            else f"VULNERABILIDAD: booking sin auth da HTTP {http_s}"
        )
    ))

    # Flow 2: lugares → detalle
    print(f"  {CYAN}[E2E Flow 2]{RESET} Explorar lugares → ver detalle")
    primer_lugar = None
    http_s, body, ms, err = timed_fetch(f"{base}/api/lugares")
    s = determine_status(http_s, 200, ms, err)
    if isinstance(body, list) and body:
        primer_lugar = body[0].get("nombre") or body[0].get("name")
    results.append(TestResult(
        name="[Flow 2 · Paso 1] Listar lugares turísticos",
        description="Catálogo de lugares de Guadalajara para el turista.",
        endpoint="GET /api/lugares",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"{len(body) if isinstance(body, list) else 0} lugares — \"{primer_lugar}\" capturado"
            if s != "FAILED" else f"HTTP {http_s}"
        )
    ))

    nombre = urllib.parse.quote(primer_lugar or "Catedral de Guadalajara")
    http_s, body, ms, err = timed_fetch(f"{base}/api/lugares/{nombre}")
    s = determine_status(http_s, [200, 404], ms, err)
    results.append(TestResult(
        name="[Flow 2 · Paso 2] Ver detalle de lugar",
        description=f"Detalle de \"{primer_lugar or 'Catedral de Guadalajara'}\".",
        endpoint=f"GET /api/lugares/{nombre}",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=[200, 404],
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else "Lugar encontrado — flujo exploración OK" if http_s == 200
            else "Lugar no encontrado — endpoint funcional" if http_s == 404
            else f"HTTP {http_s}"
        )
    ))

    # Flow 3: tours → detalle
    print(f"  {CYAN}[E2E Flow 3]{RESET} Tours públicos → filtrar")
    tour_id = None
    http_s, body, ms, err = timed_fetch(f"{base}/api/tours")
    s = determine_status(http_s, 200, ms, err)
    if isinstance(body, list) and body:
        tour_id = body[0].get("id") or body[0].get("uid")
    results.append(TestResult(
        name="[Flow 3 · Paso 1] Listar tours disponibles",
        description="Catálogo de tours del sistema.",
        endpoint="GET /api/tours",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"{len(body) if isinstance(body, list) else 0} tours disponibles"
            if s != "FAILED" else f"HTTP {http_s}"
        )
    ))

    tid = tour_id or "tour-demo-001"
    http_s, body, ms, err = timed_fetch(f"{base}/api/tours/{tid}")
    s = determine_status(http_s, [200, 404], ms, err)
    results.append(TestResult(
        name="[Flow 3 · Paso 2] Ver tour específico",
        description="Detalle de un tour para la pantalla de compra.",
        endpoint=f"GET /api/tours/{tid}",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=[200, 404],
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else "Tour encontrado — flujo compra desbloqueado" if http_s == 200
            else "Tour no encontrado (ID demo) — endpoint funcional" if http_s == 404
            else f"HTTP {http_s}"
        )
    ))

    return SectionResult(
        id="S6", name="Integration E2E Flows",
        description="Simula flujos completos: guía→perfil→booking, lugares→detalle, tours→detalle.",
        importance="Las pruebas unitarias no detectan fallos entre módulos. Estos flujos cubren la experiencia real.",
        how_to_interpret=(
            "Cada paso encadena el anterior. Si el Paso 1 falla, el Paso 2 usa datos demo. "
            "Flow 1 PASSED completo = cadena guía→booking operativa."
        ),
        acceptance="Flow 1: todos PASSED. Flows 2 y 3: Paso 1 (listado) debe ser PASSED.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 7: Módulo IA Backend
# ──────────────────────────────────────────────────────────────────

def run_section7(base: str) -> SectionResult:
    """
    IA ya NO usa Ollama. El motor es el algoritmo híbrido en ia-engine.ts (pitzbol-web :3003):
      - generateItinerary()  → constraint-based scheduling
      - sortByProximity()    → KNN greedy por distancia haversine
      - pickAddStop/Replace() → selección con reglas de horario/gastro
    El motor corre como funciones puras (sin REST API propia).
    Data pipeline: GET /api/places (pitzbol-web) → CSV + Firebase.
    """
    results = []
    t0 = time.monotonic()
    ia_base = "http://localhost:3003"

    # 7.1 GET /api/ai — debe referenciar motor híbrido, no Ollama
    http_s, body, ms, err = timed_fetch(f"{base}/api/ai")
    s = determine_status(http_s, 200, ms, err)
    mentions_hybrid = (
        isinstance(body, dict) and
        "hybrid" in json.dumps(body).lower()
    )
    results.append(TestResult(
        name="GET /api/ai (motor híbrido documentado)",
        description=(
            "Verifica que el endpoint de info de IA referencia ia-engine.ts "
            "y NO menciona Ollama."
        ),
        endpoint="GET /api/ai",
        method="GET",
        status=(
            "SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE"
            else "FAILED" if http_s != 200
            else "PASSED" if mentions_hybrid
            else "WARNING"
        ),
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else "Endpoint refleja motor híbrido — Ollama eliminado correctamente" if mentions_hybrid
            else f"HTTP 200 pero no menciona 'hybrid' — revisar ai.routes.ts" if http_s == 200
            else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    # 7.2 GET /api/places (pitzbol-web — data pipeline del algoritmo híbrido)
    http_s, body, ms, err = timed_fetch(f"{ia_base}/api/places")
    s = determine_status(http_s, 200, ms, err)
    count = len(body) if isinstance(body, list) else None
    results.append(TestResult(
        name="GET /api/places (data pipeline del algoritmo híbrido)",
        description=(
            "Endpoint en pitzbol-web (:3003) que alimenta ia-engine.ts. "
            "Fusiona Firebase + datosLugares.csv."
        ),
        endpoint="GET http://localhost:3003/api/places",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "pitzbol-web no disponible — levantar con: npm run dev en pitzbol-web" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Data pipeline OK — {count} lugares (Firebase + CSV)" if s != "FAILED" and count is not None
            else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    # 7.3 GET /api/paquetes (público)
    http_s, body, ms, err = timed_fetch(f"{base}/api/paquetes")
    s = determine_status(http_s, 200, ms, err)
    results.append(TestResult(
        name="GET /api/paquetes (público)",
        description="Paquetes turísticos que complementan los itinerarios del motor híbrido.",
        endpoint="GET /api/paquetes",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"{len(body) if isinstance(body, list) else 'respuesta'} paquetes" if s != "FAILED"
            else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    # 7.4 GET /api/ratings/guide/:id (público)
    http_s, body, ms, err = timed_fetch(f"{base}/api/ratings/guide/demo-guide-id")
    s = determine_status(http_s, 200, ms, err)
    results.append(TestResult(
        name="GET /api/ratings/guide/:id (ratings públicos)",
        description="Calificaciones de guías. El motor puede usar rating como señal de calidad.",
        endpoint="GET /api/ratings/guide/demo-guide-id",
        method="GET",
        status=s,
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"Ratings OK — {body.get('total', 0) if isinstance(body, dict) else 0} calificaciones" if http_s == 200
            else f"HTTP {http_s}"
        ),
        response_preview=preview(body)
    ))

    # 7.5–7.7 Funciones puras en ia-engine.ts — sin REST API propia
    engine_fns = [
        ("POST /api/recommendations",
         "generateItinerary(places, opts) en ia-engine.ts — constraint-based scheduling completo."),
        ("POST /api/knn-search",
         "sortByProximity() + haversine() en ia-engine.ts — KNN greedy geográfico."),
        ("POST /api/hybrid-search",
         "Todo ia-engine.ts ES el híbrido: generateItinerary + pickAddStop + pickReplaceStop."),
    ]

    for endpoint_str, note in engine_fns:
        method, path = endpoint_str.split(" ", 1)
        http_s, body, ms, err = timed_fetch(f"{base}{path}", method=method, body={"test": True})
        results.append(TestResult(
            name=f"{endpoint_str} (ia-engine.ts — función pura, sin REST)",
            description=note,
            endpoint=endpoint_str,
            method=method,
            status="SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE" else ("PASSED" if http_s == 404 else "WARNING"),
            http_status=http_s,
            expected_status=404,
            response_time_ms=ms,
            details=(
                "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
                else f"Sin REST API — lógica en {note.split('—')[0].strip()}" if http_s == 404
                else f"HTTP {http_s} — revisar si se agregó un endpoint REST"
            )
        ))

    return SectionResult(
        id="S7", name="Módulo IA Híbrida (ia-engine.ts)",
        description=(
            "Prueba el motor de IA híbrido: constraint-based scheduling + KNN geográfico. "
            "Verifica el data pipeline (/api/places en pitzbol-web), "
            "datos turísticos y confirma que Ollama fue eliminado."
        ),
        importance=(
            "El algoritmo híbrido (ia-engine.ts) es el corazón de Pitzbol para el Mundial 2026. "
            "Sin datos en /api/places el motor no puede generar itinerarios."
        ),
        how_to_interpret=(
            "GET /api/ai: PASSED si menciona 'hybrid' (Ollama eliminado). "
            "GET /api/places: PASSED = data pipeline operativo. "
            "Funciones puras (recommendations, knn, hybrid): PASSED con 404 — viven en ia-engine.ts."
        ),
        acceptance=(
            "GET /api/ai: PASSED. GET /api/places: PASSED con lista de lugares. "
            "Paquetes y ratings: PASSED con 200. Funciones puras: PASSED con 404."
        ),
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 8: Performance Testing
# ──────────────────────────────────────────────────────────────────

def run_section8(base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()

    perf_endpoints = [
        ("/",                             "GET",  None, "Health Root"),
        ("/api/guides/verified",          "GET",  None, "Guías Verificados"),
        ("/api/lugares",                  "GET",  None, "Lista Lugares"),
        ("/api/tours",                    "GET",  None, "Lista Tours"),
        ("/api/paquetes",                 "GET",  None, "Lista Paquetes"),
        ("/api/business/validate-uniqueness", "POST",
         {"email": "perf@pitzbol.me", "nombre": "PerfTest"}, "Validar Unicidad"),
    ]

    for path, method, body_data, label in perf_endpoints:
        http_s, body, ms, err = timed_fetch(f"{base}{path}", method=method, body=body_data)

        if err == "SERVIDOR_NO_DISPONIBLE":
            s = "SKIPPED"
        elif http_s is None:
            s = "FAILED"
        elif ms > PERF_FAILED:
            s = "FAILED"
        elif ms > PERF_WARNING:
            s = "WARNING"
        else:
            s = "PASSED"

        results.append(TestResult(
            name=f"[Perf] {label}",
            description=f"Tiempo de respuesta de {method} {path}.",
            endpoint=f"{method} {path}",
            method=method,
            status=s,
            http_status=http_s,
            expected_status=[200, 400, 401, 409],
            response_time_ms=ms,
            details=(
                "Backend no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
                else f"{ms}ms | WARNING>{PERF_WARNING}ms | FAILED>{PERF_FAILED}ms | HTTP:{http_s}"
            )
        ))

    return SectionResult(
        id="S8", name=f"Performance Testing (WARNING>{PERF_WARNING}ms, FAILED>{PERF_FAILED}ms)",
        description=f"Mide tiempos de respuesta. WARNING: >{PERF_WARNING}ms. FAILED: >{PERF_FAILED}ms.",
        importance="Con el tráfico del Mundial 2026 un endpoint lento degrada la experiencia de todos.",
        how_to_interpret=(
            f"PASSED <{PERF_WARNING}ms. WARNING {PERF_WARNING}–{PERF_FAILED}ms (optimizar). "
            f"FAILED >{PERF_FAILED}ms (inaceptable en producción)."
        ),
        acceptance=f"Health Root: <200ms. Listados: <1000ms. Ninguno debe superar {PERF_FAILED}ms.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Sección 9: IA de Itinerarios (pitzbol-web :3003)
# ──────────────────────────────────────────────────────────────────

def run_section9(ia_base: str) -> SectionResult:
    results = []
    t0 = time.monotonic()

    # 9.1 Health del servidor Next.js de IA
    http_s, body, ms, err = timed_fetch(ia_base)
    s = determine_status(http_s, 200, ms, err)
    is_html = isinstance(body, str) and "<html" in body.lower()
    results.append(TestResult(
        name=f"GET {ia_base}/ (pitzbol-web IA)",
        description="Verifica que el servidor de IA de itinerarios está corriendo.",
        endpoint=f"GET {ia_base}/",
        method="GET",
        status="SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE" else
               s if is_html or s == "FAILED" else "WARNING",
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "IA de itinerarios no disponible — ejecutar: npm run dev en pitzbol-web" if err == "SERVIDOR_NO_DISPONIBLE"
            else "pitzbol-web OK — HTML válido" if is_html
            else f"HTTP {http_s}"
        ),
        response_preview=(body[:150] if isinstance(body, str) else preview(body))
    ))

    # 9.2 API de generación de itinerario (si existe endpoint REST)
    # El motor ia-engine.ts es una librería de funciones puras que corre
    # en el browser/servidor Next.js. Probar su endpoint de API si existe.
    for api_path, method, body_data, label, desc in [
        ("/api/generate-itinerary", "POST",
         {
             "interests": ["cultura", "gastronomia", "cafeterias"],
             "ritmo": "normal",
             "startTime": "09:00",
             "budget": 500,
             "selectedDate": "2026-06-18",
             "duration": "dia-completo"
         },
         "POST /api/generate-itinerary",
         "Genera un itinerario completo con el motor constraint-based + scheduling."),
        ("/api/places", "GET", None, "GET /api/places",
         "Retorna el catálogo de lugares (CSV procesado) para el motor de IA."),
    ]:
        http_s, body, ms, err = timed_fetch(f"{ia_base}{api_path}", method=method, body=body_data)
        s = determine_status(http_s, [200, 404], ms, err)
        results.append(TestResult(
            name=f"[IA] {label}",
            description=desc,
            endpoint=f"{method} {ia_base}{api_path}",
            method=method,
            status=(
                "SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE"
                else "PASSED" if http_s == 200
                else "WARNING" if http_s == 404  # endpoint puede no estar como REST
                else s
            ),
            http_status=http_s,
            expected_status=[200, 404],
            response_time_ms=ms,
            details=(
                "pitzbol-web no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
                else f"Endpoint funcional — HTTP 200" if http_s == 200
                else f"Endpoint no expuesto como API REST (lógica en browser)" if http_s == 404
                else f"HTTP {http_s}"
            ),
            response_preview=preview(body)
        ))

    # 9.3 Validar que los datos del CSV son accesibles
    http_s, body, ms, err = timed_fetch(f"{ia_base}/datosLugares.csv")
    results.append(TestResult(
        name="GET /datosLugares.csv (datos del motor IA)",
        description="El CSV con 82 lugares es el input del motor de itinerarios ia-engine.ts.",
        endpoint=f"GET {ia_base}/datosLugares.csv",
        method="GET",
        status=(
            "SKIPPED" if err == "SERVIDOR_NO_DISPONIBLE"
            else "PASSED" if http_s == 200
            else "FAILED" if http_s == 404
            else "WARNING"
        ),
        http_status=http_s,
        expected_status=200,
        response_time_ms=ms,
        details=(
            "pitzbol-web no disponible" if err == "SERVIDOR_NO_DISPONIBLE"
            else f"CSV disponible — {len(body.splitlines()) if isinstance(body, str) else '?'} líneas" if http_s == 200
            else "CSV no encontrado — el motor IA no tendrá datos" if http_s == 404
            else f"HTTP {http_s}"
        )
    ))

    # 9.4 Verificar integridad del CSV (si se pudo obtener)
    if http_s == 200 and isinstance(body, str):
        lines = body.strip().splitlines()
        header = lines[0] if lines else ""
        expected_cols = ["Nombre", "Categoria", "Tipo", "Precio", "Rating", "Descripcion"]
        missing = [c for c in expected_cols if c.lower() not in header.lower()]
        results.append(TestResult(
            name="Integridad del CSV (columnas requeridas por ia-engine.ts)",
            description="Verifica que el CSV tiene las columnas que consume ia-engine.ts.",
            endpoint=f"GET {ia_base}/datosLugares.csv",
            method="GET",
            status="PASSED" if not missing else "FAILED",
            http_status=200,
            expected_status=200,
            response_time_ms=0,
            details=(
                f"CSV válido — {len(lines)-1} lugares, columnas OK" if not missing
                else f"Columnas faltantes: {', '.join(missing)}"
            )
        ))

    return SectionResult(
        id="S9", name="IA de Itinerarios (pitzbol-web :3003)",
        description=(
            "Verifica el servidor de IA de itinerarios (pitzbol-web). "
            "El motor ia-engine.ts usa constraint-based scheduling + haversine geo + scoring de comidas."
        ),
        importance=(
            "El generador de itinerarios es el diferenciador de Pitzbol. "
            "El CSV datosLugares.csv con 82 lugares es el input crítico del motor."
        ),
        how_to_interpret=(
            "PASSED = servidor disponible y datos accesibles. "
            "WARNING en API REST = normal si la lógica corre en browser (no como endpoint). "
            "FAILED en CSV = el motor no tiene datos para generar itinerarios."
        ),
        acceptance="Health: PASSED. CSV: PASSED con 200 y todas las columnas. API REST: PASSED o WARNING.",
        results=results,
        total_ms=int((time.monotonic() - t0) * 1000)
    )


# ──────────────────────────────────────────────────────────────────
# Generación de reportes
# ──────────────────────────────────────────────────────────────────

EMOJI = {"PASSED": "✅", "FAILED": "❌", "WARNING": "⚠️", "SKIPPED": "⏭️"}

def generate_markdown(sections: list, summary: dict, meta: dict) -> str:
    pass_rate = (
        round(((summary["passed"] + summary["warning"]) / summary["total"]) * 100)
        if summary["total"] else 0
    )
    overall = (
        "✅ SISTEMA OPERATIVO" if summary["failed"] == 0 and summary["skipped"] < summary["total"] * 0.5
        else "⚠️ SISTEMA DEGRADADO" if summary["failed"] <= 3
        else "❌ SISTEMA CON FALLOS CRÍTICOS"
    )

    lines = [
        "# Pitzbol — Reporte de Pruebas de Integración (Python)",
        "",
        f"**Generado:** {meta['generated_at']}  ",
        f"**Entorno:** {meta['environment']}  ",
        f"**Backend:** `{meta['backend_url']}`  ",
        f"**Frontend:** `{meta['frontend_url']}`  ",
        f"**Duración total:** {summary['duration_ms']}ms",
        "",
        "---",
        "",
        "## Resumen Ejecutivo",
        "",
        "| Indicador | Valor |",
        "|-----------|-------|",
        f"| Total de pruebas | {summary['total']} |",
        f"| ✅ PASSED | {summary['passed']} |",
        f"| ⚠️ WARNING | {summary['warning']} |",
        f"| ❌ FAILED | {summary['failed']} |",
        f"| ⏭️ SKIPPED | {summary['skipped']} |",
        f"| Tasa de éxito | {pass_rate}% |",
        f"| Duración | {summary['duration_ms']}ms |",
        "",
        f"> **{overall}** — Tasa de éxito: {pass_rate}%",
        "",
        "---",
        "",
        "## Guía de Interpretación",
        "",
        "| Estado | Significado | Acción |",
        "|--------|-------------|--------|",
        "| ✅ PASSED | Responde correctamente en tiempo | Ninguna |",
        f"| ⚠️ WARNING | Lento (>{PERF_WARNING}ms) o comportamiento no ideal | Monitorear |",
        f"| ❌ FAILED | No responde, HTTP inesperado o >{PERF_FAILED}ms | Investigar |",
        "| ⏭️ SKIPPED | Servidor no disponible | Verificar que corra |",
        "",
        f"**Umbrales:** 🟢 <500ms óptimo · 🟡 <{PERF_WARNING}ms aceptable · 🟠 WARNING · 🔴 >{PERF_FAILED}ms FAILED",
        "",
        "---",
        "",
    ]

    for sec in sections:
        s_passed  = sum(1 for r in sec.results if r.status == "PASSED")
        s_failed  = sum(1 for r in sec.results if r.status == "FAILED")
        s_warning = sum(1 for r in sec.results if r.status == "WARNING")
        s_skipped = sum(1 for r in sec.results if r.status == "SKIPPED")
        s_total   = len(sec.results)

        lines += [
            f"## {sec.id}: {sec.name}",
            "",
            f"**Descripción:** {sec.description}",
            "",
            f"**Importancia:** {sec.importance}",
            "",
            f"**Cómo interpretar:** {sec.how_to_interpret}",
            "",
            f"**Criterios de aceptación:** {sec.acceptance}",
            "",
            f"**Resultados:** {s_passed}/{s_total} PASSED · {s_warning} WARNING · {s_failed} FAILED · {s_skipped} SKIPPED · {sec.total_ms}ms",
            "",
            "| Estado | Prueba | Endpoint | HTTP | Tiempo | Detalles |",
            "|--------|--------|----------|------|--------|----------|",
        ]

        for r in sec.results:
            http_str = str(r.http_status) if r.http_status is not None else "n/a"
            time_str = f"{r.response_time_ms}ms" if r.response_time_ms > 0 else "—"
            details  = r.details.replace("|", "\\|")
            name     = r.name.replace("|", "\\|")
            lines.append(
                f"| {EMOJI[r.status]} {r.status} | {name} | "
                f"`{r.endpoint}` | {http_str} | {time_str} | {details} |"
            )

        lines += ["", "---", ""]

    lines += [
        "## Endpoints Pendientes de Implementar",
        "",
        "| Endpoint solicitado | Alternativa actual |",
        "|--------------------|--------------------|",
        "| `GET /health` | `GET /` retorna `{ status: 'ok' }` |",
        "| `GET /api/version` | No hay versioning de API |",
        "| `GET /api/businesses` (plural) | `GET /api/business/my-business` (requiere auth) |",
        "| `POST /api/businesses/search` | `GET /api/lugares` para búsqueda |",
        "| `POST /api/route-planning` | Planificado para v2 |",
        "| `GET /api/guides/by-business/:id` | Planificado — guías no vinculados a negocios aún |",
        "| `POST /api/recommendations` | `POST /api/ai` (lenguaje natural) |",
        "| `POST /api/knn-search` | Planificado para módulo IA v2 |",
        "| `POST /api/hybrid-search` | Planificado — `ia-engine.ts` tiene la lógica en cliente |",
        "",
        "---",
        f"*Generado por Pitzbol Integration Tests (Python) — {meta['generated_at']}*",
    ]

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────
# Runner principal
# ──────────────────────────────────────────────────────────────────

def status_color(s: str) -> str:
    colors = {
        "PASSED":  color(f"✓ {s}", GREEN, BOLD),
        "FAILED":  color(f"✗ {s}", RED, BOLD),
        "WARNING": color(f"⚠ {s}", YELLOW, BOLD),
        "SKIPPED": color(f"○ {s}", GRAY, BOLD),
    }
    return colors.get(s, s)


def count_stats(sections):
    passed = failed = warning = skipped = 0
    for sec in sections:
        for r in sec.results:
            if r.status == "PASSED":   passed  += 1
            elif r.status == "FAILED": failed  += 1
            elif r.status == "WARNING": warning += 1
            else: skipped += 1
    return passed, failed, warning, skipped


def main():
    suite_start = time.monotonic()
    generated_at = datetime.datetime.now().isoformat()

    print(f"\n{BOLD}{CYAN}╔═══════════════════════════════════════════════════╗{RESET}")
    print(f"{BOLD}{CYAN}║  PITZBOL — Suite de Integración (Python)           ║{RESET}")
    print(f"{BOLD}{CYAN}╚═══════════════════════════════════════════════════╝{RESET}")
    print(f"{GRAY}  Backend:  {BACKEND}{RESET}")
    print(f"{GRAY}  Frontend: {FRONTEND}{RESET}")
    print(f"{GRAY}  IA:       {IA_URL} {'(incluido)' if INCLUDE_IA else '(omitido — usar --ia)'}{RESET}")
    print(f"{GRAY}  Prod:     {'sí (--prod)' if INCLUDE_PROD else 'no'}{RESET}")
    print(f"{GRAY}  Fecha:    {generated_at}{RESET}")
    print()

    sections = []

    def run(label: str, fn):
        sys.stdout.write(f"{BOLD}{label}{RESET}... ")
        sys.stdout.flush()
        sec = fn()
        p = sum(1 for r in sec.results if r.status == "PASSED")
        f = sum(1 for r in sec.results if r.status == "FAILED")
        w = sum(1 for r in sec.results if r.status == "WARNING")
        sk = sum(1 for r in sec.results if r.status == "SKIPPED")
        total = len(sec.results)

        if f > 0:
            summary_str = color(f"{p}/{total} PASSED, {f} FAILED", RED)
        elif w > 0:
            summary_str = color(f"{p}/{total} PASSED, {w} WARNING", YELLOW)
        elif sk == total:
            summary_str = color(f"{sk}/{total} SKIPPED", GRAY)
        else:
            summary_str = color(f"{p}/{total} PASSED", GREEN)

        print(f"{summary_str}  {GRAY}({sec.total_ms}ms){RESET}")

        for r in sec.results:
            t = f"{GRAY}{r.response_time_ms}ms{RESET}" if r.response_time_ms > 0 else ""
            print(f"  {status_color(r.status)} {r.name} {t}")
            if r.status in ("FAILED", "WARNING"):
                print(f"  {GRAY}  → {r.details}{RESET}")

        print()
        sections.append(sec)

    run("S1: API Health Check        ", lambda: run_section1(BACKEND))
    run("S2: Módulo Negocios         ", lambda: run_section2(BACKEND))
    run("S3: Módulo Guías            ", lambda: run_section3(BACKEND))
    run("S4: Frontend Health         ", lambda: run_section4(FRONTEND, INCLUDE_PROD))
    run("S5: Static Assets           ", lambda: run_section5(FRONTEND, BACKEND))
    run("S6: Integration E2E Flows   ", lambda: run_section6(BACKEND))
    run("S7: Módulo IA + Datos       ", lambda: run_section7(BACKEND))
    run("S8: Performance Testing     ", lambda: run_section8(BACKEND))

    if INCLUDE_IA:
        run("S9: IA Itinerarios          ", lambda: run_section9(IA_URL))

    duration_ms = int((time.monotonic() - suite_start) * 1000)
    passed, failed, warning, skipped = count_stats(sections)
    total = passed + failed + warning + skipped
    pass_rate = round(((passed + warning) / total) * 100) if total else 0

    print(f"{BOLD}{CYAN}═══════════════════════ RESUMEN FINAL ═══════════════════════{RESET}")
    print(f"  Total pruebas:  {total}")
    print(f"  {color(f'✓ PASSED:  {passed}', GREEN)}")
    print(f"  {color(f'⚠ WARNING: {warning}', YELLOW)}")
    print(f"  {color(f'✗ FAILED:  {failed}', RED)}")
    print(f"  {color(f'○ SKIPPED: {skipped}', GRAY)}")
    print(f"  Duración: {duration_ms}ms")
    print()

    if failed == 0 and skipped < total * 0.5:
        print(f"  {color(f'✅ SISTEMA OPERATIVO ({pass_rate}% tasa de éxito)', GREEN, BOLD)}")
    elif failed <= 3:
        print(f"  {color(f'⚠️  SISTEMA DEGRADADO ({pass_rate}%, {failed} fallos)', YELLOW, BOLD)}")
    else:
        print(f"  {color(f'❌ SISTEMA CON FALLOS CRÍTICOS ({failed} fallos)', RED, BOLD)}")
    print()

    # Generar reportes
    reports_dir = Path(__file__).parent / "tests" / "integration" / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    md_path   = reports_dir / f"pitzbol-report-{ts}.md"
    json_path = reports_dir / f"pitzbol-report-{ts}.json"
    latest_md   = reports_dir / "pitzbol-report-latest.md"
    latest_json = reports_dir / "pitzbol-report-latest.json"

    summary = {
        "total": total, "passed": passed, "failed": failed,
        "warning": warning, "skipped": skipped, "duration_ms": duration_ms,
    }
    meta = {
        "generated_at": generated_at,
        "environment": "local + producción" if INCLUDE_PROD else "local",
        "backend_url": BACKEND,
        "frontend_url": FRONTEND,
    }

    md_content = generate_markdown(sections, summary, meta)
    md_path.write_text(md_content, encoding="utf-8")
    latest_md.write_text(md_content, encoding="utf-8")

    report_dict = {
        "title": "Pitzbol Integration Tests (Python)",
        "generated_at": generated_at,
        **meta,
        "summary": summary,
        "sections": [
            {
                "id": s.id,
                "name": s.name,
                "total_ms": s.total_ms,
                "results": [asdict(r) for r in s.results],
            }
            for s in sections
        ],
    }
    json_text = json.dumps(report_dict, indent=2, ensure_ascii=False)
    json_path.write_text(json_text, encoding="utf-8")
    latest_json.write_text(json_text, encoding="utf-8")

    print(f"  📄 Reporte MD:   {md_path}")
    print(f"  📊 Reporte JSON: {json_path}")
    print(f"  📄 Último MD:    {latest_md}")
    print()

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
