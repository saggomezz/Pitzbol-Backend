import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';

// Obtener o crear un chat entre turista y guía
export const getOrCreateChat = async (req: Request, res: Response) => {
  try {
    const { touristId, guideId, touristName, guideName } = req.body;

    if (!touristId || !guideId || !touristName || !guideName) {
      return res.status(400).json({
        success: false,
        msg: 'Faltan datos requeridos',
      });
    }

    // IDOR protection: authenticated user must be one of the participants
    const authUid = (req as any).user?.uid;
    if (authUid !== touristId && authUid !== guideId) {
      return res.status(403).json({ success: false, msg: 'No puedes crear chats para otros usuarios' });
    }

    const chat = await ChatService.getOrCreateChat(touristId, guideId, touristName, guideName);
    
    res.status(200).json({
      success: true,
      chat,
    });
  } catch (error: any) {
    console.error('Error al obtener o crear chat:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener o crear chat' ,
    });
  }
};

// Obtener mensajes de un chat
export const getMessages = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({
        success: false,
        msg: 'chatId es requerido',
      });
    }

    const chat = await ChatService.getChatById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        msg: 'Chat no encontrado',
      });
    }

    const authUid = (req as any).user?.uid;
    if (!authUid || (chat.touristId !== authUid && chat.guideId !== authUid)) {
      return res.status(403).json({ success: false, msg: 'No autorizado' });
    }

    const messages = await ChatService.getMessages(chatId, limit);
    
    res.status(200).json({
      success: true,
      messages: messages.reverse(), // Devolver en orden cronológico
    });
  } catch (error: any) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener mensajes' ,
    });
  }
};

// Obtener chats de un usuario
export const getUserChats = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { userType } = req.query;

    if (!userId || Array.isArray(userId)) {
      return res.status(400).json({
        success: false,
        msg: 'userId es requerido',
      });
    }

    // IDOR protection: only allow viewing own chats
    if ((req as any).user?.uid !== userId) {
      return res.status(403).json({ success: false, msg: 'No puedes ver chats de otro usuario' });
    }

    if (!userType || (userType !== 'tourist' && userType !== 'guide')) {
      return res.status(400).json({
        success: false,
        msg: 'Tipo de usuario inválido',
      });
    }

    const chats = await ChatService.getUserChats(userId, userType as 'tourist' | 'guide');
    
    res.status(200).json({
      success: true,
      chats,
    });
  } catch (error: any) {
    console.error('Error al obtener chats:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener chats' ,
    });
  }
};

// Marcar mensajes como leídos
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({
        success: false,
        msg: 'chatId es requerido',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        msg: 'userId es requerido',
      });
    }

    // IDOR protection: use JWT uid for marking as read
    const authUid = (req as any).user?.uid;
    if (!authUid || authUid !== userId) {
      return res.status(403).json({ success: false, msg: 'No autorizado' });
    }

    await ChatService.markAsRead(chatId, userId);
    
    res.status(200).json({
      success: true,
      msg: 'Mensajes marcados como leídos',
    });
  } catch (error: any) {
    console.error('Error al marcar mensajes como leídos:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al marcar mensajes como leídos' ,
    });
  }
};

// Obtener información de un chat
export const getChatInfo = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;

    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({
        success: false,
        msg: 'chatId es requerido',
      });
    }

    const chat = await ChatService.getChatById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        msg: 'Chat no encontrado',
      });
    }

    // IDOR protection: only participants can view chat info
    const authUid = (req as any).user?.uid;
    if (!authUid || (chat.touristId !== authUid && chat.guideId !== authUid)) {
      return res.status(403).json({ success: false, msg: 'No autorizado' });
    }

    res.status(200).json({
      success: true,
      chat,
    });
  } catch (error: any) {
    console.error('Error al obtener información del chat:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener información del chat' ,
    });
  }
};

// Obtener mensajes no leídos
export const getUnreadMessages = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { userType } = req.query;

    if (!userId || Array.isArray(userId)) {
      return res.status(400).json({
        success: false,
        msg: 'userId es requerido',
      });
    }

    // IDOR protection: only allow checking own unread messages
    if ((req as any).user?.uid !== userId) {
      return res.status(403).json({ success: false, msg: 'No autorizado' });
    }

    if (!userType || (userType !== 'tourist' && userType !== 'guide')) {
      return res.status(400).json({
        success: false,
        msg: 'Tipo de usuario inválido',
      });
    }

    const unreadData = await ChatService.getUnreadMessages(userId, userType as 'tourist' | 'guide');
    
    res.status(200).json({
      success: true,
      totalUnread: unreadData.totalUnread,
      chats: unreadData.chats,
    });
  } catch (error: any) {
    console.error('Error al obtener mensajes no leídos:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener mensajes no leídos' ,
    });
  }
};

// Eliminar un chat
export const deleteChat = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;

    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({
        success: false,
        msg: 'chatId es requerido',
      });
    }

    // IDOR protection: only participants can delete a chat
    const chat = await ChatService.getChatById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, msg: 'Chat no encontrado' });
    }
    const authUid = (req as any).user?.uid;
    if (!authUid || (chat.touristId !== authUid && chat.guideId !== authUid)) {
      return res.status(403).json({ success: false, msg: 'No autorizado' });
    }

    await ChatService.deleteChat(chatId);
    
    res.status(200).json({
      success: true,
      msg: 'Chat eliminado correctamente',
    });
  } catch (error: any) {
    console.error('Error al eliminar chat:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al eliminar chat' ,
    });
  }
};
