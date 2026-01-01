import { Router } from "express";
import {
  login,
  register,
  recoverPassword,
  updateProfile,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// 🆕 Registro general (turista / admin si aplica)
router.post("/register", register);

// Login
router.post("/login", login);

// Recuperar contraseña 
router.post("/recover-password", recoverPassword);

// Actualizar perfil
router.patch("/update-profile", authMiddleware, updateProfile);

export default router;