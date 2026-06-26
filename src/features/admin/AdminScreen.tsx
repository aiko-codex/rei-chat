import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  KeyRound,
  Search,
  Shield,
  LogOut,
  ChevronLeft,
  UserPlus,
  MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await refresh(pw);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong admin password');
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
    return <LoginGate pw={pw} setPw={setPw} error={error} busy={busy} onSubmit={unlock} onBack={onBack} />;
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
      </TooltipProvider>
    </div>
  );
}

// ─── Login gate ───────────────────────────────────────────────────────────────

function LoginGate({
  pw,
  setPw,
  error,
  busy,
  onSubmit,
  onBack,
}: {
  pw: string;
  setPw: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
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
            <p className='mt-1 text-sm text-muted-foreground'>Enter the admin password to continue.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className='space-y-3'>
          <Input
            type='password'
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder='Admin password'
            autoComplete='off'
            data-testid='admin-password'
            className='h-11'
          />
          {error && <p className='text-sm text-destructive'>{error}</p>}
          <Button type='submit' className='w-full' disabled={busy || !pw}>
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
}: {
  account: AdminAccount;
  tempPw?: string;
  highlighted?: boolean;
  onToggleDisabled: () => void;
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
