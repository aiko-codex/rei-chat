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
      'What is the silliest thing you have done because of me?',
      'What is a habit of mine you find endearing?',
      'What was your first impression of me, honestly?',
      'What is something I said once that you still remember?',
      'What is your favourite way for me to say I love you?',
      'What is the coziest memory you have of us?',
      'What do you look forward to most about seeing me?',
      'What is a compliment you wish I gave you more often?',
      'What is one dream you have for "us" in five years?',
      'What is the funniest inside joke we have?',
      'What is something about our relationship you never want to change?',
      'What is a small gesture from me that made your whole day?',
      'What is your favourite thing to do with me when it is raining?',
      'What is a place that reminds you of me even when I am not there?',
      'What is the first thing you would tell a friend about me?',
      'What is something you have learned about love from being with me?',
      'What is your favourite way to spend a quiet evening together?',
      'What is a memory of us you would want to relive exactly as it happened?',
      'What is something I do that instantly calms you down?',
      'What is a song you would want played at something important with me?',
      'What is your favourite thing about how we argue and make up?',
      'What is something you are proud of that I helped with?',
      'What is a nickname you have never told me you thought of?',
      'What is the most "us" thing we have ever done?',
      'What is a comfort food that reminds you of a memory with me?',
      'What is your favourite thing I do without even noticing?',
      'What is a small tradition from your childhood you would want to share with me?',
      'What is something about today you want to remember forever?',
      'What is a hope you have for how we grow old together?',
      'What is the sweetest thing a stranger has ever said about us?',
      'What is a moment you felt the most understood by me?',
      'What is your favourite way for us to say goodnight?',
      'What is something you would want written on a card just for you from me?',
      'What is a place we have not been yet that you dream of going with me?',
      'What is one thing you never get tired of hearing from me?',
      'What is the softest, most private nickname you have for me in your head?',
      'What is a small thing I do that makes you feel chosen?',
      'What is your favourite photo of me, and why?',
      'What is something about "us" that still gives you butterflies?',
      'What is your favourite way to say thank you without using words?',
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
      'Send a photo of your hands and describe what you wish they were doing right now (holding mine, obviously).',
      'Write me a one-line love note like it is 1999 and this is a text.',
      'Send a voice note reading out a fake weather forecast for "our future together".',
      'Take a selfie doing your best "just woke up thinking about you" face.',
      'Send a photo of something on your desk/table right now and rank it against me (I should still win).',
      'Record yourself saying three things you are grateful for today, one has to be me.',
      'Send a screenshot of the last thing that made you think of me.',
      'Describe our first date in exactly one sentence, dramatically.',
      'Send a photo of your favourite mug/cup and explain why.',
      'Voice note: sing (badly is fine) the chorus of a song that reminds you of me.',
      'Send a "proof of life" selfie with the silliest face you can make.',
      'Type out our relationship as a movie title.',
      'Send a photo of your shoes right now and tell me where you wish they were taking us.',
      'Record a 10-second voice note pretending to give a toast at our wedding.',
      'Send me a doodle of us, stick figures totally allowed.',
      'Text me a compliment using only emojis, I have to guess it.',
      'Send a photo of the sky wherever you are right now.',
      'Voice note: describe your perfect Sunday morning with me in under 15 seconds.',
      'Send me a screenshot of your camera roll folder names, no judgment.',
      'Record yourself trying to whistle our song.',
      'Send a photo of your outfit today, rate it out of 10 yourself.',
      'Type the first pet name that comes to mind for me, no overthinking.',
      'Send a voice note listing 3 things you would do on a perfect day off with me.',
      'Take a photo of something blue near you right now.',
      'Record a fake radio announcement dedicating a song to me.',
      'Send a photo of your favourite spot in your home.',
      'Voice note: tell me the plot of the last dream you remember.',
      'Send a screenshot of your most-used app this week.',
      'Text me a "breaking news" headline about us.',
      'Send a photo of your snack drawer / fridge right now.',
      'Record yourself doing a dramatic reading of our last text conversation.',
      'Send a selfie with the peace sign and your biggest smile.',
      'Voice note: describe me in exactly five words.',
      'Send a photo of your current phone wallpaper.',
      'Type a two-line poem about today.',
      'Record a voice note pretending to be a news anchor reporting "local couple still cute".',
      'Send a photo of the last thing you bought.',
      'Voice note: hum the tune of the song stuck in your head right now.',
      'Send me a screenshot of your notes app, one line only, your choice which.',
      'Send a voice note saying goodnight the sweetest way you know how.',
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
      'What is the first thing you notice when I walk into a room?',
      'What outfit combination of mine do you secretly hope I wear more?',
      'What is a compliment about your looks you would love to hear from me right now?',
      'What is the most charming thing I have ever done without trying?',
      'What is a "type" of yours that I happen to fit perfectly?',
      'What is your favourite way I say your name?',
      'What is something small I do that you find unfairly attractive?',
      'What is a moment you caught yourself staring at me?',
      'What is the most you have ever wanted to kiss me in public but did not?',
      'What is a scent of mine (perfume, shampoo, whatever) that gets you?',
      'What is your favourite thing to tease me about?',
      'What is a look you give me when you are trying to be subtle but are not?',
      'What is the most flirtatious thing you have ever said to me?',
      'What is something you would whisper to me if no one else could hear?',
      'What is the most attractive thing about the way I laugh?',
      'What is a memory of us that still makes you blush?',
      'What is your favourite part of getting ready to see me?',
      'What is something you think about me that you have never said out loud?',
      'What is the most you have wanted to hold my hand in a random moment?',
      'What is a compliment you have wanted to give me but felt too shy to?',
      'What is your favourite thing about the way I look at you?',
      'What is the boldest thought you have had about me this week?',
      'What is something about my voice that gets your attention?',
      'What is a moment you felt the most drawn to me?',
      'What is the cutest thing about how I get flustered?',
      'What is your favourite thing about slow dancing or swaying with me?',
      'What is a "we should do this more often" moment between us?',
      'What is the most charming compliment a stranger has given about us?',
      'What is a small touch from me that you always notice?',
      'What is the flirtiest text you have ever sent me?',
      'What is something you love about the way I tease you back?',
      'What is your favourite outfit you have seen me in?',
      'What is a "you looked really good today" moment you never mentioned?',
      'What is the most magnetic thing about my energy when we are together?',
      'What is a place you have imagined a first kiss with me happening?',
      'What is your favourite way I show affection in public?',
      'What is something about tonight you are already looking forward to?',
      'What is the most you have wanted to whisper something to me across a room?',
      'What is one thing about me that never fails to make you smile a little too much?',
      'What is the most you have wanted to steal a kiss when no one was looking?',
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
      'Send me a selfie with the look you give when you are trying to be charming.',
      'Text me the flirtiest emoji combo you can come up with, no explanation.',
      'Record a voice note saying "hey you" the way you would to get my attention across a room.',
      'Send a photo from an angle you know is your best side.',
      'Describe, in one flirty sentence, what you would say if you saw me across a bar.',
      'Send a selfie mid-laugh, unfiltered.',
      'Voice note: tell me the one thing you would compliment about me right now.',
      'Send a photo doing your best "come find me" pose.',
      'Text me a cheesy pickup line and commit to it fully.',
      'Send a close-up selfie of your smile only.',
      'Voice note: describe the outfit you are wearing like you are narrating a fashion show.',
      'Send a photo with your hair done the way you know I like.',
      'Record yourself saying my name in three different flirty tones.',
      'Send a selfie with a wink, no re-takes allowed.',
      'Text me what you would whisper if I walked in right now.',
      'Send a photo of your reflection somewhere unexpected (window, spoon, phone screen).',
      'Voice note: give me a slow, dramatic "hello" like in a movie.',
      'Send a selfie with your chin resting on your hand, looking thoughtful and cute.',
      'Describe the perfect slow song for us to sway to right now.',
      'Send a photo that captures your mood in one shot.',
      'Voice note: tell me the nicest thing a stranger has said about your smile.',
      'Send a selfie from your favourite angle, no overthinking it.',
      'Text me a flirty one-liner you would use on a first date.',
      'Send a photo of you doing something you find effortlessly attractive about yourself.',
      'Voice note: hum a tune while thinking about me, see how long you last.',
      'Send a mirror selfie with your best "caught you looking" expression.',
      'Text me the emoji that best represents how you feel about me right now.',
      'Send a photo with a soft smile, no filter.',
      'Voice note: describe what "home" feels like when you are with me.',
      'Send a selfie doing the exact face you make when you are flirting with me.',
      'Text me a flirty nickname you have never used before.',
      'Send a photo of your favourite jewelry or accessory you are wearing today.',
      'Voice note: say something sweet the way you would right before a kiss.',
      'Send a selfie with your eyes closed, peaceful and soft.',
      'Text me what song would play if this moment were a movie scene.',
      'Send a photo you would only post if I asked you to.',
      'Voice note: tell me, dramatically, that you missed me today.',
      'Send a selfie mid-scroll, exactly as you are right now.',
      'Text me the one compliment you want to hear before you fall asleep tonight.',
      'Send a selfie the second you finish reading this, no re-takes.',
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
      'What is a moment with me you wish you could freeze and stay in forever?',
      'What is the slowest you have ever wanted a moment with me to go?',
      'What is a place in the house you have thought about us together?',
      'What is the most turned-on a simple touch from me has made you?',
      'What is something you want me to take charge of tonight?',
      'What is a look I give you that instantly changes the mood?',
      'What is the boldest thing you have thought about doing to me?',
      'What is something you love about the way I take my time with you?',
      'What is a sound I make that you find irresistible?',
      'What is the most daring thing you would want to whisper to me mid-conversation?',
      'What is something about my hands you find distracting?',
      'What is a memory of us that still gets you a little breathless?',
      'What is one thing you want me to notice about you tonight?',
      'What is the most patient you have ever had to be waiting for me?',
      'What is a fantasy that starts with just us and nowhere to be?',
      'What is something you would want me to do the moment the lights go low?',
      'What is the boldest text you have almost sent me but did not?',
      'What is a part of getting close to me that you never get tired of?',
      'What is something you want more of when we are alone together?',
      'What is a memory of anticipation with me that still lingers?',
      'What is the most you have wanted to pull me closer in public?',
      'What is something about the way I move that catches your attention?',
      'What is a moment you wished we had more privacy?',
      'What is the boldest thing you would confess if I promised not to react?',
      'What is something you would want whispered to you right before I touch you?',
      'What is the most tempting version of "later tonight" you can imagine?',
      'What is a slow moment with me you replay in your head?',
      'What is something you crave when it has been a while since we were close?',
      'What is a boundary you would love for me to gently push, with your yes first?',
      'What is the most you have wanted to just be skin to skin with me, no plans?',
      'What is a compliment about my body you have never said out loud?',
      'What is something you want me to explore more the next time we are close?',
      'What is a fantasy involving somewhere we have never been together?',
      'What is the slowest kiss you can imagine us sharing right now?',
      'What is something about tonight that already has your mind wandering?',
      'What is one thing you want to hear me admit I think about you?',
      'What is a moment of closeness with me you wish had lasted longer?',
      'What is the most you have wanted to just pull me into another room?',
      'What is something you find yourself craving after a long day with me?',
      'What is one thing about intimacy with me you never want to lose?',
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
      'Send a photo of your neck / collarbone with a caption of just one word.',
      'Voice note: describe the last time we were close, in slow detail.',
      'Send a selfie with your hand near your face, looking like you are thinking about me.',
      'Text me exactly where you would want my first touch to land.',
      'Send a photo of your bed right now, no comment needed.',
      'Voice note: whisper what you are wearing right now.',
      'Send a mirror selfie from the waist up, your choice of pose.',
      'Text me, word for word, what you would say the second we are alone.',
      'Send a selfie biting your lip, holding eye contact with the camera.',
      'Voice note: tell me one thing you would do to me first, slowly.',
      'Send a photo of your hands, and describe what you want them doing to me.',
      'Text me the boldest compliment about my body you have never said out loud.',
      'Send a selfie in dim lighting, soft and close.',
      'Voice note: describe the sound you want to hear from me tonight.',
      'Send a photo teasing your collarbone or shoulder.',
      'Text me what you would whisper against my ear right now.',
      'Send a selfie lying back, relaxed and unbothered.',
      'Voice note: rate, out loud, how much you want me right now, and why.',
      'Send a photo from a low angle, your choice of what it shows.',
      'Text me the first thing you would do with your hands if I walked in.',
      'Send a close-up of your eyes, half-lidded, like you are thinking about me.',
      'Voice note: describe what "later" means to you tonight.',
      'Send a photo of you in something soft and comfortable, nothing more.',
      'Text me exactly how you would want to be held right now.',
      'Send a selfie with just a hint of what is underneath tonight’s outfit.',
      'Voice note: whisper my name the way you would if I were right there.',
      'Send a photo that only shows a small, teasing detail.',
      'Text me the boldest scenario you have thought about today.',
      'Send a selfie in bed, comfortable and unfiltered.',
      'Voice note: describe, slowly, what you want me to do the second the door closes.',
      'Send a selfie with your hand resting on your own collarbone.',
      'Voice note: describe your favourite moment of closeness with me, slowly.',
      'Send a photo of your hands intertwined with each other, imagining mine.',
      'Text me one thing you want me to notice about you the next time we are alone.',
      'Send a selfie with a soft, unguarded expression.',
      'Voice note: tell me what "close" means to you tonight.',
      'Send a photo of the last place you felt completely at ease with me.',
      'Text me the one thing you want more of when we are together.',
      'Send a selfie that captures exactly how you feel about tonight.',
      'Voice note: describe the anticipation of seeing me next, in detail.',
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
      'What is a fantasy you have never told anyone, not even me, until now?',
      'What is the wildest place you have imagined being with me?',
      'What is one thing you would want us to try that scares you a little?',
      'What is something you crave that you have never asked for directly?',
      'What is the most out-of-character thing you would do for me tonight?',
      'What is a version of tonight you have been imagining all day?',
      'What is one thing you want me to be rougher / softer about?',
      'What is the boldest thing you have ever wanted to say mid-moment?',
      'What is a fantasy involving losing all sense of time with me?',
      'What is something you want to explore that we have only talked around?',
      'What is the most you have wanted to just give up control with me?',
      'What is one thing you would want me to take completely in charge of?',
      'What is a wild "what if" scenario you have thought about us in?',
      'What is something you have wanted me to do without asking first?',
      'What is the most unfiltered want you have right now?',
      'What is a fantasy that involves an entire night, start to finish, with no interruptions?',
      'What is something about tonight you want to feel completely free to ask for?',
      'What is one boundary you would want to push together, only if we both say yes?',
      'What is the wildest thing you have thought about while missing me?',
      'What is a scenario where you completely let go with me?',
      'What is something you want to hear me beg for?',
      'What is the most reckless-feeling want you have about tonight?',
      'What is one thing you would want me to whisper right before losing control?',
      'What is a fantasy where nothing is off the table between us?',
      'What is something intense you want us to build up to slowly tonight?',
      'What is the wildest version of "goodnight" you can imagine us having?',
      'What is one thing you would want me to know without having to say it?',
      'What is a want you have been sitting on all week, just for tonight?',
      'What is the most you have wanted to surrender control completely with me?',
      'What is one thing about tonight that already has you counting down?',
      'What is a fantasy you would only ever share in a moment exactly like this one?',
      'What is the most you have wanted to just disappear somewhere private with me?',
      'What is one thing you would want to feel completely uninhibited about with me?',
      'What is the boldest "yes" you have wanted to say to me but held back?',
      'What is a want you have that only makes sense in complete privacy with me?',
      'What is the most you have wanted a night with me to have absolutely no limits?',
      'What is one thing about tonight you want to feel entirely free with me about?',
      'What is a fantasy that involves total trust between us?',
      'What is the wildest thing you would agree to if I asked, right now, no hesitation?',
      'What is something you want us to discover about each other tonight?',
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
      'Send me a photo that only I will ever see.',
      'Voice note: describe, without holding back, exactly what you want tonight.',
      'Send a selfie in the dark, lit only by your screen.',
      'Text me, in full detail, the fantasy you have been sitting on all week.',
      'Send a photo that shows exactly how you are feeling right now, no filter.',
      'Voice note: whisper the most reckless thing you want to do tonight.',
      'Send a selfie the moment before you would let go completely.',
      'Text me exactly what you want me to do first, second, third.',
      'Send a photo that says "come find out" without a single word.',
      'Voice note: describe, slowly, what surrender looks like for you tonight.',
      'Send a selfie that only makes sense once I am there.',
      'Text me the one thing you have never dared to ask for, until now.',
      'Send a photo of you exactly as you are right now, no adjusting anything.',
      'Voice note: count down from ten, describing what happens at zero.',
      'Send a selfie with an expression that says everything you are not saying.',
      'Text me the wildest "what if" you have thought about today.',
      'Send a photo that is just for the two of us to ever know about.',
      'Voice note: tell me exactly how you want tonight to end.',
      'Send a selfie mid-thought, caught completely off guard.',
      'Text me the one boundary you would want us to push together tonight.',
      'Send a photo of you completely relaxed, guard fully down.',
      'Voice note: describe the moment tonight when you stop overthinking completely.',
      'Send a selfie taken the instant you thought of me.',
      'Text me exactly what "no rules tonight" would look like for you.',
      'Send a photo of the room you would want us to disappear into.',
      'Voice note: describe what total trust with me feels like.',
      'Send a selfie where you are not posing at all, just you.',
      'Text me the one thing you would want to feel by the end of tonight.',
      'Send a photo of you mid-laugh, unguarded and real.',
      'Voice note: tell me, honestly, what you need from me tonight.',
      'Send a selfie in the exact moment you feel closest to me.',
      'Text me the wildest thing you would say yes to without asking why.',
      'Send a photo that captures the version of you only I get to see.',
      'Voice note: describe the feeling of being completely known by someone.',
      'Send a selfie right after you read this dare, no time to prepare.',
      'Text me one thing you have never let yourself want out loud, until now.',
      'Send a photo of wherever feels most private to you right now.',
      'Voice note: whisper what "us, with no limits" means to you.',
      'Send a selfie that only makes sense between the two of us.',
      'Text me exactly how you want to be wanted tonight.',
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
