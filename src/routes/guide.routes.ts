import { Router } from 'express';
import { registerGuide, addTourToGuide } from '../controllers/guide.controller';

const router = Router();

router.post('/register-guide', registerGuide);
router.post('/add-tour', addTourToGuide); // <--- Agrega esta línea

export default router;