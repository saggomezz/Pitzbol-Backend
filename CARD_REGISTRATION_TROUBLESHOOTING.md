## Cambios Realizados

### 1. **Backend - Logging Mejorado**

#### Archivo: `src/middlewares/auth.middleware.ts`
- Agregué logging detallado en cada paso del proceso de autenticación
- Ahora muestra:
  - El header Authorization recibido
  - Si el token fue extraído del header o de cookies
  - Los datos decodificados del JWT (UID, email, role)
  - Errores específicos de validación

#### Archivo: `src/controllers/perfil.controller.ts`
- **`crearSetupIntent`**: Ahora valida el UID del token y registra:
  - UID extraído del token
  - ID del setup intent creado
  - Logs de error si falla

- **`guardarTarjeta`**: Ahora valida completamente el flujo:
  - UID extraído del token
  - Payment Method ID recibido
  - Validación del payment method en Stripe
  - Confirmación de guardado en Firestore
  - Logs detallados en cada paso

- **`obtenerTarjetas`**: Ahora muestra:
  - UID del usuario
  - Número de tarjetas encontradas
  - Detalles de cada tarjeta (ID, last4, default status)

#### Archivo: `src/services/wallet.service.ts`
- **`saveCard`**: Agregué validación de UID y logging completo:
  - Validación que UID no sea vacío
  - Datos de tarjeta a guardar
  - ID de la tarjeta en Firestore
  - Indicador de tarjeta predeterminada

- **`getUserCards`**: Ahora muestra:
  - Colección de Firestore usada
  - Consulta exacta ejecutada
  - Número y detalles de tarjetas encontradas

#### Nuevo Endpoint: `GET /api/perfil/debug/auth`
```
GET http://localhost:3001/api/perfil/debug/auth
Authorization: Bearer <token>
```
**Respuesta:**
```json
{
  "success": true,
  "message": "Autenticación verificada",
  "user": {
    "uid": "...",
    "email": "...",
    "role": "..."
  },
  "timestamp": "2024-01-17T..."
}
```

### 2. **Frontend - Logging Mejorado**

#### Archivo: `app/components/WalletModal.tsx`
- **`loadCards`**: Ahora registra:
  - UID local del usuario
  - Disponibilidad del token
  - Estado de la respuesta
  - Número de tarjetas cargadas

- **`AddCardForm.handleSubmit`**: Ahora registra:
  - Validación de token y UID
  - Proceso de creación del setup intent
  - Confirmación de Stripe
  - Guardado en base de datos
  - Logs detallados en cada paso del flujo

## Cómo Debuggear

### Paso 1: Verificar Autenticación
```bash
# Abre la consola del navegador (F12)
# Intenta registrar una tarjeta
# Busca logs como:
# - "🔐 [AddCardForm] Iniciando proceso de guardar tarjeta"
# - "UID local: abc123..."
# - "Token disponible: true"
```

### Paso 2: Revisar Logs del Servidor
```bash
# En la terminal donde corre el backend, busca:
# - "🔐 [authMiddleware] Petición: [POST] /api/perfil/setup-intent"
# - "✅ Token validado correctamente"
# - "UID: ..." (debe coincidir con el UID local)
# - "💳 [guardarTarjeta] Iniciando..."
# - "✅ [guardarTarjeta] Tarjeta guardada en Firestore. ID: ..."
```

### Paso 3: Verificar Endpoint de Debug
```bash
# En la consola del navegador, ejecuta:
fetch('http://localhost:3001/api/perfil/debug/auth', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('pitzbol_token')}` }
}).then(r => r.json()).then(console.log)

# Debe mostrar:
# {
#   "success": true,
#   "user": { "uid": "...", "email": "...", "role": "..." }
# }
```

## Problemas Comunes y Soluciones

### 1. "Token no proporcionado"
**Causa**: El token JWT no se está enviando en el header Authorization
**Solución**: 
- Verifica en el navegador (DevTools → Network) que el header Authorization esté presente
- El token debe estar en localStorage con la clave `pitzbol_token`
- Asegúrate de que el usuario completó el login correctamente

### 2. "Token inválido o expirado"
**Causa**: El JWT no puede ser validado con la JWT_SECRET
**Solución**:
- Verifica que JWT_SECRET en el .env del backend sea el mismo usado al crear el token
- Intenta hacer login nuevamente para obtener un token fresco

### 3. "UID no encontrado en token"
**Causa**: El JWT no contiene el campo `uid`
**Solución**:
- Revisa cómo se genera el token en el controlador de autenticación
- El token debe incluir: `{ uid, email, role }`

### 4. "Tarjeta guardada pero no aparece en la lista"
**Causa**: Probablemente se guardó con un UID diferente
**Solución**:
- Verifica en Firestore que:
  - Colección: `userCards`
  - Campo `uid` coincida con el UID del usuario logueado
  - Campo `isActive` sea `true`

## Estructura de Datos en Firestore

```
userCards/
  {cardId}: {
    id: string (igual a la clave del documento)
    uid: string (del usuario)
    stripePaymentMethodId: string
    last4: string (últimos 4 dígitos)
    brand: string (visa, mastercard, etc)
    expMonth: number
    expYear: number
    isDefault: boolean
    isActive: boolean (true = activa, false = eliminada)
    createdAt: Timestamp
    updatedAt: Timestamp
  }
```

## Logs Esperados en Caso de Éxito

### Frontend Console
```
🔐 [AddCardForm] Iniciando proceso de guardar tarjeta
   - UID local: user123
   - Token disponible: true
📋 [AddCardForm] Crear setup intent...
✅ [AddCardForm] Setup intent creado: OK
💳 [AddCardForm] Confirmar tarjeta con Stripe...
   - Setup status: succeeded
✅ [AddCardForm] Tarjeta confirmada con éxito en Stripe
💾 [AddCardForm] Guardar tarjeta en base de datos...
✅ [AddCardForm] Tarjeta guardada exitosamente
```

### Backend Console
```
🔐 [authMiddleware] Petición: [POST] /api/perfil/setup-intent
   - Auth header: Bearer eyJh...
   ✅ Token extraído del header Authorization
   ✅ Token encontrado, validando...
   ✅ Token validado correctamente
   - UID: user123
   - Email: user@example.com
   - Role: usuario

🔐 [crearSetupIntent] Iniciando...
   - UID del token: user123
✅ [crearSetupIntent] Setup intent creado: si_1A2b3C4d5e6f

🔐 [authMiddleware] Petición: [POST] /api/perfil/save-card
   ✅ Token validado correctamente
   - UID: user123

💳 [guardarTarjeta] Iniciando...
   - UID del token: user123
   - Payment Method ID: pm_1A2b3C4d5e6f
✅ [guardarTarjeta] Payment method validado
   - Brand: visa, Last4: 4242

💾 [saveCard] Iniciando guardar tarjeta...
   - UID: user123
   - Stripe Payment Method ID: pm_1A2b3C4d5e6f
   - Last4: 4242
   - Brand: visa
✅ [saveCard] Tarjeta guardada exitosamente
   - ID de tarjeta en Firestore: card_abc123xyz
```

## Próximos Pasos

1. **Prueba el flujo completo**:
   - Abre la consola del navegador (F12)
   - Abre también los logs del servidor
   - Intenta registrar una tarjeta
   - Compara los logs con los esperados arriba

2. **Si aún no funciona**:
   - Comparte los logs exactos que ves
   - Especifica en qué punto se detiene el proceso
   - Verifica la base de datos Firestore manualmente

3. **Validaciones recomendadas**:
   - Todos los logs deben mostrar el mismo UID
   - El token debe validarse correctamente en el middleware
   - El payment method debe existir en Stripe
   - El documento debe crearse en Firestore

## Archivos Modificados
- `src/middlewares/auth.middleware.ts` - Logging mejorado
- `src/controllers/perfil.controller.ts` - Funciones de wallet con logging
- `src/services/wallet.service.ts` - Servicio de wallet con logging
- `src/routes/perfil.routes.ts` - Agregado endpoint de debug
- `app/components/WalletModal.tsx` - Frontend con logging detallado
