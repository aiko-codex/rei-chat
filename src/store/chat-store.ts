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
  getLocalCursor,
  getMetaCursor,
  loadBlobs,
  loadChannels,
  loadMessages,
  putBlob,
  putChannel,
  putMessage,
  setHistoryCursor,
  setLocalCursor,
  setMetaCursor,
} from '@/lib/db';
import {
  ackInvite,
  deleteLocalItem,
  downloadMedia,
  fetchAccepted,
  fetchHistory,
  fetchInvites,
  fetchLocal,
  fetchMeta,
  fetchProfiles,
  respondInvite,
  sendInvite,
  uploadLocalItem,
  uploadMeta,
  uploadProfile,
} from '@/lib/message-api';
import { mockMessages } from '@/lib/mock-data';
import {
  DM_CHANNEL_ID,
  type AcceptedNotice,
  type Channel,
  type CollabInvite,
  type Message,
  type Profile,
  type UserId,
} from '@/lib/types';
import type { ConnDiag, PeerStatus } from '@/lib/webrtc';

const persistent = Boolean(SIGNAL_URL);

const MY_PROFILE_KEY = 'rei-profile';
const PEER_PROFILE_KEY = 'rei-peer-profile';
const LAST_SEEN_KEY = 'rei-last-seen';
// read-receipt high-water-marks (epoch ms): hers tells us which of our sent
// messages she's seen; ours dedupes our own outgoing read-marker uploads
const PEER_READ_KEY = 'rei-peer-read';
const MY_READ_KEY = 'rei-my-read';

function readNum(key: string): number {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) ? n : 0;
}

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

/** a message is backed up room-keyed iff its channel is a *shared* (accepted
 *  collab) channel — personal/todo channels stay device-local until shared */
function isSharedChannelId(channels: Channel[], channelId?: string): boolean {
  if (!channelId || channelId === DM_CHANNEL_ID) return false;
  return channels.some((c) => c.id === channelId && c.shared);
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
  /** epoch ms the peer has read the DM up to (drives our 'read' receipts) */
  peerReadAt: number;
  /** pending collab invites the peer sent us, surfaced as notifications */
  invites: CollabInvite[];
  /** notices that the peer accepted an invite *we* sent */
  acceptances: AcceptedNotice[];

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
  /** pull the peer's published profile (name/color/avatar) from the server */
  syncProfiles: () => Promise<void>;
  /** pull overlay rows (reactions + read receipts) from the server store */
  syncMeta: () => Promise<void>;
  /** pull the encrypted personal-channel/todo backup (survives device loss) */
  syncLocal: () => Promise<void>;
  /** pull pending collab invites the peer sent us (home-screen notifications) */
  syncInvites: () => Promise<void>;
  /** pull notices that the peer accepted an invite we sent */
  syncAccepted: () => Promise<void>;
  /** dismiss an acceptance notice (clears the server invite row) */
  dismissAcceptance: (channelId: string) => void;
  /** share a personal/todo channel: mark it shared, back it up, invite the peer */
  inviteToChannel: (channelId: string) => void;
  /** accept a collab invite: adopt the channel locally and start syncing it */
  acceptInvite: (channelId: string) => Promise<void>;
  /** decline a collab invite (drops the notification) */
  declineInvite: (channelId: string) => void;
  /** rename a channel (edit) — re-publishes if the channel is shared */
  renameChannel: (id: string, name: string) => void;
  /** publish our read high-water-mark for the DM (call when she's viewing it) */
  markRead: () => void;
  /** apply the peer's read mark — flips our delivered DM sends to 'read' */
  applyPeerReadAt: (at: number) => void;

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
  peerReadAt: readNum(PEER_READ_KEY),
  invites: [],
  acceptances: [],

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
    void get().syncProfiles();
    void get().syncMeta();
    void get().syncLocal();
    void get().syncInvites();
    void get().syncAccepted();
  },

  syncProfiles: async () => {
    if (!persistent) return;
    const remote = await fetchProfiles();
    // the row that isn't this device is the peer's — show her name/avatar even
    // when we've never been P2P-connected
    const peer = remote.find((r) => !r.mine);
    if (peer) {
      const current = get().peerProfile;
      if (!current || JSON.stringify(current) !== JSON.stringify(peer.profile)) {
        get().setPeerProfile(peer.profile);
      }
    }
  },

  syncMeta: async () => {
    if (!persistent) return;
    try {
      const since = await getMetaCursor();
      const { rows, cursor } = await fetchMeta(since);
      let newestPeerRead = 0;
      for (const row of rows) {
        const userId: UserId = row.mine ? 'me' : 'her';
        if (row.key.startsWith('react:')) {
          // apply the reaction without re-publishing (avoid an upload loop)
          const id = row.key.slice('react:'.length);
          const emoji = (row.value as { e?: string | null } | null)?.e ?? undefined;
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, reactions: { ...m.reactions, [userId]: emoji || undefined } } : m,
            ),
          }));
          const updated = get().messages.find((m) => m.id === id);
          if (updated) void putMessage(updated);
        } else if (row.key === 'read' && !row.mine) {
          const at = (row.value as { at?: number } | null)?.at ?? 0;
          if (at > newestPeerRead) newestPeerRead = at;
        }
      }
      if (newestPeerRead > get().peerReadAt) get().applyPeerReadAt(newestPeerRead);
      if (cursor > since) await setMetaCursor(cursor);
    } catch {
      // server unreachable — local state still shows; next sync catches up
    }
  },

  syncLocal: async () => {
    if (!persistent) return;
    try {
      const since = await getLocalCursor();
      const { rows, cursor } = await fetchLocal(since);
      for (const row of rows) {
        // apply directly (no public mutator) so we never re-upload what we pull
        if (row.key.startsWith('ch:')) {
          const id = row.key.slice('ch:'.length);
          if (row.value === null) {
            set((s) => ({
              channels: s.channels.filter((c) => c.id !== id),
              messages: s.messages.filter((m) => m.channelId !== id),
            }));
            void dbDeleteChannel(id);
            void deleteMessagesForChannel(id);
          } else {
            const channel = { ...(row.value as Channel), shared: true };
            // only adopt channels we already know (i.e. we accepted the invite,
            // or we're the inviter) — an unaccepted invite is surfaced via the
            // notifications flow, never auto-added here
            if (!get().channels.some((c) => c.id === channel.id)) continue;
            set((s) => ({
              channels: [...s.channels.filter((c) => c.id !== channel.id), channel].sort(
                (a, b) => a.createdAt - b.createdAt,
              ),
            }));
            void putChannel(channel);
          }
        } else if (row.key.startsWith('msg:')) {
          const id = row.key.slice('msg:'.length);
          if (row.value === null) {
            set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
            void deleteMessage(id);
          } else {
            const message = row.value as Message;
            // skip rows for channels we haven't adopted (not accepted yet)
            if (!isSharedChannelId(get().channels, message.channelId)) continue;
            set((s) => ({ messages: sortedUpsert(s.messages, message) }));
            void putMessage(message);
          }
        }
      }
      if (cursor > since) await setLocalCursor(cursor);
    } catch {
      // server unreachable — local cache still shows; next sync catches up
    }
  },

  syncInvites: async () => {
    if (!persistent) return;
    const remote = await fetchInvites();
    const known = new Set(get().channels.map((c) => c.id));
    // only surface invites for channels we haven't already adopted
    const invites: CollabInvite[] = remote
      .filter((r) => !known.has(r.channelId))
      .map((r) => {
        const p = r.payload as Partial<CollabInvite>;
        return {
          channelId: r.channelId,
          name: p.name ?? 'a channel',
          kind: p.kind === 'todo' ? 'todo' : 'personal',
          fromName: p.fromName ?? 'She',
          createdAt: p.createdAt ?? Date.now(),
        };
      });
    set({ invites });
  },

  inviteToChannel: (channelId) => {
    const channel = get().channels.find((c) => c.id === channelId);
    if (!channel || channel.kind === 'dm') return;
    const shared: Channel = { ...channel, shared: true };
    set((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? shared : c)) }));
    if (!persistent) return;
    void putChannel(shared);
    // back up the channel + its current messages so the invitee gets history
    void uploadLocalItem(`ch:${channelId}`, shared);
    for (const m of get().messages) {
      if (m.channelId === channelId) void uploadLocalItem(`msg:${m.id}`, m);
    }
    void sendInvite(channelId, {
      name: shared.name,
      kind: shared.kind,
      fromName: get().myProfile?.name ?? 'Your partner',
      createdAt: Date.now(),
    });
  },

  acceptInvite: async (channelId) => {
    const invite = get().invites.find((i) => i.channelId === channelId);
    if (!invite) return;
    // adopt the channel locally (shared) so syncLocal will fill its messages
    const channel: Channel = {
      id: channelId,
      kind: invite.kind,
      name: invite.name,
      createdAt: invite.createdAt,
      shared: true,
    };
    set((s) => ({
      channels: [...s.channels.filter((c) => c.id !== channelId), channel].sort(
        (a, b) => a.createdAt - b.createdAt,
      ),
      invites: s.invites.filter((i) => i.channelId !== channelId),
    }));
    if (persistent) {
      void putChannel(channel);
      await respondInvite(channelId, 'accepted');
      // the background poll may have advanced the local cursor past this
      // channel's rows while it was still unadopted — reset so syncLocal
      // re-pulls the whole backup and fills the newly-accepted channel
      await setLocalCursor(0);
      await get().syncLocal();
    }
  },

  declineInvite: (channelId) => {
    set((s) => ({ invites: s.invites.filter((i) => i.channelId !== channelId) }));
    if (persistent) void respondInvite(channelId, 'declined');
  },

  syncAccepted: async () => {
    if (!persistent) return;
    const remote = await fetchAccepted();
    const acceptances: AcceptedNotice[] = remote.map((r) => {
      const p = r.payload as Partial<CollabInvite>;
      return {
        channelId: r.channelId,
        name: p.name ?? 'a channel',
        kind: p.kind === 'todo' ? 'todo' : 'personal',
      };
    });
    set({ acceptances });
  },

  dismissAcceptance: (channelId) => {
    set((s) => ({ acceptances: s.acceptances.filter((a) => a.channelId !== channelId) }));
    if (persistent) void ackInvite(channelId);
  },

  renameChannel: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const channel = get().channels.find((c) => c.id === id);
    if (!channel) return;
    const next = { ...channel, name: trimmed };
    set((s) => ({ channels: s.channels.map((c) => (c.id === id ? next : c)) }));
    if (persistent) {
      void putChannel(next);
      if (next.shared) void uploadLocalItem(`ch:${id}`, next);
    }
  },

  applyPeerReadAt: (at) => {
    localStorage.setItem(PEER_READ_KEY, String(at));
    set((s) => ({
      peerReadAt: at,
      messages: s.messages.map((m) => {
        // only our own delivered DM sends flip to 'read' (≤ her read mark)
        if (m.senderId !== 'me') return m;
        if ((m.channelId ?? DM_CHANNEL_ID) !== DM_CHANNEL_ID) return m;
        if (m.status !== 'delivered' && m.status !== 'sent') return m;
        if (m.sentAt > at) return m;
        const next = { ...m, status: 'read' as const };
        if (persistent) void putMessage(next);
        return next;
      }),
    }));
  },

  markRead: () => {
    if (!persistent) return;
    // the newest DM message we can see is what we've now "read up to"
    const newest = get().messages.reduce(
      (max, m) => ((m.channelId ?? DM_CHANNEL_ID) === DM_CHANNEL_ID && m.sentAt > max ? m.sentAt : max),
      0,
    );
    if (newest <= readNum(MY_READ_KEY)) return; // nothing new since last receipt
    localStorage.setItem(MY_READ_KEY, String(newest));
    void uploadMeta('read', { at: newest });
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
    // if she's already read past this one of ours, show it 'read' right away
    // (e.g. an ack lands 'delivered' after her read mark was synced)
    if (
      message.senderId === 'me' &&
      (message.channelId ?? DM_CHANNEL_ID) === DM_CHANNEL_ID &&
      (message.status === 'delivered' || message.status === 'sent') &&
      message.sentAt <= get().peerReadAt
    ) {
      message = { ...message, status: 'read' };
    }
    set((s) => ({ messages: sortedUpsert(s.messages, message) }));
    // the media Blob is persisted separately (db `blobs`); the row keeps only
    // metadata + a per-session object URL that we rebuild from the blob on load
    if (persistent) void putMessage(message);
    // shared (accepted-collab) channel rows are backed up room-keyed so both
    // devices converge; personal channels stay device-local (the DM has its
    // own ciphertext store)
    if (persistent && isSharedChannelId(get().channels, message.channelId)) {
      void uploadLocalItem(`msg:${message.id}`, message);
    }
  },

  markDelivered: (id) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== id) return m;
        // don't downgrade a message she's already read (late/duplicate ack)
        if (m.status === 'read') return m;
        // she may have read past it already (her mark synced before the ack)
        const status = m.sentAt <= get().peerReadAt ? ('read' as const) : ('delivered' as const);
        return { ...m, status };
      }),
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
    // publish to the server overlay store so it reaches her even while offline
    if (persistent) void uploadMeta(`react:${id}`, { e: emoji ?? null });
  },

  remove: (id) => {
    const removed = get().messages.find((m) => m.id === id);
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
    if (persistent) void deleteMessage(id);
    // propagate the delete of a shared-channel row (tombstone)
    if (persistent && removed && isSharedChannelId(get().channels, removed.channelId)) {
      void deleteLocalItem(`msg:${id}`);
    }
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
    // publish to the server so the peer sees it without a P2P connection
    if (persistent) void uploadProfile(profile);
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
    // new channels are personal (device-local); they only sync once shared
    set((s) => ({ channels: [...s.channels, channel] }));
    if (persistent) void putChannel(channel);
    return channel;
  },

  removeChannel: (id) => {
    const channel = get().channels.find((c) => c.id === id);
    const msgs = get().messages.filter((m) => m.channelId === id);
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== id),
      messages: s.messages.filter((m) => m.channelId !== id),
    }));
    if (persistent) {
      void dbDeleteChannel(id);
      void deleteMessagesForChannel(id);
      // only a shared channel has server rows to tombstone (so the delete
      // reaches the other phone and never resurrects)
      if (channel?.shared) {
        void deleteLocalItem(`ch:${id}`);
        for (const m of msgs) void deleteLocalItem(`msg:${m.id}`);
      }
    }
  },

  updateTodo: (id, patch) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    const updated = get().messages.find((m) => m.id === id);
    if (persistent && updated) void putMessage(updated);
    // todo items in a shared channel — keep the server backup in sync
    if (persistent && updated && isSharedChannelId(get().channels, updated.channelId)) {
      void uploadLocalItem(`msg:${updated.id}`, updated);
    }
  },

  restoreChannel: (channel, messages) => {
    set((s) => ({
      channels: [...s.channels, channel].sort((a, b) => a.createdAt - b.createdAt),
      messages: messages.reduce(sortedUpsert, s.messages),
    }));
    if (persistent) {
      void putChannel(channel);
      for (const m of messages) void putMessage(m);
      // re-publish to the server only if it was a shared channel (undo delete)
      if (channel.shared) {
        void uploadLocalItem(`ch:${channel.id}`, channel);
        for (const m of messages) void uploadLocalItem(`msg:${m.id}`, m);
      }
    }
  },

  markSeen: (channelId) => {
    const lastSeen = { ...get().lastSeen, [channelId]: Date.now() };
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(lastSeen));
    set({ lastSeen });
    // opening/viewing the DM means we've read it — publish a read receipt
    if (channelId === DM_CHANNEL_ID) get().markRead();
  },
}));
