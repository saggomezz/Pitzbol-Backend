import { Router } from 'express';
import { createMasterAdmin } from '../controllers/admin.controller';
import { login, recoverPassword, register } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/recover-password', recoverPassword);
router.get("/setup-admin", createMasterAdmin);

export default router;
