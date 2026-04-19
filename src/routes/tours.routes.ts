import { Router } from "express";
import {
  createTour,
  getPublicTours,
  getEmpresaTours,
  getTourById,
  deleteTour,
} from "../controllers/tours.controller";
import { upload } from "../middleware/uploadMiddleware";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Públicos
router.get("/", getPublicTours);
router.get("/empresa/:empresaId", getEmpresaTours);
router.get("/:id", getTourById);

// Protegidos
router.post(
  "/",
  authMiddleware,
  upload.fields([{ name: "fotoPrincipal", maxCount: 1 }]),
  createTour
);
router.delete("/:id", authMiddleware, deleteTour);

export default router;
