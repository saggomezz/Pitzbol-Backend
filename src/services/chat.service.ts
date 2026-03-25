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

      const chats = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data();
        
        // Obtener nombre actualizado del guía
        let guideName = data.guideName;
        try {
          const guideDoc = await db.collection('usuarios').doc('guias').collection('lista').doc(data.guideId).get();
          if (guideDoc.exists) {
            const guideData = guideDoc.data();
            const nombre = guideData?.['01_nombre'] || guideData?.nombre || '';
            const apellido = guideData?.['02_apellido'] || guideData?.apellido || '';
            guideName = `${nombre} ${apellido}`.trim() || guideName;
          }
        } catch (err) {
          console.error('Error al obtener nombre del guía:', err);
        }

        // Obtener nombre actualizado del turista
        let touristName = data.touristName;
        try {
          const touristDoc = await db.collection('usuarios').doc('turistas').collection('lista').doc(data.touristId).get();
          if (touristDoc.exists) {
            const touristData = touristDoc.data();
            const nombre = touristData?.['01_nombre'] || touristData?.nombre || '';
            const apellido = touristData?.['02_apellido'] || touristData?.apellido || '';
            touristName = `${nombre} ${apellido}`.trim() || touristName;
          }
        } catch (err) {
          console.error('Error al obtener nombre del turista:', err);
        }

        return {
          id: doc.id,
          ...data,
          guideName,
          touristName,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          lastMessageTime: data.lastMessageTime?.toDate ? data.lastMessageTime.toDate() : data.lastMessageTime,
        };
      })) as Chat[];

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
    
    try {
      // Obtener todos los chats del usuario
      const chatsSnapshot = await chatsRef
        .where(field, '==', userId)
        .get();

      let totalUnread = 0;
      const unreadChats = [];

      for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        
        // Query simplificada: obtener todos los mensajes del chat y filtrar en memoria
        const messagesSnapshot = await messagesRef
          .where('chatId', '==', chatDoc.id)
          .where('read', '==', false)
          .get();

        // Filtrar en memoria los mensajes que NO son del usuario actual
        const unreadMessages = messagesSnapshot.docs.filter(doc => {
          const data = doc.data();
          return data.senderId !== userId;
        });

        const unreadCount = unreadMessages.length;
        
        if (unreadCount > 0) {
          totalUnread += unreadCount;
          
          // Obtener el último mensaje no leído
          const lastUnreadDoc = unreadMessages[unreadMessages.length - 1];
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

  // Eliminar un chat y todos sus mensajes
  static async deleteChat(chatId: string): Promise<boolean> {
    try {
      // Eliminar todos los mensajes del chat
      const messagesRef = db.collection('messages');
      const messagesSnapshot = await messagesRef.where('chatId', '==', chatId).get();
      
      const batch = db.batch();
      messagesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Eliminar el chat
      const chatRef = db.collection('chats').doc(chatId);
      batch.delete(chatRef);
      
      await batch.commit();
      
      console.log(`✅ Chat ${chatId} y sus mensajes eliminados correctamente`);
      return true;
    } catch (error) {
      console.error('Error al eliminar chat:', error);
      throw error;
    }
  }
}
