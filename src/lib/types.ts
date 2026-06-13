export type UserId = 'me' | 'her';

export interface User {
  id: UserId;
  name: string;
  avatarUrl?: string;
  online: boolean;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

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

/** per-device profile, set by each user on their own device and exchanged
 *  over the encrypted data channel — never stored on the server */
export interface Profile {
  name: string;
  /** avatar background color (hex) */
  color: string;
}

/** the one DM channel between the two devices */
export const DM_CHANNEL_ID = 'dm';

export interface Channel {
  id: string;
  /** 'dm' syncs P2P + encrypted server store; 'personal' and 'todo' never
   *  leave this device */
  kind: 'dm' | 'personal' | 'todo';
  name: string;
  createdAt: number;
}

export interface Message {
  id: string;
  /** which channel this belongs to; legacy rows without it are the DM */
  channelId?: string;
  senderId: UserId;
  text?: string;
  media?: MediaAttachment;
  sentAt: number; // epoch ms
  status: MessageStatus;
  /** one reaction per user, keyed by who reacted */
  reactions?: Partial<Record<UserId, string>>;
  /** id of the message this one replies to */
  replyToId?: string;
  /** todo channels reuse message rows as items; checked state lives here */
  done?: boolean;
  /** todo: optional deadline (epoch ms) — drives the time progress bar */
  deadline?: number;
  /** todo: when the item was checked off — used for the on-time/late verdict */
  completedAt?: number;
  /** todo: manually entered time worked, in minutes */
  timeSpent?: number;
  /** todo: recurring chore — respawns when checked off */
  repeat?: 'daily' | 'weekly';
  /** todo: manual sort position (assigned on first drag-reorder) */
  order?: number;
}

export type Screen =
  | 'lock'
  | 'profile-setup'
  | 'pairing'
  | 'home'
  | 'chat'
  | 'call'
  | 'voice-channel'
  | 'settings';
