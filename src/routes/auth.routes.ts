import { Router } from "express";
import {
  login,
  register,
  recoverPassword,
  updateProfile,
  solicitarGuia,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validateRegisterInput, validateLoginInput, validatePasswordRecoveryInput, validateProfileUpdate } from "../middlewares/validation.middleware";
import { loginLimiter, registerLimiter, passwordLimiter } from "../middlewares/rateLimiter.middleware";
import { actualizarPerfil as actualizarPerfilDescripcion } from "../controllers/perfil.controller";
const router = Router();

// POST /api/auth/register - Registro con validación y rate limiting
router.post(
  '/register',
  registerLimiter,          // Rate limiting: 3 por hora
  validateRegisterInput,    // Validación de entrada
  register
);

// POST /api/auth/login - Login con rate limiting y validación
router.post(
  '/login',
  loginLimiter,             // Rate limiting: 5 por 15 minutos
  validateLoginInput,       // Validación de entrada
  login
);

// POST /api/auth/recover-password - Recuperación con rate limiting
router.post(
  '/recover-password',
  passwordLimiter,          // Rate limiting: 3 por 30 minutos
  validatePasswordRecoveryInput,
  recoverPassword
);

// PATCH /api/auth/update-profile - Actualización protegida
router.patch(
  "/update-profile",
  authMiddleware,           // Requiere JWT válido
  validateProfileUpdate,    // Validación de entrada
  updateProfile
);

// POST /api/auth/logout - Cierre de sesión
router.post(
  "/logout",
  authMiddleware,           //  Requiere estar autenticado
  (req, res) => {
    res.clearCookie('authToken', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    res.json({ msg: "Sesión cerrada correctamente" });
  }
);

// POST /api/auth/solicitar-guia - Solicitar convertirse en guía
router.post(
  "/solicitar-guia",
  authMiddleware,           // Requiere estar autenticado
  solicitarGuia
);

export default router;