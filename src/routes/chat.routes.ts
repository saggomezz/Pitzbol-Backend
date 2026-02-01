import { Router } from 'express';
import {
  getOrCreateChat,
  getMessages,
  getUserChats,
  markAsRead,
  getChatInfo,
  getUnreadMessages,
  deleteChat,
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
router.post('/:chatId/read', markAsRead);

// Obtener mensajes no leídos de un usuario
router.get('/unread/:userId', getUnreadMessages);

// Eliminar un chat
router.delete('/:chatId', deleteChat);

// Obtener información de un chat (debe ir al final para evitar conflictos)
router.get('/:chatId', getChatInfo);

export default router;
