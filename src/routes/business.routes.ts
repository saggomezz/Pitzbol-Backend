
import { Router } from "express";
import {
  registerBusiness,
  registerBusinessWithImages,
  validateBusinessUniqueness,
  getMyBusiness,
} from "../controllers/business.controller";
import { upload } from '../middleware/uploadMiddleware';
import { recoverPassword } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { isBusiness } from "../middlewares/business.middleware";

const router = Router();

// Endpoint para validar unicidad de datos del negocio
router.post("/validate-uniqueness", validateBusinessUniqueness);


// Nuevo endpoint para registro de negocio con logo y hasta 3 imágenes
router.post(
  "/register-with-images",
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'images', maxCount: 3 }
  ]),
  registerBusinessWithImages
);

router.post("/register", registerBusiness);
router.post("/recover-password", recoverPassword);

// PROTEGIDO - Obtener mi negocio
router.get(
  "/my-business",
  authMiddleware,
  getMyBusiness
);

router.get(
  "/profile",
  authMiddleware,
  isBusiness,
  (req, res) => {
    res.json({ msg: "Perfil de negocio" });
  }
);

export default router;
