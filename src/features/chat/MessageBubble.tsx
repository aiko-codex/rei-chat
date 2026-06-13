import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck, CircleAlert, FileIcon, ImageIcon, Mic, Pause, Play, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useChatStore } from '@/store/chat-store';
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

// static waveform shape; playback progress recolors it left to right
const WAVEFORM = [5, 9, 14, 8, 12, 16, 10, 6, 11, 15, 9, 13, 7, 12, 16, 10, 5, 9, 13, 8, 11, 6, 14, 9];

function VoiceNote({ media, isMine }: { media: MediaAttachment; isMine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = () => {
    if (!media.url) {
      // legacy mock notes have no audio
      setPlaying((p) => !p);
      return;
    }
    if (!audioRef.current) {
      const audio = new Audio(media.url);
      audio.ontimeupdate = () => {
        const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : media.duration ?? 1;
        setProgress(audio.currentTime / d);
      };
      audio.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audioRef.current = audio;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <span className="flex items-center gap-2 py-1" data-testid="voice-note">
      <button
        onClick={toggle}
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
        {WAVEFORM.map((h, i) => {
          const played = progress > 0 && i / WAVEFORM.length < progress;
          return (
            <span
              key={i}
              style={{ height: `${h}px` }}
              className={cn(
                'w-0.75 rounded-full',
                isMine
                  ? played
                    ? 'bg-primary-foreground'
                    : 'bg-primary-foreground/60'
                  : played
                    ? 'bg-foreground'
                    : 'bg-foreground/40',
              )}
            />
          );
        })}
      </span>
      <span className={cn('text-xs', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {formatDuration(media.duration ?? 0)}
      </span>
    </span>
  );
}

function MediaContent({
  media,
  isMine,
  onOpenImage,
}: {
  media: MediaAttachment;
  isMine: boolean;
  onOpenImage?: () => void;
}) {
  // restoring from the server backup — bytes not in hand yet
  if (!media.url && media.kind !== 'voice') {
    return (
      <span
        className="flex h-24 w-40 animate-pulse items-center justify-center rounded-xl bg-foreground/5 text-xs text-muted-foreground"
        data-testid="media-loading"
      >
        Loading…
      </span>
    );
  }
  if (media.kind === 'image') {
    return (
      <img
        src={media.url}
        alt={media.name}
        onClick={onOpenImage}
        className="max-h-80 w-full cursor-pointer rounded-2xl object-cover"
        data-testid="media-image"
      />
    );
  }
  if (media.kind === 'video') {
    // show the first frame as a poster with a play affordance; tapping opens
    // the fullscreen modal player (no inline controls — keeps the bubble clean)
    return (
      <div
        onClick={onOpenImage}
        className="relative cursor-pointer overflow-hidden rounded-2xl"
        data-testid="media-video"
      >
        <video
          src={media.url}
          preload="metadata"
          muted
          playsInline
          className="pointer-events-none max-h-80 w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm [&_svg]:size-6 [&_svg]:translate-x-0.5">
            <Play />
          </span>
        </span>
      </div>
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

function quoteSnippet(m: Message) {
  if (m.text) return m.text;
  switch (m.media?.kind) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'voice':
      return 'Voice note';
    default:
      return m.media?.name ?? 'Message';
  }
}

function QuoteIcon({ kind }: { kind?: MediaAttachment['kind'] }) {
  if (kind === 'image') return <ImageIcon className="size-3 shrink-0" />;
  if (kind === 'video') return <Video className="size-3 shrink-0" />;
  if (kind === 'voice') return <Mic className="size-3 shrink-0" />;
  if (kind === 'file') return <FileIcon className="size-3 shrink-0" />;
  return null;
}

const LONG_PRESS_MS = 450;

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  /** last message of a consecutive group from the same sender */
  isGroupEnd: boolean;
  /** resolved original message when this is a reply */
  replyTo?: Message;
  /** sender name for the quote header */
  replyToName?: string;
  /** flash highlight (after jumping to this message from a quote) */
  highlighted?: boolean;
  onLongPress: (message: Message) => void;
  onOpenImage?: (message: Message) => void;
  onQuoteClick?: (messageId: string) => void;
  /** resend a message whose server upload failed */
  onRetry?: (message: Message) => void;
}

export function MessageBubble({
  message,
  isMine,
  isGroupEnd,
  replyTo,
  replyToName,
  highlighted,
  onLongPress,
  onOpenImage,
  onQuoteClick,
  onRetry,
}: MessageBubbleProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // live upload progress (0..1) while this media message is streaming to the server
  const uploadProgress = useChatStore((s) => s.transfers[message.id]);
  const showProgress = uploadProgress !== undefined && uploadProgress < 1 && !!message.media;
  const uploadPct = Math.round((uploadProgress ?? 0) * 100);
  // image/video fill the bubble → overlay the bar; file/voice → inline bar
  const isOverlayMedia = message.media?.kind === 'image' || message.media?.kind === 'video';

  const startPress = () => {
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onLongPress(message);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const reactions = Object.values(message.reactions ?? {}).filter(Boolean);

  // image/video with no caption/reply render as a plain media tile (no colored
  // frame), Instagram-style, with the time overlaid on the media
  const isVisualMedia = message.media?.kind === 'image' || message.media?.kind === 'video';
  const plainMedia = isVisualMedia && !message.text && !replyTo;

  const statusIcon = !isMine ? null : message.status === 'failed' ? (
    <CircleAlert className="size-3" data-testid={`status-failed-${message.id}`} />
  ) : message.status === 'read' ? (
    <CheckCheck className="size-3 text-sky-300" data-testid={`status-read-${message.id}`} />
  ) : message.status === 'delivered' ? (
    <CheckCheck className="size-3" />
  ) : (
    <Check className="size-3" />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'flex w-full',
        isMine ? 'justify-end' : 'justify-start',
        message.status === 'failed' && 'flex-col items-end gap-1',
        reactions.length > 0 && 'mb-3',
      )}
      data-testid={`message-${message.id}`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerLeave={cancelPress}
      onClickCapture={(e) => {
        // a long press already opened the actions overlay — swallow the trailing click
        if (longPressFired.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressFired.current = false;
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelPress();
        onLongPress(message);
      }}
    >
      <div
        className={cn(
          'relative max-w-[78%] select-none wrap-break-word text-sm leading-relaxed',
          plainMedia
            ? 'rounded-2xl'
            : [
                'rounded-2xl px-3.5 py-2',
                isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                isGroupEnd && (isMine ? 'rounded-br-md' : 'rounded-bl-md'),
              ],
          highlighted && 'rounded-2xl ring-2 ring-ring transition-shadow',
        )}
      >
        {replyTo && (
          <button
            onClick={() => onQuoteClick?.(replyTo.id)}
            data-testid={`quote-${message.id}`}
            className={cn(
              'mb-1.5 flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs',
              isMine
                ? 'bg-primary-foreground/10 text-primary-foreground/70'
                : 'bg-foreground/5 text-muted-foreground',
            )}
          >
            <span className={cn('shrink-0 font-semibold', isMine ? 'text-primary-foreground/90' : 'text-primary')}>
              {replyToName}
            </span>
            <QuoteIcon kind={replyTo.media?.kind} />
            <span className="truncate">{quoteSnippet(replyTo)}</span>
          </button>
        )}
        {message.media && (
          <MediaContent
            media={message.media}
            isMine={isMine}
            onOpenImage={onOpenImage ? () => onOpenImage(message) : undefined}
          />
        )}
        {showProgress && isOverlayMedia && (
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-2" data-testid="upload-progress">
            <Progress value={uploadPct} className="h-1 bg-black/30 backdrop-blur-sm" />
            <span className="text-[10px] font-medium text-white tabular-nums drop-shadow">
              {uploadPct}%
            </span>
          </div>
        )}
        {showProgress && !isOverlayMedia && (
          <div className="mt-1.5 flex items-center gap-2" data-testid="upload-progress">
            <Progress
              value={uploadPct}
              className={cn(
                'h-1',
                isMine
                  ? 'bg-primary-foreground/25 [&_[data-slot=progress-indicator]]:bg-primary-foreground'
                  : 'bg-foreground/10',
              )}
            />
            <span
              className={cn(
                'text-[10px] tabular-nums',
                isMine ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {uploadPct}%
            </span>
          </div>
        )}
        {message.text && <p>{message.text}</p>}
        {plainMedia ? (
          // overlay time+status on the media; hidden while the upload bar shows
          !(showProgress && isOverlayMedia) && (
            <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] leading-none text-white backdrop-blur-sm">
              {formatTime(message.sentAt)}
              {statusIcon}
            </span>
          )
        ) : (
          <span
            className={cn(
              'mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {formatTime(message.sentAt)}
            {statusIcon}
          </span>
        )}
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
      {isMine && message.status === 'failed' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry?.(message);
          }}
          data-testid={`retry-${message.id}`}
          className="cursor-pointer text-xs font-medium text-destructive"
        >
          Not delivered — tap to retry
        </button>
      )}
    </motion.div>
  );
}
