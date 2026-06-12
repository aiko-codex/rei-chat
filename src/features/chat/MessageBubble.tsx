import { motion } from 'motion/react';
import { Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  /** last message of a consecutive group from the same sender */
  isGroupEnd: boolean;
}

export function MessageBubble({ message, isMine, isGroupEnd }: MessageBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full', isMine ? 'justify-end' : 'justify-start')}
      data-testid={`message-${message.id}`}
    >
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words',
          isMine
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
          isGroupEnd && (isMine ? 'rounded-br-md' : 'rounded-bl-md'),
        )}
      >
        {message.text && <p>{message.text}</p>}
        <span
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none',
            isMine ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {formatTime(message.sentAt)}
          {isMine &&
            (message.status === 'read' ? (
              <CheckCheck className="size-3 text-sky-300" data-testid={`status-read-${message.id}`} />
            ) : message.status === 'delivered' ? (
              <CheckCheck className="size-3" />
            ) : (
              <Check className="size-3" />
            ))}
        </span>
      </div>
    </motion.div>
  );
}
