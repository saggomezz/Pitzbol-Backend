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

    const chat = await ChatService.getOrCreateChat(touristId, guideId, touristName, guideName);
    
    res.status(200).json({
      success: true,
      chat,
    });
  } catch (error: any) {
    console.error('Error al obtener o crear chat:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener o crear chat',
      error: error.message,
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

    const messages = await ChatService.getMessages(chatId, limit);
    
    res.status(200).json({
      success: true,
      messages: messages.reverse(), // Devolver en orden cronológico
    });
  } catch (error: any) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener mensajes',
      error: error.message,
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
      msg: 'Error al obtener chats',
      error: error.message,
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

    await ChatService.markAsRead(chatId, userId);
    
    res.status(200).json({
      success: true,
      msg: 'Mensajes marcados como leídos',
    });
  } catch (error: any) {
    console.error('Error al marcar mensajes como leídos:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al marcar mensajes como leídos',
      error: error.message,
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

    res.status(200).json({
      success: true,
      chat,
    });
  } catch (error: any) {
    console.error('Error al obtener información del chat:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al obtener información del chat',
      error: error.message,
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
      msg: 'Error al obtener mensajes no leídos',
      error: error.message,
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

    await ChatService.deleteChat(chatId);
    
    res.status(200).json({
      success: true,
      msg: 'Chat eliminado correctamente',
    });
  } catch (error: any) {
    console.error('Error al eliminar chat:', error);
    res.status(500).json({
      success: false,
      msg: 'Error al eliminar chat',
      error: error.message,
    });
  }
};
