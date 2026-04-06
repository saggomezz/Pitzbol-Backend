import { Router } from 'express';
import { verifyINE, compareBiometry } from '../controllers/ocr.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.post('/verify-ine', authMiddleware, verifyINE);
router.post('/compare-biometry', authMiddleware, compareBiometry); 

export default router;