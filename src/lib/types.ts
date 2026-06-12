export type UserId = 'me' | 'her';

export interface User {
  id: UserId;
  name: string;
  avatarUrl?: string;
  online: boolean;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  senderId: UserId;
  text?: string;
  imageUrl?: string;
  sentAt: number; // epoch ms
  status: MessageStatus;
}

export type Screen = 'chat' | 'call' | 'voice-channel' | 'settings' | 'lock';
