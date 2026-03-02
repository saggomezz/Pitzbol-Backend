import { Router } from 'express';
import {
  getUserCards,
  addCard,
  removeCard,
  setDefaultCard,
  getDefaultCard,
} from '../controllers/wallet.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Obtener tarjetas del usuario (requiere autenticación)
router.get('/:userId/cards', authMiddleware, getUserCards);

// Agregar tarjeta a la billetera (requiere autenticación)
router.post('/:userId/cards', authMiddleware, addCard);

// Eliminar tarjeta (requiere autenticación)
router.delete('/:userId/cards/:cardId', authMiddleware, removeCard);

// Establecer tarjeta predeterminada (requiere autenticación)
router.put('/:userId/cards/:cardId/default', authMiddleware, setDefaultCard);

// Obtener tarjeta predeterminada (requiere autenticación)
router.get('/:userId/cards/default', authMiddleware, getDefaultCard);

export default router;
