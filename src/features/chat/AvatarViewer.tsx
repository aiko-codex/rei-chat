import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface AvatarViewerProps {
  src: string | null;
  name: string;
  onClose: () => void;
}

/** full-screen view of a profile photo — tap to dismiss, swipe down to close.
 *  Lighter than the chat `Lightbox` (no gallery nav / Message dependency). */
export function AvatarViewer({ src, name, onClose }: AvatarViewerProps) {
  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 z-30 flex flex-col bg-black"
          onClick={onClose}
          data-testid="avatar-viewer"
        >
          <div className="flex justify-end px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button
              onClick={onClose}
              aria-label="Close"
              data-testid="avatar-viewer-close-btn"
              className="cursor-pointer rounded-full p-2 text-white/80 hover:bg-white/10 [&_svg]:size-5"
            >
              <X />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <motion.img
              src={src}
              alt={name}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.y) > 120) onClose();
              }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-2xl object-contain"
              data-testid="avatar-viewer-image"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
