/**
 * Draw & Guess — a dedicated, full-screen Pictionary-style space (replaces the
 * old in-chat Message.game overlay). Same identity rule as Truth or Dare: the
 * shared state names people by account **userId**, never device-relative me/her.
 *
 * Sync model lives in `store/draw-guess-store.ts` (rides the encrypted
 * `conv_meta` overlay — keys `dg-state` / `dg-presence`).
 */

export type DGPhase = 'setup' | 'drawing' | 'guessing' | 'reveal';

export interface DGGuess {
  by: string;
  text: string;
  correct: boolean;
  at: number;
}

/** the single shared game-state object, synced under the `dg-state` meta key */
export interface DGState {
  /** monotonic version — bumped on every mutation; drives last-writer-wins */
  rev: number;
  at: number;
  by: string;
  started: boolean;
  phase: DGPhase;
  /** userId of whoever is drawing this round */
  drawerId: string;
  round: number;
  word?: string;
  /** drawing, as a data URL (small — react-sketch-canvas svg export), sent once
   *  the round enters 'guessing' so the guesser only sees it after commit */
  drawingUrl?: string;
  /** every guess this round, oldest first — visible to BOTH players live so
   *  the drawer can watch attempts land as they happen */
  guesses: DGGuess[];
  guessesLeft: number;
  /** running score, keyed by userId */
  scores: Record<string, number>;
  /** set when someone ends the session → drives the recap card */
  endedAt?: number;
}

export const MAX_GUESSES = 5;
export const POINTS_GUESSER = 2;
export const POINTS_DRAWER = 1;

/** given the two participant userIds, return the one that isn't `id` */
export function otherUser(id: string, a: string, b: string): string {
  return id === a ? b : a;
}

/** the opening state for a brand-new room (before setup) */
export function freshState(firstDrawer: string, a: string, b: string): DGState {
  return {
    rev: 1,
    at: Date.now(),
    by: firstDrawer,
    started: false,
    phase: 'setup',
    drawerId: firstDrawer,
    round: 0,
    guesses: [],
    guessesLeft: MAX_GUESSES,
    scores: { [a]: 0, [b]: 0 },
  };
}

/** Pictionary-friendly words — common enough to draw, distinct enough to guess. */
export const WORDS: string[] = [
  // Animals
  'cat', 'dog', 'fish', 'bird', 'snake', 'lion', 'tiger', 'bear', 'elephant', 'monkey',
  'penguin', 'giraffe', 'rabbit', 'frog', 'shark', 'whale', 'horse', 'cow', 'pig', 'duck',
  'owl', 'bee', 'butterfly', 'spider', 'crab', 'turtle', 'parrot', 'wolf', 'fox', 'deer',
  // Food & drink
  'pizza', 'burger', 'taco', 'sushi', 'cake', 'apple', 'banana', 'strawberry', 'watermelon',
  'ice cream', 'coffee', 'donut', 'sandwich', 'pasta', 'popcorn', 'cookie', 'grapes', 'lemon',
  'carrot', 'mushroom', 'egg', 'bread', 'cupcake', 'chocolate',
  // Objects / home
  'chair', 'table', 'lamp', 'bed', 'door', 'window', 'clock', 'mirror', 'umbrella',
  'backpack', 'key', 'phone', 'camera', 'book', 'pencil', 'glasses', 'hat', 'shoes',
  'sock', 'glove', 'guitar', 'drum', 'piano', 'balloon', 'candle', 'scissors', 'brush',
  'ladder', 'bucket', 'hammer', 'magnet', 'envelope', 'crown',
  // Nature
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'tree', 'flower', 'leaf', 'mountain',
  'river', 'ocean', 'island', 'volcano', 'cactus', 'snowflake', 'lightning', 'wave',
  // Vehicles & places
  'car', 'bus', 'train', 'plane', 'boat', 'rocket', 'bicycle', 'helicopter',
  'bridge', 'house', 'castle', 'tent', 'lighthouse', 'windmill',
  // Actions (draw the concept)
  'sleeping', 'running', 'jumping', 'swimming', 'flying', 'dancing', 'singing', 'cooking',
  'reading', 'painting', 'fishing', 'climbing', 'skating', 'surfing', 'hugging',
  // Misc fun
  'ghost', 'alien', 'robot', 'dragon', 'superhero', 'treasure', 'bomb', 'trophy',
  'heart', 'flag', 'map', 'compass', 'telescope', 'magician', 'witch', 'snowman',
  'fireworks', 'diamond', 'rocket ship', 'tornado',
];

export function pickWord(exclude?: string): string {
  const pool = exclude ? WORDS.filter((w) => w !== exclude) : WORDS;
  const list = pool.length ? pool : WORDS;
  return list[Math.floor(Math.random() * list.length)];
}

/** a peer presence heartbeat counts as "live" within this window (ms) */
export const PRESENCE_WINDOW_MS = 15_000;
export function isPresenceFresh(at: number | undefined): boolean {
  return typeof at === 'number' && Date.now() - at < PRESENCE_WINDOW_MS;
}
