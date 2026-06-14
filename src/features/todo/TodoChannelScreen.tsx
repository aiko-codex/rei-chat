import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  GripVertical,
  ListTodo,
  Plus,
  Repeat2,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ChatHeader } from '@/features/chat/ChatHeader';
import { DeadlinePicker } from './DeadlinePicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { SIGNAL_URL } from '@/lib/config';
import { uploadMessage } from '@/lib/message-api';
import { sendPeerMessage } from '@/lib/peer-service';
import { ensureNotifyPermission } from '@/lib/todo-reminders';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { DM_CHANNEL_ID, type Channel, type Message } from '@/lib/types';

/** "2d 3h" / "1h 20m" / "12m" */
function formatSpan(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatMinutes(min: number) {
  return formatSpan(min * 60_000);
}

function formatDeadline(ts: number) {
  return new Date(ts).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** time progress toward the deadline: created→deadline, clamped 0..1 */
function deadlineProgress(item: Message, now: number) {
  const total = (item.deadline ?? 0) - item.sentAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - item.sentAt) / total));
}

const QUICK_SPANS: { label: string; minutes: number }[] = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
];

const REPEAT_MS = { daily: 86_400_000, weekly: 604_800_000 } as const;
const LONG_PRESS_MS = 450;

/** all-done celebration: a brief rose burst, instant under reduced motion */
function CelebrationOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);
  const particles = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    return {
      x: Math.cos(angle) * 90,
      y: Math.sin(angle) * 90,
      emoji: i % 3 === 0 ? '🖤' : i % 3 === 1 ? '🤍' : null,
    };
  });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      data-testid="todo-celebration"
    >
      <div className="relative flex flex-col items-center gap-2">
        {particles.map((p, i) => (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ x: p.x, y: p.y, scale: 1, opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="absolute text-sm"
          >
            {p.emoji ?? <span className="block size-2 rounded-full bg-primary" />}
          </motion.span>
        ))}
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
        >
          All done 🖤
        </motion.p>
      </div>
    </motion.div>
  );
}

function TodoRow({
  item,
  now,
  onToggle,
  onLongPress,
  onRemove,
  onDeadlineChange,
  onRepeatChange,
}: {
  item: Message;
  now: number;
  onToggle: () => void;
  onLongPress: () => void;
  onRemove: () => void;
  onDeadlineChange: (deadline?: number) => void;
  onRepeatChange: (repeat: 'daily' | 'weekly' | undefined) => void;
}) {
  const controls = useDragControls();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const overdue = !item.done && item.deadline !== undefined && now > item.deadline;
  const progress = item.deadline !== undefined ? deadlineProgress(item, now) : 0;

  // sub-label: live countdown for open items, logged time for done ones
  let detail: React.ReactNode = null;
  if (item.done) {
    const verdict =
      item.deadline === undefined || item.completedAt === undefined
        ? ''
        : item.completedAt <= item.deadline
          ? ' · on time'
          : ` · ${formatSpan(item.completedAt - item.deadline)} late`;
    if (item.timeSpent !== undefined || verdict) {
      detail = (
        <span className="text-[11px] text-muted-foreground">
          {item.timeSpent !== undefined ? `worked ${formatMinutes(item.timeSpent)}` : 'done'}
          {verdict}
        </span>
      );
    }
  } else if (item.deadline !== undefined || item.repeat) {
    detail = (
      <span
        className={cn(
          'flex items-center gap-1 text-[11px] [&_svg]:size-3',
          overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {item.repeat && <Repeat2 />}
        {item.repeat && item.deadline === undefined && item.repeat}
        {item.deadline !== undefined &&
          (overdue
            ? `overdue by ${formatSpan(now - item.deadline)}`
            : `${formatSpan(item.deadline - now)} left · due ${formatDeadline(item.deadline)}`)}
      </span>
    );
  }

  const inner = (
    <>
      {!item.done && (
        <span
          onPointerDown={(e) => controls.start(e)}
          aria-hidden
          data-testid={`todo-grip-${item.id}`}
          className="cursor-grab touch-none p-1 text-muted-foreground/30 active:cursor-grabbing [&_svg]:size-4"
        >
          <GripVertical />
        </span>
      )}
      <button
        onClick={() => {
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          onToggle();
        }}
        onPointerDown={() => {
          longPressFired.current = false;
          pressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            onLongPress();
          }, LONG_PRESS_MS);
        }}
        onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
        onPointerMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
        onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress();
        }}
        aria-label={item.done ? `Uncheck ${item.text}` : `Check off ${item.text}`}
        data-testid={`todo-toggle-${item.id}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 py-2.5 text-left select-none"
      >
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors [&_svg]:size-3',
            item.done
              ? 'border-primary bg-primary text-primary-foreground'
              : overdue
                ? 'border-destructive/60'
                : 'border-muted-foreground/40',
          )}
        >
          {item.done && <Check strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm',
              item.done && 'text-muted-foreground line-through',
            )}
          >
            {item.text}
          </span>
          {detail}
          {/* deadline progress: time elapsed since creation, filling toward
              the deadline — the wave only runs while the clock is live */}
          {!item.done && item.deadline !== undefined && (
            <span
              className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted"
              data-testid={`todo-progress-${item.id}`}
            >
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-1000',
                  overdue ? 'bg-destructive' : 'todo-wave',
                )}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          )}
        </span>
      </button>
      {!item.done && (
        <DeadlinePicker
          value={item.deadline}
          onChange={onDeadlineChange}
          repeat={item.repeat}
          onRepeatChange={onRepeatChange}
        >
          <button
            aria-label={
              item.deadline !== undefined
                ? `Edit deadline for ${item.text}`
                : `Set deadline for ${item.text}`
            }
            data-testid={`todo-deadline-${item.id}`}
            className={cn(
              'cursor-pointer p-1.5 transition-colors [&_svg]:size-4',
              item.deadline !== undefined || item.repeat
                ? 'text-primary/70 hover:text-primary'
                : 'text-muted-foreground/40 hover:text-foreground',
            )}
          >
            <CalendarClock />
          </button>
        </DeadlinePicker>
      )}
      <button
        onClick={onRemove}
        aria-label={`Remove ${item.text}`}
        data-testid={`todo-remove-${item.id}`}
        className="cursor-pointer p-1.5 text-muted-foreground/40 transition-colors hover:text-destructive [&_svg]:size-4"
      >
        <X />
      </button>
    </>
  );

  // open items are drag-reorderable via the grip; done items are static rows
  if (item.done) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex items-center gap-1"
        data-testid={`todo-${item.id}`}
      >
        {inner}
      </motion.div>
    );
  }
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex items-center gap-1 bg-background"
      data-testid={`todo-${item.id}`}
    >
      {inner}
    </Reorder.Item>
  );
}

interface TodoChannelScreenProps {
  channel: Channel;
  onBack: () => void;
}

/** device-local checklist — reuses message rows (text + done) so persistence
 *  and channel-delete undo come for free */
export function TodoChannelScreen({ channel, onBack }: TodoChannelScreenProps) {
  const allMessages = useChatStore((s) => s.messages);
  const peerProfile = useChatStore((s) => s.peerProfile);
  const upsert = useChatStore((s) => s.upsert);
  const updateTodo = useChatStore((s) => s.updateTodo);
  const removeLocal = useChatStore((s) => s.remove);

  const [text, setText] = useState('');
  const [pendingDeadline, setPendingDeadline] = useState<number | undefined>();
  const [pendingRepeat, setPendingRepeat] = useState<'daily' | 'weekly' | undefined>();

  // check-off flow: ask how long it took (skippable) before marking done
  const [completeTarget, setCompleteTarget] = useState<Message | null>(null);
  const [spentInput, setSpentInput] = useState({ h: '', m: '' });

  // long-press menu (share to chat / remove)
  const [menuTarget, setMenuTarget] = useState<Message | null>(null);

  const [showDone, setShowDone] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  // countdowns and bars tick along without interaction
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const items = allMessages.filter((m) => m.channelId === channel.id);
  const sortKey = (m: Message) => m.order ?? m.sentAt;
  const openItems = items.filter((i) => !i.done).sort((a, b) => sortKey(a) - sortKey(b));
  const doneItems = items
    .filter((i) => i.done)
    .sort((a, b) => (b.completedAt ?? b.sentAt) - (a.completedAt ?? a.sentAt));
  const doneCount = doneItems.length;
  const peerName = peerProfile?.name ?? 'her';

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    upsert({
      id: `todo-${Date.now()}`,
      channelId: channel.id,
      senderId: 'me',
      text: trimmed,
      sentAt: Date.now(),
      status: 'sent',
      done: false,
      deadline: pendingDeadline,
      repeat: pendingRepeat,
      order: openItems.length > 0 ? Math.max(...openItems.map(sortKey)) + 1 : undefined,
    });
    if (pendingDeadline !== undefined) void ensureNotifyPermission();
    setText('');
    setPendingDeadline(undefined);
    setPendingRepeat(undefined);
    setNow(Date.now());
  };

  const toggle = (item: Message) => {
    if (item.done) {
      // unchecking clears the log — re-completing asks again
      updateTodo(item.id, { done: false, completedAt: undefined, timeSpent: undefined });
    } else {
      setSpentInput({ h: '', m: '' });
      setCompleteTarget(item);
    }
  };

  const completeWith = (timeSpent?: number) => {
    const item = completeTarget;
    if (!item) return;
    updateTodo(item.id, { done: true, completedAt: Date.now(), timeSpent });
    setCompleteTarget(null);

    // recurring chores respawn fresh, deadline advanced past now
    if (item.repeat) {
      let nextDeadline = item.deadline;
      if (nextDeadline !== undefined) {
        while (nextDeadline <= Date.now()) nextDeadline += REPEAT_MS[item.repeat];
      }
      upsert({
        id: `todo-${Date.now()}`,
        channelId: channel.id,
        senderId: 'me',
        text: item.text,
        sentAt: Date.now(),
        status: 'sent',
        done: false,
        deadline: nextDeadline,
        repeat: item.repeat,
      });
      toast(`Repeats ${item.repeat} — back on the list`);
      return;
    }

    // last open task checked off → small celebration
    const remaining = openItems.filter((i) => i.id !== item.id).length;
    if (remaining === 0) setCelebrating(true);
  };

  const customMinutes = () => {
    const h = parseInt(spentInput.h, 10) || 0;
    const m = parseInt(spentInput.m, 10) || 0;
    const total = h * 60 + m;
    return total > 0 ? total : undefined;
  };

  const removeItem = (item: Message) => {
    setMenuTarget(null);
    removeLocal(item.id);
    toast('Task removed', {
      duration: 5000,
      action: { label: 'Undo', onClick: () => upsert(item) },
    });
  };

  /** drop the task into the DM as a normal message */
  const sendToChat = (item: Message) => {
    setMenuTarget(null);
    const message: Message = {
      id: `local-${Date.now()}`,
      channelId: DM_CHANNEL_ID,
      senderId: 'me',
      text: `📝 ${item.text}${item.deadline !== undefined ? ` (due ${formatDeadline(item.deadline)})` : ''}`,
      sentAt: Date.now(),
      status: 'sent',
    };
    upsert(message);
    sendPeerMessage(message);
    if (SIGNAL_URL) void uploadMessage(message);
    toast(`Sent to ${peerName}`);
  };

  const reorder = (next: Message[]) => {
    next.forEach((m, i) => {
      if (m.order !== i) updateTodo(m.id, { order: i });
    });
  };

  return (
    <div className="relative flex h-full flex-col" data-testid="todo-screen">
      <ChatHeader
        title={channel.name}
        subtitle={
          items.length === 0
            ? 'only on this phone'
            : `${doneCount} of ${items.length} done · only on this phone`
        }
        isChannel
        isTodo
        onBack={onBack}
      />

      <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="todo-list">
        {items.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="flex max-w-xs flex-col items-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-7">
                <ListTodo />
              </span>
              <p className="text-sm font-semibold">{channel.name}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Add your first task below — this list lives only on this phone.
              </p>
            </div>
          </div>
        )}

        <Reorder.Group
          axis="y"
          values={openItems}
          onReorder={reorder}
          className="flex flex-col gap-1"
        >
          <AnimatePresence initial={false}>
            {openItems.map((item) => (
              <TodoRow
                key={item.id}
                item={item}
                now={now}
                onToggle={() => toggle(item)}
                onLongPress={() => setMenuTarget(item)}
                onRemove={() => removeItem(item)}
                onDeadlineChange={(deadline) => {
                  updateTodo(item.id, { deadline });
                  if (deadline !== undefined) void ensureNotifyPermission();
                  setNow(Date.now());
                }}
                onRepeatChange={(repeat) => updateTodo(item.id, { repeat })}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>

        {/* completed fold */}
        {doneCount > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowDone((s) => !s)}
              data-testid="completed-fold-btn"
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-1 py-2 text-xs font-medium text-muted-foreground [&_svg]:size-3.5"
            >
              <ChevronDown className={cn('transition-transform', !showDone && '-rotate-90')} />
              Completed · {doneCount}
            </button>
            <AnimatePresence initial={false}>
              {showDone && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                  data-testid="completed-fold"
                >
                  <div className="flex flex-col gap-1">
                    <AnimatePresence initial={false}>
                      {doneItems.map((item) => (
                        <TodoRow
                          key={item.id}
                          item={item}
                          now={now}
                          onToggle={() => toggle(item)}
                          onLongPress={() => setMenuTarget(item)}
                          onRemove={() => removeItem(item)}
                          onDeadlineChange={() => undefined}
                          onRepeatChange={() => undefined}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer
        className="border-t bg-background pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        data-testid="todo-composer"
      >
        {/* pending deadline/repeat chip for the task being typed */}
        <AnimatePresence>
          {(pendingDeadline !== undefined || pendingRepeat) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
              data-testid="deadline-chip"
            >
              <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs">
                {pendingRepeat ? <Repeat2 className="size-3.5 shrink-0 text-primary" /> : <CalendarClock className="size-3.5 shrink-0 text-primary" />}
                <span className="min-w-0 flex-1 truncate">
                  {pendingDeadline !== undefined && `Due ${formatDeadline(pendingDeadline)}`}
                  {pendingDeadline !== undefined && pendingRepeat && ' · '}
                  {pendingRepeat && `repeats ${pendingRepeat}`}
                </span>
                <button
                  onClick={() => {
                    setPendingDeadline(undefined);
                    setPendingRepeat(undefined);
                  }}
                  aria-label="Clear deadline"
                  data-testid="clear-deadline-btn"
                  className="cursor-pointer p-1 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                >
                  <X />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 px-3 py-2.5">
          <DeadlinePicker
            value={pendingDeadline}
            onChange={setPendingDeadline}
            repeat={pendingRepeat}
            onRepeatChange={setPendingRepeat}
            align="start"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Set deadline"
              data-testid="deadline-btn"
              className={cn(
                'cursor-pointer',
                (pendingDeadline !== undefined || pendingRepeat) && 'text-primary',
              )}
            >
              <CalendarClock />
            </Button>
          </DeadlinePicker>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a task"
            className="h-9 rounded-full px-4"
            data-testid="todo-input"
          />
          <Button
            size="icon"
            className="cursor-pointer rounded-full"
            onClick={add}
            disabled={!text.trim()}
            aria-label="Add task"
            data-testid="todo-add-btn"
          >
            <Plus />
          </Button>
        </div>
      </footer>

      {/* time-spent prompt on check-off */}
      <Dialog open={completeTarget !== null} onOpenChange={(open) => !open && setCompleteTarget(null)}>
        <DialogContent data-testid="time-spent-dialog">
          <DialogHeader>
            <DialogTitle>How long did it take?</DialogTitle>
          </DialogHeader>
          <p className="truncate text-sm text-muted-foreground">{completeTarget?.text}</p>
          <div className="flex flex-wrap gap-2" data-testid="time-spent-chips">
            {QUICK_SPANS.map((q) => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                onClick={() => completeWith(q.minutes)}
                className="cursor-pointer rounded-full"
                data-testid={`spent-${q.label}`}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={spentInput.h}
              onChange={(e) => setSpentInput((s) => ({ ...s, h: e.target.value }))}
              placeholder="0"
              aria-label="Hours worked"
              data-testid="spent-hours-input"
              className="h-9 w-16 text-center"
            />
            <span className="text-sm text-muted-foreground">h</span>
            <Input
              type="number"
              min={0}
              max={59}
              inputMode="numeric"
              value={spentInput.m}
              onChange={(e) => setSpentInput((s) => ({ ...s, m: e.target.value }))}
              placeholder="0"
              aria-label="Minutes worked"
              data-testid="spent-minutes-input"
              className="h-9 w-16 text-center"
            />
            <span className="text-sm text-muted-foreground">m</span>
            <Button
              size="sm"
              onClick={() => completeWith(customMinutes())}
              disabled={customMinutes() === undefined}
              className="ml-auto cursor-pointer"
              data-testid="spent-save-btn"
            >
              Save
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => completeWith(undefined)}
              className="cursor-pointer text-muted-foreground"
              data-testid="spent-skip-btn"
            >
              Skip — just mark done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* long-press menu: share / remove */}
      <Drawer open={menuTarget !== null} onOpenChange={(open) => !open && setMenuTarget(null)}>
        <DrawerContent data-testid="todo-action-sheet">
          <DrawerHeader>
            <DrawerTitle className="truncate">{menuTarget?.text}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => menuTarget && sendToChat(menuTarget)}
              data-testid="todo-share-btn"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-muted [&_svg]:size-4"
            >
              <Send /> Send to {peerName}
            </button>
            <button
              onClick={() => menuTarget && removeItem(menuTarget)}
              data-testid="todo-delete-btn"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-destructive transition-colors hover:bg-muted [&_svg]:size-4"
            >
              <Trash2 /> Remove
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <AnimatePresence>
        {celebrating && <CelebrationOverlay onDone={() => setCelebrating(false)} />}
      </AnimatePresence>
    </div>
  );
}
