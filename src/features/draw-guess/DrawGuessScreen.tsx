/**
 * Draw & Guess — a dedicated, full-screen Pictionary space (replaces the old
 * in-chat Message.game overlay). The room is the connection itself,
 * permanent and E2E; presence is ambient, never a gate.
 *
 * Flow per turn: the drawer sketches a secret word → sends it → the guesser
 * types guesses against a shared hearts budget, and the drawer watches each
 * attempt land LIVE (right/wrong) so nobody's waiting in the dark → reveal →
 * turn flips. State rides the encrypted conv_meta overlay; see
 * store/draw-guess-store.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import {
  ArrowLeft,
  Check,
  Eraser,
  MoreVertical,
  Palette,
  Pencil,
  Pipette,
  Redo2,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Undo2,
  X,
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useDrawGuessStore } from '@/store/draw-guess-store';
import { MAX_GUESSES } from '@/lib/draw-guess';

const COLORS = ['#1d1d1f', '#3b82f6', '#e0245e', '#f5a623', '#2ecc71', '#9b59b6', '#ffffff'];

interface Props {
  connectionId: string;
  peerUserId: string;
  onBack: () => void;
}

function Waiting({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <motion.div
        className="flex size-16 items-center justify-center rounded-full bg-white/5"
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Pencil className="size-7 text-sky-300" />
      </motion.div>
      <p className="text-lg font-medium text-white">{text}</p>
      {sub && <p className="max-w-xs text-sm text-white/50">{sub}</p>}
    </div>
  );
}

export function DrawGuessScreen({ connectionId, peerUserId, onBack }: Props) {
  const enter = useDrawGuessStore((s) => s.enter);
  const leave = useDrawGuessStore((s) => s.leave);
  const state = useDrawGuessStore((s) => s.state);
  const myUserId = useDrawGuessStore((s) => s.myUserId);
  const peerLive = useDrawGuessStore((s) => s.peerLive);
  const startGame = useDrawGuessStore((s) => s.startGame);
  const rerollWord = useDrawGuessStore((s) => s.rerollWord);
  const submitDrawing = useDrawGuessStore((s) => s.submitDrawing);
  const submitGuess = useDrawGuessStore((s) => s.submitGuess);
  const nextTurn = useDrawGuessStore((s) => s.nextTurn);
  const endSession = useDrawGuessStore((s) => s.endSession);
  const restart = useDrawGuessStore((s) => s.restart);

  const peerName = useChatStore((s) => s.connectionPeers[connectionId]?.displayName) || 'Her';

  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const customColorRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState(COLORS[1]);
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const guessLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    enter(connectionId, peerUserId);
    return () => leave();
  }, [connectionId, peerUserId, enter, leave]);

  useEffect(() => {
    setGuess('');
  }, [state?.phase, state?.round]);

  useEffect(() => {
    guessLogRef.current?.scrollTo({ top: guessLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [state?.guesses.length]);

  if (!state) {
    return <div className="flex h-full items-center justify-center bg-neutral-950 text-white/60">Opening…</div>;
  }

  const iAmDrawer = state.drawerId === myUserId;
  const drawerLabel = iAmDrawer ? 'You' : peerName;

  const setPen = (c: string) => {
    setColor(c);
    setErasing(false);
    canvasRef.current?.eraseMode(false);
  };
  const toggleErase = () => {
    const next = !erasing;
    setErasing(next);
    canvasRef.current?.eraseMode(next);
  };
  const send = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const dataUrl = await canvas.exportImage('png');
      submitDrawing(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode = null;

  if (state.endedAt) {
    const myScore = state.scores[myUserId] ?? 0;
    const peerScore = state.scores[peerUserId] ?? 0;
    const verdict = myScore === peerScore ? "It's a tie 🤍" : myScore > peerScore ? 'You win 🏆' : `${peerName} wins 🏆`;
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-5xl">
          🎨
        </motion.div>
        <div>
          <p className="text-2xl font-semibold text-white">Good game</p>
          <p className="mt-1 text-sm text-white/60">{state.round} rounds drawn</p>
        </div>
        <div className="flex w-full max-w-xs items-center justify-around rounded-2xl bg-white/5 p-5">
          <div>
            <p className="text-3xl font-bold text-sky-300">{myScore}</p>
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
          className="cursor-pointer rounded-full bg-sky-600 px-8 py-3 font-semibold text-white shadow-lg hover:bg-sky-500"
          data-testid="dg-play-again"
        >
          Play again
        </button>
      </div>
    );
  } else if (!state.started || state.phase === 'setup') {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-8 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Pencil className="size-12 text-sky-400" />
        </motion.div>
        <div>
          <h1 className="text-3xl font-bold text-white">Draw &amp; Guess</h1>
          <p className="mt-2 text-sm text-white/60">One of you draws a secret word, the other guesses live.</p>
        </div>
        <button
          onClick={startGame}
          className="w-full max-w-sm cursor-pointer rounded-full bg-sky-600 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-900/40 hover:bg-sky-500"
          data-testid="dg-start"
        >
          Start playing
        </button>
        <p className="text-xs text-white/40">We'll flip a coin for who draws first.</p>
      </div>
    );
  } else if (state.phase === 'drawing') {
    body = iAmDrawer ? (
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div className="relative rounded-xl bg-sky-500/10 px-4 py-2.5 text-center">
          <p className="text-[11px] uppercase tracking-widest text-sky-300/70">Your secret word</p>
          <p className="text-2xl font-bold text-sky-300">{state.word}</p>
          <p className="text-[11px] text-white/40">Don't say it — draw it!</p>
          <button
            onClick={rerollWord}
            aria-label="Get a different word"
            data-testid="dg-reroll-word"
            className="absolute right-2.5 top-2.5 flex size-7 cursor-pointer items-center justify-center rounded-full text-sky-300/70 hover:bg-white/10 hover:text-sky-300"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white">
          <ReactSketchCanvas
            ref={canvasRef}
            width="100%"
            height="100%"
            strokeWidth={5}
            eraserWidth={20}
            strokeColor={color}
            canvasColor="#ffffff"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setPen(c)}
              aria-label={`Color ${c}`}
              className={cn(
                'size-7 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-neutral-950 transition',
                !erasing && color === c ? 'ring-white' : 'ring-transparent',
              )}
              style={{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ffffff33' : undefined }}
            />
          ))}
          {/* custom color picker — the real <input type=color> sits directly on
              top of the swatch (opacity-0, not clipped) so the click hits the
              native input itself; clipping tricks (sr-only) block the picker
              from opening in some browsers */}
          <div
            className={cn(
              'relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-neutral-950 transition',
              !erasing && !COLORS.includes(color) ? 'ring-white' : 'ring-transparent',
            )}
            style={
              !erasing && !COLORS.includes(color)
                ? { background: color }
                : { background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }
            }
          >
            {(erasing || COLORS.includes(color)) && <Pipette className="pointer-events-none size-3.5 text-white drop-shadow" />}
            <input
              ref={customColorRef}
              type="color"
              value={COLORS.includes(color) ? '#3b82f6' : color}
              onChange={(e) => setPen(e.target.value)}
              aria-label="Pick a custom color"
              data-testid="dg-color-custom"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant={erasing ? 'secondary' : 'ghost'} size="icon" onClick={toggleErase} aria-label="Eraser" className="text-white hover:text-white">
              <Eraser />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => canvasRef.current?.undo()} aria-label="Undo" className="text-white hover:text-white">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => canvasRef.current?.redo()} aria-label="Redo" className="text-white hover:text-white">
              <Redo2 />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => canvasRef.current?.clearCanvas()} aria-label="Clear" className="text-white hover:text-white">
              <RotateCcw />
            </Button>
          </div>
        </div>
        <button
          onClick={send}
          disabled={busy}
          data-testid="dg-send-drawing"
          className="rounded-full bg-sky-600 py-3.5 font-semibold text-white shadow-lg hover:bg-sky-500 disabled:opacity-40"
        >
          {busy ? 'Sending…' : `Done — let ${peerName} guess`}
        </button>
      </div>
    ) : (
      <Waiting text={`${peerName} is drawing…`} sub="Their sketch will appear here the moment it's ready." />
    );
  } else if (state.phase === 'guessing') {
    const hearts = Array.from({ length: MAX_GUESSES }, (_, i) => i < state.guessesLeft);
    const submit = () => {
      if (!guess.trim()) return;
      submitGuess(guess.trim());
      setGuess('');
    };
    body = (
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
          {state.drawingUrl && <img src={state.drawingUrl} alt="drawing" className="block w-full" />}
        </div>

        {!iAmDrawer && (
          <div className="flex items-center gap-1 px-0.5 text-sm">
            {hearts.map((filled, i) => (
              <span key={i}>{filled ? '❤️' : '🖤'}</span>
            ))}
            <span className="ml-auto text-[11px] text-white/50">{state.guessesLeft}/{MAX_GUESSES} left</span>
          </div>
        )}

        {/* live guess feed — visible to BOTH, so the drawer watches attempts land */}
        <div ref={guessLogRef} className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-2xl bg-white/5 p-3">
          {state.guesses.length === 0 ? (
            <p className="text-center text-xs text-white/40">
              {iAmDrawer ? `Waiting for ${peerName}'s first guess…` : 'Type a guess below to get started.'}
            </p>
          ) : (
            state.guesses.map((g, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm',
                  g.correct ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-white/70',
                )}
              >
                {g.correct ? <Check className="size-3.5 shrink-0" /> : <X className="size-3.5 shrink-0 text-rose-300" />}
                <span className="truncate">{g.text}</span>
              </motion.div>
            ))
          )}
        </div>

        {!iAmDrawer ? (
          <div className="flex gap-1.5">
            <Input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Type your guess…"
              data-testid="dg-guess-input"
              className="h-11 flex-1 rounded-full border-white/15 bg-white/5 px-4 text-white placeholder:text-white/30"
            />
            <Button size="icon" className="size-11 shrink-0 rounded-full bg-sky-600 hover:bg-sky-500" onClick={submit} disabled={!guess.trim()} data-testid="dg-guess-submit">
              <Check className="size-4.5" />
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs text-white/40">Watching {peerName} guess live…</p>
        )}
      </div>
    );
  } else if (state.phase === 'reveal') {
    const won = state.guesses.some((g) => g.correct);
    body = (
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
          {state.drawingUrl && <img src={state.drawingUrl} alt="drawing" className="block w-full" />}
        </div>
        <div className="rounded-2xl bg-white/5 p-4 text-center">
          <p className="text-3xl">{won ? '🎉' : '😢'}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {won ? (iAmDrawer ? `${peerName} guessed it!` : 'You got it!') : `Out of guesses — nobody got it`}
          </p>
          <p className="mt-1 text-xs text-white/50">
            The word was <span className="font-bold text-white">"{state.word}"</span> · drawn by {drawerLabel}
          </p>
        </div>
        {state.guesses.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {state.guesses.map((g, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs',
                  g.correct ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-white/50',
                )}
              >
                {g.text}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={nextTurn}
          data-testid="dg-next"
          className="mt-auto flex items-center justify-center gap-2 rounded-full bg-sky-600 py-3.5 font-semibold text-white shadow-lg hover:bg-sky-500"
        >
          <SkipForward className="size-5" /> Next turn
        </button>
      </div>
    );
  }

  return (
    <div className="dark relative flex h-full flex-col overflow-hidden bg-neutral-950 text-white" data-testid="draw-guess-screen">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-sky-500/15 via-indigo-500/8 to-transparent" />
      <div className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-sky-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center gap-2 px-2 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button onClick={onBack} aria-label="Back" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Draw &amp; Guess</p>
          <p className="flex items-center gap-1.5 text-xs">
            <span className={`size-1.5 rounded-full ${peerLive ? 'bg-emerald-400' : 'bg-white/30'}`} />
            <span className="text-white/60">
              {peerLive ? `${peerName} is here` : `${peerName} is away — saved for later`}
            </span>
          </p>
        </div>
        {state.started && !state.endedAt && (
          <div className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs">
            <Palette className="size-3.5" />
            {state.scores[myUserId] ?? 0} · {state.scores[peerUserId] ?? 0}
          </div>
        )}
        <button onClick={() => setShowMenu(true)} aria-label="Menu" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <MoreVertical className="size-5" />
        </button>
      </header>

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${state.endedAt ? 'end' : state.phase}-${state.round}-${iAmDrawer}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>

      <Drawer open={showMenu} onOpenChange={setShowMenu}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Draw &amp; Guess</DrawerTitle>
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
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
