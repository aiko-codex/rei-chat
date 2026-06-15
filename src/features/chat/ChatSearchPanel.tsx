import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat-store';
import type { Message } from '@/lib/types';

interface ChatSearchPanelProps {
  messages: Message[];
  onBack: () => void;
  /** jump to the tapped message in the conversation */
  onJump: (id: string) => void;
}

/** highlight the matched run inside the message snippet */
function Snippet({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  // center the snippet around the match so long messages stay readable
  const start = Math.max(0, idx - 24);
  const before = (start > 0 ? '… ' : '') + text.slice(start, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="rounded bg-primary/20 text-foreground">{match}</mark>
      {after}
    </>
  );
}

export function ChatSearchPanel({ messages, onBack, onJump }: ChatSearchPanelProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const displayName = useChatStore((s) => s.displayName);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => m.text && m.text.toLowerCase().includes(q))
      .sort((a, b) => b.sentAt - a.sentAt);
  }, [messages, query]);

  return (
    <div className="flex h-full flex-col" data-testid="chat-search-panel">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="search-back">
          <ArrowLeft />
        </Button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this conversation"
            data-testid="search-input"
            className="w-full rounded-full bg-muted py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear"
              data-testid="search-clear"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-background [&_svg]:size-4"
            >
              <X />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {query.trim() === '' ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Search messages in this conversation.
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="search-no-results">
            No messages match “{query.trim()}”.
          </p>
        ) : (
          <ul className="divide-y">
            {results.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onJump(m.id)}
                  data-testid="search-result"
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {displayName(m.senderId)}
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      {new Date(m.sentAt).toLocaleDateString([], {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm">
                    <Snippet text={m.text ?? ''} query={query.trim()} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
