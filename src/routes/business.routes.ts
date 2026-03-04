
import { Router } from "express";
import {
  registerBusiness,
  registerBusinessWithImages,
  validateBusinessUniqueness,
  getMyBusiness,
  getBusinessById,
  updateBusiness,
  updateBusinessImages,
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
  "/by-id/:id",
  authMiddleware,
  getBusinessById
);

router.get(
  "/profile",
  authMiddleware,
  isBusiness,
  (req, res) => {
    res.json({ msg: "Perfil de negocio" });
  }
);

// RUTAS DE ACTUALIZACIÓN (admin only)
router.put(
  "/:businessId",
  authMiddleware,
  updateBusiness
);

router.put(
  "/:businessId/images",
  authMiddleware,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'images', maxCount: 3 }
  ]),
  updateBusinessImages
);

export default router;
