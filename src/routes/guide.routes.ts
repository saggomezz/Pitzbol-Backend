import { Router } from "express";
import {registerGuide, addTourToGuide, updateGuideProfile, getVerifiedGuides, getGuidePublicProfile, getGuideRequest} from "../controllers/guide.controller";
import { recoverPassword } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { isGuide } from "../middlewares/guide.middleware";

const router = Router();
router.post("/register", registerGuide);
router.post("/recover-password", recoverPassword);
router.get("/verified", getVerifiedGuides);
router.get("/profile/:uid", getGuidePublicProfile);
router.get("/my-request", authMiddleware, getGuideRequest);

router.post(
  "/add-tour",
  authMiddleware,
  isGuide,
  addTourToGuide
);

router.put('/update', updateGuideProfile);

export default router;

