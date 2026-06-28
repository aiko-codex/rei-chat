/**
 * Truth or Dare — types, the starter prompt deck, and small pure helpers.
 *
 * Identity rule: the shared game state must mean the same thing on both phones,
 * so anything that names a person uses the account **userId** (never the
 * device-relative `me`/`her`). The UI maps userId → me/her locally.
 *
 * Sync model lives in `store/truth-dare-store.ts` (rides the encrypted
 * `conv_meta` overlay — keys `tod-state` / `tod-presence` / `vault:<id>`).
 */
import type { MediaKind } from './types';

export type Spice = 'sweet' | 'flirty' | 'spicy' | 'wild';
export type ToDCategory = 'truth' | 'dare';
export type PromptSource = 'deck' | 'written';

/**
 * setup     — pick spice + who goes first (one-time, before the first round)
 * choosing  — the hot-seat player picks Truth or Dare
 * prompting — the partner (host) deals or writes the prompt
 * responding— the hot-seat player answers / does it (optional proof) or passes
 * reveal    — both see the response; host reacts; then the turn flips
 */
export type ToDPhase = 'setup' | 'choosing' | 'prompting' | 'responding' | 'reveal';

export interface ToDResponse {
  kind: 'text' | 'media' | 'done' | 'passed';
  /** truth answer / dare note */
  text?: string;
  /** proof media saved to the Vault (also referenced by a vault:<id> row) */
  mediaId?: string;
  mediaKind?: MediaKind;
  mime?: string;
  chunked?: boolean;
}

/** the single shared game-state object, synced under the `tod-state` meta key */
export interface ToDState {
  /** monotonic version — bumped on every mutation; drives last-writer-wins */
  rev: number;
  /** epoch ms of this revision — tiebreaker when revs collide */
  at: number;
  /** userId of whoever produced this revision */
  by: string;
  /** false until the one-time setup (spice + first turn) is done */
  started: boolean;
  spice: Spice;
  phase: ToDPhase;
  /** userId of the player currently in the hot seat (the one answering) */
  hotSeat: string;
  round: number;
  category?: ToDCategory;
  promptText?: string;
  promptSource?: PromptSource;
  response?: ToDResponse;
  /** host's emoji reaction shown in the reveal phase */
  reaction?: string;
  /** passes used this session, keyed by userId */
  passes: Record<string, number>;
  /** running score, keyed by userId */
  scores: Record<string, number>;
  /** a proposed spice change awaiting the other person's confirmation */
  pendingSpice?: { to: Spice; by: string } | null;
  /** set when someone ends the session → drives the recap card */
  endedAt?: number;
}

/** one saved piece of proof media — synced under `vault:<id>`, bytes via conv media */
export interface VaultEntry {
  id: string;
  /** userId who shared it */
  by: string;
  kind: MediaKind;
  /** media storage id (uploadConvMedia / downloadConvMedia) */
  mediaId: string;
  mime: string;
  chunked: boolean;
  /** the truth/dare prompt this answered, for context in the Vault */
  prompt: string;
  category: ToDCategory;
  at: number;
  /** tombstone */
  deleted?: boolean;
}

export const MAX_PASSES = 2;
/** points awarded on a completed response */
export const POINTS = { dare: 2, truth: 1 } as const;

export interface SpiceTier {
  id: Spice;
  label: string;
  emoji: string;
  blurb: string;
  /** tailwind gradient classes for the cozy backdrop at this tier */
  gradient: string;
}

export const SPICE_TIERS: SpiceTier[] = [
  { id: 'sweet', label: 'Sweet', emoji: '🍯', blurb: 'Cute & wholesome', gradient: 'from-rose-300/25 via-amber-200/15 to-transparent' },
  { id: 'flirty', label: 'Flirty', emoji: '😏', blurb: 'A little teasing', gradient: 'from-rose-400/30 via-pink-400/20 to-transparent' },
  { id: 'spicy', label: 'Spicy', emoji: '🔥', blurb: 'Getting warm', gradient: 'from-rose-500/35 via-orange-500/20 to-transparent' },
  { id: 'wild', label: 'Wild', emoji: '🌶️', blurb: 'Just us · 18+', gradient: 'from-rose-700/45 via-red-600/25 to-transparent' },
];

export function spiceTier(id: Spice): SpiceTier {
  return SPICE_TIERS.find((t) => t.id === id) ?? SPICE_TIERS[0];
}

/**
 * The starter deck. Kept tasteful even at the top tier (this is a private game
 * for two consenting partners) — suggestive, romantic, playful, never crude.
 * The user can edit/extend these freely.
 */
export const DECK: Record<Spice, { truth: string[]; dare: string[] }> = {
  sweet: {
    truth: [
      'What was the exact moment you knew you liked me?',
      'What is your favourite memory of us so far?',
      'What is one little thing I do that always makes you smile?',
      'What did you first notice about me?',
      'What is a song that reminds you of me?',
      'What is something you want us to do together this year?',
      'When did you last think about me today, and why?',
      'What is your favourite photo of us, and why?',
      'What is one thing you are grateful for about me?',
      'What nickname do you secretly love being called?',
      'Where would your dream date with me be?',
      'What is the kindest thing I have ever done for you?',
      'What part of your day do you most want to share with me?',
      'What is something small you would miss if I were gone for a week?',
      'What is a tradition you would love for us to start?',
      'What does a perfect lazy Sunday with me look like?',
    ],
    dare: [
      'Send me a selfie with your biggest, goofiest smile.',
      'Record a 10-second voice note saying why you like me.',
      'Send a photo of something near you that reminds you of me.',
      'Type me a haiku about us right now.',
      'Send the last photo in your camera roll and explain it.',
      'Give me three compliments in a row, no repeats.',
      'Send a voice note humming our song.',
      'Draw a tiny heart and send a photo of it.',
      'Tell me good morning / good night as dramatically as you can (voice note).',
      'Send me an old photo of yourself you think is cute.',
      'Plan our next date in one message, right now.',
      'Send a photo of your current view.',
      'Make up a short rhyme using my name.',
      'Send me your favourite emoji combo that means "us".',
      'Take a photo of your face making the expression you have when you miss me.',
      'Send a voice note of your real laugh.',
    ],
  },
  flirty: {
    truth: [
      'What is the first thing you would do if I were next to you right now?',
      'What outfit of mine do you like me in the most?',
      'What is something about me you find irresistible?',
      'Where on a date do you most want to hold my hand?',
      'What was going through your mind during our first kiss?',
      'What is a little fantasy you have about a perfect night in with me?',
      'What is the most attractive thing I do without realising it?',
      'What pet name makes you blush when I use it?',
      'What would you whisper to me across a crowded room?',
      'What is something flirty you have wanted to tell me but were too shy to?',
      'What is your favourite way for me to surprise you?',
      'If we had the whole house to ourselves tonight, what would we do?',
      'What is the most romantic thing you have ever imagined us doing?',
      'What part of a slow dance with me would you love most?',
      'What text from me always makes your heart race?',
      'What is the look I give you that you cannot resist?',
    ],
    dare: [
      'Send me your flirtiest selfie right now.',
      'Record a voice note saying my name the way you would to get my attention.',
      'Send me a photo blowing a kiss.',
      'Describe in one message exactly how you would greet me at the door tonight.',
      'Send me a wink selfie.',
      'Text me the most flirtatious one-liner you can think of.',
      'Send a photo of your eyes only, looking your most charming.',
      'Record a voice note of you saying "come here" the way you mean it.',
      'Send me a selfie biting your lip.',
      'Tell me, in detail, the first thing you would kiss when you see me.',
      'Send a photo of your smile that you know I love.',
      'Voice note: whisper the cheesiest pickup line you can invent.',
      'Send me a "thinking about you" selfie right now.',
      'Describe your ideal cuddle position with me in one message.',
      'Send a photo posing the way you would for a date-night mirror pic.',
      'Record a 5-second voice note saying "I want you here".',
    ],
  },
  spicy: {
    truth: [
      'What is something you have been wanting me to do to you?',
      'Where is the most daring place you would want to kiss me?',
      'What is a fantasy you have not told me about yet?',
      'What outfit would you love to slowly take off me?',
      'What is the most turned-on I have ever made you, and when?',
      'What do you think about when you miss me at night?',
      'What is one thing you would do to me the second we are alone?',
      'Which part of me do you find the most distracting?',
      'What is a bold idea you would try with me if you knew I would say yes?',
      'What is the steamiest dream you have had about us?',
      'Where do you most love to be touched?',
      'What would you want me to whisper in your ear?',
      'What is the most tempting photo you would send me if you were feeling brave?',
      'What is something playful and naughty you want to try together?',
      'What is your favourite memory of us being close?',
      'If I set the mood tonight, how would you want it to start?',
    ],
    dare: [
      'Send me a photo that shows just a little more than usual.',
      'Record a voice note describing what you would do to me tonight.',
      'Send me a selfie giving your most tempting look.',
      'Describe, step by step, how you would kiss me right now.',
      'Send a photo of your shoulders / collarbone.',
      'Voice note: tell me your favourite thing I do when we are close.',
      'Send a mirror selfie of tonight’s look.',
      'Text me, in detail, where you would want my hands.',
      'Send a photo teasing one part of you that you know I love.',
      'Record a voice note saying exactly what you want from me later.',
      'Send a selfie lying down, looking up at the camera.',
      'Describe the outfit you would wear just for me tonight.',
      'Send a photo of you in something comfortable you know I like.',
      'Voice note: rate how much you want me right now and why.',
      'Send a close-up selfie of your lips.',
      'Text me the boldest thing you would do if I were there in 10 minutes.',
    ],
  },
  wild: {
    truth: [
      'What is the wildest thing you would want us to try together?',
      'What is a desire you have been keeping just for me?',
      'What is the most adventurous place you would want to be with me?',
      'What is something you want me to do to you slowly tonight?',
      'What is a secret turn-on you have never said out loud?',
      'What would a perfect uninterrupted night with me look like, start to finish?',
      'What is the boldest message you wish you could send me right now?',
      'What is one thing you have fantasised about that we have not done yet?',
      'What do you want me to take my time with?',
      'What is the most daring outfit you would wear only for my eyes?',
      'What is a "we should really do that" idea you keep thinking about?',
      'Where on your body do you most want my attention tonight?',
      'What would you beg me for if you had no reason to hold back?',
      'What is the most intense moment we have ever shared, in your memory?',
      'What is something you want to hear me say in your ear?',
      'If tonight had no rules, what would you ask of me?',
    ],
    dare: [
      'Send me the boldest photo you are comfortable sending right now.',
      'Record a voice note describing exactly what you want tonight, no holding back.',
      'Send a mirror selfie showing off the look you would greet me in.',
      'Describe, in full detail, the first five minutes once we are finally alone.',
      'Send a photo teasing what is under tonight’s outfit.',
      'Voice note: tell me your wildest want, whispered.',
      'Send a selfie from your bed right now.',
      'Text me, in detail, the scenario you have been daydreaming about.',
      'Send a photo of the most tempting angle you are willing to share.',
      'Record a voice note counting down what you would do to me, one by one.',
      'Send a selfie with the lights low.',
      'Describe what you want me to do the moment I walk in tonight.',
      'Send a photo that you would only ever send to me.',
      'Voice note: say the boldest sentence you have never said to me.',
      'Send a close-up of the look you give me when you want more.',
      'Tell me one thing you want to try tonight, and exactly how.',
    ],
  },
};

/** pick a random prompt for a tier+category, avoiding `exclude` when possible */
export function dealPrompt(spice: Spice, category: ToDCategory, exclude?: string): string {
  const pool = DECK[spice][category];
  const choices = exclude ? pool.filter((p) => p !== exclude) : pool;
  const list = choices.length ? choices : pool;
  return list[Math.floor(Math.random() * list.length)];
}

/** given the two participant userIds, return the one that isn't `id` */
export function otherUser(id: string, a: string, b: string): string {
  return id === a ? b : a;
}

/** a peer presence heartbeat counts as "live" within this window (ms) */
export const PRESENCE_WINDOW_MS = 15_000;
export function isPresenceFresh(at: number | undefined): boolean {
  return typeof at === 'number' && Date.now() - at < PRESENCE_WINDOW_MS;
}

/** the opening state for a brand-new room (before setup) */
export function freshState(firstHotSeat: string, a: string, b: string): ToDState {
  return {
    rev: 1,
    at: Date.now(),
    by: firstHotSeat,
    started: false,
    spice: 'flirty',
    phase: 'setup',
    hotSeat: firstHotSeat,
    round: 0,
    passes: { [a]: 0, [b]: 0 },
    scores: { [a]: 0, [b]: 0 },
    pendingSpice: null,
  };
}

export function vaultId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
