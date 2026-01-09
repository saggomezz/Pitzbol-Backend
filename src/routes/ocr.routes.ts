import { Router } from 'express';
import { verifyINE, compareBiometry } from '../controllers/ocr.controller';

const router = Router();

router.post('/verify-ine', verifyINE);
router.post('/compare-biometry', compareBiometry); 

export default router;