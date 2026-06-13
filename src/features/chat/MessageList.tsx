import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/store/chat-store';
import type { Message, UserId } from '@/lib/types';

/** how close to the bottom (px) still counts as "reading the latest" */
const NEAR_BOTTOM_PX = 120;

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
  /** shown centered when the channel has no messages yet */
  emptyState?: React.ReactNode;
}

export function MessageList({
  messages,
  currentUserId,
  peerTyping,
  onLongPress,
  onOpenImage,
  onRetry,
  emptyState,
}: MessageListProps) {
  const displayName = useChatStore((s) => s.displayName);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [unseenBelow, setUnseenBelow] = useState(0);

  const isNearBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    setUnseenBelow(0);
  };

  // opening the channel always starts at the latest message, instantly
  const mounted = useRef(false);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    mounted.current = true;
  }, []);

  // after mount, auto-scroll only when it doesn't steal the reading
  // position: always for my own sends, otherwise only when already near the
  // bottom. Incoming messages while scrolled up surface as a pill instead.
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (!lastMessage || !mounted.current) return;
    if (lastMessage.senderId === currentUserId || isNearBottom()) {
      scrollToBottom();
    } else {
      setUnseenBelow((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.id]);

  useEffect(() => {
    if (peerTyping && isNearBottom()) scrollToBottom();
  }, [peerTyping]);

  const jumpTo = (id: string) => {
    rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1200);
  };

  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={() => {
          if (unseenBelow > 0 && isNearBottom()) setUnseenBelow(0);
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
        {messages.map((msg, i) => {
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
                isGroupEnd={isGroupEnd}
                replyTo={replyTo}
                replyToName={replyTo ? displayName(replyTo.senderId) : undefined}
                highlighted={highlightId === msg.id}
                onLongPress={onLongPress}
                onOpenImage={onOpenImage}
                onQuoteClick={jumpTo}
                onRetry={onRetry}
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
