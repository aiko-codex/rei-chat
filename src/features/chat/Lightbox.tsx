import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

interface LightboxProps {
  /** the image/video message currently open, or null when closed */
  message: Message | null;
  /** all image messages in the chat, for swiping between them */
  imageMessages: Message[];
  onClose: () => void;
}

export function Lightbox({ message, imageMessages, onClose }: LightboxProps) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const isVideo = message?.media?.kind === 'video';

  useEffect(() => {
    if (!message) return;
    const i = imageMessages.findIndex((m) => m.id === message.id);
    setIndex(i >= 0 ? i : 0);
    setZoomed(false);
  }, [message, imageMessages]);

  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (isVideo) return; // no gallery nav for a single video
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(imageMessages.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, imageMessages.length, onClose, isVideo]);

  // video opens standalone; images use the swipeable gallery
  const current = isVideo ? message : imageMessages[index];
  const hasPrev = !isVideo && index > 0;
  const hasNext = !isVideo && index < imageMessages.length - 1;

  const download = () => {
    const media = current?.media;
    if (!media?.url) return;
    const a = document.createElement('a');
    a.href = media.url;
    a.download = media.name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <AnimatePresence>
      {message && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 z-30 flex flex-col bg-black"
          data-testid="lightbox"
        >
          <div className="flex items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <span className="text-sm text-white/70">
              {!isVideo && imageMessages.length > 1 && `${index + 1} / ${imageMessages.length}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={download}
                aria-label="Download"
                data-testid="lightbox-download-btn"
                className="cursor-pointer rounded-full p-2 text-white/80 hover:bg-white/10 [&_svg]:size-5"
              >
                <Download />
              </button>
              <button
                onClick={onClose}
                aria-label="Close"
                data-testid="lightbox-close-btn"
                className="cursor-pointer rounded-full p-2 text-white/80 hover:bg-white/10 [&_svg]:size-5"
              >
                <X />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {isVideo ? (
              <video
                key={current.id}
                src={current.media!.url}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full"
                data-testid="lightbox-video"
              />
            ) : (
              <motion.img
                key={current.id}
                src={current.media!.url}
                alt={current.media!.name}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: zoomed ? 2 : 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                drag={zoomed ? true : 'y'}
                dragConstraints={zoomed ? undefined : { top: 0, bottom: 0 }}
                dragElastic={zoomed ? 0.1 : 0.6}
                onDragEnd={(_, info) => {
                  if (!zoomed && Math.abs(info.offset.y) > 120) onClose();
                }}
                onDoubleClick={() => setZoomed((z) => !z)}
                className={cn(
                  'max-h-full max-w-full object-contain',
                  zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
                )}
                data-testid="lightbox-image"
              />
            )}
            {hasPrev && !zoomed && (
              <button
                onClick={() => setIndex(index - 1)}
                aria-label="Previous image"
                data-testid="lightbox-prev-btn"
                className="absolute left-2 cursor-pointer rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 [&_svg]:size-5"
              >
                <ChevronLeft />
              </button>
            )}
            {hasNext && !zoomed && (
              <button
                onClick={() => setIndex(index + 1)}
                aria-label="Next image"
                data-testid="lightbox-next-btn"
                className="absolute right-2 cursor-pointer rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 [&_svg]:size-5"
              >
                <ChevronRight />
              </button>
            )}
          </div>

          <p className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-white/50">
            {new Date(current.sentAt).toLocaleString([], {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
