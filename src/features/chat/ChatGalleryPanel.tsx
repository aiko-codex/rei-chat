import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, ImageOff, Play, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/features/settings/ConfirmDialog';
import { Lightbox } from './Lightbox';
import type { Message } from '@/lib/types';

type Tab = 'photos' | 'videos' | 'links';

const URL_RE = /(https?:\/\/[^\s]+)/gi;

interface ChatGalleryPanelProps {
  messages: Message[];
  onBack: () => void;
  /** delete selected messages locally only (this device) */
  onDeleteForMe: (ids: string[]) => void;
  /** unsend selected messages for everyone + the server */
  onDeleteForEveryone: (ids: string[]) => void;
}

interface LinkHit {
  message: Message;
  url: string;
}

export function ChatGalleryPanel({
  messages,
  onBack,
  onDeleteForMe,
  onDeleteForEveryone,
}: ChatGalleryPanelProps) {
  const [tab, setTab] = useState<Tab>('photos');
  const [lightbox, setLightbox] = useState<Message | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmEveryone, setConfirmEveryone] = useState(false);

  // newest first for a gallery feel
  const ordered = useMemo(() => [...messages].sort((a, b) => b.sentAt - a.sentAt), [messages]);
  const photos = useMemo(() => ordered.filter((m) => m.media?.kind === 'image'), [ordered]);
  const videos = useMemo(() => ordered.filter((m) => m.media?.kind === 'video'), [ordered]);
  const links = useMemo<LinkHit[]>(() => {
    const out: LinkHit[] = [];
    for (const m of ordered) {
      if (!m.text) continue;
      const match = m.text.match(URL_RE);
      if (match) out.push({ message: m, url: match[0] });
    }
    return out;
  }, [ordered]);

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'photos', label: 'Photos', count: photos.length },
    { id: 'videos', label: 'Videos', count: videos.length },
    { id: 'links', label: 'Links', count: links.length },
  ];

  // ids visible under the current tab (used for "select all" of this view)
  const visibleIds = useMemo(
    () => (tab === 'links' ? links.map((l) => l.message.id) : (tab === 'photos' ? photos : videos).map((m) => m.id)),
    [tab, links, photos, videos],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const count = selected.size;

  const runDeleteForMe = () => {
    onDeleteForMe([...selected]);
    exitSelect();
  };
  const runDeleteForEveryone = () => {
    onDeleteForEveryone([...selected]);
    exitSelect();
  };

  const grid = tab === 'photos' ? photos : videos;
  const hasAny = photos.length + videos.length + links.length > 0;

  return (
    <div className="flex h-full flex-col" data-testid="chat-gallery-panel">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        {selecting ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={exitSelect}
              data-testid="gallery-select-cancel"
            >
              Cancel
            </Button>
            <p className="flex-1 text-center text-sm font-semibold">
              {count > 0 ? `${count} selected` : 'Select items'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={toggleSelectAll}
              disabled={visibleIds.length === 0}
              data-testid="gallery-select-all"
            >
              {allVisibleSelected ? 'None' : 'All'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="gallery-back">
              <ArrowLeft />
            </Button>
            <p className="flex-1 text-sm font-semibold">Media &amp; links</p>
            {hasAny && (
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setSelecting(true)}
                data-testid="gallery-select"
              >
                Select
              </Button>
            )}
          </>
        )}
      </header>

      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`gallery-tab-${t.id}`}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span className="text-xs text-muted-foreground">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'links' ? (
          links.length === 0 ? (
            <Empty label="No links shared yet" />
          ) : (
            <ul className="divide-y">
              {links.map(({ message, url }) => {
                const isSel = selected.has(message.id);
                const inner = (
                  <>
                    {selecting && <SelectDot selected={isSel} />}
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
                      <ExternalLink />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-primary">{url}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {new Date(message.sentAt).toLocaleDateString([], {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={message.id}>
                    {selecting ? (
                      <button
                        onClick={() => toggle(message.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                        data-testid="gallery-link"
                      >
                        {inner}
                      </button>
                    ) : (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                        data-testid="gallery-link"
                      >
                        {inner}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : grid.length === 0 ? (
          <Empty label={tab === 'photos' ? 'No photos shared yet' : 'No videos shared yet'} />
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {grid.map((m) => {
              const isSel = selected.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => (selecting ? toggle(m.id) : setLightbox(m))}
                  data-testid={`gallery-${tab}-tile`}
                  className={cn(
                    'relative aspect-square cursor-pointer overflow-hidden bg-muted transition-opacity',
                    selecting && isSel && 'opacity-80',
                  )}
                >
                  {m.media?.url ? (
                    <img src={m.media.url} alt={m.media.name} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground/50 [&_svg]:size-5">
                      <ImageOff />
                    </span>
                  )}
                  {tab === 'videos' && !selecting && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white [&_svg]:size-7 [&_svg]:drop-shadow">
                      <Play className="fill-white" />
                    </span>
                  )}
                  {selecting && (
                    <span className="absolute right-1.5 top-1.5">
                      <SelectDot selected={isSel} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* bulk action bar */}
      {selecting && count > 0 && (
        <div className="flex gap-2 border-t bg-background px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <Button
            variant="outline"
            className="flex-1 cursor-pointer"
            onClick={runDeleteForMe}
            data-testid="gallery-delete-me"
          >
            <Undo2 className="size-4" /> Delete for me
          </Button>
          <Button
            variant="destructive"
            className="flex-1 cursor-pointer"
            onClick={() => setConfirmEveryone(true)}
            data-testid="gallery-delete-everyone"
          >
            <Trash2 className="size-4" /> Unsend for everyone
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmEveryone}
        onOpenChange={setConfirmEveryone}
        title={`Unsend ${count} item${count > 1 ? 's' : ''}?`}
        description="This removes them for both of you and deletes them from the server. This can't be undone."
        destructive
        confirmText="Unsend"
        onConfirm={runDeleteForEveryone}
      />

      <Lightbox message={lightbox} imageMessages={photos} onClose={() => setLightbox(null)} />
    </div>
  );
}

function SelectDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full border-2 shadow transition-colors',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/90 bg-black/25',
      )}
    >
      {selected && <Check className="size-4" strokeWidth={3} />}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
        <ImageOff />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
