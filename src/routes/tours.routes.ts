import { Router } from "express";
import {
  createTour,
  getPublicTours,
  getEmpresaTours,
  getGuiaTours,
  getTourById,
  updateTour,
  deleteTour,
} from "../controllers/tours.controller";
import { upload } from "../middleware/uploadMiddleware";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Públicos
router.get("/", getPublicTours);
router.get("/empresa/:empresaId", getEmpresaTours);
router.get("/guia/:guiaId", getGuiaTours);
router.get("/:id", getTourById);

// Protegidos
router.post(
  "/",
  authMiddleware,
  upload.fields([{ name: "fotos", maxCount: 3 }]),
  createTour
);
router.patch(
  "/:id",
  authMiddleware,
  upload.fields([{ name: "fotos", maxCount: 3 }]),
  updateTour
);
router.delete("/:id", authMiddleware, deleteTour);

export default router;
