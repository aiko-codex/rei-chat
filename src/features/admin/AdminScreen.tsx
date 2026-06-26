import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  KeyRound,
  Search,
  Shield,
  ShieldCheck,
  LogOut,
  ChevronLeft,
  UserPlus,
  MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ADMIN_PUBLIC_KEY } from '@/lib/config';
import { deriveAdminProof, openSealedStringWithKeys, readyCrypto } from '@/lib/account-crypto';
import { formatRecoveryKey } from '@/lib/recovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import {
  createAccount,
  listAccounts,
  setAccountDisabled,
  getAdminRecovery,
  type AdminAccount,
} from '@/lib/admin-api';

// Temp passwords are NOT stored on the server (it only keeps a hash), so to let
// the admin re-copy a new account's password from the list later, we cache the
// just-created temp passwords locally on THIS admin device, keyed by username.
// They're only valid until the user does their first login + sets a real
// password, at which point the entry is pruned.
const TEMP_PW_KEY = 'rei-admin-temp-pw';
function readTempPws(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TEMP_PW_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function writeTempPws(map: Record<string, string>): void {
  localStorage.setItem(TEMP_PW_KEY, JSON.stringify(map));
}

type Status = 'active' | 'pending' | 'disabled';
type FilterId = 'all' | Status;

function accountStatus(a: AdminAccount): Status {
  if (a.disabled) return 'disabled';
  if (a.mustSetPassword) return 'pending';
  return 'active';
}

const STATUS_DOT: Record<Status, string> = {
  active: 'bg-emerald-500',
  pending: 'bg-amber-500',
  disabled: 'bg-muted-foreground/40',
};
const STATUS_LABEL: Record<Status, string> = {
  active: 'Active',
  pending: 'Pending setup',
  disabled: 'Disabled',
};
const FILTERS: { id: FilterId; label: string; dot?: Status }[] = [
  { id: 'all', label: 'All accounts' },
  { id: 'active', label: 'Active', dot: 'active' },
  { id: 'pending', label: 'Pending setup', dot: 'pending' },
  { id: 'disabled', label: 'Disabled', dot: 'disabled' },
];

/**
 * Super-admin panel: gate on the admin password, then create / list / disable
 * accounts. The admin never sees message content — only account rows.
 */
export function AdminScreen({ onBack }: { onBack: () => void }) {
  // `pw` here is the derived admin PROOF (sha256 of the escrow key), not a
  // password — it's what every admin_* call sends; the server stores only its
  // hash. Set on unlock from the loaded escrow private key.
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [tempPws, setTempPws] = useState<Record<string, string>>(readTempPws);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  // in-panel "Recover access": which account's sheet is open, and the offline
  // escrow private key — held in memory for this panel session only, NEVER
  // persisted or sent to the server (paste once, reuse across accounts).
  const [recoverFor, setRecoverFor] = useState<AdminAccount | null>(null);
  const [escrowPriv, setEscrowPriv] = useState('');

  const refresh = async (adminPw: string) => {
    const { accounts } = await listAccounts(adminPw);
    setAccounts(accounts);
    const map = readTempPws();
    let changed = false;
    for (const a of accounts) {
      if (!a.mustSetPassword && map[a.username]) {
        delete map[a.username];
        changed = true;
      }
    }
    if (changed) {
      writeTempPws(map);
      setTempPws(map);
    }
  };

  // Unlock with the offline escrow private key: derive the admin proof from it,
  // verify against the server, and — since the same key unseals recovery blobs —
  // load it into escrowPriv so "Recover access" needs no second paste.
  const unlock = async (escrowKey: string) => {
    const key = escrowKey.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await readyCrypto();
      const proof = deriveAdminProof(key);
      await refresh(proof);
      setPw(proof);
      setEscrowPriv(key);
      setAuthed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'That admin key was not accepted';
      setError(/401|auth failed/i.test(msg) ? 'That admin key was not accepted.' : msg);
    } finally {
      setBusy(false);
    }
  };

  // keep the roster live while the panel is open
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => void refresh(pw), 30_000);
    return () => clearInterval(id);
  }, [authed, pw]);

  // brief "just created" row highlight, then clear
  useEffect(() => {
    if (!justCreated) return;
    const t = setTimeout(() => setJustCreated(null), 2000);
    return () => clearTimeout(t);
  }, [justCreated]);

  const counts = useMemo(
    () => ({
      all: accounts.length,
      active: accounts.filter((a) => accountStatus(a) === 'active').length,
      pending: accounts.filter((a) => accountStatus(a) === 'pending').length,
      disabled: accounts.filter((a) => accountStatus(a) === 'disabled').length,
    }),
    [accounts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts
      .filter((a) => filter === 'all' || accountStatus(a) === filter)
      .filter(
        (a) =>
          !q ||
          a.username.toLowerCase().includes(q) ||
          a.displayName.toLowerCase().includes(q) ||
          (a.email ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [accounts, filter, search]);

  const toggleDisabled = async (a: AdminAccount) => {
    try {
      await setAccountDisabled(pw, a.userId, !a.disabled);
      toast(a.disabled ? `@${a.username} enabled` : `@${a.username} disabled`);
      await refresh(pw);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  if (!authed) {
    return <LoginGate error={error} busy={busy} onUnlock={unlock} onBack={onBack} />;
  }

  const activeFilterLabel = FILTERS.find((f) => f.id === filter)?.label;

  return (
    <div style={{ contain: 'layout' }} className='h-full w-full'>
      <TooltipProvider>
        <SidebarProvider defaultOpen className='h-full min-h-0'>
          <div className='flex h-full w-full overflow-hidden bg-background'>
            <Sidebar collapsible='icon' className='border-r'>
              <SidebarHeader className='px-3 py-3'>
                <div className='flex items-center gap-2'>
                  <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground'>
                    <Shield className='h-3.5 w-3.5' />
                  </div>
                  <p className='min-w-0 truncate text-sm font-semibold group-data-[collapsible=icon]:hidden'>
                    rei admin
                  </p>
                </div>
              </SidebarHeader>

              <SidebarContent className='gap-3 px-2 pt-1'>
                <div className='space-y-2 group-data-[collapsible=icon]:hidden'>
                  <div className='relative'>
                    <Search className='pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder='Search accounts'
                      className='h-8 pl-7 text-sm'
                      data-testid='admin-search'
                    />
                  </div>
                  <Button
                    size='sm'
                    className='w-full justify-start gap-2'
                    onClick={() => setSheetOpen(true)}
                    data-testid='admin-open-create'
                  >
                    <UserPlus className='h-3.5 w-3.5' /> Create account
                  </Button>
                </div>

                <SidebarMenu>
                  {FILTERS.map(({ id, label, dot }) => (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton isActive={filter === id} onClick={() => setFilter(id)} tooltip={label}>
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            dot ? STATUS_DOT[dot] : 'border border-muted-foreground/40',
                          )}
                        />
                        <span className='truncate'>{label}</span>
                        <span className='ml-auto shrink-0 text-xs tabular-nums text-muted-foreground'>
                          {counts[id]}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarContent>

              <SidebarFooter className='px-2 py-2'>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={onBack} tooltip='Back to app'>
                      <ChevronLeft className='h-4 w-4' />
                      <span>Back to app</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => {
                        setAuthed(false);
                        setPw('');
                      }}
                      tooltip='Sign out'
                      className='text-destructive hover:text-destructive'
                    >
                      <LogOut className='h-4 w-4' />
                      <span>Sign out</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarFooter>
            </Sidebar>

            <SidebarInset className='flex min-w-0 flex-1 flex-col overflow-hidden'>
              <header className='flex h-12 shrink-0 items-center gap-3 border-b px-4'>
                <SidebarTrigger className='-ml-1' />
                <Separator orientation='vertical' className='h-4' />
                <h1 className='text-sm font-semibold'>{activeFilterLabel}</h1>
                <span className='text-xs text-muted-foreground'>{filtered.length}</span>
              </header>

              <main className='flex-1 overflow-y-auto'>
                {filtered.length === 0 ? (
                  <div className='flex h-full items-center justify-center p-6'>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant='icon'>
                          {accounts.length === 0 ? <UserPlus className='h-4 w-4' /> : <Search className='h-4 w-4' />}
                        </EmptyMedia>
                        <EmptyTitle>{accounts.length === 0 ? 'No accounts yet' : 'No matches'}</EmptyTitle>
                        <EmptyDescription>
                          {accounts.length === 0
                            ? 'Create the first account to get started.'
                            : 'Try a different search or filter.'}
                        </EmptyDescription>
                      </EmptyHeader>
                      {accounts.length === 0 && (
                        <EmptyContent>
                          <Button size='sm' onClick={() => setSheetOpen(true)} className='gap-2'>
                            <UserPlus className='h-3.5 w-3.5' /> Create account
                          </Button>
                        </EmptyContent>
                      )}
                    </Empty>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className='text-right'>Active</TableHead>
                        <TableHead className='w-8' />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((a) => (
                        <AccountTableRow
                          key={a.userId}
                          account={a}
                          tempPw={tempPws[a.username]}
                          highlighted={justCreated === a.username}
                          onToggleDisabled={() => void toggleDisabled(a)}
                          onRecover={() => setRecoverFor(a)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>

        <CreateAccountSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          adminPw={pw}
          onCreated={(username, tempPassword) => {
            const map = { ...readTempPws(), [username]: tempPassword };
            writeTempPws(map);
            setTempPws(map);
            void refresh(pw);
            setJustCreated(username);
            setFilter('all');
            setSearch('');
          }}
        />

        <RecoverAccessSheet
          account={recoverFor}
          adminPw={pw}
          escrowPriv={escrowPriv}
          setEscrowPriv={setEscrowPriv}
          onClose={() => setRecoverFor(null)}
        />
      </TooltipProvider>
    </div>
  );
}

// ─── Login gate ───────────────────────────────────────────────────────────────

function LoginGate({
  error,
  busy,
  onUnlock,
  onBack,
}: {
  error: string | null;
  busy: boolean;
  onUnlock: (escrowKey: string) => void;
  onBack: () => void;
}) {
  const [key, setKey] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // read a saved key file (escrow_private_key.txt) and pull out the base64 key —
  // the last non-empty, non-comment line.
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const line = text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#'))
        .pop();
      if (line) setKey(line);
      else toast.error('No key found in that file');
    } catch {
      toast.error("Couldn't read that file");
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className='flex h-full flex-col items-center justify-center bg-background px-6'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-full max-w-sm space-y-6'
      >
        <button onClick={onBack} className='flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'>
          <ChevronLeft className='h-4 w-4' /> Back
        </button>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground'>
            <Shield className='h-6 w-6' />
          </div>
          <div>
            <h1 className='text-xl font-bold'>Admin panel</h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Unlock with your offline admin key. The key stays on this device — the server only ever sees a one-way
              proof.
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUnlock(key);
          }}
          className='space-y-3'
        >
          <Input
            type='password'
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder='Paste your admin key'
            autoComplete='off'
            spellCheck={false}
            data-testid='admin-key'
            className='h-11 font-mono'
          />
          <button
            type='button'
            onClick={() => fileRef.current?.click()}
            className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'
          >
            <KeyRound className='h-3.5 w-3.5' /> Load key file…
          </button>
          <input
            ref={fileRef}
            type='file'
            accept='.txt,text/plain'
            className='hidden'
            onChange={(e) => void loadFile(e.target.files?.[0])}
            data-testid='admin-key-file'
          />
          {error && <p className='text-sm text-destructive'>{error}</p>}
          <Button type='submit' className='w-full' disabled={busy || !key.trim()}>
            {busy ? 'Checking…' : 'Unlock'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Account row ──────────────────────────────────────────────────────────────

function AccountTableRow({
  account: a,
  tempPw,
  highlighted,
  onToggleDisabled,
  onRecover,
}: {
  account: AdminAccount;
  tempPw?: string;
  highlighted?: boolean;
  onToggleDisabled: () => void;
  onRecover: () => void;
}) {
  const status = accountStatus(a);

  return (
    <TableRow className={cn(highlighted && 'bg-primary/10')} data-testid='admin-account-row'>
      <TableCell>
        <div className='flex items-center gap-2.5'>
          <Avatar>
            <AvatarFallback className='bg-primary/90 text-xs font-semibold text-white'>
              {a.displayName.slice(0, 1).toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium leading-tight'>{a.displayName}</p>
            <p className='truncate text-xs leading-tight text-muted-foreground'>@{a.username}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className='text-sm text-muted-foreground'>{a.email || '—'}</TableCell>
      <TableCell>
        <span className='flex items-center gap-1.5 text-sm whitespace-nowrap'>
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              STATUS_DOT[status],
              status === 'pending' && 'animate-pulse',
            )}
          />
          {STATUS_LABEL[status]}
        </span>
      </TableCell>
      <TableCell className='text-sm whitespace-nowrap text-muted-foreground'>
        {new Date(a.createdAt * 1000).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </TableCell>
      <TableCell className='text-right'>
        <Switch
          checked={!a.disabled}
          onCheckedChange={onToggleDisabled}
          aria-label={a.disabled ? 'Enable account' : 'Disable account'}
          data-testid='admin-toggle-disabled'
        />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon-sm' aria-label='Account actions'>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onSelect={() => void copyText(a.username, 'Username copied')}>
              <Copy className='h-3.5 w-3.5' /> Copy username
            </DropdownMenuItem>
            {tempPw && (
              <DropdownMenuItem onSelect={() => void copyText(tempPw, 'Temporary password copied')}>
                <KeyRound className='h-3.5 w-3.5' /> Copy temp password
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onRecover} data-testid='admin-recover-action'>
              <ShieldCheck className='h-3.5 w-3.5' /> Recover access
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ─── Create account ────────────────────────────────────────────────────────────

function CreateAccountSheet({
  open,
  onOpenChange,
  adminPw,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminPw: string;
  onCreated: (username: string, tempPassword: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setUsername('');
    setDisplayName('');
    setEmail('');
    setTempPassword('');
    setCreated(null);
    setError(null);
    setBusy(false);
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setTimeout(reset, 200);
  };

  const valid = username.trim().length > 0 && displayName.trim().length > 0 && tempPassword.length >= 4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createAccount(adminPw, {
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        tempPassword,
      });
      setCreated({ username: res.username, password: tempPassword });
      onCreated(res.username, tempPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className='flex w-full flex-col sm:max-w-md'>
        {created ? (
          <>
            <SheetHeader>
              <SheetTitle>Account created</SheetTitle>
              <SheetDescription>
                Share these with @{created.username} — the password only exists here; the server keeps a hash, never the plaintext.
              </SheetDescription>
            </SheetHeader>
            <div className='flex-1 space-y-3 px-4'>
              <CredentialRow label='Username' value={created.username} testId='admin-copy-username' />
              <CredentialRow label='Password' value={created.password} testId='admin-copy-password' />
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() =>
                  void copyText(`Username: ${created.username}\nPassword: ${created.password}`, 'Credentials copied')
                }
                data-testid='admin-copy-both'
              >
                <Copy className='h-3.5 w-3.5' /> Copy both
              </Button>
            </div>
            <SheetFooter>
              <Button onClick={() => handleOpenChange(false)} className='w-full'>
                Done
              </Button>
            </SheetFooter>
          </>
        ) : (
          <form onSubmit={submit} className='flex h-full flex-col'>
            <SheetHeader>
              <SheetTitle>Create account</SheetTitle>
              <SheetDescription>They'll set their own password on first login — you never see it.</SheetDescription>
            </SheetHeader>
            <div className='flex-1 space-y-4 overflow-y-auto px-4'>
              <Field label='Username'>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder='e.g. jess_21'
                  autoCapitalize='none'
                  data-testid='admin-new-username'
                />
              </Field>
              <Field label='Display name'>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder='e.g. Jessica'
                  data-testid='admin-new-display'
                />
              </Field>
              <Field label='Email (optional)'>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='user@example.com'
                  autoCapitalize='none'
                  type='email'
                />
              </Field>
              <Field label='Temporary password'>
                <Input
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder='At least 4 characters'
                  data-testid='admin-new-temp'
                />
              </Field>
              {error && <p className='text-sm text-destructive'>{error}</p>}
            </div>
            <SheetFooter>
              <Button type='submit' className='w-full' disabled={busy || !valid}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1.5'>
      <label className='text-xs font-semibold tracking-wider text-muted-foreground uppercase'>{label}</label>
      {children}
    </div>
  );
}

// ─── Recover access (escrow) ───────────────────────────────────────────────────

/**
 * God-access recovery, in-panel. The admin pastes their OFFLINE escrow private
 * key (never stored, never sent to the server); the panel pulls the sealed
 * `admin_wrap` for the account and unseals it client-side → the user's recovery
 * key, which unlocks their account (use it on the Forgot-password screen to
 * reset / sign in as them). Because the only decryption secret (the escrow
 * private key) lives in the admin's head/keystore — not on the host — a server
 * or DB breach still recovers nothing.
 */
function RecoverAccessSheet({
  account,
  adminPw,
  escrowPriv,
  setEscrowPriv,
  onClose,
}: {
  account: AdminAccount | null;
  adminPw: string;
  escrowPriv: string;
  setEscrowPriv: (v: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);

  const open = account !== null;
  const configured = Boolean(ADMIN_PUBLIC_KEY);

  // clear the revealed key + error whenever the target account changes/closes,
  // but keep the pasted escrow key (so it's paste-once across accounts)
  useEffect(() => {
    setRecovered(null);
    setError(null);
    setBusy(false);
  }, [account?.userId]);

  const reveal = async () => {
    if (!account || busy) return;
    const priv = escrowPriv.trim();
    if (!priv) {
      setError('Paste your offline escrow private key first.');
      return;
    }
    setBusy(true);
    setError(null);
    setRecovered(null);
    try {
      await readyCrypto();
      const { adminWrap } = await getAdminRecovery(adminPw, account.username);
      const key = openSealedStringWithKeys(adminWrap, ADMIN_PUBLIC_KEY, priv);
      if (!key) {
        setError("Couldn't unseal — that escrow key doesn't match this deployment.");
      } else {
        setRecovered(key);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recovery failed';
      setError(
        /no admin escrow/i.test(msg)
          ? 'No escrow on file for this account — it was created before escrow was configured. Have them open Settings → Security → Recovery key once while logged in.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className='flex w-full flex-col sm:max-w-md'>
        <SheetHeader>
          <SheetTitle>Recover access</SheetTitle>
          <SheetDescription>
            {account
              ? `Unseal @${account.username}'s recovery key with your offline escrow key. Nothing here is stored or sent to the server.`
              : null}
          </SheetDescription>
        </SheetHeader>

        {!configured ? (
          <div className='flex-1 space-y-3 px-4 text-sm'>
            <p className='font-medium text-destructive'>Escrow isn't configured yet.</p>
            <p className='text-muted-foreground'>
              No escrow public key is built into this app, so accounts have no recoverable blob. To turn on
              god-access recovery (one-time):
            </p>
            <ol className='list-decimal space-y-1.5 pl-4 text-muted-foreground'>
              <li>
                Run <code className='rounded bg-muted px-1 py-0.5 text-xs'>node tools/admin-recover.mjs keygen</code>
              </li>
              <li>
                Put the <strong>public</strong> key in <code className='rounded bg-muted px-1 py-0.5 text-xs'>.env.local</code> as{' '}
                <code className='rounded bg-muted px-1 py-0.5 text-xs'>VITE_ADMIN_PUBLIC_KEY</code>, then rebuild.
              </li>
              <li>
                Keep the <strong>private</strong> key offline — paste it here when recovering. New accounts get a
                recoverable blob automatically from then on.
              </li>
            </ol>
          </div>
        ) : recovered ? (
          <div className='flex-1 space-y-3 px-4'>
            <p className='text-sm text-muted-foreground'>
              This unlocks @{account?.username}'s account — use it on the <strong>Forgot password?</strong> screen to
              reset their password (data is preserved) or sign in as them.
            </p>
            <CredentialRow label='Recovery key' value={formatRecoveryKey(recovered)} testId='admin-recovered-key' />
          </div>
        ) : (
          <div className='flex-1 space-y-3 px-4'>
            <Field label='Escrow private key'>
              <Input
                value={escrowPriv}
                onChange={(e) => setEscrowPriv(e.target.value)}
                placeholder='paste your offline escrow private key'
                autoCapitalize='none'
                autoComplete='off'
                spellCheck={false}
                className='font-mono'
                data-testid='admin-escrow-key'
              />
            </Field>
            <p className='text-xs text-muted-foreground'>
              Held in memory for this session only — never written to disk or sent to the server.
            </p>
            {error && <p className='text-sm text-destructive'>{error}</p>}
          </div>
        )}

        <SheetFooter>
          {configured && !recovered ? (
            <Button onClick={() => void reveal()} disabled={busy || !escrowPriv.trim()} className='w-full'>
              {busy ? 'Recovering…' : 'Reveal recovery key'}
            </Button>
          ) : (
            <Button variant='outline' onClick={onClose} className='w-full'>
              Close
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

async function copyText(text: string, okMsg = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    toast.error("Couldn't copy");
  }
}

function CredentialRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(value, `${label} copied`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className='flex items-center gap-2'>
      <div className='min-w-0 flex-1'>
        <p className='text-[11px] tracking-wide text-muted-foreground uppercase'>{label}</p>
        <p className='truncate font-mono text-sm'>{value}</p>
      </div>
      <button
        type='button'
        onClick={copy}
        className='shrink-0 rounded-lg border p-2 text-muted-foreground hover:bg-muted'
        aria-label={`Copy ${label.toLowerCase()}`}
        data-testid={testId}
      >
        {copied ? <Check className='h-4 w-4 text-emerald-600' /> : <Copy className='h-4 w-4' />}
      </button>
    </div>
  );
}
