import { Router } from "express";
import {
  login,
  register,
  recoverPassword,
} from "../controllers/auth.controller";

const router = Router();

// 🆕 Registro general (turista / admin si aplica)
router.post("/register", register);

// Login
router.post("/login", login);

// Recuperar contraseña 
router.post("/recover-password", recoverPassword);

export default router;
