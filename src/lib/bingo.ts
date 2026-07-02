/**
 * Bingo (aka "Line25") — a two-player strategy game. Each player gets a
 * uniquely shuffled 1-25 board; a called number marks that number on BOTH
 * boards (wherever it happens to sit); first to complete 5 lines wins.
 *
 * Adapted from the original PRD (BINGO.md) to this app's no-WebSocket
 * constraint: instead of a server-authoritative match, the two devices share
 * one state object over the encrypted conv_meta overlay (versioned
 * last-writer-wins, same pattern as Truth or Dare / Draw & Guess). This is
 * safe because it's a private 2-person trusted game — no anti-cheat needed —
 * and turn-based play means only the player whose turn it is ever writes,
 * so there's no write race. See store/bingo-store.ts.
 *
 * v1 ships Classic mode only (5×5, 1-25, first to 5 lines, 15s turn timer).
 * Large/Mega/Speed/Ranked modes from the PRD are deferred.
 */

export const BOARD_SIZE = 5;
export const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
export const TARGET_LINES = 5;
export const TURN_SECONDS = 15;

export interface BingoState {
  /** monotonic version — bumped on every mutation; drives last-writer-wins */
  rev: number;
  at: number;
  by: string;
  started: boolean;
  /** userId → flattened row-major board (1..25 each in a unique order) */
  boards: Record<string, number[]>;
  /** numbers called so far, in order */
  calledNumbers: number[];
  /** userId of whoever picks the next number */
  turn: string;
  /** epoch ms the current turn started — drives the 15s countdown */
  turnStartedAt: number;
  /** completed line count, keyed by userId */
  lines: Record<string, number>;
  winner?: string;
  endedAt?: number;
}

/** Fisher-Yates shuffle of 1..n */
function shuffledRange(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** the opening state for a brand-new room (before the first game starts) */
export function freshState(firstTurn: string, a: string, b: string): BingoState {
  return {
    rev: 1,
    at: Date.now(),
    by: firstTurn,
    started: false,
    boards: {},
    calledNumbers: [],
    turn: firstTurn,
    turnStartedAt: Date.now(),
    lines: { [a]: 0, [b]: 0 },
  };
}

/** count completed lines (rows + columns + both diagonals) on a board given
 *  the set of called numbers */
export function countLines(board: number[], called: Set<number>): number {
  let lines = 0;
  const marked = (i: number) => called.has(board[i]);
  for (let r = 0; r < BOARD_SIZE; r++) {
    let full = true;
    for (let c = 0; c < BOARD_SIZE; c++) if (!marked(r * BOARD_SIZE + c)) { full = false; break; }
    if (full) lines++;
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) if (!marked(r * BOARD_SIZE + c)) { full = false; break; }
    if (full) lines++;
  }
  let diag1 = true;
  let diag2 = true;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!marked(i * BOARD_SIZE + i)) diag1 = false;
    if (!marked(i * BOARD_SIZE + (BOARD_SIZE - 1 - i))) diag2 = false;
  }
  if (diag1) lines++;
  if (diag2) lines++;
  return lines;
}

/** which cell indices make up each completed line, for a subtle highlight */
export function completedLineCells(board: number[], called: Set<number>): Set<number> {
  const cells = new Set<number>();
  const marked = (i: number) => called.has(board[i]);
  for (let r = 0; r < BOARD_SIZE; r++) {
    let full = true;
    for (let c = 0; c < BOARD_SIZE; c++) if (!marked(r * BOARD_SIZE + c)) { full = false; break; }
    if (full) for (let c = 0; c < BOARD_SIZE; c++) cells.add(r * BOARD_SIZE + c);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) if (!marked(r * BOARD_SIZE + c)) { full = false; break; }
    if (full) for (let r = 0; r < BOARD_SIZE; r++) cells.add(r * BOARD_SIZE + c);
  }
  let diag1 = true;
  let diag2 = true;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!marked(i * BOARD_SIZE + i)) diag1 = false;
    if (!marked(i * BOARD_SIZE + (BOARD_SIZE - 1 - i))) diag2 = false;
  }
  if (diag1) for (let i = 0; i < BOARD_SIZE; i++) cells.add(i * BOARD_SIZE + i);
  if (diag2) for (let i = 0; i < BOARD_SIZE; i++) cells.add(i * BOARD_SIZE + (BOARD_SIZE - 1 - i));
  return cells;
}

/** given the two participant userIds, return the one that isn't `id` */
export function otherUser(id: string, a: string, b: string): string {
  return id === a ? b : a;
}

export function newBoard(): number[] {
  return shuffledRange(BOARD_CELLS);
}

/** a peer presence heartbeat counts as "live" within this window (ms) */
export const PRESENCE_WINDOW_MS = 15_000;
export function isPresenceFresh(at: number | undefined): boolean {
  return typeof at === 'number' && Date.now() - at < PRESENCE_WINDOW_MS;
}
