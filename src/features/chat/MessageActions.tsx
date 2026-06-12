import { AnimatePresence, motion } from 'motion/react';
import { Copy, Reply, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

export const QUICK_REACTIONS = ['🤍', '🖤', '😂', '😢', '😡', '😆'];

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
  testId: string;
}

function ActionRow({ icon, label, destructive, onClick, testId }: ActionRowProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted [&_svg]:size-4',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export interface MessageActionsProps {
  message: Message | null;
  isMine: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
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
  onDeleteForMe,
  onUnsend,
}: MessageActionsProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 px-6 backdrop-blur-sm"
          onClick={onClose}
          data-testid="message-actions-overlay"
        >
          {/* reaction bar */}
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex items-center gap-1 rounded-full border bg-background px-2 py-1.5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            data-testid="reaction-bar"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                aria-label={`React ${emoji}`}
                data-testid={`react-${emoji}`}
                className="cursor-pointer rounded-full p-1.5 text-xl transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
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
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-56 overflow-hidden rounded-2xl border bg-background py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            data-testid="message-action-menu"
          >
            <p className="px-4 pt-2 pb-1 text-xs text-muted-foreground">
              {new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <ActionRow icon={<Reply />} label="Reply" onClick={onReply} testId="action-reply" />
            {message.text && (
              <ActionRow icon={<Copy />} label="Copy" onClick={onCopy} testId="action-copy" />
            )}
            <ActionRow
              icon={<Trash2 />}
              label="Delete for you"
              destructive
              onClick={onDeleteForMe}
              testId="action-delete"
            />
            {isMine && (
              <ActionRow
                icon={<Undo2 />}
                label="Unsend"
                destructive
                onClick={onUnsend}
                testId="action-unsend"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
