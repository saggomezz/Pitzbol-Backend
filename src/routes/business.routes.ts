import { Router } from "express";
import {
  registerBusiness,
  registerBusinessWithImages,
  validateBusinessUniqueness,
  getMyBusiness,
  getMyBusinessRequests,
  getBusinessById,
  getBusinessStatus,
  updateBusiness,
  updateBusinessImages,
  getTransportPublicProfile,
  updateTransportSocialMedia,
} from "../controllers/business.controller";
import { upload } from '../middleware/uploadMiddleware';
import { recoverPassword } from "../controllers/auth.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { isBusiness } from "../middlewares/business.middleware";

const router = Router();

// Endpoints públicos / protegidos — empresa de transportes
router.get("/transporte/perfil/:id", getTransportPublicProfile);
router.patch("/transporte/redes/:id", authMiddleware, updateTransportSocialMedia);

// Endpoint para validar unicidad de datos del negocio
router.post("/validate-uniqueness", validateBusinessUniqueness);

// Nuevo endpoint para registro de negocio con logo y hasta 3 imagenes
router.post(
  "/register-with-images",
  optionalAuthMiddleware,
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

// PROTEGIDO - Obtener todas mis solicitudes de negocio
router.get(
  "/my-requests",
  authMiddleware,
  getMyBusinessRequests
);

router.get(
  "/by-id/:id",
  authMiddleware,
  getBusinessById
);

router.get(
  "/status",
  authMiddleware,
  getBusinessStatus
);

router.get(
  "/profile",
  authMiddleware,
  isBusiness,
  (req, res) => {
    res.json({ msg: "Perfil de negocio" });
  }
);

// RUTAS DE ACTUALIZACION (admin only)
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