import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck, FileIcon, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaAttachment, Message } from '@/lib/types';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

// static fake waveform for the mock phase
const WAVEFORM = [5, 9, 14, 8, 12, 16, 10, 6, 11, 15, 9, 13, 7, 12, 16, 10, 5, 9, 13, 8, 11, 6, 14, 9];

function VoiceNote({ media, isMine }: { media: MediaAttachment; isMine: boolean }) {
  const [playing, setPlaying] = useState(false);
  return (
    <span className="flex items-center gap-2 py-1" data-testid="voice-note">
      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        data-testid="voice-note-play-btn"
        className={cn(
          'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full [&_svg]:size-4',
          isMine ? 'bg-primary-foreground/20' : 'bg-foreground/10',
        )}
      >
        {playing ? <Pause /> : <Play className="ml-0.5" />}
      </button>
      <span className="flex h-8 items-center gap-0.5">
        {WAVEFORM.map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}px` }}
            className={cn(
              'w-0.75 rounded-full',
              isMine ? 'bg-primary-foreground/60' : 'bg-foreground/40',
            )}
          />
        ))}
      </span>
      <span className={cn('text-xs', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {formatDuration(media.duration ?? 0)}
      </span>
    </span>
  );
}

function MediaContent({ media, isMine }: { media: MediaAttachment; isMine: boolean }) {
  if (media.kind === 'image') {
    return (
      <img
        src={media.url}
        alt={media.name}
        className="max-h-72 w-full rounded-xl object-cover"
        data-testid="media-image"
      />
    );
  }
  if (media.kind === 'video') {
    return (
      <video src={media.url} controls className="max-h-72 w-full rounded-xl" data-testid="media-video" />
    );
  }
  if (media.kind === 'voice') {
    return <VoiceNote media={media} isMine={isMine} />;
  }
  return (
    <a
      href={media.url}
      download={media.name}
      className="flex cursor-pointer items-center gap-2.5 py-1"
      data-testid="media-file"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
          isMine ? 'bg-primary-foreground/20' : 'bg-foreground/10',
        )}
      >
        <FileIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{media.name}</span>
        <span className={cn('block text-xs', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {formatSize(media.size)}
        </span>
      </span>
    </a>
  );
}

const LONG_PRESS_MS = 450;

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  /** last message of a consecutive group from the same sender */
  isGroupEnd: boolean;
  onLongPress: (message: Message) => void;
}

export function MessageBubble({ message, isMine, isGroupEnd, onLongPress }: MessageBubbleProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    pressTimer.current = setTimeout(() => onLongPress(message), LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const reactions = Object.values(message.reactions ?? {}).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full', isMine ? 'justify-end' : 'justify-start', reactions.length > 0 && 'mb-3')}
      data-testid={`message-${message.id}`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelPress();
        onLongPress(message);
      }}
    >
      <div
        className={cn(
          'relative max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed wrap-break-word select-none',
          isMine
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
          isGroupEnd && (isMine ? 'rounded-br-md' : 'rounded-bl-md'),
          // image/video bubbles: let the media own the bubble edge
          (message.media?.kind === 'image' || message.media?.kind === 'video') && 'p-1.5',
        )}
      >
        {message.media && <MediaContent media={message.media} isMine={isMine} />}
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
        {reactions.length > 0 && (
          <span
            className={cn(
              'absolute -bottom-3.5 flex items-center rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm',
              isMine ? 'right-2' : 'left-2',
            )}
            data-testid={`reactions-${message.id}`}
          >
            {reactions.join('')}
          </span>
        )}
      </div>
    </motion.div>
  );
}
