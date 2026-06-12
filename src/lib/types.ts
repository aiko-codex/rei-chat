export type UserId = 'me' | 'her';

export interface User {
  id: UserId;
  name: string;
  avatarUrl?: string;
  online: boolean;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type MediaKind = 'image' | 'video' | 'file' | 'voice';

export interface MediaAttachment {
  kind: MediaKind;
  /** object URL in the mock phase; later a decrypted blob from the data channel */
  url: string;
  name: string;
  size: number; // bytes
  mimeType: string;
  /** voice notes / videos, in seconds */
  duration?: number;
}

export interface Message {
  id: string;
  senderId: UserId;
  text?: string;
  media?: MediaAttachment;
  sentAt: number; // epoch ms
  status: MessageStatus;
  /** one reaction per user, keyed by who reacted */
  reactions?: Partial<Record<UserId, string>>;
}

export type Screen = 'chat' | 'call' | 'voice-channel' | 'settings' | 'lock';
