// src/routes/guide.routes.ts
import { Router } from 'express';
import { registerGuide } from '../controllers/guide.controller';

const router = Router();

router.post('/register-guide', registerGuide);

export default router;