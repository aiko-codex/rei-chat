/**
 * Chat state (Zustand): optimistic UI over two persistence layers —
 * IndexedDB (local plaintext cache, instant load) and the server's
 * encrypted conversation store (ciphertext only, synced via history cursor).
 *
 * Channels: the single DM syncs P2P + server; personal channels (notes)
 * live only on this device. Profiles are per-device and exchanged over the
 * data channel — the server never sees a name.
 *
 * Mock mode (no VITE_SIGNAL_URL): mock messages, no persistence.
 */
import { create } from 'zustand';
import { getRoomId, getSecret, isPaired, SIGNAL_URL } from '@/lib/config';
import { initCrypto } from '@/lib/crypto';
import {
  deleteChannel as dbDeleteChannel,
  deleteMessage,
  deleteMessagesForChannel,
  getBlob,
  getHistoryCursor,
  loadBlobs,
  loadChannels,
  loadMessages,
  putBlob,
  putChannel,
  putMessage,
  setHistoryCursor,
} from '@/lib/db';
import { downloadMedia, fetchHistory } from '@/lib/message-api';
import { mockMessages } from '@/lib/mock-data';
import { DM_CHANNEL_ID, type Channel, type Message, type Profile, type UserId } from '@/lib/types';
import type { ConnDiag, PeerStatus } from '@/lib/webrtc';

const persistent = Boolean(SIGNAL_URL);

const MY_PROFILE_KEY = 'rei-profile';
const PEER_PROFILE_KEY = 'rei-peer-profile';
const LAST_SEEN_KEY = 'rei-last-seen';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function sortedUpsert(list: Message[], message: Message): Message[] {
  const without = list.filter((m) => m.id !== message.id);
  return [...without, message].sort((a, b) => a.sentAt - b.sentAt);
}

/**
 * Make sure a media message has a usable object URL: rebuild from the local
 * blob if we have it, otherwise pull the encrypted bytes from the server
 * backup (restores media on a new device or after the peer was offline).
 */
async function ensureMediaBlob(message: Message): Promise<void> {
  if (!message.media || message.media.url) return;
  let blob = await getBlob(message.id);
  if (!blob) {
    const downloaded = await downloadMedia(message.id, message.media.mimeType);
    if (!downloaded) return; // not backed up / unreachable — try again next sync
    blob = downloaded;
    await putBlob(message.id, blob);
  }
  useChatStore
    .getState()
    .upsert({ ...message, media: { ...message.media, url: URL.createObjectURL(blob) } });
}

interface ChatStore {
  messages: Message[];
  channels: Channel[];
  status: PeerStatus;
  /** connection diagnostics (ICE path + connect time), null until connected */
  connDiag: ConnDiag | null;
  /** outgoing media upload progress (0..1) keyed by message id, while sending */
  transfers: Record<string, number>;
  peerTyping: boolean;
  hydrated: boolean;

  /** my profile (set on this device) and hers (received over the channel) */
  myProfile: Profile | null;
  peerProfile: Profile | null;
  /** last time each channel was opened, for unread counts */
  lastSeen: Record<string, number>;

  /** load local cache, derive the key, then pull new ciphertext from the server */
  hydrate: () => Promise<void>;
  /** add or replace a message (optimistic) and persist locally */
  upsert: (message: Message) => void;
  markDelivered: (id: string) => void;
  setReaction: (id: string, userId: UserId, emoji: string | undefined) => void;
  /** local removal only — callers decide about the server copy */
  remove: (id: string) => void;
  setStatus: (status: PeerStatus) => void;
  setConnDiag: (diag: ConnDiag | null) => void;
  /** set upload progress (0..1) for a media message; clears once it hits 1 */
  setTransfer: (id: string, progress: number) => void;
  clearTransfer: (id: string) => void;
  setPeerTyping: (typing: boolean) => void;
  /** pull anything new from the server store (called on boot + reconnect) */
  syncHistory: () => Promise<void>;

  setMyProfile: (profile: Profile) => void;
  setPeerProfile: (profile: Profile) => void;
  /** display name for a sender, with mock fallbacks */
  displayName: (senderId: UserId) => string;

  createChannel: (name: string, kind?: 'personal' | 'todo') => Channel;
  /** patch a todo item (done/completedAt/timeSpent/deadline) and persist */
  updateTodo: (id: string, patch: Partial<Message>) => void;
  removeChannel: (id: string) => void;
  /** undo for removeChannel: put the channel and its messages back */
  restoreChannel: (channel: Channel, messages: Message[]) => void;
  markSeen: (channelId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: persistent ? [] : mockMessages,
  channels: [],
  status: 'offline',
  connDiag: null,
  transfers: {},
  peerTyping: false,
  hydrated: !persistent,

  myProfile: readJson<Profile>(MY_PROFILE_KEY),
  peerProfile: readJson<Profile>(PEER_PROFILE_KEY),
  lastSeen: readJson<Record<string, number>>(LAST_SEEN_KEY) ?? {},

  hydrate: async () => {
    if (!persistent || get().hydrated || !isPaired()) return;
    await initCrypto(getSecret(), getRoomId());
    const [cached, channels, blobs] = await Promise.all([
      loadMessages(),
      loadChannels(),
      loadBlobs(),
    ]);
    set({
      messages: cached.map((m) => {
        // legacy rows predate channels — they belong to the DM
        const withChannel = m.channelId ? m : { ...m, channelId: DM_CHANNEL_ID };
        // object URLs die on reload — rebuild them from the stored blob
        const blob = m.media ? blobs.get(m.id) : undefined;
        return blob
          ? { ...withChannel, media: { ...m.media!, url: URL.createObjectURL(blob) } }
          : withChannel;
      }),
      channels: channels.sort((a, b) => a.createdAt - b.createdAt),
      hydrated: true,
    });
    // media rows with no local blob yet (failed/unfinished restore) — backfill
    for (const m of cached) {
      if (m.media && !blobs.has(m.id)) void ensureMediaBlob({ ...m, media: { ...m.media, url: '' } });
    }
    await get().syncHistory();
  },

  syncHistory: async () => {
    if (!persistent) return;
    try {
      const since = await getHistoryCursor();
      const { messages: remote, cursor } = await fetchHistory(since);
      for (const { mine, message } of remote) {
        // sender stored it from their own perspective — normalize to ours
        const normalized: Message = {
          ...message,
          channelId: DM_CHANNEL_ID,
          senderId: mine ? 'me' : 'her',
          status: mine ? message.status : 'delivered',
        };
        get().upsert(normalized);
        // pull the encrypted media bytes if this row carries an attachment
        if (normalized.media) void ensureMediaBlob(normalized);
      }
      if (cursor > since) await setHistoryCursor(cursor);
    } catch {
      // server unreachable — local cache still shows; next sync catches up
    }
  },

  upsert: (message) => {
    set((s) => ({ messages: sortedUpsert(s.messages, message) }));
    // the media Blob is persisted separately (db `blobs`); the row keeps only
    // metadata + a per-session object URL that we rebuild from the blob on load
    if (persistent) void putMessage(message);
  },

  markDelivered: (id) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, status: 'delivered' } : m)),
    }));
    const updated = get().messages.find((m) => m.id === id);
    if (persistent && updated) void putMessage(updated);
  },

  setReaction: (id, userId, emoji) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, reactions: { ...m.reactions, [userId]: emoji } } : m,
      ),
    }));
    const updated = get().messages.find((m) => m.id === id);
    if (persistent && updated) void putMessage(updated);
  },

  remove: (id) => {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
    if (persistent) void deleteMessage(id);
  },

  setStatus: (status) => set({ status, connDiag: status === 'connected' ? get().connDiag : null }),
  setConnDiag: (connDiag) => set({ connDiag }),

  setTransfer: (id, progress) => {
    if (progress >= 1) {
      get().clearTransfer(id);
      return;
    }
    set((s) => ({ transfers: { ...s.transfers, [id]: progress } }));
  },
  clearTransfer: (id) => {
    set((s) => {
      if (!(id in s.transfers)) return s;
      const next = { ...s.transfers };
      delete next[id];
      return { transfers: next };
    });
  },

  setPeerTyping: (peerTyping) => set({ peerTyping }),

  setMyProfile: (profile) => {
    localStorage.setItem(MY_PROFILE_KEY, JSON.stringify(profile));
    set({ myProfile: profile });
  },

  setPeerProfile: (profile) => {
    localStorage.setItem(PEER_PROFILE_KEY, JSON.stringify(profile));
    set({ peerProfile: profile });
  },

  displayName: (senderId) => {
    const { myProfile, peerProfile } = get();
    return senderId === 'me' ? (myProfile?.name ?? 'Me') : (peerProfile?.name ?? 'Her');
  },

  createChannel: (name, kind = 'personal') => {
    const channel: Channel = {
      id: `ch-${crypto.randomUUID().slice(0, 8)}`,
      kind,
      name: name.trim(),
      createdAt: Date.now(),
    };
    set((s) => ({ channels: [...s.channels, channel] }));
    if (persistent) void putChannel(channel);
    return channel;
  },

  removeChannel: (id) => {
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== id),
      messages: s.messages.filter((m) => m.channelId !== id),
    }));
    if (persistent) {
      void dbDeleteChannel(id);
      void deleteMessagesForChannel(id);
    }
  },

  updateTodo: (id, patch) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    const updated = get().messages.find((m) => m.id === id);
    if (persistent && updated) void putMessage(updated);
  },

  restoreChannel: (channel, messages) => {
    set((s) => ({
      channels: [...s.channels, channel].sort((a, b) => a.createdAt - b.createdAt),
      messages: messages.reduce(sortedUpsert, s.messages),
    }));
    if (persistent) {
      void putChannel(channel);
      for (const m of messages) void putMessage(m);
    }
  },

  markSeen: (channelId) => {
    const lastSeen = { ...get().lastSeen, [channelId]: Date.now() };
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(lastSeen));
    set({ lastSeen });
  },
}));
