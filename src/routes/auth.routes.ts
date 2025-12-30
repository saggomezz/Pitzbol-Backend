import { Router } from 'express';
import { login, register, recoverPassword } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/recover-password', recoverPassword);

export default router;
