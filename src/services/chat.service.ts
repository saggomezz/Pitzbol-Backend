import { db } from '../config/firebase';
import { Chat, Message } from '../models/chat.model';
import admin from 'firebase-admin';

type UnreadMessagesSnapshot = {
  totalUnread: number;
  chats: Array<{
    chatId: string;
    count: number;
    lastMessage: string;
    senderName: string;
    timestamp: Date;
  }>;
};

const UNREAD_CACHE_TTL_MS = 30000;
const unreadCache = new Map<string, { data: UnreadMessagesSnapshot; expiresAt: number }>();
const PROFILE_BATCH_SIZE = 10;

type ChatUserProfile = {
  name?: string;
  photo?: string;
};

const getUnreadCacheKey = (userId: string, userType: 'tourist' | 'guide') => `${userType}:${userId}`;

const invalidateUnreadCache = (userId?: string) => {
  if (!userId) return;
  for (const key of unreadCache.keys()) {
    if (key.endsWith(`:${userId}`)) unreadCache.delete(key);
  }
};

const isSafeFirestoreFieldSegment = (value: string) => /^[A-Za-z0-9_-]+$/.test(value);

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const extractProfileName = (data: FirebaseFirestore.DocumentData | undefined, fallback?: string): string | undefined => {
  if (!data) return fallback;

  const nombre = data['01_nombre'] || data.nombre || '';
  const apellido = data['02_apellido'] || data.apellido || '';
  const fullName = `${nombre} ${apellido}`.trim();

  return fullName || fallback;
};

const extractProfilePhoto = (data: FirebaseFirestore.DocumentData | undefined): string | undefined => {
  if (!data) return undefined;
  return data['14_foto_perfil']?.url || data.fotoPerfil || undefined;
};

const getUserCollection = (userType: 'tourist' | 'guide') => {
  const segment = userType === 'guide' ? 'guias' : 'turistas';
  return db.collection('usuarios').doc(segment).collection('lista');
};

const fetchProfilesByUid = async (userIds: string[], userType: 'tourist' | 'guide'): Promise<Map<string, ChatUserProfile>> => {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const profiles = new Map<string, ChatUserProfile>();

  if (uniqueIds.length === 0) {
    return profiles;
  }

  try {
    const snapshots = await Promise.all(
      chunkArray(uniqueIds, PROFILE_BATCH_SIZE).map((batch) =>
        getUserCollection(userType)
          .where('uid', 'in', batch)
          .get()
      )
    );

    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const uid = typeof data.uid === 'string' ? data.uid : undefined;
        if (!uid) continue;

        const name = extractProfileName(data);
        const photo = extractProfilePhoto(data);

        profiles.set(uid, {
          ...(name ? { name } : {}),
          ...(photo ? { photo } : {}),
        });
      }
    }
  } catch (error) {
    console.error(`Error al obtener perfiles de ${userType}:`, error);
  }

  return profiles;
};

const toDate = (value: any): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const emptyUnreadSnapshot = (): UnreadMessagesSnapshot => ({ totalUnread: 0, chats: [] });

const isQuotaExceeded = (error: any) => error?.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(error?.message || error));

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
      unreadByUser: {
        [touristId]: 0,
        [guideId]: 0,
      },
      unreadSummaryByUser: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const chatDoc = await chatsRef.add(newChat);
    return { id: chatDoc.id, ...newChat };
  }

  // Guardar mensaje en Firebase
  static async saveMessage(message: Omit<Message, 'id'>): Promise<Message> {
    const messagesRef = db.collection('messages');
    const chatRef = db.collection('chats').doc(message.chatId);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      throw new Error('Chat no encontrado');
    }

    const chatData = chatSnap.data() || {};
    const participantIds = [chatData.touristId, chatData.guideId].filter(Boolean);

    if (!participantIds.includes(message.senderId)) {
      throw new Error('No autorizado para enviar mensajes en este chat');
    }

    const recipientId = message.senderId === chatData.touristId ? chatData.guideId : chatData.touristId;
    const timestamp = new Date(message.timestamp);

    const messageDoc = await messagesRef.add({
      ...message,
      timestamp,
    });

    const updatePayload: Record<string, any> = {
      lastMessage: message.content,
      lastMessageTime: timestamp,
      updatedAt: new Date(),
    };

    if (recipientId && isSafeFirestoreFieldSegment(recipientId)) {
      updatePayload[`unreadByUser.${recipientId}`] = admin.firestore.FieldValue.increment(1);
      updatePayload[`unreadSummaryByUser.${recipientId}`] = {
        lastMessage: message.content,
        senderName: message.senderName,
        timestamp,
      };
    } else {
      updatePayload.unreadCount = admin.firestore.FieldValue.increment(1);
    }

    await chatRef.update(updatePayload);
    invalidateUnreadCache(message.senderId);
    invalidateUnreadCache(recipientId);

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

      const rawChats = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      }));

      const [guideProfiles, touristProfiles] = await Promise.all([
        fetchProfilesByUid(rawChats.map(({ data }) => String(data.guideId || '')).filter(Boolean), 'guide'),
        fetchProfilesByUid(rawChats.map(({ data }) => String(data.touristId || '')).filter(Boolean), 'tourist'),
      ]);

      const chats = rawChats.map(({ id, data }) => {
        const guideProfile = guideProfiles.get(String(data.guideId || ''));
        const touristProfile = touristProfiles.get(String(data.touristId || ''));

        return {
          id,
          ...data,
          guideName: guideProfile?.name || data.guideName,
          guidePhoto: guideProfile?.photo,
          touristName: touristProfile?.name || data.touristName,
          touristPhoto: touristProfile?.photo,
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
    const chatRef = db.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      throw new Error('Chat no encontrado');
    }

    const chatData = chatSnap.data() || {};
    if (chatData.touristId !== userId && chatData.guideId !== userId) {
      throw new Error('No autorizado para marcar este chat como leído');
    }

    const updatePayload: Record<string, any> = {
      unreadCount: 0,
    };

    if (isSafeFirestoreFieldSegment(userId)) {
      updatePayload[`unreadByUser.${userId}`] = 0;
      updatePayload[`unreadSummaryByUser.${userId}`] = admin.firestore.FieldValue.delete();
    }

    await chatRef.update(updatePayload);
    invalidateUnreadCache(userId);
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
  static async getUnreadMessages(userId: string, userType: 'tourist' | 'guide'): Promise<UnreadMessagesSnapshot> {
    const chatsRef = db.collection('chats');
    const field = userType === 'tourist' ? 'touristId' : 'guideId';
    const cacheKey = getUnreadCacheKey(userId, userType);
    const cached = unreadCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return {
        totalUnread: cached.data.totalUnread,
        chats: [...cached.data.chats],
      };
    }
    
    try {
      const chatsSnapshot = await chatsRef
        .where(field, '==', userId)
        .get();

      let totalUnread = 0;
      const unreadChats: UnreadMessagesSnapshot['chats'] = [];

      for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        const unreadCount = Number(chatData.unreadByUser?.[userId] || 0);
        
        if (unreadCount > 0) {
          totalUnread += unreadCount;
          const summary = chatData.unreadSummaryByUser?.[userId] || {};
          const senderName = userType === 'tourist' ? chatData.guideName : chatData.touristName;
          
          unreadChats.push({
            chatId: chatDoc.id,
            count: unreadCount,
            lastMessage: summary.lastMessage || chatData.lastMessage || '',
            senderName: summary.senderName || senderName || '',
            timestamp: toDate(summary.timestamp || chatData.lastMessageTime || chatData.updatedAt),
          });
        }
      }

      const data = {
        totalUnread,
        chats: unreadChats.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
      };

      unreadCache.set(cacheKey, { data, expiresAt: Date.now() + UNREAD_CACHE_TTL_MS });
      return data;
    } catch (error) {
      if (isQuotaExceeded(error)) {
        return cached?.data || emptyUnreadSnapshot();
      }

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
      
      console.log(`Chat ${chatId} y sus mensajes eliminados correctamente`);
      return true;
    } catch (error) {
      console.error('Error al eliminar chat:', error);
      throw error;
    }
  }
}
