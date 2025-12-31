import { Router } from "express";
import {
  registerGuide,
  addTourToGuide,
} from "../controllers/guide.controller";
import { recoverPassword } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { isGuide } from "../middlewares/guide.middleware";

const router = Router();

// 🆕 Registro de guía (público)
router.post("/register", registerGuide);

// 🔐 Recuperar contraseña (público)
router.post("/recover-password", recoverPassword);

// 🔒 Agregar tour (solo guías autenticados)
router.post(
  "/add-tour",
  authMiddleware,
  isGuide,
  addTourToGuide
);

export default router;
