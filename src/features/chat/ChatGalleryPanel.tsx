import { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, ImageOff, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Lightbox } from './Lightbox';
import type { Message } from '@/lib/types';

type Tab = 'photos' | 'videos' | 'links';

const URL_RE = /(https?:\/\/[^\s]+)/gi;

interface ChatGalleryPanelProps {
  messages: Message[];
  onBack: () => void;
}

interface LinkHit {
  message: Message;
  url: string;
}

export function ChatGalleryPanel({ messages, onBack }: ChatGalleryPanelProps) {
  const [tab, setTab] = useState<Tab>('photos');
  const [lightbox, setLightbox] = useState<Message | null>(null);

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

  const grid = tab === 'photos' ? photos : videos;

  return (
    <div className="flex h-full flex-col" data-testid="chat-gallery-panel">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="gallery-back">
          <ArrowLeft />
        </Button>
        <p className="text-sm font-semibold">Media & links</p>
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
              {links.map(({ message, url }) => (
                <li key={message.id}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                    data-testid="gallery-link"
                  >
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
                  </a>
                </li>
              ))}
            </ul>
          )
        ) : grid.length === 0 ? (
          <Empty label={tab === 'photos' ? 'No photos shared yet' : 'No videos shared yet'} />
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {grid.map((m) => (
              <button
                key={m.id}
                onClick={() => setLightbox(m)}
                data-testid={`gallery-${tab}-tile`}
                className="relative aspect-square cursor-pointer overflow-hidden bg-muted"
              >
                {m.media?.url ? (
                  <img src={m.media.url} alt={m.media.name} className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground/50 [&_svg]:size-5">
                    <ImageOff />
                  </span>
                )}
                {tab === 'videos' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white [&_svg]:size-7 [&_svg]:drop-shadow">
                    <Play className="fill-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Lightbox message={lightbox} imageMessages={photos} onClose={() => setLightbox(null)} />
    </div>
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
