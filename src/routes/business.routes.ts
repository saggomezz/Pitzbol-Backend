import { Router } from "express";
import {
  registerBusiness,
} from "../controllers/business.controller";
import { recoverPassword } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { isBusiness } from "../middlewares/business.middleware";

const router = Router();

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
