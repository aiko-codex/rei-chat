import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Pencil, Plus, Reply, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { ReactionEmojiSheet } from './ReactionEmojiSheet';
import type { Message } from '@/lib/types';

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  slideKey: string;
  hovered: boolean;
  destructive?: boolean;
  onClick: () => void;
  testId: string;
}

function ActionRow({ icon, label, slideKey, hovered, destructive, onClick, testId }: ActionRowProps) {
  return (
    <motion.button
      onClick={onClick}
      data-testid={testId}
      data-slide-key={slideKey}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-[15px] transition-colors active:bg-muted [&_svg]:size-[18px]',
        hovered && 'bg-muted',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      <span className="font-medium">{label}</span>
      <span className={destructive ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
    </motion.button>
  );
}

export interface MessageActionsProps {
  message: Message | null;
  isMine: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDeleteForMe: () => void;
  onUnsend: () => void;
}

export function MessageActions({
  message,
  isMine,
  onClose,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDeleteForMe,
  onUnsend,
}: MessageActionsProps) {
  const quickReactions = useChatStore((s) => s.quickReactions);
  // which option the finger is currently over during a slide gesture
  const [hovered, setHovered] = useState<string | null>(null);
  // the "react with any emoji" / customise sheet
  const [pickerOpen, setPickerOpen] = useState(false);

  // each fresh open resets the picker
  useEffect(() => {
    if (!message) setPickerOpen(false);
  }, [message]);

  // resolve a slide key → its action; kept in a ref so the gesture listeners
  // (attached once per open) always see the latest handlers
  const fireRef = useRef<(key: string) => void>(() => {});
  fireRef.current = (key: string) => {
    if (key.startsWith('react:')) onReact(key.slice('react:'.length));
    else if (key === 'more') setPickerOpen(true);
    else if (key === 'reply') onReply();
    else if (key === 'copy') onCopy();
    else if (key === 'edit') onEdit();
    else if (key === 'delete') onDeleteForMe();
    else if (key === 'unsend') onUnsend();
  };

  // while the menu is open, run the press-and-slide-to-select gesture. The
  // original long-press touch is still down but its events stay bound to the
  // bubble, so we track on document. TOUCH is driven by touch events (we
  // preventDefault them, which also kills background scroll AND stops the
  // browser from pan-cancelling the pointer); MOUSE/pen uses pointer events.
  useEffect(() => {
    // no slide gesture / scroll-lock while the emoji sheet is open (it needs
    // to scroll); the slide only matters during the initial long-press anyway
    if (!message || pickerOpen) return;
    let current: string | null = null;
    const setHover = (k: string | null) => {
      if (k === current) return;
      current = k;
      setHovered(k);
    };

    const keyUnder = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      const item = el?.closest('[data-slide-key]') as HTMLElement | null;
      return item?.dataset.slideKey ?? null;
    };

    const cleanup = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    // fire the option the finger lifted on; swallow the trailing ghost click so
    // the option doesn't also trigger via its onClick (double-fire)
    const finish = () => {
      const key = current;
      setHover(null);
      if (!key) return; // released on empty space → leave open for tap mode
      const killClick = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        window.removeEventListener('click', killClick, true);
      };
      window.addEventListener('click', killClick, true);
      setTimeout(() => window.removeEventListener('click', killClick, true), 400);
      fireRef.current(key);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // no background scroll + keeps the touch alive
      const t = e.touches[0];
      if (t) setHover(keyUnder(t.clientX, t.clientY));
    };
    const onTouchEnd = () => {
      cleanup();
      finish();
    };
    const onTouchCancel = () => {
      cleanup();
      setHover(null);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // touch handled above
      if (e.buttons !== 1) return; // only while the button is held (a drag)
      setHover(keyUnder(e.clientX, e.clientY));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      cleanup();
      finish();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchCancel);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return cleanup;
  }, [message, pickerOpen]);

  const myReaction = message?.reactions?.me;

  return (
    <>
    <AnimatePresence>
      {message && !pickerOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-20 flex touch-none flex-col items-center justify-center gap-3 overscroll-none bg-background/70 px-6 backdrop-blur-md select-none"
          onClick={onClose}
          data-testid="message-actions-overlay"
        >
          {/* reaction bar */}
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-0.5 rounded-full border bg-popover px-1.5 py-1.5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="reaction-bar"
          >
            {quickReactions.map((emoji, i) => {
              const key = `react:${emoji}`;
              const selected = myReaction === emoji;
              const isHovered = hovered === key;
              return (
                <motion.button
                  key={i}
                  onClick={() => onReact(emoji)}
                  aria-label={`React ${emoji}`}
                  aria-pressed={selected}
                  data-testid={`react-${emoji}`}
                  data-slide-key={key}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: isHovered ? 1.35 : 1, y: isHovered ? -6 : 0 }}
                  transition={{ delay: isHovered ? 0 : 0.03 * i, type: 'spring', stiffness: 600, damping: 22 }}
                  whileTap={{ scale: 0.85 }}
                  className={cn(
                    'flex size-10 cursor-pointer items-center justify-center rounded-full text-2xl transition-colors hover:scale-110',
                    (selected || isHovered) && 'bg-primary/15',
                  )}
                >
                  {emoji}
                </motion.button>
              );
            })}
            <motion.button
              onClick={() => setPickerOpen(true)}
              aria-label="More reactions"
              data-testid="react-more"
              data-slide-key="more"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: hovered === 'more' ? 1.2 : 1 }}
              transition={{ delay: hovered === 'more' ? 0 : 0.03 * quickReactions.length, type: 'spring', stiffness: 600, damping: 22 }}
              whileTap={{ scale: 0.85 }}
              className={cn(
                'flex size-10 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 [&_svg]:size-5',
                hovered === 'more' && 'bg-primary/15 text-primary',
              )}
            >
              <Plus />
            </motion.button>
          </motion.div>

          {/* the message being acted on */}
          <div
            className={cn(
              'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-lg',
              isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {message.media ? (
              message.media.kind === 'image' ? (
                <img src={message.media.url} alt="" className="max-h-40 rounded-xl object-cover" />
              ) : (
                <p className="italic opacity-80">{message.media.kind}</p>
              )
            ) : (
              <p className="line-clamp-4">{message.text}</p>
            )}
          </div>

          {/* action menu */}
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-60 overflow-hidden rounded-2xl border bg-popover shadow-xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="message-action-menu"
          >
            <div className="divide-y divide-border/70">
              <ActionRow
                icon={<Reply />}
                label="Reply"
                slideKey="reply"
                hovered={hovered === 'reply'}
                onClick={onReply}
                testId="action-reply"
              />
              {message.text && (
                <ActionRow
                  icon={<Copy />}
                  label="Copy"
                  slideKey="copy"
                  hovered={hovered === 'copy'}
                  onClick={onCopy}
                  testId="action-copy"
                />
              )}
              {isMine && message.text && !message.media && (
                <ActionRow
                  icon={<Pencil />}
                  label="Edit"
                  slideKey="edit"
                  hovered={hovered === 'edit'}
                  onClick={onEdit}
                  testId="action-edit"
                />
              )}
              <ActionRow
                icon={<Trash2 />}
                label="Delete for you"
                slideKey="delete"
                hovered={hovered === 'delete'}
                destructive
                onClick={onDeleteForMe}
                testId="action-delete"
              />
              {isMine && (
                <ActionRow
                  icon={<Undo2 />}
                  label="Unsend"
                  slideKey="unsend"
                  hovered={hovered === 'unsend'}
                  destructive
                  onClick={onUnsend}
                  testId="action-unsend"
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <ReactionEmojiSheet
      open={pickerOpen && !!message}
      onClose={() => setPickerOpen(false)}
      onReact={onReact}
    />
    </>
  );
}
