import { Router } from "express";
import {
  login,
  register,
  recoverPassword,
  updateProfile,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/recover-password', recoverPassword);

// Actualizar perfil
router.patch("/update-profile", authMiddleware, updateProfile);

export default router;