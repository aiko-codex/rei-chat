import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { Check, CheckCheck, CircleAlert, FileIcon, ImageIcon, MapPin, Mic, Pause, Play, Reply, Video } from 'lucide-react';
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
    // stickers / drawn doodles: transparent, frameless, small, not zoomable
    if (media.sticker) {
      return (
        <img
          src={media.url}
          alt={media.name}
          className="max-h-40 w-auto max-w-[60%] object-contain"
          data-testid="media-sticker"
        />
      );
    }
    // shared location: the encrypted map snapshot + an "Open in Maps" action
    if (media.coords) {
      const { lat, lng } = media.coords;
      const mapsUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
      return (
        <span className="relative block overflow-hidden rounded-2xl ring-1 ring-inset ring-black/10 shadow-sm dark:ring-white/15">
          <img
            src={media.url}
            alt="Shared location"
            onClick={onOpenImage}
            className="max-h-80 w-full cursor-pointer object-cover"
            data-testid="media-location"
          />
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm [&_svg]:size-3.5"
          >
            <MapPin /> Open in Maps
          </a>
        </span>
      );
    }
    return (
      <img
        src={media.url}
        alt={media.name}
        onClick={onOpenImage}
        className="max-h-80 w-full cursor-pointer rounded-2xl object-cover ring-1 ring-inset ring-black/10 shadow-sm dark:ring-white/15"
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
        className="relative cursor-pointer overflow-hidden rounded-2xl ring-1 ring-inset ring-black/10 shadow-sm dark:ring-white/15"
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
  if (m.media?.coords) return 'Location';
  if (m.media?.sticker) return 'Sticker';
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
  /** most-recent outgoing message — gets the iMessage-style status word */
  isLastOwn?: boolean;
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
  /** double-tap to toggle the default reaction */
  onDoubleTapReact?: (message: Message) => void;
  /** swipe right on the bubble to quick-reply (iMessage convention) */
  onSwipeReply?: (message: Message) => void;
  /** play the spring "pop" entrance — only for genuinely new messages, not for
   *  older rows re-mounted by windowed scrolling / jump-to-quote */
  animateIn?: boolean;
}

/** drag distance (px) past which releasing fires a reply */
const SWIPE_REPLY_PX = 48;

export function MessageBubble({
  message,
  isMine,
  isGroupEnd,
  isLastOwn,
  replyTo,
  highlighted,
  onLongPress,
  onOpenImage,
  onQuoteClick,
  onRetry,
  onDoubleTapReact,
  onSwipeReply,
  animateIn = true,
}: MessageBubbleProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const lastTap = useRef(0);
  const displayName = useChatStore((s) => s.displayName);

  // swipe-to-reply: x is driven by the horizontal drag; the reply glyph fades
  // and scales in as the bubble slides right, and a release past the threshold
  // fires the quick-reply.
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [0, SWIPE_REPLY_PX], [0, 1]);
  const replyScale = useTransform(x, [0, SWIPE_REPLY_PX], [0.5, 1]);

  const handleTap = () => {
    if (longPressFired.current || !onDoubleTapReact) return;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      navigator.vibrate?.(10);
      onDoubleTapReact(message);
    } else {
      lastTap.current = now;
    }
  };

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
      navigator.vibrate?.(10); // subtle haptic when the menu pops (native feel)
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

  // iMessage-style status word under the most-recent outgoing message
  const statusWord =
    isMine && isLastOwn && message.status !== 'failed'
      ? message.status === 'read'
        ? 'Seen'
        : message.status === 'delivered'
          ? 'Delivered'
          : 'Sent'
      : null;

  return (
    <motion.div
      // send/receive: spring scale-and-fade in (not a linear slide) — gives the
      // sent bubble a tactile "pop" as it lands. Older rows that re-mount during
      // windowed scrolling skip the entrance (animateIn=false) so they don't pop.
      initial={animateIn ? { opacity: 0, scale: 0.85, y: 8 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.7 }}
      className={cn(
        'relative flex w-full select-none [-webkit-touch-callout:none]',
        isMine ? 'justify-end' : 'justify-start',
        reactions.length > 0 && 'mb-3',
      )}
      data-testid={`message-${message.id}`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerLeave={cancelPress}
      onClick={handleTap}
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
      {/* reply affordance revealed as the bubble is swiped right */}
      {onSwipeReply && (
        <motion.span
          style={{ opacity: replyOpacity, scale: replyScale }}
          className="pointer-events-none absolute left-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4"
          aria-hidden
        >
          <Reply />
        </motion.span>
      )}
      <motion.div
        style={{ x }}
        drag={onSwipeReply ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ top: 0, bottom: 0, left: 0, right: 0.6 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (onSwipeReply && info.offset.x > SWIPE_REPLY_PX) {
            navigator.vibrate?.(12);
            onSwipeReply(message);
          }
        }}
        className={cn('flex max-w-[82%] flex-col gap-1', isMine ? 'items-end' : 'items-start')}
      >
        {replyTo && (
          // minimal Instagram-style quote: a tiny "replied" label + a faint
          // pill of the original, above the bubble (tap to jump to it)
          <button
            onClick={() => onQuoteClick?.(replyTo.id)}
            data-testid={`quote-${message.id}`}
            className={cn(
              'flex max-w-full cursor-pointer flex-col gap-0.5',
              isMine ? 'items-end' : 'items-start',
            )}
          >
            <span className="px-2 text-[11px] text-muted-foreground">
              {isMine ? 'You replied' : `${displayName(message.senderId)} replied`}
            </span>
            <span className="flex max-w-[15rem] items-center gap-1 truncate rounded-2xl bg-muted/70 px-3 py-1.5 text-xs text-muted-foreground">
              <QuoteIcon kind={replyTo.media?.kind} />
              <span className="truncate">{quoteSnippet(replyTo)}</span>
            </span>
          </button>
        )}
      <div
        className={cn(
          'relative max-w-full select-none [-webkit-touch-callout:none] wrap-break-word text-sm leading-relaxed',
          plainMedia
            ? 'rounded-2xl'
            : [
                'rounded-2xl px-4 py-2.5',
                isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                isGroupEnd && (isMine ? 'rounded-br-md' : 'rounded-bl-md'),
              ],
          highlighted && 'rounded-2xl ring-2 ring-ring transition-shadow',
        )}
      >
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
            {message.edited && <span className="italic">edited</span>}
            {formatTime(message.sentAt)}
            {statusIcon}
          </span>
        )}
        {reactions.length > 0 && (
          // sits in a clean cut-out at the bubble's bottom edge: the ring is the
          // chat-background colour, carving an "invisible border" around it
          // (Instagram style) so the emoji reads as attached to the bubble
          <motion.span
            initial={{ scale: 0, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, mass: 0.4 }}
            className={cn(
              'absolute -bottom-3 flex items-center gap-0.5 rounded-full bg-background px-1 py-0.5 text-[15px] leading-none shadow-sm ring-2 ring-background',
              isMine ? 'right-1.5' : 'left-1.5',
            )}
            data-testid={`reactions-${message.id}`}
          >
            {reactions.join('')}
          </motion.span>
        )}
      </div>
        {isMine && message.status === 'failed' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.(message);
            }}
            data-testid={`retry-${message.id}`}
            className="mt-1 cursor-pointer text-xs font-medium text-destructive"
          >
            Not delivered — tap to retry
          </button>
        )}
        {statusWord && (
          <span
            className={cn(
              'mt-0.5 px-0.5 text-[11px] leading-none',
              message.status === 'read' ? 'text-sky-400' : 'text-muted-foreground',
            )}
            data-testid={`status-word-${message.id}`}
          >
            {statusWord}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}
