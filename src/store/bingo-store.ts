/**
 * Bingo store (Zustand) — a self-contained, connection-scoped game. Mirrors
 * truth-dare-store.ts / draw-guess-store.ts's transport pattern.
 *
 * Transport: everything rides the existing encrypted `conv_meta` overlay
 * (ciphertext only) under two key shapes —
 *   bingo-state      the single shared game-state object (versioned LWW)
 *   bingo-presence   a heartbeat {at}, so each side knows when the other is live
 * No new server endpoints.
 *
 * Sync uses its OWN meta cursor (`rei-bingo-cursor:<cid>`) polled while the
 * screen is open — decoupled from the chat poll, so no cursor contention.
 * Turn-based play means only the player whose turn it is ever mutates state,
 * so there's no write race despite the lack of a server-authoritative match.
 */
import { create } from 'zustand';
import { fetchConvMeta, uploadConvMeta } from '@/lib/conversation-api';
import { getAccount } from '@/lib/session';
import {
  countLines,
  freshState,
  isPresenceFresh,
  newBoard,
  otherUser,
  TARGET_LINES,
  type BingoState,
} from '@/lib/bingo';

const POLL_MS = 1500;
const HEARTBEAT_MS = 5000;

function stateKey(cid: string) {
  return `rei-bingo-state:${cid}`;
}
function cursorKey(cid: string) {
  return `rei-bingo-cursor:${cid}`;
}

function loadState(cid: string): BingoState | null {
  try {
    const raw = localStorage.getItem(stateKey(cid));
    return raw ? (JSON.parse(raw) as BingoState) : null;
  } catch {
    return null;
  }
}

interface BingoStore {
  connectionId: string | null;
  myUserId: string;
  peerUserId: string;
  state: BingoState | null;
  peerPresenceAt: number;
  peerLive: boolean;

  enter: (connectionId: string, peerUserId: string) => void;
  leave: () => void;

  startGame: () => void;
  callNumber: (n: number) => void;
  restart: () => void;
  endSession: () => void;

  isMyTurn: () => boolean;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;

export const useBingoStore = create<BingoStore>((set, get) => {
  const persistState = (next: BingoState) => {
    const cid = get().connectionId;
    if (!cid) return;
    localStorage.setItem(stateKey(cid), JSON.stringify(next));
  };

  const mutate = (fn: (s: BingoState) => BingoState) => {
    const cid = get().connectionId;
    const cur = get().state;
    if (!cid || !cur) return;
    const next = fn({ ...cur });
    next.rev = cur.rev + 1;
    next.at = Date.now();
    next.by = get().myUserId;
    set({ state: next });
    persistState(next);
    void uploadConvMeta(cid, 'bingo-state', next);
  };

  const adoptState = (incoming: BingoState) => {
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
        if (row.key === 'bingo-state' && !row.mine) {
          adoptState(row.value as BingoState);
        } else if (row.key === 'bingo-presence' && !row.mine) {
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
    void uploadConvMeta(cid, 'bingo-presence', { at: Date.now() });
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
        boards: { [myUserId]: newBoard(), [peerUserId]: newBoard() },
        calledNumbers: [],
        turn: first,
        turnStartedAt: Date.now(),
        lines: { [myUserId]: 0, [peerUserId]: 0 },
        winner: undefined,
        endedAt: undefined,
      }));
    },

    callNumber: (n) => {
      const s = get().state;
      const { myUserId, peerUserId } = get();
      if (!s || !s.started || s.winner || s.turn !== myUserId) return;
      if (s.calledNumbers.includes(n)) return;
      mutate((st) => {
        const calledNumbers = [...st.calledNumbers, n];
        const calledSet = new Set(calledNumbers);
        const lines: Record<string, number> = {
          [myUserId]: countLines(st.boards[myUserId] ?? [], calledSet),
          [peerUserId]: countLines(st.boards[peerUserId] ?? [], calledSet),
        };
        // the mover's board is checked first — a natural "first to complete" tiebreak
        let winner: string | undefined;
        if (lines[myUserId] >= TARGET_LINES) winner = myUserId;
        else if (lines[peerUserId] >= TARGET_LINES) winner = peerUserId;
        return {
          ...st,
          calledNumbers,
          lines,
          winner,
          endedAt: winner ? Date.now() : undefined,
          turn: winner ? st.turn : otherUser(st.turn, myUserId, peerUserId),
          turnStartedAt: Date.now(),
        };
      });
    },

    restart: () => {
      const { myUserId, peerUserId } = get();
      mutate(() => freshState(myUserId, myUserId, peerUserId));
    },

    endSession: () => {
      mutate((st) => ({ ...st, endedAt: Date.now() }));
    },

    isMyTurn: () => {
      const s = get().state;
      return !!s && s.started && !s.winner && s.turn === get().myUserId;
    },
  };
});
