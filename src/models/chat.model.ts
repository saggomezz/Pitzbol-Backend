export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderType: 'tourist' | 'guide';
  content: string;
  timestamp: Date;
  read: boolean;
}

export interface Chat {
  id: string;
  touristId: string;
  touristName: string;
  touristPhoto?: string;
  guideId: string;
  guideName: string;
  guidePhoto?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  unreadByUser?: Record<string, number>;
  unreadSummaryByUser?: Record<string, {
    lastMessage?: string;
    senderName?: string;
    timestamp?: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatParticipant {
  userId: string;
  userName: string;
  userType: 'tourist' | 'guide';
}
