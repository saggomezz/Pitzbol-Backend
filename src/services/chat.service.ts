import { db } from '../config/firebase';
import { Chat, Message } from '../models/chat.model';

export class ChatService {
  // Crear o obtener un chat existente entre turista y guía
  static async getOrCreateChat(touristId: string, guideId: string, touristName: string, guideName: string): Promise<Chat> {
    const chatsRef = db.collection('chats');
    
    // Buscar chat existente
    const existingChats = await chatsRef
      .where('touristId', '==', touristId)
      .where('guideId', '==', guideId)
      .limit(1)
      .get();

    if (!existingChats.empty) {
      const chatDoc = existingChats.docs[0];
      if (chatDoc) {
        return { id: chatDoc.id, ...chatDoc.data() } as Chat;
      }
    }

    // Crear nuevo chat
    const newChat: Omit<Chat, 'id'> = {
      touristId,
      touristName,
      guideId,
      guideName,
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const chatDoc = await chatsRef.add(newChat);
    return { id: chatDoc.id, ...newChat };
  }

  // Guardar mensaje en Firebase
  static async saveMessage(message: Omit<Message, 'id'>): Promise<Message> {
    const messagesRef = db.collection('messages');
    const messageDoc = await messagesRef.add({
      ...message,
      timestamp: new Date(message.timestamp),
    });

    // Actualizar último mensaje del chat
    await db.collection('chats').doc(message.chatId).update({
      lastMessage: message.content,
      lastMessageTime: new Date(message.timestamp),
      updatedAt: new Date(),
    });

    return { id: messageDoc.id, ...message };
  }

  // Obtener mensajes de un chat
  static async getMessages(chatId: string, limit: number = 50): Promise<Message[]> {
    const messagesRef = db.collection('messages');
    const snapshot = await messagesRef
      .where('chatId', '==', chatId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Message[];
  }

  // Obtener chats de un usuario
  static async getUserChats(userId: string, userType: 'tourist' | 'guide'): Promise<Chat[]> {
    const chatsRef = db.collection('chats');
    const field = userType === 'tourist' ? 'touristId' : 'guideId';
    
    const snapshot = await chatsRef
      .where(field, '==', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Chat[];
  }

  // Marcar mensajes como leídos
  static async markAsRead(chatId: string, userId: string): Promise<void> {
    const messagesRef = db.collection('messages');
    const snapshot = await messagesRef
      .where('chatId', '==', chatId)
      .where('senderId', '!=', userId)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();

    // Actualizar contador de no leídos
    await db.collection('chats').doc(chatId).update({
      unreadCount: 0,
    });
  }

  // Obtener información del chat
  static async getChatById(chatId: string): Promise<Chat | null> {
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return null;
    
    return { id: chatDoc.id, ...chatDoc.data() } as Chat;
  }
}
