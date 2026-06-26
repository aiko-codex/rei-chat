import { useEffect, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { Message } from '@/lib/types';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DISMISS_PX = 120;
const SPRING = { type: 'spring', stiffness: 320, damping: 32 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface LightboxProps {
  /** the image/video message currently open, or null when closed */
  message: Message | null;
  /** all image messages in the chat, for swiping between them */
  imageMessages: Message[];
  onClose: () => void;
}

export function Lightbox({ message, imageMessages, onClose }: LightboxProps) {
  const [index, setIndex] = useState(0);
  // true while pinched/zoomed in — hides gallery arrows + disables swipe-dismiss
  const [isZoomed, setIsZoomed] = useState(false);

  const isVideo = message?.media?.kind === 'video';

  // the live transform, driven imperatively by the pinch/pan gesture
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // the image's on-screen size at scale 1 (measured on load), for pan bounds
  const baseSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // active pointers (touch/mouse), keyed by pointerId, for pinch detection
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ d0: number; s0: number; t0x: number; t0y: number; m0x: number; m0y: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; tx: number; ty: number; pan: boolean; t: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const stopAll = () => {
    scale.stop();
    x.stop();
    y.stop();
  };

  const reset = (withAnim = false) => {
    if (withAnim) {
      animate(scale, 1, SPRING);
      animate(x, 0, SPRING);
      animate(y, 0, SPRING);
    } else {
      stopAll();
      scale.set(1);
      x.set(0);
      y.set(0);
    }
  };

  // keep `isZoomed` (hides arrows, gates swipe-dismiss + arrow keys) in lockstep
  // with the live scale — covers pinch, double-tap, wheel, and snap-back alike.
  // setState bails when the boolean is unchanged, so this only re-renders on the
  // 1× boundary crossing, not every frame of a pinch.
  useEffect(() => scale.on('change', (s) => setIsZoomed(s > 1.01)), [scale]);

  useEffect(() => {
    if (!message) return;
    const i = imageMessages.findIndex((m) => m.id === message.id);
    setIndex(i >= 0 ? i : 0);
    reset(false);
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, imageMessages]);

  // reset zoom when paging between gallery images
  useEffect(() => {
    reset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (isVideo || isZoomed) return; // no gallery nav for video / while zoomed
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(imageMessages.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, imageMessages.length, onClose, isVideo, isZoomed]);

  // video opens standalone; images use the swipeable gallery
  const current = isVideo ? message : imageMessages[index];
  const hasPrev = !isVideo && !isZoomed && index > 0;
  const hasNext = !isVideo && !isZoomed && index < imageMessages.length - 1;

  const center = () => {
    const r = containerRef.current?.getBoundingClientRect();
    return r
      ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
      : { cx: 0, cy: 0, w: 0, h: 0 };
  };

  // keep the zoomed image from being dragged off-screen
  const clampPan = (nx: number, ny: number, s: number) => {
    const c = center();
    const maxX = Math.max(0, (baseSize.current.w * s - c.w) / 2);
    const maxY = Math.max(0, (baseSize.current.h * s - c.h) / 2);
    return { x: clamp(nx, -maxX, maxX), y: clamp(ny, -maxY, maxY) };
  };

  // scale toward a screen point (mx,my) keeping that point visually anchored
  const zoomTo = (target: number, mx: number, my: number, withAnim = true) => {
    const c = center();
    const s = clamp(target, MIN_SCALE, MAX_SCALE);
    const s0 = scale.get();
    const t0x = x.get();
    const t0y = y.get();
    const t = clampPan(
      mx - c.cx - (s / s0) * (mx - c.cx - t0x),
      my - c.cy - (s / s0) * (my - c.cy - t0y),
      s,
    );
    if (withAnim) {
      animate(scale, s, SPRING);
      animate(x, t.x, SPRING);
      animate(y, t.y, SPRING);
    } else {
      stopAll();
      scale.set(s);
      x.set(t.x);
      y.set(t.y);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stopAll(); // grab: halt any in-flight snap-back so the gesture takes over cleanly
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s0: scale.get(),
        t0x: x.get(),
        t0y: y.get(),
        m0x: (a.x + b.x) / 2,
        m0y: (a.y + b.y) / 2,
      };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { sx: e.clientX, sy: e.clientY, tx: x.get(), ty: y.get(), pan: scale.get() > 1.01, t: Date.now(), moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const c = center();
      const p = pinch.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m1x = (a.x + b.x) / 2;
      const m1y = (a.y + b.y) / 2;
      const s = clamp((p.s0 * d) / p.d0, MIN_SCALE, MAX_SCALE);
      const t = clampPan(
        m1x - c.cx - (s / p.s0) * (p.m0x - c.cx - p.t0x),
        m1y - c.cy - (s / p.s0) * (p.m0y - c.cy - p.t0y),
        s,
      );
      scale.set(s);
      x.set(t.x);
      y.set(t.y);
      if (drag.current) drag.current.moved = true;
    } else if (pointers.current.size === 1 && drag.current) {
      const dx = e.clientX - drag.current.sx;
      const dy = e.clientY - drag.current.sy;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) drag.current.moved = true;
      if (drag.current.pan) {
        const t = clampPan(drag.current.tx + dx, drag.current.ty + dy, scale.get());
        x.set(t.x);
        y.set(t.y);
      } else {
        y.set(dy); // at min scale, a vertical drag is pull-to-dismiss
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already gone */
    }
    if (pointers.current.size === 1) {
      // a pinch finger lifted — keep going as a one-finger pan from here
      const [p] = [...pointers.current.values()];
      pinch.current = null;
      drag.current = { sx: p.x, sy: p.y, tx: x.get(), ty: y.get(), pan: scale.get() > 1.01, t: Date.now(), moved: true };
      return;
    }
    if (pointers.current.size > 1) return;

    const was = drag.current;
    pinch.current = null;
    drag.current = null;

    // tap → double-tap to toggle zoom (anchored at the tap point)
    if (was && !was.moved && Date.now() - was.t < 250) {
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
        lastTap.current = null;
        if (scale.get() > 1.01) reset(true);
        else zoomTo(DOUBLE_TAP_SCALE, e.clientX, e.clientY, true);
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
      return;
    }

    // settle the gesture
    if (scale.get() <= 1.01) {
      if (was && !was.pan && Math.abs(y.get()) > DISMISS_PX) {
        onClose();
        return;
      }
      reset(true);
    } else {
      const t = clampPan(x.get(), y.get(), scale.get());
      animate(x, t.x, SPRING);
      animate(y, t.y, SPRING);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isVideo) return; // let video controls handle their own input
    zoomTo(scale.get() * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY, false);
  };

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

          <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden">
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
              <div
                className="flex h-full w-full touch-none items-center justify-center select-none [-webkit-touch-callout:none]"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
              >
                <motion.img
                  ref={imgRef}
                  key={current.id}
                  src={current.media!.url}
                  alt={current.media!.name}
                  draggable={false}
                  onLoad={() => {
                    const r = imgRef.current?.getBoundingClientRect();
                    // divide out the current scale so we always store the scale-1
                    // (contained) size, even if measured mid-zoom
                    const s = scale.get() || 1;
                    if (r) baseSize.current = { w: r.width / s, h: r.height / s };
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  style={{ scale, x, y }}
                  className="max-h-full max-w-full object-contain"
                  data-testid="lightbox-image"
                />
              </div>
            )}
            {hasPrev && (
              <button
                onClick={() => setIndex(index - 1)}
                aria-label="Previous image"
                data-testid="lightbox-prev-btn"
                className="absolute left-2 cursor-pointer rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 [&_svg]:size-5"
              >
                <ChevronLeft />
              </button>
            )}
            {hasNext && (
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
