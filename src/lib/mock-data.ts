import type { Message, User, UserId } from './types';

export const users: Record<UserId, User> = {
  me: { id: 'me', name: 'Takashi', online: true },
  her: { id: 'her', name: 'Rei', online: true },
};

export const currentUserId: UserId = 'me';

const minutesAgo = (m: number) => Date.now() - m * 60_000;

export const mockMessages: Message[] = [
  { id: 'm1', senderId: 'her', text: 'good morning ☀️', sentAt: minutesAgo(190), status: 'read' },
  { id: 'm2', senderId: 'me', text: 'morning! slept ok?', sentAt: minutesAgo(188), status: 'read' },
  { id: 'm3', senderId: 'her', text: 'mm kinda, kept waking up', sentAt: minutesAgo(185), status: 'read' },
  { id: 'm4', senderId: 'her', text: 'what time are you free today?', sentAt: minutesAgo(184), status: 'read' },
  { id: 'm5', senderId: 'me', text: 'after 6, want to call then?', sentAt: minutesAgo(180), status: 'read' },
  { id: 'm6', senderId: 'her', text: 'yes!! 📞', sentAt: minutesAgo(179), status: 'read' },
  { id: 'm7', senderId: 'me', text: 'btw I started building our own chat app so we can stop using whatsapp', sentAt: minutesAgo(40), status: 'read' },
  { id: 'm8', senderId: 'her', text: 'wait really?', sentAt: minutesAgo(38), status: 'read' },
  { id: 'm9', senderId: 'her', text: 'that is so cute wth', sentAt: minutesAgo(38), status: 'read' },
  { id: 'm10', senderId: 'me', text: 'fully encrypted, just for us two', sentAt: minutesAgo(36), status: 'read' },
  { id: 'm11', senderId: 'her', text: 'okay now I need to see it 👀', sentAt: minutesAgo(2), status: 'delivered' },
];
