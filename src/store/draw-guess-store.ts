/**
 * Draw & Guess store (Zustand) — a self-contained, connection-scoped game.
 * Mirrors truth-dare-store.ts's transport pattern.
 *
 * Transport: everything rides the existing encrypted `conv_meta` overlay
 * (ciphertext only) under two key shapes —
 *   dg-state      the single shared game-state object (versioned LWW), incl.
 *                 the drawing itself as a small PNG data URL and the live
 *                 guess log (so the drawer watches guesses land in real time)
 *   dg-presence   a heartbeat {at}, so each side knows when the other is live
 * No new server endpoints, no chunked media — a Pictionary sketch export is
 * small enough to ride inline in the state row.
 *
 * Sync uses its OWN meta cursor (`rei-dg-cursor:<cid>`) polled while the
 * screen is open — decoupled from the chat poll, so no cursor contention.
 */
import { create } from 'zustand';
import { fetchConvMeta, uploadConvMeta } from '@/lib/conversation-api';
import { getAccount } from '@/lib/session';
import {
  freshState,
  isPresenceFresh,
  otherUser,
  pickWord,
  MAX_GUESSES,
  POINTS_DRAWER,
  POINTS_GUESSER,
  type DGState,
} from '@/lib/draw-guess';

const POLL_MS = 1500;
const HEARTBEAT_MS = 5000;

function stateKey(cid: string) {
  return `rei-dg-state:${cid}`;
}
function cursorKey(cid: string) {
  return `rei-dg-cursor:${cid}`;
}

function loadState(cid: string): DGState | null {
  try {
    const raw = localStorage.getItem(stateKey(cid));
    return raw ? (JSON.parse(raw) as DGState) : null;
  } catch {
    return null;
  }
}

interface DrawGuessStore {
  connectionId: string | null;
  myUserId: string;
  peerUserId: string;
  state: DGState | null;
  peerPresenceAt: number;
  peerLive: boolean;

  enter: (connectionId: string, peerUserId: string) => void;
  leave: () => void;

  startGame: () => void;
  /** re-roll the secret word before the drawing is sent (drawer only) */
  rerollWord: () => void;
  submitDrawing: (dataUrl: string) => void;
  submitGuess: (text: string) => void;
  nextTurn: () => void;
  endSession: () => void;
  restart: () => void;

  iAmDrawer: () => boolean;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;

export const useDrawGuessStore = create<DrawGuessStore>((set, get) => {
  const persistState = (next: DGState) => {
    const cid = get().connectionId;
    if (!cid) return;
    localStorage.setItem(stateKey(cid), JSON.stringify(next));
  };

  const mutate = (fn: (s: DGState) => DGState) => {
    const cid = get().connectionId;
    const cur = get().state;
    if (!cid || !cur) return;
    const next = fn({ ...cur });
    next.rev = cur.rev + 1;
    next.at = Date.now();
    next.by = get().myUserId;
    set({ state: next });
    persistState(next);
    void uploadConvMeta(cid, 'dg-state', next);
  };

  const adoptState = (incoming: DGState) => {
    const cur = get().state;
    const newer =
      !cur || incoming.rev > cur.rev || (incoming.rev === cur.rev && incoming.at > cur.at);
    if (!newer) return;
    set({ state: incoming });
    persistState(incoming);
  };

  const syncMeta = async () => {
    const cid = get().connectionId;
    if (!cid) return;
    const since = Number(localStorage.getItem(cursorKey(cid)) || 0);
    try {
      const { rows, cursor } = await fetchConvMeta(cid, since);
      let presence = get().peerPresenceAt;
      for (const row of rows) {
        if (row.key === 'dg-state' && !row.mine) {
          adoptState(row.value as DGState);
        } else if (row.key === 'dg-presence' && !row.mine) {
          const at = (row.value as { at?: number } | null)?.at ?? 0;
          if (at > presence) presence = at;
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
    void uploadConvMeta(cid, 'dg-presence', { at: Date.now() });
    set({ peerLive: isPresenceFresh(get().peerPresenceAt) });
  };

  return {
    connectionId: null,
    myUserId: getAccount()?.userId ?? 'me',
    peerUserId: 'her',
    state: null,
    peerPresenceAt: 0,
    peerLive: false,

    enter: (connectionId, peerUserId) => {
      const myUserId = getAccount()?.userId ?? 'me';
      const existing = loadState(connectionId);
      set({
        connectionId,
        myUserId,
        peerUserId,
        state: existing ?? freshState(myUserId, myUserId, peerUserId),
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
      set({ connectionId: null, peerLive: false });
    },

    startGame: () => {
      const { myUserId, peerUserId } = get();
      const first = Math.random() < 0.5 ? myUserId : peerUserId;
      mutate((st) => ({
        ...st,
        started: true,
        phase: 'drawing',
        drawerId: first,
        round: 1,
        word: pickWord(),
        drawingUrl: undefined,
        guesses: [],
        guessesLeft: MAX_GUESSES,
      }));
    },

    rerollWord: () => {
      const s = get().state;
      if (!s || s.phase !== 'drawing' || s.drawingUrl) return;
      mutate((st) => ({ ...st, word: pickWord(st.word) }));
    },

    submitDrawing: (dataUrl) => {
      mutate((st) => ({ ...st, drawingUrl: dataUrl, phase: 'guessing' }));
    },

    submitGuess: (text) => {
      const s = get().state;
      const myUserId = get().myUserId;
      if (!s || !s.word || s.phase !== 'guessing' || s.guessesLeft <= 0) return;
      const correct = text.trim().toLowerCase() === s.word.toLowerCase();
      mutate((st) => {
        const guesses = [...st.guesses, { by: myUserId, text: text.trim(), correct, at: Date.now() }];
        const guessesLeft = st.guessesLeft - 1;
        if (correct) {
          return {
            ...st,
            guesses,
            guessesLeft,
            phase: 'reveal',
            scores: {
              ...st.scores,
              [myUserId]: (st.scores[myUserId] ?? 0) + POINTS_GUESSER,
              [st.drawerId]: (st.scores[st.drawerId] ?? 0) + POINTS_DRAWER,
            },
          };
        }
        if (guessesLeft <= 0) {
          return { ...st, guesses, guessesLeft, phase: 'reveal' };
        }
        return { ...st, guesses, guessesLeft };
      });
    },

    nextTurn: () => {
      const { myUserId, peerUserId } = get();
      mutate((st) => ({
        ...st,
        drawerId: otherUser(st.drawerId, myUserId, peerUserId),
        round: st.round + 1,
        phase: 'drawing',
        word: pickWord(st.word),
        drawingUrl: undefined,
        guesses: [],
        guessesLeft: MAX_GUESSES,
      }));
    },

    endSession: () => {
      mutate((st) => ({ ...st, endedAt: Date.now() }));
    },

    restart: () => {
      const { myUserId, peerUserId } = get();
      mutate(() => freshState(myUserId, myUserId, peerUserId));
    },

    iAmDrawer: () => {
      const s = get().state;
      return !!s && s.drawerId === get().myUserId;
    },
  };
});
