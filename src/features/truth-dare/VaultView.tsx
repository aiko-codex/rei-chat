/**
 * The Truth or Dare Vault — every photo / video / voice note ever shared in the
 * game, saved forever and re-watchable. Hidden inside the ToD space (never in
 * the main chat gallery). Media bytes are pulled from the local blob cache or
 * re-downloaded + decrypted from the server on demand, so they survive cache
 * eviction / reinstall.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Lock, Mic, Play, Trash2, X } from 'lucide-react';
import { useTruthDareStore } from '@/store/truth-dare-store';
import type { VaultEntry } from '@/lib/truth-dare';

function Thumb({ entry }: { entry: VaultEntry }) {
  const url = useTruthDareStore((s) => s.mediaUrls[entry.mediaId]);
  const ensure = useTruthDareStore((s) => s.ensureMediaUrl);
  useEffect(() => {
    if (!url) void ensure(entry.mediaId, entry.mime, entry.chunked);
  }, [entry.mediaId, entry.mime, entry.chunked, url, ensure]);

  if (entry.kind === 'voice') {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-rose-950/60 text-rose-200">
        <Mic className="size-6" />
        <span className="text-[10px] uppercase tracking-wide">Voice</span>
      </div>
    );
  }
  if (!url) {
    return <div className="size-full animate-pulse bg-white/5" />;
  }
  if (entry.kind === 'video') {
    return (
      <div className="relative size-full">
        <video src={url} className="size-full object-cover" muted playsInline preload="metadata" />
        <span className="absolute inset-0 flex items-center justify-center">
          <Play className="size-7 text-white drop-shadow" />
        </span>
      </div>
    );
  }
  return <img src={url} alt={entry.prompt} className="size-full object-cover" />;
}

function Viewer({ entry, onClose }: { entry: VaultEntry; onClose: () => void }) {
  const url = useTruthDareStore((s) => s.mediaUrls[entry.mediaId]);
  const ensure = useTruthDareStore((s) => s.ensureMediaUrl);
  const del = useTruthDareStore((s) => s.deleteVaultEntry);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!url) void ensure(entry.mediaId, entry.mime, entry.chunked);
  }, [entry, url, ensure]);

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col bg-black/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <button onClick={onClose} aria-label="Close" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <X className="size-5" />
        </button>
        <button
          onClick={() => setConfirm(true)}
          aria-label="Delete"
          className="cursor-pointer rounded-full p-2 text-rose-300 hover:bg-white/10"
        >
          <Trash2 className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        {!url ? (
          <span className="text-sm text-white/60">Loading…</span>
        ) : entry.kind === 'image' ? (
          <img src={url} alt={entry.prompt} className="max-h-full max-w-full object-contain" />
        ) : entry.kind === 'video' ? (
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-4 text-white">
            <Mic className="size-12 text-rose-300" />
            <audio src={url} controls autoPlay className="w-full" />
          </div>
        )}
      </div>
      <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-white/80">
        <span className="mr-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide">
          {entry.category}
        </span>
        {entry.prompt}
      </div>

      <AnimatePresence>
        {confirm && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-xs rounded-2xl bg-neutral-900 p-5 text-center text-white">
              <p className="text-sm">Delete this from the vault for both of you?</p>
              <p className="mt-1 text-xs text-white/50">This can't be undone.</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setConfirm(false)}
                  className="flex-1 cursor-pointer rounded-full bg-white/10 py-2 text-sm hover:bg-white/15"
                >
                  Keep
                </button>
                <button
                  onClick={() => {
                    del(entry.id);
                    onClose();
                  }}
                  className="flex-1 cursor-pointer rounded-full bg-rose-600 py-2 text-sm font-medium hover:bg-rose-500"
                >
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function VaultView({ onBack }: { onBack: () => void }) {
  const vault = useTruthDareStore((s) => s.vault);
  const entries = Object.values(vault)
    .filter((e) => !e.deleted)
    .sort((a, b) => b.at - a.at);
  const [open, setOpen] = useState<VaultEntry | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="dark flex h-full flex-col bg-neutral-950 text-white">
      <header className="flex items-center gap-2 border-b border-white/10 px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button onClick={onBack} aria-label="Back" className="cursor-pointer rounded-full p-2 hover:bg-white/10">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <Lock className="size-4 text-rose-300" />
          <p className="text-sm font-semibold">Vault</p>
        </div>
        <span className="ml-auto text-xs text-white/40">{entries.length} saved</span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-1" data-testid="tod-vault">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-white/50">
            <Lock className="size-8" />
            <p className="text-sm">Nothing saved yet.</p>
            <p className="text-xs">Photos, videos and voice notes you share in the game live here — only for you two.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {entries.map((e) => (
              <button
                key={e.id}
                onClick={() => setOpen(e)}
                className="relative aspect-square cursor-pointer overflow-hidden rounded-md bg-white/5"
                data-testid={`tod-vault-item-${e.id}`}
              >
                <Thumb entry={e} />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>{open && <Viewer entry={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}
