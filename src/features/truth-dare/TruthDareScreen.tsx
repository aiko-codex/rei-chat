/**
 * Truth or Dare — a dedicated, cozy, just-for-two space (separate from the main
 * chat). The room is the connection itself, permanent and E2E; presence is
 * ambient (a "she's here" glow when both are looking → live), never a gate.
 *
 * Flow per turn: the hot-seat player picks Truth/Dare → the partner (host)
 * deals a deck card or writes their own → the hot-seat answers / does it (with
 * optional proof media that lands in the Vault) or passes → the host reacts →
 * the turn flips. State + presence + vault all ride the encrypted conv_meta
 * overlay; see store/truth-dare-store.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Camera,
  Check,
  Flame,
  Lock,
  Mic,
  MoreVertical,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Progress } from '@/components/ui/progress';
import { useChatStore } from '@/store/chat-store';
import { useTruthDareStore } from '@/store/truth-dare-store';
import { VoiceRecorderModal } from '@/features/chat/VoiceRecorderModal';
import { VaultView } from './VaultView';
import { SPICE_TIERS, spiceTier, MAX_PASSES, type Spice } from '@/lib/truth-dare';

const REACTIONS = ['😍', '😏', '🔥', '😂', '🙈', '👏', '🥵', '💋'];

interface Props {
  connectionId: string;
  peerUserId: string;
  onBack: () => void;
}

/** the response media shown in the reveal phase */
function RevealMedia({ mediaId, mime, chunked, kind }: { mediaId: string; mime: string; chunked: boolean; kind?: string }) {
  const url = useTruthDareStore((s) => s.mediaUrls[mediaId]);
  const ensure = useTruthDareStore((s) => s.ensureMediaUrl);
  useEffect(() => {
    if (!url) void ensure(mediaId, mime, chunked);
  }, [mediaId, mime, chunked, url, ensure]);
  if (!url) return <div className="h-48 w-full animate-pulse rounded-2xl bg-white/5" />;
  if (kind === 'video') return <video src={url} controls playsInline className="max-h-72 w-full rounded-2xl object-contain" />;
  if (kind === 'voice')
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
        <Mic className="size-6 shrink-0 text-rose-300" />
        <audio src={url} controls className="w-full" />
      </div>
    );
  return <img src={url} alt="proof" className="max-h-72 w-full rounded-2xl object-contain" />;
}

/** waiting placeholder while it's the other person's move */
function Waiting({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <motion.div
        className="flex size-16 items-center justify-center rounded-full bg-white/5"
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="size-7 text-rose-300" />
      </motion.div>
      <p className="text-lg font-medium text-white">{text}</p>
      {sub && <p className="max-w-xs text-sm text-white/50">{sub}</p>}
    </div>
  );
}

function PromptCard({ category, text }: { category: string; text: string }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      className="w-full rounded-3xl bg-linear-to-b from-white/12 to-white/5 p-6 shadow-xl ring-1 ring-white/10"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/25 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-200">
        {category === 'dare' ? <Flame className="size-3.5" /> : <Sparkles className="size-3.5" />}
        {category}
      </span>
      <p className="mt-4 text-xl leading-relaxed text-white">{text}</p>
    </motion.div>
  );
}

export function TruthDareScreen({ connectionId, peerUserId, onBack }: Props) {
  const enter = useTruthDareStore((s) => s.enter);
  const leave = useTruthDareStore((s) => s.leave);
  const state = useTruthDareStore((s) => s.state);
  const draft = useTruthDareStore((s) => s.draft);
  const myUserId = useTruthDareStore((s) => s.myUserId);
  const peerLive = useTruthDareStore((s) => s.peerLive);
  const uploading = useTruthDareStore((s) => s.uploading);

  const setSpice = useTruthDareStore((s) => s.setSpice);
  const startGame = useTruthDareStore((s) => s.startGame);
  const pick = useTruthDareStore((s) => s.pick);
  const dealDraft = useTruthDareStore((s) => s.dealDraft);
  const setDraftText = useTruthDareStore((s) => s.setDraftText);
  const sendPrompt = useTruthDareStore((s) => s.sendPrompt);
  const answerText = useTruthDareStore((s) => s.answerText);
  const answerMedia = useTruthDareStore((s) => s.answerMedia);
  const markDone = useTruthDareStore((s) => s.markDone);
  const passTurn = useTruthDareStore((s) => s.pass);
  const react = useTruthDareStore((s) => s.react);
  const nextTurn = useTruthDareStore((s) => s.nextTurn);
  const proposeSpice = useTruthDareStore((s) => s.proposeSpice);
  const confirmSpice = useTruthDareStore((s) => s.confirmSpice);
  const dismissSpice = useTruthDareStore((s) => s.dismissSpice);
  const endSession = useTruthDareStore((s) => s.endSession);
  const restart = useTruthDareStore((s) => s.restart);
  const deleteRoom = useTruthDareStore((s) => s.deleteRoom);

  const peerName = useChatStore((s) => s.connectionPeers[connectionId]?.displayName) || 'Her';

  const [answer, setAnswer] = useState('');
  const [showVault, setShowVault] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showSpice, setShowSpice] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    enter(connectionId, peerUserId);
    return () => leave();
  }, [connectionId, peerUserId, enter, leave]);

  // reset the local answer draft when the turn/phase changes
  useEffect(() => {
    setAnswer('');
  }, [state?.phase, state?.round]);

  if (!state) {
    return <div className="flex h-full items-center justify-center bg-neutral-950 text-white/60">Opening…</div>;
  }

  const tier = spiceTier(state.spice);
  const iAmHotSeat = state.hotSeat === myUserId;
  const hotSeatLabel = iAmHotSeat ? 'You' : peerName;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    void answerMedia(file, kind);
  };

  // ── phase bodies ──────────────────────────────────────────────────────────
  let body: React.ReactNode = null;

  if (showVault) {
    return <VaultView onBack={() => setShowVault(false)} />;
  }

  if (state.endedAt) {
    const myScore = state.scores[myUserId] ?? 0;
    const peerScore = state.scores[peerUserId] ?? 0;
    const verdict = myScore === peerScore ? "It's a tie 🤍" : myScore > peerScore ? 'You win 👑' : `${peerName} wins 👑`;
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-5xl">
          🔥
        </motion.div>
        <div>
          <p className="text-2xl font-semibold text-white">Good game</p>
          <p className="mt-1 text-sm text-white/60">{state.round} rounds · {tier.emoji} {tier.label}</p>
        </div>
        <div className="flex w-full max-w-xs items-center justify-around rounded-2xl bg-white/5 p-5">
          <div>
            <p className="text-3xl font-bold text-rose-300">{myScore}</p>
            <p className="text-xs text-white/50">You</p>
          </div>
          <span className="text-white/30">vs</span>
          <div>
            <p className="text-3xl font-bold text-white">{peerScore}</p>
            <p className="text-xs text-white/50">{peerName}</p>
          </div>
        </div>
        <p className="text-lg text-white">{verdict}</p>
        <button
          onClick={restart}
          className="cursor-pointer rounded-full bg-rose-600 px-8 py-3 font-semibold text-white shadow-lg hover:bg-rose-500"
          data-testid="tod-play-again"
        >
          Play again
        </button>
      </div>
    );
  } else if (!state.started || state.phase === 'setup') {
    // ── lobby / setup ──
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-8 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Flame className="size-12 text-rose-400" />
        </motion.div>
        <div>
          <h1 className="text-3xl font-bold text-white">Truth or Dare</h1>
          <p className="mt-2 text-sm text-white/60">Just the two of you. Pick a vibe and begin.</p>
        </div>

        <div className="grid w-full max-w-sm grid-cols-2 gap-2">
          {SPICE_TIERS.map((t) => {
            const active = state.spice === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSpice(t.id)}
                data-testid={`tod-spice-${t.id}`}
                className={`flex flex-col items-start gap-0.5 rounded-2xl p-4 text-left ring-1 transition-all ${
                  active ? 'bg-rose-600/30 ring-rose-400' : 'bg-white/5 ring-white/10 hover:bg-white/10'
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-sm font-semibold text-white">{t.label}</span>
                <span className="text-[11px] text-white/50">{t.blurb}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={startGame}
          className="w-full max-w-sm cursor-pointer rounded-full bg-rose-600 py-4 text-lg font-semibold text-white shadow-lg shadow-rose-900/40 hover:bg-rose-500"
          data-testid="tod-start"
        >
          Start playing
        </button>
        <p className="text-xs text-white/40">We'll flip a coin for who goes first.</p>
      </div>
    );
  } else if (state.phase === 'choosing') {
    body = iAmHotSeat ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
        <p className="text-center text-xl font-medium text-white">Your turn — pick one</p>
        <div className="flex w-full max-w-sm flex-col gap-4">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => pick('truth')}
            data-testid="tod-pick-truth"
            className="flex items-center justify-center gap-3 rounded-3xl bg-linear-to-br from-sky-500/30 to-indigo-500/20 py-8 text-2xl font-bold text-white ring-1 ring-white/15"
          >
            <Sparkles className="size-7" /> Truth
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => pick('dare')}
            data-testid="tod-pick-dare"
            className="flex items-center justify-center gap-3 rounded-3xl bg-linear-to-br from-rose-500/40 to-orange-500/25 py-8 text-2xl font-bold text-white ring-1 ring-white/15"
          >
            <Flame className="size-7" /> Dare
          </motion.button>
        </div>
      </div>
    ) : (
      <Waiting text={`${peerName} is choosing…`} sub="Truth or dare — they're deciding." />
    );
  } else if (state.phase === 'prompting') {
    // host supplies the prompt (deal or write); hot-seat waits
    const isHost = !iAmHotSeat;
    body = isHost ? (
      <div className="flex flex-1 flex-col gap-4 px-6 py-4">
        <p className="text-center text-sm text-white/60">
          {peerName} picked <span className="font-semibold text-rose-300">{state.category}</span> — give them one
        </p>
        <div className="flex-1">
          {draft ? (
            <PromptCard category={state.category ?? ''} text={draft.text} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-white/50">
              <Wand2 className="size-9 text-rose-300" />
              <p className="text-sm">Deal a card or write your own {state.category}.</p>
            </div>
          )}
          {draft && (
            <textarea
              value={draft.text}
              onChange={(e) => setDraftText(e.target.value)}
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl bg-white/5 p-3 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-rose-400"
              placeholder={`Write a ${state.category}…`}
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={dealDraft}
              data-testid="tod-deal"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-sm font-medium text-white hover:bg-white/15"
            >
              <Wand2 className="size-4" /> {draft ? 'Deal again' : 'Deal a card'}
            </button>
            {!draft && (
              <button
                onClick={() => setDraftText('')}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-sm font-medium text-white hover:bg-white/15"
              >
                Write my own
              </button>
            )}
          </div>
          <button
            onClick={sendPrompt}
            disabled={!draft?.text.trim()}
            data-testid="tod-send-prompt"
            className="rounded-full bg-rose-600 py-3.5 font-semibold text-white shadow-lg hover:bg-rose-500 disabled:opacity-40"
          >
            Send to {peerName}
          </button>
        </div>
      </div>
    ) : (
      <Waiting text={`${peerName} is setting your ${state.category}…`} sub="Brace yourself 👀" />
    );
  } else if (state.phase === 'responding') {
    body = iAmHotSeat ? (
      <div className="flex flex-1 flex-col gap-4 px-6 py-4">
        <PromptCard category={state.category ?? ''} text={state.promptText ?? ''} />
        {uploading !== null ? (
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="mb-2 text-sm text-white/70">Sending…</p>
            <Progress value={Math.round(uploading * 100)} />
          </div>
        ) : (
          <>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl bg-white/5 p-3 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-rose-400"
              placeholder={state.category === 'truth' ? 'Type your answer…' : 'Add a note (optional)…'}
            />
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                data-testid="tod-proof-photo"
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 py-3 text-xs text-white hover:bg-white/10"
              >
                <Camera className="size-5 text-rose-300" /> Photo/Video
              </button>
              <button
                onClick={() => setShowVoice(true)}
                data-testid="tod-proof-voice"
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 py-3 text-xs text-white hover:bg-white/10"
              >
                <Mic className="size-5 text-rose-300" /> Voice
              </button>
              <button
                onClick={() => {
                  passTurn();
                }}
                data-testid="tod-pass"
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 py-3 text-xs text-white hover:bg-white/10"
              >
                <SkipForward className="size-5 text-white/60" /> Pass
                <span className="text-[10px] text-white/40">{MAX_PASSES - (state.passes[myUserId] ?? 0)} left</span>
              </button>
            </div>
            <button
              onClick={() => (state.category === 'truth' ? answerText(answer) : markDone(answer))}
              disabled={state.category === 'truth' && !answer.trim()}
              data-testid="tod-submit-answer"
              className="flex items-center justify-center gap-2 rounded-full bg-rose-600 py-3.5 font-semibold text-white shadow-lg hover:bg-rose-500 disabled:opacity-40"
            >
              <Check className="size-5" /> {state.category === 'truth' ? 'Send answer' : 'Done — I did it'}
            </button>
          </>
        )}
      </div>
    ) : (
      <Waiting text={`${peerName} is answering…`} sub={state.promptText} />
    );
  } else if (state.phase === 'reveal') {
    const r = state.response;
    body = (
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        <PromptCard category={state.category ?? ''} text={state.promptText ?? ''} />
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-white/40">{hotSeatLabel}'s answer</p>
          {r?.kind === 'passed' ? (
            <p className="text-white/60">Chickened out 🐔 — passed this one.</p>
          ) : r?.kind === 'media' && r.mediaId ? (
            <RevealMedia mediaId={r.mediaId} mime={r.mime ?? ''} chunked={r.chunked ?? true} kind={r.mediaKind} />
          ) : r?.kind === 'done' ? (
            <p className="text-white">Did it ✅{r.text ? ` — ${r.text}` : ''}</p>
          ) : (
            <p className="whitespace-pre-wrap text-white">{r?.text}</p>
          )}
        </div>

        {state.reaction ? (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <span className="text-2xl">{state.reaction}</span>
            <span>{iAmHotSeat ? `${peerName} reacted` : 'You reacted'}</span>
          </div>
        ) : !iAmHotSeat ? (
          <div className="flex flex-wrap justify-center gap-2">
            {REACTIONS.map((e) => (
              <motion.button
                key={e}
                whileTap={{ scale: 1.3 }}
                onClick={() => react(e)}
                className="rounded-full bg-white/5 px-3 py-2 text-xl hover:bg-white/10"
              >
                {e}
              </motion.button>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-white/40">Waiting for {peerName}'s reaction…</p>
        )}

        <button
          onClick={nextTurn}
          data-testid="tod-next"
          className="mt-auto flex items-center justify-center gap-2 rounded-full bg-rose-600 py-3.5 font-semibold text-white shadow-lg hover:bg-rose-500"
        >
          <SkipForward className="size-5" /> Next turn
        </button>
      </div>
    );
  }

  const pendingFromPeer = state.pendingSpice && state.pendingSpice.by !== myUserId;
  const pendingFromMe = state.pendingSpice && state.pendingSpice.by === myUserId;

  return (
    <div className="dark relative flex h-full flex-col overflow-hidden bg-neutral-950 text-white" data-testid="truth-dare-screen">
      {/* cozy spice-tinted backdrop */}
      <div className={`pointer-events-none absolute inset-0 bg-linear-to-b ${tier.gradient}`} />
      <div className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-rose-600/20 blur-3xl" />

      {/* header */}
      <header className="relative z-10 flex items-center gap-2 px-2 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button onClick={onBack} aria-label="Back" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Truth or Dare</p>
          <p className="flex items-center gap-1.5 text-xs">
            <span className={`size-1.5 rounded-full ${peerLive ? 'bg-emerald-400' : 'bg-white/30'}`} />
            <span className="text-white/60">
              {peerLive ? `${peerName} is here` : `${peerName} is away — saved for later`}
            </span>
          </p>
        </div>
        {state.started && !state.endedAt && (
          <button
            onClick={() => setShowSpice(true)}
            className="cursor-pointer rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15"
            data-testid="tod-spice-chip"
          >
            {tier.emoji} {tier.label}
          </button>
        )}
        <button onClick={() => setShowVault(true)} aria-label="Vault" className="cursor-pointer rounded-full p-2 hover:bg-white/10" data-testid="tod-open-vault">
          <Lock className="size-5" />
        </button>
        <button onClick={() => setShowMenu(true)} aria-label="Menu" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <MoreVertical className="size-5" />
        </button>
      </header>

      {/* spice-change agreement banner */}
      <AnimatePresence>
        {pendingFromPeer && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 mx-4 mb-1 flex items-center gap-3 rounded-2xl bg-rose-600/30 p-3 text-sm ring-1 ring-rose-400/40"
          >
            <Flame className="size-5 shrink-0 text-rose-200" />
            <span className="flex-1">{peerName} wants to switch to {spiceTier(state.pendingSpice!.to).emoji} {spiceTier(state.pendingSpice!.to).label}</span>
            <button onClick={confirmSpice} className="cursor-pointer rounded-full bg-rose-500 px-3 py-1 text-xs font-medium">Agree</button>
            <button onClick={dismissSpice} className="cursor-pointer rounded-full bg-white/10 px-3 py-1 text-xs">Not now</button>
          </motion.div>
        )}
        {pendingFromMe && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 mx-4 mb-1 rounded-2xl bg-white/5 p-2 text-center text-xs text-white/60">
            Waiting for {peerName} to agree to {spiceTier(state.pendingSpice!.to).emoji} {spiceTier(state.pendingSpice!.to).label}…
          </motion.div>
        )}
      </AnimatePresence>

      {/* body */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${state.endedAt ? 'end' : state.phase}-${state.round}-${iAmHotSeat}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-y-auto"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onPickFile} />

      <VoiceRecorderModal
        open={showVoice}
        onClose={() => setShowVoice(false)}
        onSend={(_media, blob) => {
          setShowVoice(false);
          void answerMedia(blob, 'voice');
        }}
      />

      {/* spice change sheet (mid-game → proposes, needs agreement) */}
      <Drawer open={showSpice} onOpenChange={setShowSpice}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Change the heat</DrawerTitle>
            <p className="text-xs text-muted-foreground">{peerName} has to agree before it switches.</p>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {SPICE_TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id !== state.spice) {
                    proposeSpice(t.id as Spice);
                    toast(`Asked ${peerName} to switch to ${t.label}`);
                  }
                  setShowSpice(false);
                }}
                className={`flex flex-col items-start gap-0.5 rounded-2xl p-4 text-left ring-1 ${
                  state.spice === t.id ? 'bg-primary/15 ring-primary' : 'bg-muted ring-transparent hover:bg-muted/70'
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-[11px] text-muted-foreground">{t.blurb}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* overflow menu: end session / delete room */}
      <Drawer open={showMenu} onOpenChange={setShowMenu}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Truth or Dare</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {state.started && !state.endedAt && (
              <button
                onClick={() => {
                  endSession();
                  setShowMenu(false);
                }}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted [&_svg]:size-4.5"
              >
                <RotateCcw />
                <span className="text-sm font-medium">End session &amp; see recap</span>
              </button>
            )}
            <button
              onClick={() => setShowVault(true)}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted [&_svg]:size-4.5"
            >
              <Lock />
              <span className="text-sm font-medium">Open the Vault</span>
            </button>
            <button
              onClick={() => {
                if (confirm('Clear the whole room and empty the vault for both of you? This cannot be undone.')) {
                  void deleteRoom();
                }
                setShowMenu(false);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-destructive hover:bg-destructive/10 [&_svg]:size-4.5"
            >
              <Trash2 />
              <span className="text-sm font-medium">Clear room &amp; vault</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
