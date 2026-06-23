import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarHeart, ChevronLeft, Plus, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { DATE_ICONS, dateIcon, daysUntil, nextOccurrence } from '@/lib/important-dates';
import type { ImportantDate } from '@/lib/types';

interface ChatDatesPanelProps {
  channelId: string;
  onBack: () => void;
}

function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days < 30) return `in ${days}d`;
  if (days < 365) return `in ${Math.round(days / 30)}mo`;
  return `in ${Math.round(days / 365)}y`;
}

function emptyDraft(): ImportantDate {
  return { id: crypto.randomUUID(), title: '', date: Date.now(), icon: 'heart', repeatYearly: false, updatedAt: 0 };
}

export function ChatDatesPanel({ channelId, onBack }: ChatDatesPanelProps) {
  const dates = useChatStore((s) => s.datesByChannel[channelId]) ?? [];
  const loadDatesFor = useChatStore((s) => s.loadDatesFor);
  const setImportantDate = useChatStore((s) => s.setImportantDate);
  const removeImportantDate = useChatStore((s) => s.removeImportantDate);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ImportantDate>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    loadDatesFor(channelId);
  }, [channelId, loadDatesFor]);

  const now = Date.now();
  const sorted = useMemo(() => {
    return [...dates].sort((a, b) => nextOccurrence(a, now) - nextOccurrence(b, now));
  }, [dates, now]);
  const upcoming = sorted.filter((d) => daysUntil(nextOccurrence(d, now), now) >= 0);
  const past = sorted.filter((d) => daysUntil(nextOccurrence(d, now), now) < 0).reverse();

  const openAdd = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setSheetOpen(true);
  };

  const openEdit = (entry: ImportantDate) => {
    setDraft(entry);
    setEditingId(entry.id);
    setSheetOpen(true);
  };

  const save = () => {
    if (!draft.title.trim()) {
      toast.error('Give it a title first');
      return;
    }
    setImportantDate(channelId, { ...draft, title: draft.title.trim(), updatedAt: Date.now() });
    setSheetOpen(false);
    toast.success(editingId ? 'Date updated' : 'Date added');
  };

  const remove = () => {
    if (!editingId) return;
    removeImportantDate(channelId, editingId);
    setSheetOpen(false);
    toast('Removed');
  };

  return (
    <div className="relative flex h-full flex-col" data-testid="chat-dates-panel">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="dates-back">
          <ChevronLeft />
        </Button>
        <p className="flex-1 text-sm font-semibold">Important dates</p>
        <motion.div whileTap={{ scale: 0.88 }}>
          <Button variant="ghost" size="icon" className="cursor-pointer" onClick={openAdd} aria-label="Add date" data-testid="dates-add">
            <Plus />
          </Button>
        </motion.div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {sorted.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 px-6 py-16 text-center"
          >
            <CalendarHeart className="size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">No important dates yet</p>
            <p className="text-xs text-muted-foreground">
              Anniversaries, birthdays, trips — keep the ones that matter to you both.
            </p>
            <Button className="mt-2 cursor-pointer" onClick={openAdd} data-testid="dates-add-empty">
              Add your first date
            </Button>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-6">
            {upcoming.length > 0 && (
              <DateGroup label="Upcoming" entries={upcoming} now={now} onTap={openEdit} />
            )}
            {past.length > 0 && (
              <DateGroup label="Past" entries={past} now={now} onTap={openEdit} faded />
            )}
          </div>
        )}
      </div>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent data-testid="date-edit-sheet">
          <DrawerHeader className="pb-1">
            <DrawerTitle className="text-base">{editingId ? 'Edit date' : 'New important date'}</DrawerTitle>
          </DrawerHeader>

          <div className="flex flex-col gap-5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
            <Input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. Our anniversary"
              maxLength={50}
              className="h-12 rounded-xl text-base"
              data-testid="date-title-input"
            />

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Icon</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {DATE_ICONS.map(({ id, icon: Icon, label }) => {
                  const selected = draft.icon === id;
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      aria-label={label}
                      onClick={() => setDraft((d) => ({ ...d, icon: id }))}
                      whileTap={{ scale: 0.88 }}
                      animate={{ scale: selected ? 1.06 : 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      data-testid={`date-icon-${id}`}
                      className={cn(
                        'flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors',
                        selected
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="size-5" />
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    data-testid="date-picker-trigger"
                    className="flex h-12 flex-1 cursor-pointer items-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-medium"
                  >
                    <CalendarHeart className="size-4 text-muted-foreground" />
                    {format(new Date(draft.date), 'MMM d, yyyy')}
                  </motion.button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(draft.date)}
                    defaultMonth={new Date(draft.date)}
                    captionLayout="dropdown"
                    onSelect={(d) => {
                      if (d) setDraft((cur) => ({ ...cur, date: d.getTime() }));
                      setCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>

              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setDraft((d) => ({ ...d, repeatYearly: !d.repeatYearly }))}
                aria-pressed={draft.repeatYearly}
                data-testid="date-repeat-toggle"
                className={cn(
                  'flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors',
                  draft.repeatYearly
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <Repeat className="size-4" />
                Yearly
              </motion.button>
            </div>

            <div className="flex gap-2 pt-1">
              {editingId && (
                <motion.div whileTap={{ scale: 0.96 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-12 cursor-pointer text-destructive hover:text-destructive"
                    onClick={remove}
                    aria-label="Delete date"
                    data-testid="date-delete-btn"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </motion.div>
              )}
              <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
                <Button className="h-12 w-full cursor-pointer rounded-xl text-base" onClick={save} data-testid="date-save-btn">
                  {editingId ? 'Save' : 'Add date'}
                </Button>
              </motion.div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DateGroup({
  label,
  entries,
  now,
  onTap,
  faded,
}: {
  label: string;
  entries: ImportantDate[];
  now: number;
  onTap: (entry: ImportantDate) => void;
  faded?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn('flex flex-col gap-1.5', faded && 'opacity-60')}>
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const Icon = dateIcon(entry.icon);
            const occ = nextOccurrence(entry, now);
            const days = daysUntil(occ, now);
            const isToday = days === 0;
            return (
              <motion.button
                key={entry.id}
                type="button"
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                onClick={() => onTap(entry)}
                data-testid={`date-row-${entry.id}`}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{entry.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {format(new Date(occ), 'MMM d')}
                    {entry.repeatYearly && ' · every year'}
                  </span>
                </span>
                <motion.span
                  animate={isToday ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={isToday ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                    isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {countdownLabel(days)}
                </motion.span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
