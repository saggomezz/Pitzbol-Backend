import { Router } from "express";
import {
  login,
  register,
  recoverPassword,
  updateProfile,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { createMasterAdmin } from "../controllers/admin.controller";

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/recover-password', recoverPassword);
router.get("/setup-admin", createMasterAdmin);

// Actualizar perfil
router.patch("/update-profile", authMiddleware, updateProfile);

export default router;