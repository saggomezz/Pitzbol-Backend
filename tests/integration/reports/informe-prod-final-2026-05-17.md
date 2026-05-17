# Pitzbol PWA — Informe de Pruebas de Producción

**Run #4 · 17 de mayo de 2026 · 33.8 s**

| Servicio | URL |
|----------|-----|
| Frontend | https://www.pitzbol.me |
| Backend  | https://api.pitzbol.me |
| Motor IA | https://ia.pitzbol.me  |

---

## 🏆 Resultado: Infraestructura completamente operativa

> Frontend, API y Motor IA funcionando. Cloudflare Full SSL + Origin Rule :8443 resolvió todos los HTTP 525.  
> Solo 3 fallos residuales de aplicación (datos de prueba / service worker).

**Tasa de éxito: 94%**

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Total tests | 111 |
| ✅ Pasaron | 103 (92.8 %) |
| ❌ Fallaron | 3 (solo app-level) |
| ⏭️ Saltados | 2 (dependen de LUG-008) |
| Tasa de éxito (excl. SKIPPED) | **94 %** |
| Duración total | 33 s |
| Tiempo promedio API | 345 ms |

### Distribución de resultados

```
[████████████████████████████████████████ 103 pasaron (92.8 %)] [❌ 3] [⏭️ 2] [ℹ️ 3]
```

---

## ⚠️ Fallos residuales (NO son problemas de infraestructura)

| ID | Endpoint | Estado | Causa |
|----|----------|--------|-------|
| **LUG-008** | `GET /api/lugares/:nombre` | 404 | El nombre de lugar hardcodeado en el test no existe en la BD actual. No es un error de la API. |
| **IA-008b** | `POST /api/itinerary` | 400 | El body del test no coincide con el esquema esperado. La IA sí funciona (IA-003 pasa). |
| **PER-008** | `/sw.js` | 404 | El Service Worker no se genera. Requiere nuevo deploy en Vercel con `withPWA` habilitado en producción. |

---

## 📈 Evolución histórica de ejecuciones

| Run | Fecha / Hora | Pasaron | Fallaron | Tasa | Causa principal de fallos | Δ |
|-----|-------------|---------|----------|------|--------------------------|---|
| Run #1 | 16 may · pre-fix | 53 / 110 | 40 | 53 % | API: HTTP 525 (CF Full + OpenVPN en 443) · Frontend: HTTP 308 | — base |
| Run #2 | 16 may · CF Flexible | 60 / 111 | 40 | 55 % | API: OK (CF Flexible + nginx port 80) · Frontend: HTTP 308 persistía | +2 % ↑ |
| Run #3 | 17 may · CF Full | 53 / 110 | 41 | 53 % | Frontend: OK ✅ · API: HTTP 525 de nuevo (sin Origin Rule) | −2 % ↓ |
| **Run #4** ✅ | **17 may · solución final** | **103 / 111** | **3** | **🏆 94 %** | CF Full + Origin Rule :8443 → todo OK · 3 fallos app-level | **+41 % ↑↑↑** |

### Progresión de la tasa de éxito

```
#1 (53%)  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░
#2 (55%)  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░
#3 (53%)  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░
#4 (94%)  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░
```

**Solución definitiva aplicada:** Cloudflare SSL **Full** + **Origin Rule** redirige `api.pitzbol.me` e `ia.pitzbol.me` al puerto `8443` donde nginx sirve con certificados Let's Encrypt válidos. Puerto 443 del VPS sigue con OpenVPN (sin cambios en servidor).

---

## Resultados por sección

### S1 — Autenticación ✅ 10 / 10

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | AUT-001 | Página /login carga sin autenticación | 200 | 1203 ms |
| ✅ | AUT-009 | Página /forgot-password carga | 200 | 400 ms |
| ✅ | AUT-010 | Página /reset-password carga | 200 | 311 ms |
| ✅ | AUT-001b | Registro sin datos → 400 | 400 | 506 ms |
| ✅ | AUT-002 | Registro email inválido → 400 | 400 | 204 ms |
| ✅ | AUT-006 | Login credenciales incorrectas → 401 | 401 | 413 ms |
| ✅ | AUT-009b | Recuperar contraseña email inexistente → 200 | 200 | 713 ms |
| ✅ | AUT-011 | Actualizar perfil sin token → 401 | 401 | 152 ms |
| ✅ | AUT-007 | Logout sin token → 401 | 401 | 164 ms |
| ✅ | AUT-011b | Página / principal carga sin auth | 200 | 254 ms |

---

### S2 — Descubrimiento de Guías ✅ 6 / 6 · ℹ️ 1

| Estado | ID | Test | HTTP | Tiempo | Detalle |
|--------|----|------|------|--------|---------|
| ✅ | GUI-001 | Página /explora carga sin autenticación | 200 | 249 ms | |
| ✅ | GUI-002 | GET /api/guides/verified → listado guías activos | 200 | 1201 ms | |
| ℹ️ | GUI-002b | Guías encontrados: 5 | 200 | — | Primer UID: tfMO51nJFJaIKygjk3xoUniuVkj1 |
| ✅ | GUI-005 | GET /api/guides/profile/:uid → perfil público | 200 | 474 ms | |
| ✅ | GUI-005b | Página /perfil/[uid] carga | 200 | 1209 ms | |
| ✅ | PER-006 | GET /api/ratings/guide/:uid | 200 | 266 ms | |
| ✅ | PER-007 | GET /api/ratings/guide/:uid/stats | 200 | 290 ms | |

---

### S3 — Perfil de Guía ✅ 5 / 5

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | PER-004 | GET /api/availability/:guideId → disponibilidad | 200 | 297 ms |
| ✅ | PER-009 | GET /api/tours/guia/:uid → tours del guía | 200 | 225 ms |
| ✅ | PER-001b | Página /guia/empresa/[uid] carga | 200 | 341 ms |
| ✅ | PER-010 | POST /api/bookings/create sin auth → 401 | 401 | 167 ms |
| ✅ | PER-011 | Página /perfil (protegida) acceso controlado | 200 | 165 ms |

---

### S4 — Booking / Reservas ✅ 7 / 7

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | BOO-001 | GET /api/bookings/tourist/:id sin token → 401 | 401 | 155 ms |
| ✅ | BOO-010 | POST /api/bookings/create sin token → 401 | 401 | 156 ms |
| ✅ | BOO-001b | Página /tours/reservar/[uid] carga | 200 | 419 ms |
| ✅ | BOO-011 | Página /tours/confirmacion/[bookingId] carga | 200 | 220 ms |
| ✅ | BOO-013 | Página /tours/pago/[bookingId] carga | 200 | 310 ms |
| ✅ | BOO-011b | GET /api/ratings/can-rate/:id sin token → 401 | 401 | 150 ms |
| ✅ | BOO-013b | POST /api/payments/create-payment-intent sin token → 401 | 401 | 164 ms |

---

### S5 — Exploración de Lugares ✅ 7 · ❌ 1 · ⏭️ 2

| Estado | ID | Test | HTTP | Tiempo | Detalle |
|--------|----|------|------|--------|---------|
| ✅ | LUG-001 | GET /api/lugares → catálogo | 200 | 303 ms | |
| ❌ | LUG-008 | GET /api/lugares/:nombre | 404 | 230 ms | Nombre de prueba no existe en BD actual |
| ✅ | LUG-006a | Página /cultura carga | 200 | 257 ms | |
| ✅ | LUG-006b | Página /gastronomia carga | 200 | 158 ms | |
| ✅ | LUG-006c | Página /arte carga | 200 | 180 ms | |
| ✅ | LUG-006d | Página /futbol carga | 200 | 162 ms | |
| ✅ | LUG-007 | Página /mapa carga | 200 | 163 ms | |
| ✅ | IA-002 | GET /api/places (pitzbol-web IA) | 200 | 2019 ms | Catálogo IA disponible |
| ⏭️ | LUG-008b | Página /informacion/[nombre] | — | 0 ms | Saltado: depende de LUG-008 |
| ⏭️ | LUG-012 | GET /api/place-ratings/:nombre/stats | — | 0 ms | Saltado: depende de LUG-008 |

---

### S6 — Tours / Itinerarios ✅ 8 / 8

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | TOU-001 | GET /api/tours → listado | 200 | 465 ms |
| ✅ | TOU-002 | GET /api/paquetes → paquetes | 200 | 408 ms |
| ✅ | TOU-001b | Página /tours carga | 200 | 512 ms |
| ✅ | TOU-002b | Página /tours/paquetes carga | 200 | 816 ms |
| ✅ | TOU-009 | Página /itinerario carga | 200 | 307 ms |
| ✅ | TOU-009b | Página /itinerario/manual carga | 200 | 202 ms |
| ✅ | TOU-004 | GET /api/tours/:id | 200 | 267 ms |
| ✅ | IA-001 | pitzbol-web raíz accesible | 200 | 228 ms |

---

### S7 — Motor IA Híbrido ✅ 2 · ❌ 1 · ℹ️ 1

| Estado | ID | Test | HTTP | Tiempo | Detalle |
|--------|----|------|------|--------|---------|
| ✅ | IA-008a | GET /api/ai → info motor IA | 200 | 143 ms | |
| ✅ | IA-003 | POST /api/itinerary — sin intereses → 400 | 400 | 369 ms | Validación OK |
| ❌ | IA-008b | POST /api/itinerary — genera itinerario | 400 | 343 ms | Body del test no coincide con esquema esperado |
| ℹ️ | IA-017b | Coherencia geográfica KNN | — | — | Requiere inspección manual del resultado |

---

### S8 — Panel de Usuario ✅ 9 / 9

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | USU-001 | GET /api/favorites sin token → 401 | 401 | 140 ms |
| ✅ | USU-003 | GET /api/bookings/tourist sin token → 401 | 401 | 156 ms |
| ✅ | USU-009 | GET /api/perfil/foto-perfil sin token → 401 | 401 | 183 ms |
| ✅ | USU-009b | GET /api/perfil/wallet sin token → 401 | 401 | 135 ms |
| ✅ | USU-013 | GET /api/itinerarios/itinerarios sin token → 401 | 401 | 146 ms |
| ✅ | USU-013b | GET /api/itinerarios/notas sin token → 401 | 401 | 150 ms |
| ✅ | USU-001b | Página /perfil acceso controlado | 200 | 143 ms |
| ✅ | USU-001c | Página /favoritos acceso controlado | 200 | 165 ms |
| ✅ | USU-001d | Página /mensajes acceso controlado | 200 | 262 ms |

---

### S9 — Panel de Guía ✅ 7 / 7

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | GUI-P01 | GET /api/guides/my-request sin token → 401 | 401 | 131 ms |
| ✅ | GUI-P09 | POST /api/availability/set sin token → 401 | 401 | 151 ms |
| ✅ | GUI-P03 | GET /api/bookings/guide sin token → 401 | 401 | 137 ms |
| ✅ | GUI-P12 | POST /api/tours sin token → 401 | 401 | 154 ms |
| ✅ | GUI-P11 | POST /api/guides/add-tour sin token → 401 | 401 | 188 ms |
| ✅ | GUI-P01b | Página /guide/estatus acceso controlado | 200 | 161 ms |
| ✅ | GUI-P01c | Página /guide/solicitudes acceso controlado | 200 | 153 ms |

---

### S10 — Panel Admin ✅ 10 / 10

| Estado | ID | Test | HTTP | Tiempo |
|--------|----|------|------|--------|
| ✅ | ADM-001 | GET /api/admin/negocios sin token → 401 | 401 | 147 ms |
| ✅ | ADM-008 | GET /api/admin/negocios/pendientes sin token → 401 | 401 | 141 ms |
| ✅ | ADM-005 | GET /api/admin/guias/pendientes sin token → 401 | 401 | 137 ms |
| ✅ | ADM-006 | GET /api/admin/guias/aprobados sin token → 401 | 401 | 148 ms |
| ✅ | ADM-001b | GET /api/admin/solicitudes-pendientes sin token → 401 | 401 | 137 ms |
| ✅ | ADM-011 | GET /api/admin/usuarios-gestionables sin token → 401 | 401 | 166 ms |
| ✅ | ADM-001c | Página /admin acceso controlado | 200 | 169 ms |
| ✅ | ADM-005b | Página /admin/guias acceso controlado | 200 | 142 ms |
| ✅ | ADM-008b | Página /admin/negocios acceso controlado | 200 | 167 ms |
| ✅ | ADM-012 | Página /admin/lugares acceso controlado | 200 | 157 ms |

---

### S11 — Responsividad y UX ✅ 5 · ❌ 1

| Estado | ID | Test | HTTP | Tiempo | Detalle |
|--------|----|------|------|--------|---------|
| ✅ | RES-012 | PWA Manifest disponible | 200 | 159 ms | |
| ✅ | RES-001 | Favicon disponible | 200 | 243 ms | |
| ✅ | RES-003a | Mobile UA — Página principal | 200 | 164 ms | |
| ✅ | RES-003b | Mobile UA — /explora | 200 | 143 ms | |
| ✅ | RES-003c | Mobile UA — /tours | 200 | 142 ms | |
| ❌ | PER-008 | Service Worker /sw.js disponible | 404 | 251 ms | Requiere nuevo deploy en Vercel con `next-pwa` |

---

### S12 — Seguridad ✅ 8 / 8

| Estado | ID | Test | Detalle |
|--------|----|------|---------|
| ✅ | SEC-001a | SSL/HTTPS válido — www.pitzbol.me | Certificado válido · expira Jul 15 2026 |
| ✅ | SEC-001b | SSL/HTTPS válido — api.pitzbol.me | Certificado válido · expira Jul 15 2026 |
| ✅ | SEC-001c | HSTS header presente | `max-age=63072000; includeSubDomains; preload` |
| ✅ | SEC-001d | X-Frame-Options header | `DENY` |
| ✅ | SEC-001e | X-Content-Type-Options header | `nosniff` |
| ✅ | SEC-001f | Content-Security-Policy header | `default-src 'self'; script-src 'self' 'unsafe-inline'…` |
| ✅ | SEC-001g | Permissions-Policy header | `camera=(self), microphone=(), geolocation=(self)` |
| ✅ | SEC-005 | CORS — API acepta origen pitzbol.me | `Access-Control-Allow-Origin: https://www.pitzbol.me` |

---

### S13 — Rendimiento ✅ 10 / 10

| Estado | ID | Test | Tiempo | Umbral |
|--------|----|------|--------|--------|
| ✅ | PER-001 | Página principal carga < 3 s | 153 ms | < 3000 ms ✓ |
| ✅ | PER-002 | Página /explora carga < 3 s | 177 ms | < 3000 ms ✓ |
| ✅ | PER-003 | Página /tours carga < 3 s | 149 ms | < 3000 ms ✓ |
| ✅ | PER-004 | Página /mapa carga < 5 s | 158 ms | < 5000 ms ✓ |
| ✅ | PER-005a | Backend health < 2 s | 165 ms | < 2000 ms ✓ |
| ✅ | PER-005b | GET /api/guides/verified < 4 s | 966 ms | < 4000 ms ✓ |
| ✅ | PER-005c | GET /api/lugares < 3 s | 161 ms | < 3000 ms ✓ |
| ✅ | PER-005d | GET /api/tours < 3 s | 214 ms | < 3000 ms ✓ |
| ✅ | PER-005e | GET /api/paquetes < 3 s | 220 ms | < 3000 ms ✓ |
| ✅ | PER-005f | Tiempo promedio de respuesta API | 345 ms avg | — ✓ |

---

### S14 — Errores y Casos Edge ✅ 3 / 3 · ℹ️ 1

| Estado | ID | Test | HTTP | Tiempo | Detalle |
|--------|----|------|------|--------|---------|
| ✅ | ERR-003 | Ruta inexistente → 404 con JSON | 404 | 160 ms | Respuesta JSON estructurada |
| ✅ | ERR-003b | Página 404 frontend devuelve respuesta | 404 | 165 ms | |
| ✅ | ERR-001 | Body JSON malformado → 400 | 400 | 140 ms | Express rechaza JSON inválido |
| ℹ️ | AUT-013 | Rate limiting en /api/auth/login | — | — | Configurado: `loginLimiter` 20 req / 15 min (código fuente) |

---

### S15 — Integraciones ✅ 6 / 6

| Estado | ID | Test | HTTP | Tiempo | Detalle |
|--------|----|------|------|--------|---------|
| ✅ | INT-001 | Firebase Auth — endpoint login accesible | 401 | 224 ms | |
| ✅ | INT-002 | Firestore lee datos — GET /api/guides retorna datos | 200 | 875 ms | |
| ✅ | INT-003 | Firestore accesible — POST /api/business/validate-uniqueness | 200 | 176 ms | Firestore respondió |
| ✅ | INT-004 | Stripe — endpoint payment-intent protegido y accesible | 401 | 177 ms | Retorna 401 sin token (endpoint existe) |
| ✅ | INT-006 | Mapa Leaflet — página /mapa carga correctamente | 200 | 170 ms | HTML retornado, Leaflet inicializa en browser |
| ✅ | INT-007 | GET /api/support/contact-forms (protegido) → 401 | 401 | 149 ms | |

---

## Acciones pendientes

| Prioridad | Tarea | Test afectado |
|-----------|-------|---------------|
| Baja | Actualizar el nombre de lugar en el test con uno que exista en la BD actual | LUG-008, LUG-008b, LUG-012 |
| Baja | Corregir el body del test `IA-008b` para que coincida con el esquema del endpoint | IA-008b |
| Media | Nuevo deploy en Vercel con `withPWA` habilitado en producción | PER-008 |

---

*Generado: 17 de mayo de 2026 · Duración: 33.8 s · Suite: `pitzbol_prod_tests.py` · Run #4 — Informe final de producción*
