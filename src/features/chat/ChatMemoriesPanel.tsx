import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Heart, Pencil, PinOff, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat-store';
import { Lightbox } from './Lightbox';
import type { Message } from '@/lib/types';

interface ChatMemoriesPanelProps {
  messages: Message[];
  onBack: () => void;
  /** jump to the original message in the conversation */
  onJump: (id: string) => void;
}

/**
 * Shared "Memories" album — a curated collection of messages both people pinned.
 * Pins ride the encrypted meta overlay (key `pin:<id>`), so the album is shared
 * across both phones with no extra server storage. Photos/videos show as cards
 * with an optional caption; text memories show as quote cards.
 */
export function ChatMemoriesPanel({ messages, onBack, onJump }: ChatMemoriesPanelProps) {
  const setMemory = useChatStore((s) => s.setMemory);
  const [lightbox, setLightbox] = useState<Message | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const pinned = useMemo(
    () => messages.filter((m) => m.pinned).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [messages],
  );
  const photos = useMemo(() => pinned.filter((m) => m.media?.kind === 'image'), [pinned]);

  const startEdit = (m: Message) => {
    setEditing(m.id);
    setDraft(m.memoryCaption ?? '');
  };
  const saveCaption = (m: Message) => {
    setMemory(m.id, true, draft.trim() || undefined);
    setEditing(null);
  };

  return (
    <div className="flex h-full flex-col" data-testid="chat-memories-panel">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="memories-back">
          <ArrowLeft />
        </Button>
        <p className="text-sm font-semibold">Memories</p>
        {pinned.length > 0 && <span className="text-xs text-muted-foreground">{pinned.length}</span>}
      </header>

      <div className="flex-1 overflow-y-auto">
        {pinned.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
              <Heart />
            </span>
            <p className="text-sm font-medium">No memories yet</p>
            <p className="text-xs text-muted-foreground">
              Long-press any message and choose <span className="font-medium">Pin to memories</span> to
              start your shared album.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3 p-3">
            {pinned.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm" data-testid="memory-card">
                {m.media?.kind === 'image' && (
                  <button
                    onClick={() => setLightbox(m)}
                    className="block w-full cursor-pointer"
                    data-testid="memory-photo"
                  >
                    {m.media.url ? (
                      <img src={m.media.url} alt="" className="max-h-80 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-muted text-xs text-muted-foreground">
                        Loading…
                      </div>
                    )}
                  </button>
                )}
                {m.media?.kind === 'video' && (
                  <button
                    onClick={() => setLightbox(m)}
                    className="relative block w-full cursor-pointer"
                    data-testid="memory-video"
                  >
                    {m.media.url ? (
                      <video src={m.media.url} className="max-h-80 w-full object-cover" muted playsInline />
                    ) : (
                      <div className="aspect-video bg-muted" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white [&_svg]:size-9 [&_svg]:drop-shadow">
                      <Play className="fill-white" />
                    </span>
                  </button>
                )}
                {!m.media && m.text && (
                  <button
                    onClick={() => onJump(m.id)}
                    className="block w-full cursor-pointer px-4 pt-4 text-left"
                    data-testid="memory-text"
                  >
                    <p className="border-l-2 border-primary/60 pl-3 text-sm italic text-foreground">“{m.text}”</p>
                  </button>
                )}

                <div className="px-4 py-3">
                  {editing === m.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveCaption(m)}
                        placeholder="Add a caption…"
                        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                        data-testid="memory-caption-input"
                      />
                      <Button size="icon" variant="ghost" className="cursor-pointer" onClick={() => saveCaption(m)} aria-label="Save caption">
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="cursor-pointer" onClick={() => setEditing(null)} aria-label="Cancel">
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => startEdit(m)}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        data-testid="memory-caption"
                      >
                        {m.memoryCaption ? (
                          <span className="block truncate text-sm">{m.memoryCaption}</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Pencil className="size-3.5" /> Add a caption
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {new Date(m.pinnedAt ?? m.sentAt).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 cursor-pointer text-muted-foreground"
                        onClick={() => setMemory(m.id, false)}
                        aria-label="Remove from memories"
                        data-testid="memory-unpin"
                      >
                        <PinOff className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Lightbox message={lightbox} imageMessages={photos} onClose={() => setLightbox(null)} />
    </div>
  );
}
