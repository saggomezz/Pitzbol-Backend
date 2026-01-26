
import { Router } from "express";
import {
  registerBusiness,
  registerBusinessWithImages,
} from "../controllers/business.controller";
import { upload } from '../middleware/uploadMiddleware';
import { recoverPassword } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { isBusiness } from "../middlewares/business.middleware";

const router = Router();

// Nuevo endpoint para registro de negocio con imágenes (hasta 3)
router.post("/register-with-images", upload.array('images', 3), registerBusinessWithImages);

router.post("/register", registerBusiness);
router.post("/recover-password", recoverPassword);
router.get(
  "/profile",
  authMiddleware,
  isBusiness,
  (req, res) => {
    res.json({ msg: "Perfil de negocio" });
  }
);

export default router;
