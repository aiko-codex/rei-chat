/**
 * Bingo ("Line25") — a dedicated, full-screen two-player strategy space.
 * Each player gets a uniquely shuffled 1-25 board; a called number marks
 * that number on BOTH boards; first to complete 5 lines wins. See
 * lib/bingo.ts for the rules adapted to this app's no-WebSocket sync model
 * and store/bingo-store.ts for the conv_meta transport.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Grid3x3, MoreVertical, RotateCcw, Star, Timer } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useBingoStore } from '@/store/bingo-store';
import { BOARD_CELLS, TARGET_LINES, TURN_SECONDS, completedLineCells } from '@/lib/bingo';

interface Props {
  connectionId: string;
  peerUserId: string;
  onBack: () => void;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: TARGET_LINES }, (_, i) => (
        <Star key={i} className={cn('size-3.5', i < count ? 'fill-amber-300 text-amber-300' : 'text-white/20')} />
      ))}
    </span>
  );
}

export function BingoScreen({ connectionId, peerUserId, onBack }: Props) {
  const enter = useBingoStore((s) => s.enter);
  const leave = useBingoStore((s) => s.leave);
  const state = useBingoStore((s) => s.state);
  const myUserId = useBingoStore((s) => s.myUserId);
  const peerLive = useBingoStore((s) => s.peerLive);
  const startGame = useBingoStore((s) => s.startGame);
  const callNumber = useBingoStore((s) => s.callNumber);
  const restart = useBingoStore((s) => s.restart);

  const peerName = useChatStore((s) => s.connectionPeers[connectionId]?.displayName) || 'Her';

  const [showMenu, setShowMenu] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);

  useEffect(() => {
    enter(connectionId, peerUserId);
    return () => leave();
  }, [connectionId, peerUserId, enter, leave]);

  // 15s turn timer — only the player on the clock runs it and auto-picks on expiry
  useEffect(() => {
    if (!state || !state.started || state.winner) return;
    const iAmTurn = state.turn === myUserId;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - state.turnStartedAt) / 1000);
      const left = Math.max(0, TURN_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left <= 0 && iAmTurn) {
        const remaining = Array.from({ length: BOARD_CELLS }, (_, i) => i + 1).filter(
          (n) => !state.calledNumbers.includes(n),
        );
        if (remaining.length) callNumber(remaining[Math.floor(Math.random() * remaining.length)]);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [state, myUserId, callNumber]);

  if (!state) {
    return <div className="flex h-full items-center justify-center bg-neutral-950 text-white/60">Opening…</div>;
  }

  const iAmTurn = state.turn === myUserId;
  const myBoard = state.boards[myUserId] ?? [];
  const calledSet = new Set(state.calledNumbers);
  const highlightCells = completedLineCells(myBoard, calledSet);
  const remaining = Array.from({ length: BOARD_CELLS }, (_, i) => i + 1).filter((n) => !calledSet.has(n));
  const lastCalled = state.calledNumbers[state.calledNumbers.length - 1];

  let body: React.ReactNode;

  if (state.endedAt && state.winner) {
    const won = state.winner === myUserId;
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-5xl">
          {won ? '🏆' : '🎯'}
        </motion.div>
        <div>
          <p className="text-2xl font-semibold text-white">{won ? 'Victory!' : 'Defeat'}</p>
          <p className="mt-1 text-sm text-white/60">
            {won ? 'You completed 5 lines first.' : `${peerName} completed 5 lines first.`}
          </p>
        </div>
        <div className="flex w-full max-w-xs items-center justify-around rounded-2xl bg-white/5 p-5">
          <div>
            <p className="text-3xl font-bold text-emerald-300">{state.lines[myUserId] ?? 0}</p>
            <p className="text-xs text-white/50">You</p>
          </div>
          <span className="text-white/30">vs</span>
          <div>
            <p className="text-3xl font-bold text-white">{state.lines[peerUserId] ?? 0}</p>
            <p className="text-xs text-white/50">{peerName}</p>
          </div>
        </div>
        <button
          onClick={restart}
          className="cursor-pointer rounded-full bg-emerald-600 px-8 py-3 font-semibold text-white shadow-lg hover:bg-emerald-500"
          data-testid="bingo-play-again"
        >
          Play again
        </button>
      </div>
    );
  } else if (!state.started) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-8 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Grid3x3 className="size-12 text-emerald-400" />
        </motion.div>
        <div>
          <h1 className="text-3xl font-bold text-white">Bingo</h1>
          <p className="mt-2 text-sm text-white/60">
            You each get a shuffled 1-25 board. Take turns calling a number — first to 5 lines wins.
          </p>
        </div>
        <button
          onClick={startGame}
          className="w-full max-w-sm cursor-pointer rounded-full bg-emerald-600 py-4 text-lg font-semibold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500"
          data-testid="bingo-start"
        >
          Start playing
        </button>
        <p className="text-xs text-white/40">We'll flip a coin for who calls first.</p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {/* opponent status */}
        <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5">
          <div>
            <p className="text-xs text-white/50">{peerName}</p>
            <Stars count={state.lines[peerUserId] ?? 0} />
          </div>
          <p className="text-xs text-white/50">
            {(state.lines[peerUserId] ?? 0)}/{TARGET_LINES} lines
          </p>
        </div>

        {/* current number + turn indicator */}
        <div className="flex flex-col items-center gap-1.5 py-1">
          <p className={cn('flex items-center gap-1.5 text-xs font-medium', iAmTurn ? 'text-emerald-300' : 'text-white/50')}>
            <Timer className="size-3.5" />
            {iAmTurn ? `Your turn · ${secondsLeft}s` : `${peerName}'s turn · ${secondsLeft}s`}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={lastCalled ?? 'none'}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="flex size-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl font-bold text-emerald-300 ring-2 ring-emerald-400/40"
            >
              {lastCalled ?? '–'}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* my board */}
        <div className="mx-auto grid w-full max-w-[280px] grid-cols-5 gap-1.5">
          {myBoard.map((num, i) => {
            const marked = calledSet.has(num);
            const inLine = highlightCells.has(i);
            return (
              <div
                key={i}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg text-sm font-semibold transition-all',
                  inLine
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                    : marked
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : 'bg-white/5 text-white/70',
                )}
              >
                {num}
              </div>
            );
          })}
        </div>

        {/* remaining numbers to call */}
        <div className="mt-1">
          <p className="mb-1.5 text-center text-[11px] uppercase tracking-widest text-white/40">
            {iAmTurn ? 'Pick a number' : 'Waiting…'}
          </p>
          <div className="mx-auto grid max-w-sm grid-cols-5 gap-1.5">
            {remaining.map((n) => (
              <button
                key={n}
                onClick={() => iAmTurn && callNumber(n)}
                disabled={!iAmTurn}
                data-testid={`bingo-number-${n}`}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  iAmTurn
                    ? 'cursor-pointer bg-white/10 text-white hover:bg-emerald-500/40 active:scale-95'
                    : 'cursor-not-allowed bg-white/5 text-white/30',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark relative flex h-full flex-col overflow-hidden bg-neutral-950 text-white" data-testid="bingo-screen">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-emerald-500/15 via-teal-500/8 to-transparent" />
      <div className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-emerald-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center gap-2 px-2 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button onClick={onBack} aria-label="Back" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Bingo</p>
          <p className="flex items-center gap-1.5 text-xs">
            <span className={`size-1.5 rounded-full ${peerLive ? 'bg-emerald-400' : 'bg-white/30'}`} />
            <span className="text-white/60">
              {peerLive ? `${peerName} is here` : `${peerName} is away — saved for later`}
            </span>
          </p>
        </div>
        {state.started && !state.winner && (
          <div className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs">
            {(state.lines[myUserId] ?? 0)} · {(state.lines[peerUserId] ?? 0)}
          </div>
        )}
        <button onClick={() => setShowMenu(true)} aria-label="Menu" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <MoreVertical className="size-5" />
        </button>
      </header>

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.endedAt ? 'end' : state.started ? 'playing' : 'lobby'}
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
            <DrawerTitle>Bingo</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {state.started && !state.winner && (
              <button
                onClick={() => {
                  restart();
                  setShowMenu(false);
                }}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted [&_svg]:size-4.5"
              >
                <RotateCcw />
                <span className="text-sm font-medium">Restart game</span>
              </button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
