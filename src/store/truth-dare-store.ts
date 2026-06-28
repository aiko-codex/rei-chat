/**
 * Truth or Dare store (Zustand) — a self-contained, connection-scoped game.
 *
 * Transport: everything rides the existing encrypted `conv_meta` overlay
 * (ciphertext only) under three key shapes —
 *   tod-state       the single shared game-state object (versioned LWW)
 *   tod-presence    a heartbeat {at}, so each side knows when the other is live
 *   vault:<id>      one row per saved proof-media item (| {deleted} tombstone)
 * Proof bytes ride the proven chunked `uploadConvMedia`/`downloadConvMedia`
 * path, cached locally in IndexedDB. No new server endpoints.
 *
 * Sync uses its OWN meta cursor (`rei-tod-cursor:<cid>`) polled while the
 * screen is open — decoupled from the chat poll, so no cursor contention.
 * Identity is the account `userId` (never device-relative me/her).
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import {
  fetchConvMeta,
  uploadConvMeta,
  uploadConvMedia,
  downloadConvMedia,
} from '@/lib/conversation-api';
import { getBlob, putBlob, deleteBlob } from '@/lib/db';
import { getAccount } from '@/lib/session';
import {
  dealPrompt,
  freshState,
  isPresenceFresh,
  otherUser,
  vaultId,
  MAX_PASSES,
  POINTS,
  type Spice,
  type ToDCategory,
  type ToDState,
  type VaultEntry,
} from '@/lib/truth-dare';
import type { MediaKind } from '@/lib/types';

const POLL_MS = 1800;
const HEARTBEAT_MS = 5000;

function stateKey(cid: string) {
  return `rei-tod-state:${cid}`;
}
function vaultKey(cid: string) {
  return `rei-tod-vault:${cid}`;
}
function cursorKey(cid: string) {
  return `rei-tod-cursor:${cid}`;
}

function loadState(cid: string): ToDState | null {
  try {
    const raw = localStorage.getItem(stateKey(cid));
    return raw ? (JSON.parse(raw) as ToDState) : null;
  } catch {
    return null;
  }
}
function loadVault(cid: string): Record<string, VaultEntry> {
  try {
    const raw = localStorage.getItem(vaultKey(cid));
    return raw ? (JSON.parse(raw) as Record<string, VaultEntry>) : {};
  } catch {
    return {};
  }
}

interface TruthDareStore {
  connectionId: string | null;
  myUserId: string;
  peerUserId: string;
  state: ToDState | null;
  /** host's private prompt draft (deal/write) before it's sent — NOT synced */
  draft: { text: string; source: 'deck' | 'written' } | null;
  vault: Record<string, VaultEntry>;
  /** mediaId → object URL (rebuilt from blob cache / server on demand) */
  mediaUrls: Record<string, string>;
  /** upload progress 0..1 while sending proof media, else null */
  uploading: number | null;
  peerPresenceAt: number;
  peerLive: boolean;

  enter: (connectionId: string, peerUserId: string) => void;
  leave: () => void;

  // setup
  setSpice: (spice: Spice) => void;
  startGame: () => void;

  // a turn
  pick: (category: ToDCategory) => void;
  dealDraft: () => void;
  setDraftText: (text: string) => void;
  sendPrompt: () => void;
  answerText: (text: string) => void;
  answerMedia: (blob: Blob, kind: MediaKind) => Promise<void>;
  markDone: (note?: string) => void;
  pass: () => void;
  react: (emoji: string) => void;
  nextTurn: () => void;

  // spice change mid-game (needs both to agree)
  proposeSpice: (to: Spice) => void;
  confirmSpice: () => void;
  dismissSpice: () => void;

  endSession: () => void;
  restart: () => void;
  deleteRoom: () => Promise<void>;

  // vault
  ensureMediaUrl: (mediaId: string, mime: string, chunked: boolean) => Promise<void>;
  deleteVaultEntry: (id: string) => void;

  // derived helpers
  iAmHotSeat: () => boolean;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;

export const useTruthDareStore = create<TruthDareStore>((set, get) => {
  /** persist state + push it to the server (own row, bumped rev) */
  const persistState = (next: ToDState) => {
    const cid = get().connectionId;
    if (!cid) return;
    localStorage.setItem(stateKey(cid), JSON.stringify(next));
  };

  /** apply a state mutation: bump rev/at/by, persist, upload. No-op if no state */
  const mutate = (fn: (s: ToDState) => ToDState) => {
    const cid = get().connectionId;
    const cur = get().state;
    if (!cid || !cur) return;
    const next = fn({ ...cur });
    next.rev = cur.rev + 1;
    next.at = Date.now();
    next.by = get().myUserId;
    set({ state: next });
    persistState(next);
    void uploadConvMeta(cid, 'tod-state', next);
  };

  /** adopt an incoming state iff it's strictly newer (versioned LWW) */
  const adoptState = (incoming: ToDState) => {
    const cur = get().state;
    const newer =
      !cur ||
      incoming.rev > cur.rev ||
      (incoming.rev === cur.rev && incoming.at > cur.at);
    if (!newer) return;
    set({ state: incoming });
    persistState(incoming);
  };

  const addVaultLocal = (entry: VaultEntry) => {
    const cid = get().connectionId;
    if (!cid) return;
    const vault = { ...get().vault, [entry.id]: entry };
    set({ vault });
    localStorage.setItem(vaultKey(cid), JSON.stringify(vault));
  };

  const syncMeta = async () => {
    const cid = get().connectionId;
    if (!cid) return;
    const since = Number(localStorage.getItem(cursorKey(cid)) || 0);
    try {
      const { rows, cursor } = await fetchConvMeta(cid, since);
      let presence = get().peerPresenceAt;
      for (const row of rows) {
        if (row.key === 'tod-state' && !row.mine) {
          adoptState(row.value as ToDState);
        } else if (row.key === 'tod-presence' && !row.mine) {
          const at = (row.value as { at?: number } | null)?.at ?? 0;
          if (at > presence) presence = at;
        } else if (row.key.startsWith('vault:')) {
          const entry = row.value as VaultEntry | null;
          if (entry && entry.id) {
            if (entry.deleted) {
              const vault = { ...get().vault };
              delete vault[entry.id];
              set({ vault });
              localStorage.setItem(vaultKey(cid), JSON.stringify(vault));
            } else {
              // keep the freshest copy (own optimistic add vs incoming)
              const existing = get().vault[entry.id];
              if (!existing || entry.at >= existing.at) addVaultLocal(entry);
            }
          }
        }
      }
      localStorage.setItem(cursorKey(cid), String(cursor));
      set({ peerPresenceAt: presence, peerLive: isPresenceFresh(presence) });
    } catch {
      set({ peerLive: isPresenceFresh(get().peerPresenceAt) });
    }
  };

  const beat = () => {
    const cid = get().connectionId;
    if (!cid) return;
    void uploadConvMeta(cid, 'tod-presence', { at: Date.now() });
    set({ peerLive: isPresenceFresh(get().peerPresenceAt) });
  };

  /** add points to the hot-seat player's score by the prompt category */
  const award = (s: ToDState): ToDState => {
    if (!s.category) return s;
    const pts = s.category === 'dare' ? POINTS.dare : POINTS.truth;
    return { ...s, scores: { ...s.scores, [s.hotSeat]: (s.scores[s.hotSeat] ?? 0) + pts } };
  };

  return {
    connectionId: null,
    myUserId: getAccount()?.userId ?? 'me',
    peerUserId: 'her',
    state: null,
    draft: null,
    vault: {},
    mediaUrls: {},
    uploading: null,
    peerPresenceAt: 0,
    peerLive: false,

    enter: (connectionId, peerUserId) => {
      const myUserId = getAccount()?.userId ?? 'me';
      const existing = loadState(connectionId);
      set({
        connectionId,
        myUserId,
        peerUserId,
        // a local pre-setup state lets the lobby render immediately; it isn't
        // uploaded until the first real action (Start), so no setup-race.
        state: existing ?? freshState(myUserId, myUserId, peerUserId),
        vault: loadVault(connectionId),
        draft: null,
        peerLive: false,
      });
      void syncMeta();
      beat();
      if (pollTimer) clearInterval(pollTimer);
      if (beatTimer) clearInterval(beatTimer);
      pollTimer = setInterval(() => void syncMeta(), POLL_MS);
      beatTimer = setInterval(beat, HEARTBEAT_MS);
    },

    leave: () => {
      if (pollTimer) clearInterval(pollTimer);
      if (beatTimer) clearInterval(beatTimer);
      pollTimer = null;
      beatTimer = null;
      // revoke object URLs to free memory; they rebuild on demand next time
      const urls = get().mediaUrls;
      for (const k of Object.keys(urls)) URL.revokeObjectURL(urls[k]);
      set({ connectionId: null, draft: null, mediaUrls: {}, peerLive: false });
    },

    setSpice: (spice) => {
      const s = get().state;
      if (!s) return;
      // during setup, spice is set freely; mid-game use proposeSpice instead
      if (!s.started) mutate((st) => ({ ...st, spice }));
    },

    startGame: () => {
      const { myUserId, peerUserId } = get();
      // coin flip for who's first
      const first = Math.random() < 0.5 ? myUserId : peerUserId;
      mutate((st) => ({
        ...st,
        started: true,
        phase: 'choosing',
        hotSeat: first,
        round: 1,
        category: undefined,
        promptText: undefined,
        promptSource: undefined,
        response: undefined,
        reaction: undefined,
      }));
    },

    pick: (category) => {
      mutate((st) => ({ ...st, category, phase: 'prompting', promptText: undefined, response: undefined, reaction: undefined }));
    },

    dealDraft: () => {
      const s = get().state;
      if (!s?.category) return;
      const text = dealPrompt(s.spice, s.category, get().draft?.text);
      set({ draft: { text, source: 'deck' } });
    },

    setDraftText: (text) => {
      const cur = get().draft;
      set({ draft: { text, source: cur?.source === 'deck' && cur.text === text ? 'deck' : 'written' } });
    },

    sendPrompt: () => {
      const draft = get().draft;
      if (!draft || !draft.text.trim()) return;
      mutate((st) => ({ ...st, promptText: draft.text.trim(), promptSource: draft.source, phase: 'responding' }));
      set({ draft: null });
    },

    answerText: (text) => {
      if (!text.trim()) return;
      mutate((st) => award({ ...st, response: { kind: 'text', text: text.trim() }, phase: 'reveal' }));
    },

    answerMedia: async (blob, kind) => {
      const cid = get().connectionId;
      const s = get().state;
      if (!cid || !s) return;
      const id = vaultId();
      const mediaId = `tod_${id}`;
      try {
        await putBlob(mediaId, blob);
      } catch {
        /* cache best-effort */
      }
      const url = URL.createObjectURL(blob);
      set({ mediaUrls: { ...get().mediaUrls, [mediaId]: url }, uploading: 0 });
      const ok = await uploadConvMedia(cid, mediaId, blob, (f) => set({ uploading: f }));
      set({ uploading: null });
      if (!ok) {
        toast.error('Could not upload — check your connection');
        return;
      }
      const entry: VaultEntry = {
        id,
        by: get().myUserId,
        kind,
        mediaId,
        mime: blob.type || 'application/octet-stream',
        chunked: true,
        prompt: s.promptText ?? '',
        category: s.category ?? 'dare',
        at: Date.now(),
      };
      addVaultLocal(entry);
      void uploadConvMeta(cid, `vault:${id}`, entry);
      mutate((st) =>
        award({
          ...st,
          response: { kind: 'media', mediaId, mediaKind: kind, mime: entry.mime, chunked: true },
          phase: 'reveal',
        }),
      );
    },

    markDone: (note) => {
      mutate((st) => award({ ...st, response: { kind: 'done', text: note?.trim() || undefined }, phase: 'reveal' }));
    },

    pass: () => {
      const s = get().state;
      if (!s) return;
      const used = s.passes[s.hotSeat] ?? 0;
      if (used >= MAX_PASSES) {
        toast('No passes left — you owe a wildcard 😈');
        return;
      }
      mutate((st) => ({
        ...st,
        response: { kind: 'passed' },
        phase: 'reveal',
        passes: { ...st.passes, [st.hotSeat]: used + 1 },
      }));
    },

    react: (emoji) => {
      mutate((st) => ({ ...st, reaction: emoji }));
    },

    nextTurn: () => {
      const { myUserId, peerUserId } = get();
      mutate((st) => ({
        ...st,
        hotSeat: otherUser(st.hotSeat, myUserId, peerUserId),
        round: st.round + 1,
        phase: 'choosing',
        category: undefined,
        promptText: undefined,
        promptSource: undefined,
        response: undefined,
        reaction: undefined,
      }));
      set({ draft: null });
    },

    proposeSpice: (to) => {
      mutate((st) => ({ ...st, pendingSpice: { to, by: get().myUserId } }));
    },
    confirmSpice: () => {
      const s = get().state;
      if (!s?.pendingSpice) return;
      mutate((st) => ({ ...st, spice: st.pendingSpice!.to, pendingSpice: null }));
    },
    dismissSpice: () => {
      mutate((st) => ({ ...st, pendingSpice: null }));
    },

    endSession: () => {
      mutate((st) => ({ ...st, endedAt: Date.now() }));
    },

    restart: () => {
      const { myUserId, peerUserId } = get();
      const s = get().state;
      const spice = s?.spice ?? 'flirty';
      mutate(() => ({ ...freshState(myUserId, myUserId, peerUserId), spice }));
      set({ draft: null });
    },

    deleteRoom: async () => {
      const cid = get().connectionId;
      if (!cid) return;
      // tombstone every vault row + drop local blobs/urls
      const vault = get().vault;
      for (const id of Object.keys(vault)) {
        const e = vault[id];
        void uploadConvMeta(cid, `vault:${id}`, { id, deleted: true, at: Date.now() });
        if (e?.mediaId) {
          void deleteBlob(e.mediaId).catch(() => {});
          const u = get().mediaUrls[e.mediaId];
          if (u) URL.revokeObjectURL(u);
        }
      }
      localStorage.removeItem(vaultKey(cid));
      set({ vault: {}, mediaUrls: {} });
      // reset the game to a fresh, un-started room
      const { myUserId, peerUserId } = get();
      mutate(() => freshState(myUserId, myUserId, peerUserId));
      toast('Room cleared');
    },

    ensureMediaUrl: async (mediaId, mime, chunked) => {
      if (get().mediaUrls[mediaId]) return;
      const cid = get().connectionId;
      if (!cid) return;
      let blob = await getBlob(mediaId).catch(() => undefined);
      if (!blob) {
        blob = (await downloadConvMedia(cid, mediaId, mime, chunked)) ?? undefined;
        if (blob) void putBlob(mediaId, blob).catch(() => {});
      }
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      set({ mediaUrls: { ...get().mediaUrls, [mediaId]: url } });
    },

    deleteVaultEntry: (id) => {
      const cid = get().connectionId;
      if (!cid) return;
      const entry = get().vault[id];
      const vault = { ...get().vault };
      delete vault[id];
      set({ vault });
      localStorage.setItem(vaultKey(cid), JSON.stringify(vault));
      void uploadConvMeta(cid, `vault:${id}`, { id, deleted: true, at: Date.now() });
      if (entry?.mediaId) {
        void deleteBlob(entry.mediaId).catch(() => {});
        const u = get().mediaUrls[entry.mediaId];
        if (u) {
          URL.revokeObjectURL(u);
          const urls = { ...get().mediaUrls };
          delete urls[entry.mediaId];
          set({ mediaUrls: urls });
        }
      }
    },

    iAmHotSeat: () => {
      const s = get().state;
      return !!s && s.hotSeat === get().myUserId;
    },
  };
});
