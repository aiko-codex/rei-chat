import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { EMOJI_CATEGORIES, searchEmojis } from '@/lib/emoji-data';
import { DEFAULT_REACTIONS } from '@/lib/reactions';

interface ReactionEmojiSheetProps {
  open: boolean;
  onClose: () => void;
  /** react to the message with any chosen emoji (react mode) */
  onReact: (emoji: string) => void;
}

/** scrollable emoji grid with a search box + category tabs */
function EmojiBrowser({ onPick }: { onPick: (emoji: string) => void }) {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id);

  const results = useMemo(() => (search ? searchEmojis(search) : null), [search]);
  const category = EMOJI_CATEGORIES.find((c) => c.id === activeCat) ?? EMOJI_CATEGORIES[0];
  const emojis = results ?? category.emojis.map(([e]) => e);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-4 pb-2">
        <Search className="absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-10 rounded-full bg-muted pl-9"
          data-testid="emoji-search"
        />
      </div>

      {!results && (
        <div className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              aria-label={c.label}
              data-testid={`emoji-cat-${c.id}`}
              className={cn(
                'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg transition-colors',
                activeCat === c.id ? 'bg-primary/15' : 'hover:bg-muted',
              )}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {emojis.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No emoji found</p>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {emojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => onPick(emoji)}
                data-testid={`emoji-${emoji}`}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-lg text-2xl transition-transform hover:scale-110 hover:bg-muted active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReactionEmojiSheet({ open, onClose, onReact }: ReactionEmojiSheetProps) {
  const quickReactions = useChatStore((s) => s.quickReactions);
  const setQuickReactions = useChatStore((s) => s.setQuickReactions);

  const [mode, setMode] = useState<'react' | 'customise'>('react');
  const [selectedSlot, setSelectedSlot] = useState(0);

  // each fresh open starts on the react step
  useEffect(() => {
    if (open) {
      setMode('react');
      setSelectedSlot(0);
    }
  }, [open]);

  const react = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  const replaceSlot = (emoji: string) => {
    const next = [...quickReactions];
    next[selectedSlot] = emoji;
    setQuickReactions(next);
    // advance to the next slot so you can rattle through all six
    setSelectedSlot((s) => (s + 1) % quickReactions.length);
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="h-[80vh]" data-testid="reaction-emoji-sheet">
        {mode === 'react' ? (
          <>
            <DrawerHeader className="flex-row items-center justify-between pb-2">
              <DrawerTitle className="text-base">Your reactions</DrawerTitle>
              <button
                onClick={() => setMode('customise')}
                className="cursor-pointer text-sm font-medium text-primary"
                data-testid="reactions-customise-btn"
              >
                Customise
              </button>
            </DrawerHeader>
            <div className="flex justify-between gap-1 px-4 pb-3">
              {quickReactions.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => react(emoji)}
                  data-testid={`quick-react-${i}`}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-full text-2xl transition-transform hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <EmojiBrowser onPick={react} />
          </>
        ) : (
          <>
            <DrawerHeader className="flex-row items-center justify-between pb-2">
              <button
                onClick={() => setQuickReactions([...DEFAULT_REACTIONS])}
                className="cursor-pointer text-sm font-medium text-muted-foreground"
                data-testid="reactions-reset-btn"
              >
                Reset
              </button>
              <DrawerTitle className="text-base">Customise reactions</DrawerTitle>
              <button
                onClick={() => setMode('react')}
                className="cursor-pointer text-sm font-medium text-primary"
                data-testid="reactions-done-btn"
              >
                Done
              </button>
            </DrawerHeader>
            <div className="mx-4 mb-1 flex justify-between gap-1 rounded-full border bg-popover px-2 py-1.5">
              {quickReactions.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSlot(i)}
                  aria-pressed={selectedSlot === i}
                  data-testid={`reaction-slot-${i}`}
                  className={cn(
                    'flex size-10 cursor-pointer items-center justify-center rounded-full text-2xl transition-all',
                    selectedSlot === i ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="px-4 pb-2 text-center text-xs text-muted-foreground">
              Tap a reaction, then choose an emoji to replace it. The first is your double-tap
              reaction.
            </p>
            <EmojiBrowser onPick={replaceSlot} />
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
