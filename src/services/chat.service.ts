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
    
    try {
      const snapshot = await messagesRef
        .where('chatId', '==', chatId)
        .get();

      const messages = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        };
      }) as Message[];

      // Ordenar en memoria por timestamp y limitar
      return messages
        .sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return dateA - dateB;
        })
        .slice(0, limit);
    } catch (error) {
      console.error('Error al obtener mensajes:', error);
      throw error;
    }
  }

  // Obtener chats de un usuario
  static async getUserChats(userId: string, userType: 'tourist' | 'guide'): Promise<Chat[]> {
    const chatsRef = db.collection('chats');
    const field = userType === 'tourist' ? 'touristId' : 'guideId';
    
    try {
      const snapshot = await chatsRef
        .where(field, '==', userId)
        .get();

      const chats = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          lastMessageTime: data.lastMessageTime?.toDate ? data.lastMessageTime.toDate() : data.lastMessageTime,
        };
      }) as Chat[];

      // Ordenar en memoria por updatedAt
      return chats.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error al obtener chats:', error);
      throw error;
    }
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
    
    const data = chatDoc.data();
    if (!data) return null;
    
    return {
      id: chatDoc.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      lastMessageTime: data.lastMessageTime?.toDate ? data.lastMessageTime.toDate() : data.lastMessageTime,
    } as Chat;
  }

  // Obtener mensajes no leídos de un usuario
  static async getUnreadMessages(userId: string, userType: 'tourist' | 'guide'): Promise<{
    totalUnread: number;
    chats: Array<{
      chatId: string;
      count: number;
      lastMessage: string;
      senderName: string;
      timestamp: Date;
    }>;
  }> {
    const chatsRef = db.collection('chats');
    const messagesRef = db.collection('messages');
    const field = userType === 'tourist' ? 'touristId' : 'guideId';
    const receiverField = userType === 'tourist' ? 'guide' : 'tourist';
    
    try {
      // Obtener todos los chats del usuario
      const chatsSnapshot = await chatsRef
        .where(field, '==', userId)
        .get();

      let totalUnread = 0;
      const unreadChats = [];

      for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        
        // Contar mensajes no leídos en este chat
        const unreadSnapshot = await messagesRef
          .where('chatId', '==', chatDoc.id)
          .where('senderId', '!=', userId)
          .where('read', '==', false)
          .get();

        const unreadCount = unreadSnapshot.size;
        
        if (unreadCount > 0) {
          totalUnread += unreadCount;
          
          // Obtener el último mensaje no leído
          const lastUnreadDoc = unreadSnapshot.docs[unreadSnapshot.docs.length - 1];
          const lastUnreadData = lastUnreadDoc?.data();
          
          unreadChats.push({
            chatId: chatDoc.id,
            count: unreadCount,
            lastMessage: lastUnreadData?.content || '',
            senderName: lastUnreadData?.senderName || '',
            timestamp: lastUnreadData?.timestamp?.toDate ? lastUnreadData.timestamp.toDate() : new Date(),
          });
        }
      }

      return {
        totalUnread,
        chats: unreadChats,
      };
    } catch (error) {
      console.error('Error al obtener mensajes no leídos:', error);
      throw error;
    }
  }
}
