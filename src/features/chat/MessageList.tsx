import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/store/chat-store';
import { cn } from '@/lib/utils';
import type { Message, UserId } from '@/lib/types';

/** skeleton placeholder bubbles shown while older messages page in (pulse, not
 *  a spinner — feels like content arriving rather than a stall) */
function LoadingOlderSkeleton() {
  const rows = [
    { mine: false, w: 'w-40' },
    { mine: true, w: 'w-28' },
    { mine: false, w: 'w-52' },
  ];
  return (
    <div className="flex flex-col gap-2 py-2" data-testid="loading-older" aria-label="Loading earlier messages">
      {rows.map((r, i) => (
        <div key={i} className={cn('flex w-full', r.mine ? 'justify-end' : 'justify-start')}>
          <div
            className={cn(
              'h-9 animate-pulse rounded-2xl bg-muted',
              r.w,
              r.mine ? 'rounded-br-md' : 'rounded-bl-md',
            )}
          />
        </div>
      ))}
    </div>
  );
}

/** how close to the bottom (px) still counts as "reading the latest" */
const NEAR_BOTTOM_PX = 120;

/** render only the most recent N messages; reveal another page on scroll-up */
const PAGE_SIZE = 30;
/** start loading older messages when the user scrolls within this of the top */
const LOAD_MORE_PX = 300;

/** Instagram-style typing bubble: three dots pulsing in sequence */
function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.9 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="flex w-full justify-start"
      data-testid="typing-bubble"
    >
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18, ease: 'easeInOut' }}
            className="size-1.5 rounded-full bg-muted-foreground"
          />
        ))}
      </div>
    </motion.div>
  );
}

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

interface MessageListProps {
  messages: Message[];
  currentUserId: UserId;
  peerTyping?: boolean;
  onLongPress: (message: Message) => void;
  onOpenImage: (message: Message) => void;
  onRetry?: (message: Message) => void;
  /** double-tap a message to toggle the default reaction */
  onDoubleTapReact?: (message: Message) => void;
  /** swipe a message right to quick-reply */
  onSwipeReply?: (message: Message) => void;
  /** fired when the user is genuinely viewing the latest message (at the bottom) */
  onViewedBottom?: () => void;
  /** shown centered when the channel has no messages yet */
  emptyState?: React.ReactNode;
  /** chat wallpaper applied behind the messages (sits under opaque bubbles) */
  backgroundStyle?: React.CSSProperties;
  /** id of a message to scroll to + highlight; re-fires when jumpNonce changes */
  jumpToId?: string | null;
  /** bump to re-trigger a jump to the same id (e.g. tapping a search result) */
  jumpNonce?: number;
}

export function MessageList({
  messages,
  currentUserId,
  peerTyping,
  onLongPress,
  onOpenImage,
  onRetry,
  onDoubleTapReact,
  onSwipeReply,
  onViewedBottom,
  emptyState,
  backgroundStyle,
  jumpToId,
  jumpNonce,
}: MessageListProps) {
  const displayName = useChatStore((s) => s.displayName);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [unseenBelow, setUnseenBelow] = useState(0);

  // windowed rendering: only mount the most recent `visibleCount` messages so a
  // 3000-message history doesn't create 3000 DOM nodes. Scrolling near the top
  // reveals another page; the messages themselves are already in memory.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // distance-from-bottom captured before prepending older rows, so we can pin
  // the viewport in place once the taller content lays out (no scroll jump)
  const restoreFromBottom = useRef<number | null>(null);

  const loadOlder = () => {
    const el = containerRef.current;
    if (!el || restoreFromBottom.current !== null) return;
    if (visibleCount >= messages.length) return;
    restoreFromBottom.current = el.scrollHeight - el.scrollTop;
    setVisibleCount((c) => Math.min(messages.length, c + PAGE_SIZE));
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el && restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
    }
  }, [visibleCount]);

  // keep the latest callback without retriggering the scroll effects
  const viewedBottomRef = useRef(onViewedBottom);
  viewedBottomRef.current = onViewedBottom;
  const notifyViewedBottom = () => {
    if (document.visibilityState === 'visible') viewedBottomRef.current?.();
  };

  const isNearBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    setUnseenBelow(0);
  };

  const rafs = useRef<number[]>([]);
  // opening the channel always starts pinned to the absolute latest message.
  // useLayoutEffect runs before paint, and we re-pin on the next frames to
  // catch late layout shifts (status line, reactions, avatars, media) that
  // would otherwise leave us a few messages short of the bottom.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const el = containerRef.current;
    const pin = () => {
      if (el) el.scrollTop = el.scrollHeight;
    };
    pin();
    const r1 = requestAnimationFrame(() => {
      pin();
      const r2 = requestAnimationFrame(pin);
      rafs.current.push(r2);
    });
    rafs.current.push(r1);
    mounted.current = true;
    // opening the channel lands us on the latest message → we've seen it
    notifyViewedBottom();
    return () => rafs.current.forEach(cancelAnimationFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // after mount, auto-scroll only when it doesn't steal the reading
  // position: always for my own sends, otherwise only when already near the
  // bottom. Incoming messages while scrolled up surface as a pill instead.
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (!lastMessage || !mounted.current) return;
    if (lastMessage.senderId === currentUserId || isNearBottom()) {
      scrollToBottom();
      // a new message arrived while we're at the bottom → we've seen it
      if (lastMessage.senderId !== currentUserId) notifyViewedBottom();
    } else {
      setUnseenBelow((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.id]);

  useEffect(() => {
    if (peerTyping && isNearBottom()) scrollToBottom();
  }, [peerTyping]);

  const jumpTo = (id: string) => {
    // the quoted message may be older than the current window — reveal enough
    // pages to include it before scrolling
    const idx = byIndex.get(id);
    if (idx !== undefined && idx < messages.length - visibleCount) {
      setVisibleCount(messages.length - idx + PAGE_SIZE);
    }
    setHighlightId(id);
    // wait a tick for the newly-revealed rows to mount, then scroll
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setTimeout(() => setHighlightId(null), 1200);
  };

  // jump to a message requested from outside (e.g. tapping a search result).
  // keep the latest jumpTo in a ref so the effect only fires on a new request.
  const jumpToRef = useRef(jumpTo);
  jumpToRef.current = jumpTo;
  useEffect(() => {
    if (jumpToId) jumpToRef.current(jumpToId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpNonce]);

  const byId = new Map(messages.map((m) => [m.id, m]));
  const byIndex = new Map(messages.map((m, i) => [m.id, i]));

  // only render the tail window; older rows mount as the user scrolls up
  const startIndex = Math.max(0, messages.length - visibleCount);
  const windowed = messages.slice(startIndex);

  // iMessage-style status word ("Sent"/"Delivered"/"Seen") shows under the
  // most-recent outgoing message only, not on every bubble.
  let lastOwnId: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].senderId === currentUserId) {
      lastOwnId = messages[i].id;
      break;
    }
  }

  return (
    <div className="relative min-h-0 flex-1" style={backgroundStyle}>
      <div
        ref={containerRef}
        onScroll={() => {
          const el = containerRef.current;
          if (el && el.scrollTop < LOAD_MORE_PX) loadOlder();
          if (isNearBottom()) {
            if (unseenBelow > 0) setUnseenBelow(0);
            // scrolled down to the latest → mark as seen
            notifyViewedBottom();
          }
        }}
        className="h-full overflow-y-auto px-4 py-3"
        data-testid="message-list"
      >
      {messages.length === 0 && !peerTyping && emptyState && (
        <div className="flex h-full items-center justify-center" data-testid="chat-empty-state">
          {emptyState}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {startIndex > 0 && <LoadingOlderSkeleton />}
        {windowed.map((msg) => {
          // grouping/day-labels resolve against the full array, not the window,
          // so the boundary row keeps the correct header + tail spacing
          const i = byIndex.get(msg.id)!;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.sentAt) !== dayLabel(msg.sentAt);
          const isGroupEnd = !next || next.senderId !== msg.senderId;
          const replyTo = msg.replyToId ? byId.get(msg.replyToId) : undefined;
          return (
            <div
              key={msg.id}
              className={isGroupEnd ? 'mb-2' : undefined}
              ref={(el) => {
                if (el) rowRefs.current.set(msg.id, el);
                else rowRefs.current.delete(msg.id);
              }}
            >
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {dayLabel(msg.sentAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isMine={msg.senderId === currentUserId}
                isLastOwn={msg.id === lastOwnId}
                isGroupEnd={isGroupEnd}
                replyTo={replyTo}
                replyToName={replyTo ? displayName(replyTo.senderId) : undefined}
                highlighted={highlightId === msg.id}
                onLongPress={onLongPress}
                onOpenImage={onOpenImage}
                onQuoteClick={jumpTo}
                onRetry={onRetry}
                onDoubleTapReact={onDoubleTapReact}
                onSwipeReply={onSwipeReply}
              />
            </div>
          );
        })}
        <AnimatePresence>{peerTyping && <TypingBubble />}</AnimatePresence>
        <div ref={bottomRef} />
      </div>
      </div>

      {/* new-messages pill: appears when messages arrive while scrolled up */}
      <AnimatePresence>
        {unseenBelow > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => scrollToBottom()}
            data-testid="new-messages-pill"
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow-sm [&_svg]:size-3.5"
          >
            {unseenBelow === 1 ? 'New message' : `${unseenBelow} new messages`}
            <ChevronDown />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
