import { Router } from 'express';
import {
  getOrCreateChat,
  getMessages,
  getUserChats,
  markAsRead,
  getChatInfo,
} from '../controllers/chat.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener o crear chat entre turista y guía
router.post('/create', getOrCreateChat);

// Obtener mensajes de un chat
router.get('/:chatId/messages', getMessages);

// Obtener chats de un usuario
router.get('/user/:userId', getUserChats);

// Marcar mensajes como leídos
router.put('/:chatId/read', markAsRead);

// Obtener información de un chat
router.get('/:chatId', getChatInfo);

export default router;
