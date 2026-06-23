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
  fetchMembers,
  fetchMeta,
  fetchProfiles,
  joinSpace,
  removeMember,
  respondInvite,
  sendInvite,
  uploadLocalItem,
  uploadMedia,
  uploadMeta,
  uploadProfile,
  type SpaceMember,
} from '@/lib/message-api';
import {
  deleteConvLocal,
  downloadConvMedia,
  fetchConvHistory,
  fetchConvLocal,
  fetchConvMeta,
  uploadConvLocal,
  uploadConvMedia,
  uploadConvMeta,
} from '@/lib/conversation-api';
import {
  acceptConnection,
  declineConnection,
  listConnections,
  type Connection,
} from '@/lib/account-api';
import { isLoggedIn } from '@/lib/session';
import { mockMessages } from '@/lib/mock-data';
import { loadReactions, persistReactions } from '@/lib/reactions';
import {
  getStoredBackground,
  storeBackground,
  type ChatBackground,
} from '@/lib/chat-theme';
import { loadDates, storeDates } from '@/lib/important-dates';
import {
  DM_CHANNEL_ID,
  type AcceptedNotice,
  type Channel,
  type CollabInvite,
  type ImportantDate,
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

/** the connection a channel is shared with (accounts mode), or null */
function connBackupOf(channels: Channel[], channelId?: string): string | null {
  if (!channelId || channelId === DM_CHANNEL_ID) return null;
  const c = channels.find((ch) => ch.id === channelId);
  return c && c.shared && c.sharedConnId ? c.sharedConnId : null;
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

/**
 * Rebuild the object URL for a custom chat wallpaper: from the local blob if we
 * have it, otherwise from the encrypted server backup (so the wallpaper one
 * device set restores on the other). Returns null for presets / when absent.
 */
async function ensureWallpaperUrl(
  bg: ChatBackground | null,
  connectionId?: string | null,
): Promise<string | null> {
  if (!bg || bg.id !== 'custom' || !bg.wid) return null;
  let blob = await getBlob(bg.wid);
  if (!blob) {
    // a connection wallpaper rides the per-connection media file; the legacy DM
    // rides the room-keyed chunked media store
    const downloaded = connectionId
      ? await downloadConvMedia(connectionId, bg.wid, bg.mime ?? 'image/jpeg')
      : await downloadMedia(bg.wid, bg.mime ?? 'image/jpeg');
    if (!downloaded) return null;
    blob = downloaded;
    await putBlob(bg.wid, blob);
  }
  return URL.createObjectURL(blob);
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
  /** device-membership lock: 'full' = this device was refused (room has its 2) */
  membership: 'unknown' | 'member' | 'full';
  /** the room's registered devices (for Settings → Manage devices) */
  members: SpaceMember[];
  /** the 6 customizable quick reactions; slot 0 is the double-tap default */
  quickReactions: string[];
  /** pending collab invites the peer sent us, surfaced as notifications */
  invites: CollabInvite[];
  /** notices that the peer accepted an invite *we* sent */
  acceptances: AcceptedNotice[];
  /** shared chat wallpaper selection (synced to both devices), null = default */
  chatBg: ChatBackground | null;
  /** object URL for a custom wallpaper photo (rebuilt per session), else null */
  chatBgUrl: string | null;

  /** load local cache, derive the key, then pull new ciphertext from the server */
  hydrate: () => Promise<void>;
  /** add or replace a message (optimistic) and persist locally */
  upsert: (message: Message) => void;
  markDelivered: (id: string) => void;
  setReaction: (id: string, userId: UserId, emoji: string | undefined) => void;
  /** apply a reaction to local state only — no server/P2P re-publish (used by
   *  the inbound P2P reaction frame and server overlay sync) */
  applyReactionLocal: (id: string, userId: UserId, emoji: string | undefined) => void;
  /** pin/unpin a message into the shared Memories album (or edit its caption);
   *  syncs to the peer via the encrypted meta overlay (key `pin:<id>`) */
  setMemory: (id: string, pinned: boolean, caption?: string) => void;
  /** apply a memory pin to local state only — no re-publish (used by overlay sync) */
  applyMemoryLocal: (id: string, pinned: boolean, caption: string | undefined, at: number) => void;
  /** move messages in/out of this device's Hidden vault (local-only, not synced) */
  hideMessages: (ids: string[], hidden: boolean) => void;
  /** flip our sent messages in a connection to 'read' up to `at` (P2P receipt) */
  applyPeerReadAtConnection: (connectionId: string, at: number) => void;
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
  /** set the shared chat wallpaper (preset or custom photo) and publish it */
  setChatBackground: (bg: ChatBackground, blob?: Blob, connectionId?: string | null) => Promise<void>;
  /** publish our read high-water-mark for the DM (call when she's viewing it) */
  markRead: () => void;
  /** apply the peer's read mark — flips our delivered DM sends to 'read' */
  applyPeerReadAt: (at: number) => void;

  /** replace the quick-reaction set (persists; slot 0 = double-tap default) */
  setQuickReactions: (reactions: string[]) => void;
  setMyProfile: (profile: Profile) => void;
  setPeerProfile: (profile: Profile) => void;
  /** display name for a sender, with mock fallbacks */
  displayName: (senderId: UserId) => string;

  /** claim this device's slot; sets membership to 'member' or 'full' */
  registerDevice: () => Promise<void>;
  /** reload the room's device list */
  refreshMembers: () => Promise<void>;
  /** remove a device to free a slot (replace a lost/reinstalled phone) */
  removeDevice: (target: string) => Promise<void>;

  createChannel: (name: string, kind?: 'personal' | 'todo') => Channel;
  /** patch a todo item (done/completedAt/timeSpent/deadline) and persist */
  updateTodo: (id: string, patch: Partial<Message>) => void;
  removeChannel: (id: string) => void;
  /** undo for removeChannel: put the channel and its messages back */
  restoreChannel: (channel: Channel, messages: Message[]) => void;
  markSeen: (channelId: string) => void;

  // ── accounts model (2026-06-17): connection-keyed conversations ──────────
  /** the connection conversation currently open (accounts mode), else null */
  activeConnectionId: string | null;
  setActiveConnection: (connectionId: string | null) => void;
  /** remembered peer display name/username per connection (for the header) */
  connectionPeers: Record<string, { displayName: string; username: string; avatar?: string | null }>;
  rememberConnectionPeer: (
    connectionId: string,
    peer: { displayName: string; username: string; avatar?: string | null },
  ) => void;
  /** pull new messages for a connection from the server (truth lane) */
  syncConversation: (connectionId: string) => Promise<void>;
  /** all my connections (accepted + pending); drives chats + request notifications */
  connections: Connection[];
  /** notices that someone accepted a request *I* sent (surfaced in Notifications) */
  connectionAccepts: { connectionId: string; displayName: string; username: string }[];
  /** dismiss an accepted-request notice */
  dismissConnectionAccept: (connectionId: string) => void;
  /** refresh the connection list from the server (polled in accounts mode) */
  syncConnections: () => Promise<void>;
  /** accept an incoming connection request (seals the conv key to both) */
  acceptConnectionRequest: (connectionId: string, otherUserId: string) => Promise<void>;
  /** decline/cancel a connection request */
  declineConnectionRequest: (connectionId: string) => Promise<void>;
  /** peer's read high-water-mark per connection (drives our 'read' ticks) */
  connectionReadAt: Record<string, number>;
  /** pull reactions + read receipts for a connection from the server */
  syncConvMeta: (connectionId: string) => Promise<void>;
  /** publish our read high-water-mark for a connection (call when viewing it) */
  markReadConnection: (connectionId: string) => void;
  /** accounts-mode boot: load the local message cache (the room `hydrate` is
   *  gated on pairing, which accounts mode never sets) + refresh connections */
  hydrateAccount: () => Promise<void>;
  /** share a personal/todo channel with a connected account (backs it up +
   *  its items to conv_local; the peer auto-adopts it on sync) */
  shareChannelWithConnection: (channelId: string, connectionId: string) => void;
  /** pull shared channels/items for a connection and adopt them locally */
  syncConvLocal: (connectionId: string) => Promise<void>;

  // ── shared "Important dates" agenda (per conversation) ───────────────────
  /** important dates per channel, lazily loaded from localStorage */
  datesByChannel: Record<string, ImportantDate[]>;
  /** load this channel's dates into state if not already present */
  loadDatesFor: (channelId: string) => void;
  /** add/edit a date and publish it to the encrypted meta overlay */
  setImportantDate: (channelId: string, entry: ImportantDate) => void;
  /** remove a date and publish the tombstone */
  removeImportantDate: (channelId: string, id: string) => void;

  /** patch a live-location message's position/paused/stopped state, locally
   *  and via the encrypted meta overlay (key `loc:<id>`) — the message itself
   *  is sent once through the normal message path; this only updates it */
  setLiveLocation: (
    channelId: string,
    id: string,
    patch: Partial<NonNullable<Message['liveLocation']>>,
  ) => void;
}

type DateOverlayValue =
  | { title: string; date: number; icon: string; color?: string; repeatYearly?: boolean; at: number }
  | { deleted: true; at: number }
  | null;

/** apply an incoming `date:<id>` overlay row to a channel's agenda —
 *  last-writer-wins by the embedded `at`, mirrors the Memories pin handler */
function applyDateOverlay(
  get: () => ChatStore,
  set: (partial: Partial<ChatStore>) => void,
  channelId: string,
  id: string,
  rawValue: unknown,
): void {
  const v = rawValue as DateOverlayValue;
  const at = v?.at ?? Date.now();
  const list = get().datesByChannel[channelId] ?? loadDates(channelId);
  const existing = list.find((d) => d.id === id);
  if (existing && existing.updatedAt > at) return;
  const next =
    v && 'deleted' in v
      ? list.filter((d) => d.id !== id)
      : v
        ? [
            ...list.filter((d) => d.id !== id),
            { id, title: v.title, date: v.date, icon: v.icon, color: v.color, repeatYearly: v.repeatYearly, updatedAt: at },
          ]
        : list.filter((d) => d.id !== id);
  storeDates(channelId, next);
  set({ datesByChannel: { ...get().datesByChannel, [channelId]: next } });
}

// last-applied overlay `at` per live-location message id — resolves
// last-writer-wins without polluting the persisted Message shape. Resets on
// reload (worst case: one redundant re-application of the same row).
const liveLocAtCache = new Map<string, number>();

type LiveLocationOverlayValue = (NonNullable<Message['liveLocation']> & { at: number }) | null;

function applyLiveLocationOverlay(
  get: () => ChatStore,
  set: (partial: Partial<ChatStore>) => void,
  id: string,
  rawValue: unknown,
): void {
  const v = rawValue as LiveLocationOverlayValue;
  if (!v) return;
  const lastAt = liveLocAtCache.get(id) ?? 0;
  if (v.at <= lastAt) return;
  liveLocAtCache.set(id, v.at);
  const current = get().messages.find((m) => m.id === id);
  if (!current) return; // message hasn't arrived via history yet — next sync catches up
  const { at: _at, ...liveLocation } = v;
  const next = { ...current, liveLocation };
  set({ messages: get().messages.map((m) => (m.id === id ? next : m)) });
  if (persistent) void putMessage(next);
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
  membership: 'unknown',
  members: [],
  quickReactions: loadReactions(),
  invites: [],
  acceptances: [],
  chatBg: getStoredBackground(),
  chatBgUrl: null,
  activeConnectionId: null,
  connectionPeers: readJson<Record<string, { displayName: string; username: string; avatar?: string | null }>>(
    'rei-conn-peers',
  ) ?? {},
  connections: [],
  connectionAccepts: [],
  connectionReadAt: {},
  datesByChannel: {},

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
      // remote media (Giphy etc.) has no bytes to restore — its url is the asset
      if (m.media && !m.media.remote && !blobs.has(m.id))
        void ensureMediaBlob({ ...m, media: { ...m.media, url: '' } });
    }
    // rebuild the custom wallpaper object URL (object URLs die on reload)
    void ensureWallpaperUrl(get().chatBg).then((url) => {
      if (url) set({ chatBgUrl: url });
    });
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
        } else if (row.key.startsWith('pin:')) {
          // shared Memories album — apply locally, last-writer-wins by `at`
          const id = row.key.slice('pin:'.length);
          const v = row.value as { c?: string | null; at?: number } | null;
          const at = v?.at ?? Date.now();
          const current = get().messages.find((m) => m.id === id);
          if (current && Math.max(current.pinnedAt ?? 0, 0) <= at) {
            get().applyMemoryLocal(id, !!v, v?.c ?? undefined, at);
          }
        } else if (row.key.startsWith('date:')) {
          applyDateOverlay(get, set, DM_CHANNEL_ID, row.key.slice('date:'.length), row.value);
        } else if (row.key.startsWith('loc:')) {
          applyLiveLocationOverlay(get, set, row.key.slice('loc:'.length), row.value);
        } else if (row.key === 'chat-bg') {
          // shared wallpaper — last-writer-wins by the embedded timestamp, so a
          // stale row (or our own echo) never clobbers a newer selection
          const bg = row.value as ChatBackground | null;
          const current = get().chatBg;
          if (bg && typeof bg.at === 'number' && (!current || bg.at > current.at)) {
            storeBackground(bg);
            set({ chatBg: bg });
            const previousUrl = get().chatBgUrl;
            if (bg.id !== 'custom') {
              set({ chatBgUrl: null });
              if (previousUrl) URL.revokeObjectURL(previousUrl);
            } else {
              void ensureWallpaperUrl(bg).then((url) => {
                set({ chatBgUrl: url });
                if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
              });
            }
          }
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
      if (next.sharedConnId) void uploadConvLocal(next.sharedConnId, `ch:${id}`, next);
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

  setChatBackground: async (bg, blob, connectionId) => {
    storeBackground(bg);
    // a connection conversation syncs over its own conv overlay/media; the
    // legacy DM uses the room-keyed meta/media store. The caller passes the
    // channel explicitly (the Theme panel lives in Chat Details, where the
    // chat screen — and thus `activeConnectionId` — has already unmounted), so
    // prefer that and only fall back to the active connection.
    const connId =
      connectionId !== undefined ? connectionId : get().activeConnectionId;
    const previousUrl = get().chatBgUrl;
    let url: string | null = null;
    if (bg.id === 'custom' && bg.wid) {
      if (blob) {
        await putBlob(bg.wid, blob);
        url = URL.createObjectURL(blob);
      } else {
        url = await ensureWallpaperUrl(bg, connId);
      }
    }
    set({ chatBg: bg, chatBgUrl: url });
    if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
    if (persistent) {
      if (connId) {
        // back the photo bytes up (encrypted) + publish the selection so the
        // other phone restores the same wallpaper
        if (bg.id === 'custom' && bg.wid && blob) void uploadConvMedia(connId, bg.wid, blob);
        void uploadConvMeta(connId, 'chat-bg', bg);
      } else {
        if (bg.id === 'custom' && bg.wid && blob) void uploadMedia(bg.wid, blob);
        void uploadMeta('chat-bg', bg);
      }
    }
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
    // accounts mode: a channel shared with a connection backs up to conv_local
    const connId = connBackupOf(get().channels, message.channelId);
    if (persistent && connId) void uploadConvLocal(connId, `msg:${message.id}`, message);
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
    get().applyReactionLocal(id, userId, emoji);
    const updated = get().messages.find((m) => m.id === id);
    if (!persistent || !updated) return;
    // DURABLE fallback: publish to the server overlay so it reaches her even
    // while offline. A connection message uses the connection-keyed overlay; the
    // legacy DM uses the room overlay. (The instant P2P push is fired from the
    // UI layer — ChatScreen — to keep the store free of the peer-service cycle.)
    const cid = updated.channelId;
    if (cid && get().connectionPeers[cid]) {
      void uploadConvMeta(cid, `react:${id}`, { e: emoji ?? null });
    } else {
      void uploadMeta(`react:${id}`, { e: emoji ?? null });
    }
  },

  applyReactionLocal: (id, userId, emoji) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, reactions: { ...m.reactions, [userId]: emoji || undefined } } : m,
      ),
    }));
    const updated = get().messages.find((m) => m.id === id);
    if (persistent && updated) void putMessage(updated);
  },

  setMemory: (id, pinned, caption) => {
    const at = Date.now();
    get().applyMemoryLocal(id, pinned, caption, at);
    const updated = get().messages.find((m) => m.id === id);
    if (!persistent || !updated) return;
    // DURABLE: publish to the encrypted overlay so the album syncs to her even
    // while offline. null value = unpinned (a tombstone). Connection-keyed for
    // accounts mode, room-keyed for the legacy DM.
    const value = pinned ? { c: caption ?? null, at } : null;
    const cid = updated.channelId;
    if (cid && get().connectionPeers[cid]) {
      void uploadConvMeta(cid, `pin:${id}`, value);
    } else {
      void uploadMeta(`pin:${id}`, value);
    }
  },

  applyMemoryLocal: (id, pinned, caption, at) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? pinned
            ? { ...m, pinned: true, memoryCaption: caption || undefined, pinnedAt: at }
            : { ...m, pinned: false, memoryCaption: undefined, pinnedAt: undefined }
          : m,
      ),
    }));
    const updated = get().messages.find((m) => m.id === id);
    if (persistent && updated) void putMessage(updated);
  },

  loadDatesFor: (channelId) => {
    if (get().datesByChannel[channelId]) return;
    set({ datesByChannel: { ...get().datesByChannel, [channelId]: loadDates(channelId) } });
  },

  setImportantDate: (channelId, entry) => {
    const list = get().datesByChannel[channelId] ?? loadDates(channelId);
    const next = [...list.filter((d) => d.id !== entry.id), entry];
    storeDates(channelId, next);
    set({ datesByChannel: { ...get().datesByChannel, [channelId]: next } });
    if (!persistent) return;
    const value = {
      title: entry.title,
      date: entry.date,
      icon: entry.icon,
      color: entry.color,
      repeatYearly: entry.repeatYearly,
      at: entry.updatedAt,
    };
    if (channelId !== DM_CHANNEL_ID && get().connectionPeers[channelId]) {
      void uploadConvMeta(channelId, `date:${entry.id}`, value);
    } else {
      void uploadMeta(`date:${entry.id}`, value);
    }
  },

  removeImportantDate: (channelId, id) => {
    const list = get().datesByChannel[channelId] ?? loadDates(channelId);
    const next = list.filter((d) => d.id !== id);
    storeDates(channelId, next);
    set({ datesByChannel: { ...get().datesByChannel, [channelId]: next } });
    if (!persistent) return;
    const value = { deleted: true as const, at: Date.now() };
    if (channelId !== DM_CHANNEL_ID && get().connectionPeers[channelId]) {
      void uploadConvMeta(channelId, `date:${id}`, value);
    } else {
      void uploadMeta(`date:${id}`, value);
    }
  },

  setLiveLocation: (channelId, id, patch) => {
    const current = get().messages.find((m) => m.id === id);
    if (!current) return;
    const merged = {
      ...(current.liveLocation ?? { lat: 0, lng: 0, startedAt: Date.now(), expiresAt: Date.now() }),
      ...patch,
    };
    const next = { ...current, liveLocation: merged };
    set({ messages: get().messages.map((m) => (m.id === id ? next : m)) });
    if (persistent) void putMessage(next);
    if (!persistent) return;
    const at = Date.now();
    liveLocAtCache.set(id, at);
    const value = { ...merged, at };
    if (channelId !== DM_CHANNEL_ID && get().connectionPeers[channelId]) {
      void uploadConvMeta(channelId, `loc:${id}`, value);
    } else {
      void uploadMeta(`loc:${id}`, value);
    }
  },

  hideMessages: (ids, hidden) => {
    const idSet = new Set(ids);
    set((s) => ({
      messages: s.messages.map((m) => (idSet.has(m.id) ? { ...m, hidden } : m)),
    }));
    if (persistent) {
      for (const id of ids) {
        const m = get().messages.find((x) => x.id === id);
        if (m) void putMessage(m);
      }
    }
  },

  applyPeerReadAtConnection: (connectionId, at) => {
    if (at <= (get().connectionReadAt[connectionId] ?? 0)) return;
    set((s) => ({
      connectionReadAt: { ...s.connectionReadAt, [connectionId]: at },
      messages: s.messages.map((m) => {
        if (m.senderId !== 'me' || m.channelId !== connectionId) return m;
        if (m.status !== 'sent' && m.status !== 'delivered') return m;
        if (m.sentAt > at) return m;
        const next = { ...m, status: 'read' as const };
        if (persistent) void putMessage(next);
        return next;
      }),
    }));
  },

  remove: (id) => {
    const removed = get().messages.find((m) => m.id === id);
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
    if (persistent) void deleteMessage(id);
    // propagate the delete of a shared-channel row (tombstone)
    if (persistent && removed && isSharedChannelId(get().channels, removed.channelId)) {
      void deleteLocalItem(`msg:${id}`);
    }
    const connId = connBackupOf(get().channels, removed?.channelId);
    if (persistent && connId) void deleteConvLocal(connId, `msg:${id}`);
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

  registerDevice: async () => {
    const res = await joinSpace();
    set({ membership: res.full ? 'full' : 'member', members: res.members });
  },
  refreshMembers: async () => {
    set({ members: await fetchMembers() });
  },
  removeDevice: async (target) => {
    await removeMember(target);
    await get().refreshMembers();
  },

  setQuickReactions: (reactions) => {
    persistReactions(reactions);
    set({ quickReactions: reactions });
  },

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
      if (channel?.sharedConnId) {
        void deleteConvLocal(channel.sharedConnId, `ch:${id}`);
        for (const m of msgs) void deleteConvLocal(channel.sharedConnId, `msg:${m.id}`);
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
    const connId = connBackupOf(get().channels, updated?.channelId);
    if (persistent && connId && updated) void uploadConvLocal(connId, `msg:${updated.id}`, updated);
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
    else if (get().connectionPeers[channelId]) get().markReadConnection(channelId);
  },

  setActiveConnection: (connectionId) => {
    set({ activeConnectionId: connectionId, peerTyping: false });
    if (connectionId) void get().syncConversation(connectionId);
  },

  rememberConnectionPeer: (connectionId, peer) => {
    const connectionPeers = { ...get().connectionPeers, [connectionId]: peer };
    localStorage.setItem('rei-conn-peers', JSON.stringify(connectionPeers));
    set({ connectionPeers });
  },

  syncConnections: async () => {
    if (!persistent || !isLoggedIn()) return;
    try {
      const connections = await listConnections();
      set({ connections });
      // remember each peer's name so an opened conversation has a header
      const peers = { ...get().connectionPeers };
      for (const c of connections) {
        peers[c.connectionId] = {
          displayName: c.account.displayName,
          username: c.account.username,
          avatar: c.account.avatar,
        };
      }
      localStorage.setItem('rei-conn-peers', JSON.stringify(peers));
      set({ connectionPeers: peers });

      // pull any channels/todos shared with me over each accepted connection
      for (const c of connections) {
        if (c.status === 'accepted') void get().syncConvLocal(c.connectionId);
      }

      // a request I sent that's now accepted → surface a one-time notice
      const seen = readJson<string[]>('rei-conn-accept-seen') ?? [];
      const fresh = connections.filter(
        (c) => c.status === 'accepted' && c.requestedByMe && !seen.includes(c.connectionId),
      );
      if (fresh.length) {
        const seenSet = [...seen, ...fresh.map((c) => c.connectionId)];
        localStorage.setItem('rei-conn-accept-seen', JSON.stringify(seenSet));
        set((s) => ({
          connectionAccepts: [
            ...s.connectionAccepts,
            ...fresh
              .filter((c) => !s.connectionAccepts.some((a) => a.connectionId === c.connectionId))
              .map((c) => ({
                connectionId: c.connectionId,
                displayName: c.account.displayName,
                username: c.account.username,
              })),
          ],
        }));
      }
    } catch {
      // offline — keep the last list
    }
  },

  dismissConnectionAccept: (connectionId) => {
    set((s) => ({
      connectionAccepts: s.connectionAccepts.filter((a) => a.connectionId !== connectionId),
    }));
  },

  acceptConnectionRequest: async (connectionId, otherUserId) => {
    await acceptConnection(connectionId, otherUserId);
    await get().syncConnections();
  },

  declineConnectionRequest: async (connectionId) => {
    await declineConnection(connectionId);
    await get().syncConnections();
  },

  syncConversation: async (connectionId) => {
    if (!persistent || !connectionId) return;
    const cursorKey = `rei-conv-cursor:${connectionId}`;
    const since = readNum(cursorKey);
    try {
      const { messages, cursor } = await fetchConvHistory(connectionId, since);
      for (const { message } of messages) {
        // messages carry the connection as their channel id locally
        const local: Message = { ...message, channelId: connectionId };
        get().upsert(local);
        if (persistent) void putMessage(local);
        // media rows arrive with an empty url — pull + decrypt the bytes
        // (remote media has no bytes; its url is the public asset, keep it)
        if (local.media && !local.media.url && !local.media.remote) {
          void (async () => {
            const existing = await getBlob(local.id);
            const blob =
              existing ?? (await downloadConvMedia(connectionId, local.id, local.media!.mimeType));
            if (!blob) return;
            if (!existing) await putBlob(local.id, blob);
            get().upsert({ ...local, media: { ...local.media!, url: URL.createObjectURL(blob) } });
          })();
        }
      }
      if (cursor > since) localStorage.setItem(cursorKey, String(cursor));
    } catch {
      // offline / unreachable — retry on the next poll
    }
    // overlays (reactions + read receipts) ride the same poll
    void get().syncConvMeta(connectionId);
  },

  syncConvMeta: async (connectionId) => {
    if (!persistent || !connectionId) return;
    const cursorKey = `rei-conv-meta-cursor:${connectionId}`;
    const since = readNum(cursorKey);
    try {
      const { rows, cursor } = await fetchConvMeta(connectionId, since);
      let newestPeerRead = 0;
      for (const row of rows) {
        if (row.key.startsWith('react:')) {
          // apply the reaction without re-publishing (no upload loop)
          const id = row.key.slice('react:'.length);
          const userId: UserId = row.mine ? 'me' : 'her';
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
        } else if (row.key.startsWith('pin:')) {
          // shared Memories album — apply without re-publishing (no upload loop);
          // last-writer-wins by the embedded `at` so a stale row can't clobber
          const id = row.key.slice('pin:'.length);
          const v = row.value as { c?: string | null; at?: number } | null;
          const at = v?.at ?? Date.now();
          const current = get().messages.find((m) => m.id === id);
          if (current && Math.max(current.pinnedAt ?? 0, 0) <= at) {
            get().applyMemoryLocal(id, !!v, v?.c ?? undefined, at);
          }
        } else if (row.key.startsWith('date:')) {
          applyDateOverlay(get, set, connectionId, row.key.slice('date:'.length), row.value);
        } else if (row.key.startsWith('loc:')) {
          applyLiveLocationOverlay(get, set, row.key.slice('loc:'.length), row.value);
        } else if (row.key === 'chat-bg') {
          // shared wallpaper for this connection — last-writer-wins by the
          // embedded timestamp (a stale row / our own echo never clobbers a
          // newer pick), mirroring the room-keyed DM handler
          const bg = row.value as ChatBackground | null;
          const current = get().chatBg;
          if (bg && typeof bg.at === 'number' && (!current || bg.at > current.at)) {
            storeBackground(bg);
            set({ chatBg: bg });
            const previousUrl = get().chatBgUrl;
            if (bg.id !== 'custom') {
              set({ chatBgUrl: null });
              if (previousUrl) URL.revokeObjectURL(previousUrl);
            } else {
              void ensureWallpaperUrl(bg, connectionId).then((url) => {
                set({ chatBgUrl: url });
                if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
              });
            }
          }
        }
      }
      if (newestPeerRead > (get().connectionReadAt[connectionId] ?? 0)) {
        // flip our delivered/sent messages in this connection to 'read'
        set((s) => ({
          connectionReadAt: { ...s.connectionReadAt, [connectionId]: newestPeerRead },
          messages: s.messages.map((m) => {
            if (m.senderId !== 'me' || m.channelId !== connectionId) return m;
            if (m.status !== 'sent' && m.status !== 'delivered') return m;
            if (m.sentAt > newestPeerRead) return m;
            const next = { ...m, status: 'read' as const };
            void putMessage(next);
            return next;
          }),
        }));
      }
      if (cursor > since) localStorage.setItem(cursorKey, String(cursor));
    } catch {
      // offline — retry next poll
    }
  },

  hydrateAccount: async () => {
    if (!persistent || get().hydrated || !isLoggedIn()) return;
    const [cached, channels, blobs] = await Promise.all([
      loadMessages(),
      loadChannels(),
      loadBlobs(),
    ]);
    set({
      messages: cached.map((m) => {
        const withChannel = m.channelId ? m : { ...m, channelId: DM_CHANNEL_ID };
        const blob = m.media ? blobs.get(m.id) : undefined;
        return blob
          ? { ...withChannel, media: { ...m.media!, url: URL.createObjectURL(blob) } }
          : withChannel;
      }),
      channels: channels.sort((a, b) => a.createdAt - b.createdAt),
      hydrated: true,
    });
    void get().syncConnections();
  },

  shareChannelWithConnection: (channelId, connectionId) => {
    const channel = get().channels.find((c) => c.id === channelId);
    if (!channel || channel.kind === 'dm') return;
    const shared: Channel = { ...channel, shared: true, sharedConnId: connectionId };
    set((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? shared : c)) }));
    if (!persistent) return;
    void putChannel(shared);
    // back up the channel + its current items so the peer gets full history
    void uploadConvLocal(connectionId, `ch:${channelId}`, shared);
    for (const m of get().messages) {
      if (m.channelId === channelId) void uploadConvLocal(connectionId, `msg:${m.id}`, m);
    }
  },

  syncConvLocal: async (connectionId) => {
    if (!persistent || !connectionId) return;
    const cursorKey = `rei-conv-local-cursor:${connectionId}`;
    const since = readNum(cursorKey);
    try {
      const { rows, cursor } = await fetchConvLocal(connectionId, since);
      for (const row of rows) {
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
            // auto-adopt: a connected account sharing a channel is trusted, so
            // it appears directly (no separate accept step)
            const channel = { ...(row.value as Channel), shared: true, sharedConnId: connectionId };
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
            // only apply once we've adopted the parent channel
            if (!isSharedChannelId(get().channels, message.channelId)) continue;
            set((s) => ({ messages: sortedUpsert(s.messages, message) }));
            void putMessage(message);
          }
        }
      }
      if (cursor > since) localStorage.setItem(cursorKey, String(cursor));
    } catch {
      // offline — retry next poll
    }
  },

  markReadConnection: (connectionId) => {
    if (!persistent || !connectionId) return;
    const newest = get().messages.reduce(
      (max, m) => (m.channelId === connectionId && m.sentAt > max ? m.sentAt : max),
      0,
    );
    const dedupeKey = `rei-conv-myread:${connectionId}`;
    if (newest <= readNum(dedupeKey)) return;
    localStorage.setItem(dedupeKey, String(newest));
    void uploadConvMeta(connectionId, 'read', { at: newest });
  },
}));
