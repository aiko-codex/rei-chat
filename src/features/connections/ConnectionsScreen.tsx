import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Search, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  acceptConnection,
  declineConnection,
  listConnections,
  requestConnection,
  searchUsers,
  type Connection,
  type SearchResult,
} from '@/lib/account-api';

function InitialAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
  return (
    <Avatar className='size-10'>
      {avatar && <AvatarImage src={avatar} alt={name} />}
      <AvatarFallback className='bg-primary/90 text-sm font-semibold text-white'>
        {name[0]?.toUpperCase() ?? '?'}
      </AvatarFallback>
    </Avatar>
  );
}

interface Props {
  onBack: () => void;
  onOpenConnection?: (connectionId: string, account: SearchResult) => void;
}

/**
 * People: Instagram-style username search → connection request → accept/decline,
 * plus the list of accepted connections (chats). Self-contained against the
 * accounts endpoints.
 */
export function ConnectionsScreen({ onBack, onOpenConnection }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setConnections(await listConnections());
    } catch {
      /* offline — leave as-is */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchUsers(q);
        if (mySeq === seq.current) setResults(r);
      } catch {
        if (mySeq === seq.current) setResults([]);
      } finally {
        if (mySeq === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // a user's connection state, for labelling search results
  const stateFor = (userId: string): Connection | undefined =>
    connections.find((c) => c.account.userId === userId);

  const sendRequest = async (u: SearchResult) => {
    setBusyId(u.userId);
    try {
      await requestConnection(u.userId);
      toast.success(`Request sent to @${u.username}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setBusyId(null);
    }
  };

  const accept = async (c: Connection) => {
    setBusyId(c.connectionId);
    try {
      await acceptConnection(c.connectionId, c.account.userId);
      toast.success(`Connected with @${c.account.username}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept');
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (c: Connection) => {
    setBusyId(c.connectionId);
    try {
      await declineConnection(c.connectionId);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusyId(null);
    }
  };

  const incoming = connections.filter((c) => c.status === 'pending' && c.incoming);
  const accepted = connections.filter((c) => c.status === 'accepted');
  const showSearch = query.trim().length >= 2;

  return (
    <div className='flex h-full flex-col bg-background' data-testid='connections-screen'>
      <header className='flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]'>
        <Button variant='ghost' size='icon' onClick={onBack} aria-label='Back'>
          <ArrowLeft />
        </Button>
        <p className='text-sm font-semibold'>People</p>
      </header>

      <div className='px-4 py-3'>
        <div className='relative'>
          <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search by @username'
            autoCapitalize='none'
            autoCorrect='off'
            spellCheck={false}
            className='pl-9'
            data-testid='connections-search'
          />
        </div>
      </div>

      <div className='flex-1 overflow-y-auto pb-6'>
        {showSearch ? (
          <div data-testid='connections-results'>
            {searching && (
              <p className='flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground'>
                <Loader2 className='size-4 animate-spin' /> Searching…
              </p>
            )}
            {!searching && results.length === 0 && (
              <p className='py-6 text-center text-sm text-muted-foreground'>No users found.</p>
            )}
            {results.map((u) => {
              const st = stateFor(u.userId);
              return (
                <div key={u.userId} className='flex items-center gap-3 px-4 py-2.5'>
                  <InitialAvatar name={u.displayName || u.username} avatar={u.avatar} />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{u.displayName}</p>
                    <p className='truncate text-xs text-muted-foreground'>@{u.username}</p>
                  </div>
                  {st?.status === 'accepted' ? (
                    <span className='text-xs text-emerald-600'>Connected</span>
                  ) : st?.requestedByMe ? (
                    <span className='text-xs text-muted-foreground'>Requested</span>
                  ) : st?.incoming ? (
                    <Button size='sm' onClick={() => accept(st)} disabled={busyId === st.connectionId}>
                      Accept
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => sendRequest(u)}
                      disabled={busyId === u.userId}
                      data-testid={`connections-add-${u.username}`}
                    >
                      <UserPlus className='size-4' /> Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {incoming.length > 0 && (
              <>
                <p className='px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  Requests
                </p>
                {incoming.map((c) => (
                  <div key={c.connectionId} className='flex items-center gap-3 px-4 py-2.5'>
                    <InitialAvatar name={c.account.displayName || c.account.username} avatar={c.account.avatar} />
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>{c.account.displayName}</p>
                      <p className='truncate text-xs text-muted-foreground'>@{c.account.username}</p>
                    </div>
                    <Button size='sm' onClick={() => accept(c)} disabled={busyId === c.connectionId}>
                      <Check className='size-4' /> Accept
                    </Button>
                    <Button
                      size='icon'
                      variant='ghost'
                      onClick={() => decline(c)}
                      disabled={busyId === c.connectionId}
                      aria-label='Decline'
                    >
                      <X className='size-4' />
                    </Button>
                  </div>
                ))}
              </>
            )}

            <p className='px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              Connections
            </p>
            {accepted.length === 0 ? (
              <p className='px-4 py-6 text-center text-sm text-muted-foreground'>
                No connections yet. Search a @username to add someone.
              </p>
            ) : (
              accepted.map((c) => (
                <button
                  key={c.connectionId}
                  onClick={() => onOpenConnection?.(c.connectionId, c.account)}
                  className='flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60'
                  data-testid={`connections-open-${c.account.username}`}
                >
                  <InitialAvatar name={c.account.displayName || c.account.username} />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{c.account.displayName}</p>
                    <p className='truncate text-xs text-muted-foreground'>@{c.account.username}</p>
                  </div>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
