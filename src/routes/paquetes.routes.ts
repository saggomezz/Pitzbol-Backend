import { Router } from "express";
import {
  createPaquete,
  getPublicPaquetes,
  getPaquetesByGuia,
  getPaqueteById,
  getPaqueteOcupacion,
  updatePaquete,
  deletePaquete,
} from "../controllers/paquetes.controller";
import { upload } from "../middleware/uploadMiddleware";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Públicos
router.get("/", getPublicPaquetes);
router.get("/guia/:guiaId", getPaquetesByGuia);
router.get("/:id/ocupacion", getPaqueteOcupacion);
router.get("/:id", getPaqueteById);

// Protegidos
router.post("/", authMiddleware, upload.fields([{ name: "fotos", maxCount: 3 }]), createPaquete);
router.patch("/:id", authMiddleware, upload.fields([{ name: "fotos", maxCount: 3 }]), updatePaquete);
router.delete("/:id", authMiddleware, deletePaquete);

export default router;
