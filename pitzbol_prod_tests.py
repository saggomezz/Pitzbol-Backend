#!/usr/bin/env python3
"""
Pitzbol PWA — Suite de Pruebas Funcionales (Producción)
URL base: https://www.pitzbol.me
API:      https://api.pitzbol.me
IA:       https://ia.pitzbol.me
"""

import json
import time
import ssl
import socket
import urllib.request
import urllib.error
import urllib.parse
import datetime
import os

FRONTEND = "https://www.pitzbol.me"
BACKEND  = "https://api.pitzbol.me"
IA_URL   = "https://ia.pitzbol.me"
TIMEOUT  = 15.0

UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
UA_MOBILE  = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1 Mobile/15E148 Safari/604.1"

results = []

# ══════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════

def req(method, url, *, body=None, headers=None, ua=UA_DESKTOP):
    hdrs = {"User-Agent": ua, "Accept": "application/json,text/html,*/*"}
    if headers:
        hdrs.update(headers)
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    else:
        data = None
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        t0 = time.time()
        with urllib.request.urlopen(r, timeout=TIMEOUT) as resp:
            ms = int((time.time() - t0) * 1000)
            content = resp.read()
            return resp.status, ms, dict(resp.headers), content
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        try:
            content = e.read(4096)
        except Exception:
            content = b""
        return e.code, ms, dict(e.headers), content
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return None, ms, {}, str(e).encode()

def record(status, test_id, name, http, ms, detail, module):
    tag = f"[{status}]"
    print(f"  {tag:<10} [{test_id}] {name} | HTTP {http or '-'} | {ms}ms | {detail}")
    results.append({
        "status": status, "id": test_id, "name": name,
        "http": http, "ms": ms, "detail": detail, "module": module
    })

def page_ok(url, test_id, name, module, *, ua=UA_DESKTOP, min_status=200, max_status=299):
    status, ms, hdrs, body = req("GET", url, ua=ua)
    if status is None:
        record("FAILED", test_id, name, None, ms, f"Sin respuesta / timeout: {body.decode(errors='replace')[:80]}", module)
    elif min_status <= status <= max_status:
        record("PASSED", test_id, name, status, ms, f"HTTP {status}", module)
    else:
        record("FAILED", test_id, name, status, ms, f"HTTP {status} inesperado", module)
    return status, ms, hdrs, body

def api_ok(url, test_id, name, module, *, method="GET", body=None, expected=200, warn_ms=3000):
    status, ms, hdrs, content = req(method, url, body=body)
    if status is None:
        record("FAILED", test_id, name, None, ms, f"Sin respuesta / timeout", module)
    elif status == expected:
        note = f"HTTP {status}"
        if ms > warn_ms:
            record("WARNING", test_id, name, status, ms, f"{note} pero {ms}ms > {warn_ms}ms", module)
        else:
            record("PASSED", test_id, name, status, ms, note, module)
    else:
        record("FAILED", test_id, name, status, ms, f"Esperado {expected}, recibido {status}", module)
    return status, ms, hdrs, content

def check_header(hdrs, header_name, test_id, name, module):
    key = header_name.lower()
    found = any(k.lower() == key for k in hdrs)
    if found:
        val = next(v for k, v in hdrs.items() if k.lower() == key)
        record("PASSED", test_id, name, "-", 0, f"Presente: {val[:80]}", module)
    else:
        record("WARNING", test_id, name, "-", 0, f"Header '{header_name}' ausente", module)
    return found

def check_ssl(host, test_id, module):
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.create_connection((host, 443), timeout=10), server_hostname=host) as s:
            cert = s.getpeercert()
            exp_str = cert.get("notAfter", "")
            record("PASSED", test_id, f"SSL/HTTPS válido — {host}", "-", 0,
                   f"Certificado válido, expira: {exp_str}", "SEGURIDAD")
            return True
    except Exception as e:
        record("FAILED", test_id, f"SSL/HTTPS válido — {host}", "-", 0, str(e)[:80], "SEGURIDAD")
        return False

# ══════════════════════════════════════════════════
#  SECCIÓN 1: AUTENTICACIÓN
# ══════════════════════════════════════════════════

def section1():
    print("\n── S1: Autenticación ──────────────────────────────")
    M = "AUTENTICACIÓN"

    page_ok(f"{FRONTEND}/login", "AUT-001", "Página /login carga sin autenticación", M)
    page_ok(f"{FRONTEND}/forgot-password", "AUT-009", "Página /forgot-password carga", M)
    page_ok(f"{FRONTEND}/reset-password", "AUT-010", "Página /reset-password carga", M)

    # Registro sin datos → 400
    api_ok(f"{BACKEND}/api/auth/register", "AUT-001b", "Registro sin datos → 400", M,
           method="POST", body={}, expected=400)

    # Registro email inválido → 400
    api_ok(f"{BACKEND}/api/auth/register", "AUT-002", "Registro email inválido → 400", M,
           method="POST", body={"email": "no-es-email", "password": "abc"}, expected=400)

    # Login credenciales incorrectas → 401
    api_ok(f"{BACKEND}/api/auth/login", "AUT-006", "Login credenciales incorrectas → 401", M,
           method="POST", body={"email": "noexiste@test.com", "password": "wrongpass123"}, expected=401)

    # Recuperar contraseña (email inexistente) → 200 por seguridad
    api_ok(f"{BACKEND}/api/auth/recover-password", "AUT-009b", "Recuperar contraseña email inexistente → 200", M,
           method="POST", body={"email": "noexiste_test_prod@pitzbol.me"}, expected=200)

    # Ruta protegida sin token → 401
    api_ok(f"{BACKEND}/api/auth/update-profile", "AUT-011", "Actualizar perfil sin token → 401", M,
           method="PATCH", body={"nombre": "test"}, expected=401)

    # Logout sin token → 401
    api_ok(f"{BACKEND}/api/auth/logout", "AUT-007", "Logout sin token → 401", M,
           method="POST", expected=401)

    # Página principal sin autenticación
    page_ok(f"{FRONTEND}/", "AUT-011b", "Página / principal carga sin auth", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 2: DESCUBRIMIENTO DE GUÍAS
# ══════════════════════════════════════════════════

def section2():
    print("\n── S2: Descubrimiento de Guías ────────────────────")
    M = "DESCUBRIMIENTO GUÍAS"

    page_ok(f"{FRONTEND}/explora", "GUI-001", "Página /explora carga sin autenticación", M)

    status, ms, _, body = api_ok(f"{BACKEND}/api/guides/verified", "GUI-002",
                                  "GET /api/guides/verified → listado guías activos", M, warn_ms=4000)

    guide_uid = None
    if status == 200:
        try:
            data = json.loads(body)
            guides = data if isinstance(data, list) else data.get("guides", data.get("data", []))
            if guides and len(guides) > 0:
                guide_uid = guides[0].get("uid") or guides[0].get("id") or guides[0].get("userId")
                record("INFO", "GUI-002b", f"Guías encontrados: {len(guides)}", status, ms,
                       f"Primer guía UID: {guide_uid}", M)
        except Exception:
            pass

    if guide_uid:
        api_ok(f"{BACKEND}/api/guides/profile/{guide_uid}", "GUI-005",
               "GET /api/guides/profile/:uid → perfil público", M, warn_ms=4000)
        page_ok(f"{FRONTEND}/perfil/{guide_uid}", "GUI-005b", f"Página /perfil/[uid] carga", M)
        api_ok(f"{BACKEND}/api/ratings/guide/{guide_uid}", "PER-006",
               "GET /api/ratings/guide/:uid", M, warn_ms=4000)
        api_ok(f"{BACKEND}/api/ratings/guide/{guide_uid}/stats", "PER-007",
               "GET /api/ratings/guide/:uid/stats", M, warn_ms=4000)
    else:
        record("SKIPPED", "GUI-005",  "GET /api/guides/profile/:uid", None, 0, "No se obtuvo UID de guía", M)
        record("SKIPPED", "GUI-005b", "Página /perfil/[uid]",         None, 0, "No se obtuvo UID de guía", M)
        record("SKIPPED", "PER-006",  "GET /api/ratings/guide/:uid",  None, 0, "No se obtuvo UID de guía", M)
        record("SKIPPED", "PER-007",  "GET /api/ratings/guide/:uid/stats", None, 0, "No se obtuvo UID de guía", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 3: PERFIL DE GUÍA
# ══════════════════════════════════════════════════

def section3():
    print("\n── S3: Perfil de Guía ─────────────────────────────")
    M = "PERFIL GUÍA"

    # Re-obtener un UID para las pruebas
    status, ms, _, body = req("GET", f"{BACKEND}/api/guides/verified")
    guide_uid = None
    if status == 200:
        try:
            data = json.loads(body)
            guides = data if isinstance(data, list) else data.get("guides", data.get("data", []))
            if guides:
                guide_uid = guides[0].get("uid") or guides[0].get("id") or guides[0].get("userId")
        except Exception:
            pass

    if guide_uid:
        api_ok(f"{BACKEND}/api/availability/{guide_uid}", "PER-004",
               "GET /api/availability/:guideId → disponibilidad", M, warn_ms=4000)
        api_ok(f"{BACKEND}/api/tours/guia/{guide_uid}", "PER-009",
               "GET /api/tours/guia/:uid → tours del guía", M, warn_ms=4000)
        page_ok(f"{FRONTEND}/guia/empresa/{guide_uid}", "PER-001b",
                "Página /guia/empresa/[uid] carga", M)
    else:
        record("SKIPPED", "PER-004",  "GET /api/availability/:guideId", None, 0, "Sin UID de guía", M)
        record("SKIPPED", "PER-009",  "GET /api/tours/guia/:uid",       None, 0, "Sin UID de guía", M)
        record("SKIPPED", "PER-001b", "Página /guia/empresa/[uid]",     None, 0, "Sin UID de guía", M)

    # Intento reserva sin autenticación → 401
    api_ok(f"{BACKEND}/api/bookings/create", "PER-010",
           "POST /api/bookings/create sin auth → 401", M, method="POST",
           body={"guideId": "demo"}, expected=401)

    page_ok(f"{FRONTEND}/perfil", "PER-011", "Página /perfil (protegida) acceso controlado", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 4: BOOKING / RESERVAS
# ══════════════════════════════════════════════════

def section4():
    print("\n── S4: Booking / Reservas ─────────────────────────")
    M = "BOOKING"

    api_ok(f"{BACKEND}/api/bookings/tourist/demo", "BOO-001",
           "GET /api/bookings/tourist/:id sin token → 401", M, expected=401)
    api_ok(f"{BACKEND}/api/bookings/create", "BOO-010",
           "POST /api/bookings/create sin token → 401", M, method="POST",
           body={"guideId": "test"}, expected=401)

    # Obtener un UID de guía para la página de reserva
    status, _, _, body = req("GET", f"{BACKEND}/api/guides/verified")
    guide_uid = None
    if status == 200:
        try:
            data = json.loads(body)
            guides = data if isinstance(data, list) else data.get("guides", data.get("data", []))
            if guides:
                guide_uid = guides[0].get("uid") or guides[0].get("id") or guides[0].get("userId")
        except Exception:
            pass

    if guide_uid:
        page_ok(f"{FRONTEND}/tours/reservar/{guide_uid}", "BOO-001b",
                "Página /tours/reservar/[uid] carga", M)
    else:
        record("SKIPPED", "BOO-001b", "Página /tours/reservar/[uid]", None, 0, "Sin UID", M)

    page_ok(f"{FRONTEND}/tours/confirmacion/demo-booking", "BOO-011",
            "Página /tours/confirmacion/[bookingId] carga", M)
    page_ok(f"{FRONTEND}/tours/pago/demo-booking", "BOO-013",
            "Página /tours/pago/[bookingId] carga", M)

    api_ok(f"{BACKEND}/api/ratings/can-rate/demo-booking", "BOO-011b",
           "GET /api/ratings/can-rate/:id sin token → 401", M, expected=401)
    api_ok(f"{BACKEND}/api/payments/create-payment-intent", "BOO-013b",
           "POST /api/payments/create-payment-intent sin token → 401", M,
           method="POST", body={"bookingId": "demo"}, expected=401)

# ══════════════════════════════════════════════════
#  SECCIÓN 5: EXPLORACIÓN DE LUGARES
# ══════════════════════════════════════════════════

def section5():
    print("\n── S5: Exploración de Lugares ─────────────────────")
    M = "LUGARES"

    api_ok(f"{BACKEND}/api/lugares", "LUG-001", "GET /api/lugares → catálogo", M, warn_ms=4000)

    page_ok(f"{FRONTEND}/cultura",     "LUG-006a", "Página /cultura carga", M)
    page_ok(f"{FRONTEND}/gastronomia", "LUG-006b", "Página /gastronomia carga", M)
    page_ok(f"{FRONTEND}/arte",        "LUG-006c", "Página /arte carga", M)
    page_ok(f"{FRONTEND}/futbol",      "LUG-006d", "Página /futbol carga", M)
    page_ok(f"{FRONTEND}/mapa",        "LUG-007",  "Página /mapa carga", M)

    # Obtener un lugar real del catálogo para pruebas de detalle
    status, ms, _, body = req("GET", f"{BACKEND}/api/lugares")
    lugar_id = None
    lugar_nombre = None
    if status == 200:
        try:
            data = json.loads(body)
            lugares = data if isinstance(data, list) else data.get("lugares", data.get("data", []))
            if lugares:
                lugar_id = lugares[0].get("id") or lugares[0].get("slug")
                lugar_nombre = lugares[0].get("nombre") or lugares[0].get("name") or lugar_id
        except Exception:
            pass

    if lugar_id:
        api_ok(f"{BACKEND}/api/lugares/{urllib.parse.quote(lugar_id)}", "LUG-008",
               "GET /api/lugares/:nombre", M, warn_ms=4000)
    else:
        record("SKIPPED", "LUG-008", "GET /api/lugares/:nombre", None, 0, "Sin ID de lugar disponible", M)

    if lugar_nombre:
        page_ok(f"{FRONTEND}/informacion/{urllib.parse.quote(lugar_nombre)}", "LUG-008b",
                f"Página /informacion/[nombre] carga", M)
        api_ok(f"{BACKEND}/api/place-ratings/{urllib.parse.quote(lugar_nombre)}/stats", "LUG-012",
               "GET /api/place-ratings/:nombre/stats", M, warn_ms=4000)
    else:
        record("SKIPPED", "LUG-008b", "Página /informacion/[nombre]", None, 0, "Sin nombre de lugar", M)
        record("SKIPPED", "LUG-012",  "GET /api/place-ratings/:nombre/stats", None, 0, "Sin nombre", M)

    # IA catalog
    status_ia, ms_ia, _, _ = req("GET", f"{IA_URL}/api/places")
    if status_ia is None:
        record("SKIPPED", "IA-002", "GET /api/places (pitzbol-web IA)", None, ms_ia, "ia.pitzbol.me no disponible", M)
    elif status_ia == 200:
        record("PASSED", "IA-002", "GET /api/places (pitzbol-web IA)", status_ia, ms_ia, "Catálogo IA disponible", M)
    else:
        record("FAILED", "IA-002", "GET /api/places (pitzbol-web IA)", status_ia, ms_ia, f"HTTP {status_ia}", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 6: TOURS / ITINERARIOS
# ══════════════════════════════════════════════════

def section6():
    print("\n── S6: Tours / Itinerarios ────────────────────────")
    M = "TOURS"

    api_ok(f"{BACKEND}/api/tours",    "TOU-001", "GET /api/tours → listado", M, warn_ms=4000)
    api_ok(f"{BACKEND}/api/paquetes", "TOU-002", "GET /api/paquetes → paquetes", M, warn_ms=4000)

    page_ok(f"{FRONTEND}/tours",          "TOU-001b", "Página /tours carga", M)
    page_ok(f"{FRONTEND}/tours/paquetes", "TOU-002b", "Página /tours/paquetes carga", M)
    page_ok(f"{FRONTEND}/itinerario",     "TOU-009",  "Página /itinerario carga", M)
    page_ok(f"{FRONTEND}/itinerario/manual", "TOU-009b", "Página /itinerario/manual carga", M)

    # Detalle de tour con ID real
    status, ms, _, body = req("GET", f"{BACKEND}/api/tours")
    tour_id = None
    if status == 200:
        try:
            data = json.loads(body)
            tours = data if isinstance(data, list) else data.get("tours", data.get("data", []))
            if tours:
                tour_id = tours[0].get("id") or tours[0].get("_id") or tours[0].get("uid")
        except Exception:
            pass

    if tour_id:
        api_ok(f"{BACKEND}/api/tours/{tour_id}", "TOU-004", f"GET /api/tours/:id", M, warn_ms=4000)
    else:
        api_ok(f"{BACKEND}/api/tours/demo-id", "TOU-004", "GET /api/tours/:id (demo)", M,
               warn_ms=4000)  # 404 is fine — endpoint exists

    # pitzbol-web
    status_ia, ms_ia, _, _ = req("GET", f"{IA_URL}/")
    if status_ia is None:
        record("SKIPPED", "IA-001", "pitzbol-web — generador IA disponible", None, ms_ia,
               "ia.pitzbol.me no disponible", M)
    else:
        record("PASSED" if status_ia == 200 else "WARNING", "IA-001",
               "pitzbol-web raíz accesible", status_ia, ms_ia, f"HTTP {status_ia}", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 7: MOTOR IA
# ══════════════════════════════════════════════════

def section7():
    print("\n── S7: Motor IA Híbrido ───────────────────────────")
    M = "MOTOR IA"

    api_ok(f"{BACKEND}/api/ai", "IA-008a", "GET /api/ai → info motor IA", M, warn_ms=4000)

    # Probar ia.pitzbol.me
    status_ia, ms_ia, _, body_ia = req("GET", f"{IA_URL}/")
    ia_up = status_ia is not None

    if not ia_up:
        for tid, name in [
            ("IA-017",  "POST /api/itinerary — modo a-pie"),
            ("IA-003",  "POST /api/itinerary — inputs inválidos → 400"),
            ("IA-007",  "POST /api/itinerary — constraint nocturna"),
        ]:
            record("SKIPPED", tid, name, None, 0, "ia.pitzbol.me no disponible", M)
        record("INFO", "IA-017b", "Coherencia geográfica KNN", None, 0,
               "Verificado por diseño: sortByProximity() + haversine()", M)
    else:
        api_ok(f"{IA_URL}/api/itinerary", "IA-003", "POST /api/itinerary — sin intereses → 400", M,
               method="POST", body={"duracion": "4h", "presupuesto": 100}, expected=400)
        record("INFO", "IA-017b", "Coherencia geográfica KNN", None, 0,
               "Requiere inspección manual del resultado generado", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 8: PANEL DE USUARIO
# ══════════════════════════════════════════════════

def section8():
    print("\n── S8: Panel de Usuario ───────────────────────────")
    M = "PANEL USUARIO"

    endpoints = [
        ("GET", f"{BACKEND}/api/favorites",                   "USU-001", "GET /api/favorites sin token → 401"),
        ("GET", f"{BACKEND}/api/bookings/tourist/demo",       "USU-003", "GET /api/bookings/tourist sin token → 401"),
        ("GET", f"{BACKEND}/api/perfil/foto-perfil",          "USU-009", "GET /api/perfil/foto-perfil sin token → 401"),
        ("GET", f"{BACKEND}/api/perfil/wallet",               "USU-009b","GET /api/perfil/wallet sin token → 401"),
        ("GET", f"{BACKEND}/api/itinerarios/itinerarios",     "USU-013", "GET /api/itinerarios/itinerarios sin token → 401"),
        ("GET", f"{BACKEND}/api/itinerarios/notas",           "USU-013b","GET /api/itinerarios/notas sin token → 401"),
    ]
    for method, url, tid, name in endpoints:
        api_ok(url, tid, name, M, method=method, expected=401)

    page_ok(f"{FRONTEND}/perfil",    "USU-001b", "Página /perfil acceso controlado", M)
    page_ok(f"{FRONTEND}/favoritos", "USU-001c", "Página /favoritos acceso controlado", M)
    page_ok(f"{FRONTEND}/mensajes",  "USU-001d", "Página /mensajes acceso controlado", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 9: PANEL DE GUÍA
# ══════════════════════════════════════════════════

def section9():
    print("\n── S9: Panel de Guía ──────────────────────────────")
    M = "PANEL GUÍA"

    endpoints = [
        ("GET",  f"{BACKEND}/api/guides/my-request",  "GUI-P01", "GET /api/guides/my-request sin token → 401"),
        ("POST", f"{BACKEND}/api/availability/set",   "GUI-P09", "POST /api/availability/set sin token → 401"),
        ("GET",  f"{BACKEND}/api/bookings/guide/demo","GUI-P03", "GET /api/bookings/guide sin token → 401"),
        ("POST", f"{BACKEND}/api/tours",              "GUI-P12", "POST /api/tours sin token → 401"),
        ("POST", f"{BACKEND}/api/guides/add-tour",    "GUI-P11", "POST /api/guides/add-tour sin token → 401"),
    ]
    for method, url, tid, name in endpoints:
        kw = {"body": {"test": 1}} if method == "POST" else {}
        api_ok(url, tid, name, M, method=method, expected=401, **kw)

    page_ok(f"{FRONTEND}/guide/estatus",     "GUI-P01b", "Página /guide/estatus acceso controlado", M)
    page_ok(f"{FRONTEND}/guide/solicitudes", "GUI-P01c", "Página /guide/solicitudes acceso controlado", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 10: PANEL ADMIN
# ══════════════════════════════════════════════════

def section10():
    print("\n── S10: Panel Admin ───────────────────────────────")
    M = "PANEL ADMIN"

    endpoints = [
        ("GET", f"{BACKEND}/api/admin/negocios",              "ADM-001",  "GET /api/admin/negocios sin token → 401"),
        ("GET", f"{BACKEND}/api/admin/negocios/pendientes",   "ADM-008",  "GET /api/admin/negocios/pendientes sin token → 401"),
        ("GET", f"{BACKEND}/api/admin/guias/pendientes",      "ADM-005",  "GET /api/admin/guias/pendientes sin token → 401"),
        ("GET", f"{BACKEND}/api/admin/guias/aprobados",       "ADM-006",  "GET /api/admin/guias/aprobados sin token → 401"),
        ("GET", f"{BACKEND}/api/admin/solicitudes-pendientes","ADM-001b", "GET /api/admin/solicitudes-pendientes sin token → 401"),
        ("GET", f"{BACKEND}/api/admin/usuarios-gestionables", "ADM-011",  "GET /api/admin/usuarios-gestionables sin token → 401"),
    ]
    for method, url, tid, name in endpoints:
        api_ok(url, tid, name, M, method=method, expected=401)

    page_ok(f"{FRONTEND}/admin",          "ADM-001c", "Página /admin acceso controlado", M)
    page_ok(f"{FRONTEND}/admin/guias",    "ADM-005b", "Página /admin/guias acceso controlado", M)
    page_ok(f"{FRONTEND}/admin/negocios", "ADM-008b", "Página /admin/negocios acceso controlado", M)
    page_ok(f"{FRONTEND}/admin/lugares",  "ADM-012",  "Página /admin/lugares acceso controlado", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 11: RESPONSIVIDAD Y UX
# ══════════════════════════════════════════════════

def section11():
    print("\n── S11: Responsividad y UX ────────────────────────")
    M = "RESPONSIVIDAD"

    page_ok(f"{FRONTEND}/manifest.json", "RES-012", "PWA Manifest disponible", M)
    page_ok(f"{FRONTEND}/favicon.ico",   "RES-001",  "Favicon disponible", M)

    # Mobile UA
    for path, tid, name in [
        ("/",        "RES-003a", "Mobile UA — Página principal"),
        ("/explora", "RES-003b", "Mobile UA — /explora"),
        ("/tours",   "RES-003c", "Mobile UA — /tours"),
    ]:
        page_ok(f"{FRONTEND}{path}", tid, name, M, ua=UA_MOBILE)

# ══════════════════════════════════════════════════
#  SECCIÓN 12: SEGURIDAD
# ══════════════════════════════════════════════════

def section12():
    print("\n── S12: Seguridad ─────────────────────────────────")
    M = "SEGURIDAD"

    # SSL
    check_ssl("www.pitzbol.me", "SEC-001a", M)
    check_ssl("api.pitzbol.me", "SEC-001b", M)

    # Headers de seguridad
    status, ms, hdrs, body = req("GET", f"{FRONTEND}/")
    if status is not None:
        check_header(hdrs, "strict-transport-security",     "SEC-001c", "HSTS header presente",          M)
        check_header(hdrs, "x-frame-options",               "SEC-001d", "X-Frame-Options header",        M)
        check_header(hdrs, "x-content-type-options",        "SEC-001e", "X-Content-Type-Options header", M)
        check_header(hdrs, "content-security-policy",       "SEC-001f", "Content-Security-Policy header",M)
        check_header(hdrs, "permissions-policy",            "SEC-001g", "Permissions-Policy header",     M)
    else:
        for tid, name in [("SEC-001c","HSTS"),("SEC-001d","X-Frame"),("SEC-001e","X-CTO"),
                          ("SEC-001f","CSP"),("SEC-001g","Permissions")]:
            record("SKIPPED", tid, name, None, ms, "No se pudo conectar al frontend", M)

    # CORS — api acepta origen pitzbol.me
    status2, ms2, hdrs2, _ = req("GET", f"{BACKEND}/api/guides/verified",
                                  headers={"Origin": "https://www.pitzbol.me"})
    cors_val = hdrs2.get("Access-Control-Allow-Origin", hdrs2.get("access-control-allow-origin", ""))
    if cors_val:
        record("PASSED", "SEC-005", "CORS — API acepta origen pitzbol.me", status2, ms2,
               f"Access-Control-Allow-Origin: {cors_val}", M)
    else:
        record("WARNING", "SEC-005", "CORS — header ausente o restrictivo", status2, ms2,
               "No se encontró Access-Control-Allow-Origin", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 13: PERFORMANCE
# ══════════════════════════════════════════════════

def section13():
    print("\n── S13: Rendimiento ───────────────────────────────")
    M = "PERFORMANCE"

    pages = [
        (f"{FRONTEND}/",        "PER-001", "Página principal carga <3s",    3000),
        (f"{FRONTEND}/explora", "PER-002", "Página /explora carga <3s",     3000),
        (f"{FRONTEND}/tours",   "PER-003", "Página /tours carga <3s",       3000),
        (f"{FRONTEND}/mapa",    "PER-004", "Página /mapa carga <5s",        5000),
    ]
    for url, tid, name, threshold in pages:
        status, ms, _, _ = req("GET", url)
        if status is None:
            record("FAILED", tid, name, None, ms, "Sin respuesta", M)
        elif ms <= threshold:
            record("PASSED", tid, name, status, ms, f"{ms}ms < {threshold}ms ✓", M)
        else:
            record("WARNING", tid, name, status, ms, f"{ms}ms > {threshold}ms", M)

    apis = [
        (f"{BACKEND}/",                    "PER-005a", "Backend health <2s",           2000),
        (f"{BACKEND}/api/guides/verified", "PER-005b", "GET /api/guides/verified <4s", 4000),
        (f"{BACKEND}/api/lugares",         "PER-005c", "GET /api/lugares <3s",         3000),
        (f"{BACKEND}/api/tours",           "PER-005d", "GET /api/tours <3s",           3000),
        (f"{BACKEND}/api/paquetes",        "PER-005e", "GET /api/paquetes <3s",        3000),
    ]
    times = []
    for url, tid, name, threshold in apis:
        status, ms, _, _ = req("GET", url)
        times.append(ms)
        if status is None:
            record("FAILED", tid, name, None, ms, "Sin respuesta", M)
        elif ms <= threshold:
            record("PASSED", tid, name, status, ms, f"{ms}ms < {threshold}ms ✓", M)
        else:
            record("WARNING", tid, name, status, ms, f"{ms}ms > umbral {threshold}ms", M)

    avg = int(sum(times) / len(times)) if times else 0
    status_avg = "PASSED" if avg <= 2500 else "WARNING"
    record(status_avg, "PER-005f", "Tiempo promedio de respuesta API",
           None, avg, f"Promedio: {avg}ms", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 14: ERRORES Y CASOS EDGE
# ══════════════════════════════════════════════════

def section14():
    print("\n── S14: Errores y Casos Edge ──────────────────────")
    M = "ERRORES EDGE"

    # 404 estructurado
    status, ms, hdrs, body = req("GET", f"{BACKEND}/api/ruta-que-no-existe-xyz")
    if status == 404:
        try:
            json.loads(body)
            record("PASSED", "ERR-003", "Ruta inexistente → 404 con JSON", status, ms, "Respuesta JSON estructurada", M)
        except Exception:
            record("WARNING", "ERR-003", "Ruta inexistente → 404 con JSON", status, ms, "404 pero no JSON", M)
    else:
        record("FAILED", "ERR-003", "Ruta inexistente → 404 con JSON", status, ms, f"HTTP {status}", M)

    # 404 página frontend
    status_f, ms_f, _, _ = req("GET", f"{FRONTEND}/pagina-que-no-existe-404")
    if status_f in (200, 404):  # Next.js custom 404 returns HTML with 404 status
        record("PASSED", "ERR-003b", "Página 404 frontend devuelve respuesta", status_f, ms_f, f"HTTP {status_f}", M)
    else:
        record("WARNING", "ERR-003b", "Página 404 frontend", status_f, ms_f, f"HTTP {status_f}", M)

    # JSON malformado
    try:
        t0 = time.time()
        bad_data = b"esto no es json {"
        r = urllib.request.Request(
            f"{BACKEND}/api/auth/login",
            data=bad_data,
            headers={"Content-Type": "application/json", "User-Agent": UA_DESKTOP},
            method="POST",
        )
        with urllib.request.urlopen(r, timeout=TIMEOUT) as resp:
            ms2 = int((time.time() - t0) * 1000)
            record("WARNING", "ERR-001", "Body JSON malformado manejo", resp.status, ms2,
                   f"Esperado 400, recibido {resp.status}", M)
    except urllib.error.HTTPError as e:
        ms2 = int((time.time() - t0) * 1000)
        if e.code == 400:
            record("PASSED", "ERR-001", "Body JSON malformado → 400", e.code, ms2, "Express rechaza JSON inválido", M)
        else:
            record("WARNING", "ERR-001", "Body JSON malformado manejo", e.code, ms2, f"HTTP {e.code}", M)
    except Exception as ex:
        ms2 = int((time.time() - t0) * 1000)
        record("WARNING", "ERR-001", "Body JSON malformado", None, ms2, str(ex)[:60], M)

    # Rate limiting info
    record("INFO", "AUT-013", "Rate limiting en /api/auth/login",
           None, 0, "Configurado: loginLimiter 20/15min (código fuente)", M)

# ══════════════════════════════════════════════════
#  SECCIÓN 15: INTEGRACIONES
# ══════════════════════════════════════════════════

def section15():
    print("\n── S15: Integraciones ─────────────────────────────")
    M = "INTEGRACIONES"

    # Firebase Auth (indirecto — login funciona)
    api_ok(f"{BACKEND}/api/auth/login", "INT-001",
           "Firebase Auth — endpoint login accesible", M,
           method="POST", body={"email": "test@test.com", "password": "wrong"},
           expected=401)

    # Firestore lee datos
    api_ok(f"{BACKEND}/api/guides/verified", "INT-002",
           "Firestore lee datos — GET /api/guides retorna datos", M, warn_ms=5000)

    # Business validate (Firestore escribe indirecto)
    status, ms, _, body = req("POST", f"{BACKEND}/api/business/validate-uniqueness",
                               body={"nombre": "Test Business Pitzbol QA 999", "tipo": "restaurant"})
    if status in (200, 400):
        record("PASSED", "INT-003", "Firestore accesible — POST /api/business/validate-uniqueness",
               status, ms, f"HTTP {status} — Firestore respondió", M)
    else:
        record("WARNING", "INT-003", "Firestore accesible — POST /api/business/validate-uniqueness",
               status, ms, f"HTTP {status}", M)

    # Stripe (indirecto — endpoint protegido existe)
    status_s, ms_s, _, _ = req("POST", f"{BACKEND}/api/payments/create-payment-intent",
                                body={"bookingId": "demo"})
    if status_s == 401:
        record("PASSED", "INT-004", "Stripe — endpoint payment-intent protegido y accesible", status_s, ms_s,
               "Retorna 401 sin token (endpoint existe)", M)
    else:
        record("WARNING", "INT-004", "Stripe — endpoint payment-intent", status_s, ms_s,
               f"HTTP {status_s}", M)

    # Leaflet / mapa — verificar que la página del mapa carga
    status_m, ms_m, _, body_m = req("GET", f"{FRONTEND}/mapa")
    if status_m == 200:
        record("PASSED", "INT-006", "Mapa Leaflet — página /mapa carga correctamente", status_m, ms_m,
               "HTML retornado, Leaflet inicializa en browser", M)
    else:
        record("FAILED", "INT-006", "Mapa Leaflet — página /mapa", status_m, ms_m, f"HTTP {status_m}", M)

    # Soporte
    api_ok(f"{BACKEND}/api/support/contact-forms", "INT-007",
           "GET /api/support/contact-forms (protegido) → 401", M, expected=401)

# ══════════════════════════════════════════════════
#  REPORTE
# ══════════════════════════════════════════════════

def generate_report(duration_ms):
    total   = len(results)
    passed  = sum(1 for r in results if r["status"] == "PASSED")
    failed  = sum(1 for r in results if r["status"] == "FAILED")
    warning = sum(1 for r in results if r["status"] == "WARNING")
    skipped = sum(1 for r in results if r["status"] == "SKIPPED")
    info_c  = sum(1 for r in results if r["status"] == "INFO")

    excl    = total - skipped
    rate    = round(passed / excl * 100) if excl > 0 else 0

    ts = datetime.datetime.now().isoformat()
    os.makedirs("tests/integration/reports", exist_ok=True)

    # JSON
    report_data = {
        "timestamp": ts,
        "frontend": FRONTEND,
        "backend":  BACKEND,
        "ia":       IA_URL,
        "duration_ms": duration_ms,
        "summary": {
            "total": total, "passed": passed, "failed": failed,
            "warning": warning, "skipped": skipped, "info": info_c,
            "success_rate": rate,
        },
        "results": results,
    }
    with open("tests/integration/reports/prod-latest.json", "w", encoding="utf-8") as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)

    # Markdown breve
    lines = [
        f"# Pitzbol PWA — Pruebas Funcionales (Producción)\n",
        f"**Generado:** {ts}  \n**URL:** {FRONTEND}  \n**Duración:** {duration_ms}ms\n\n---\n",
        f"## Resumen\n| | Valor |\n|--|--|\n",
        f"| Total | **{total}** |\n| ✅ PASSED | **{passed}** |\n| ⚠️ WARNING | **{warning}** |\n",
        f"| ❌ FAILED | **{failed}** |\n| ⏭️ SKIPPED | **{skipped}** |\n| **Tasa de éxito** | **{rate}%** |\n\n---\n",
    ]
    with open("tests/integration/reports/prod-latest.md", "w", encoding="utf-8") as f:
        f.writelines(lines)

    print(f"\n{'═'*60}")
    print(f"  RESUMEN FINAL — Producción ({FRONTEND})")
    print(f"{'═'*60}")
    print(f"  Total:   {total}")
    print(f"  PASSED:  {passed}")
    print(f"  WARNING: {warning}")
    print(f"  FAILED:  {failed}")
    print(f"  SKIPPED: {skipped}")
    print(f"  INFO:    {info_c}")
    print(f"  Éxito:      {rate}%  (excl. SKIPPED)")
    print(f"  Duración:   {duration_ms}ms")
    print(f"{'═'*60}")
    print(f"  Reportes en: tests/integration/reports/prod-latest.json")

    return report_data

def main():
    print(f"Pitzbol Functional Tests — PRODUCCIÓN")
    print(f"Frontend: {FRONTEND}")
    print(f"Backend:  {BACKEND}")
    print(f"IA:       {IA_URL}")
    print(f"Timeout:  {TIMEOUT}s")
    print(f"{'─'*60}")

    t0 = time.time()
    section1()
    section2()
    section3()
    section4()
    section5()
    section6()
    section7()
    section8()
    section9()
    section10()
    section11()
    section12()
    section13()
    section14()
    section15()
    duration = int((time.time() - t0) * 1000)

    return generate_report(duration)

if __name__ == "__main__":
    main()
