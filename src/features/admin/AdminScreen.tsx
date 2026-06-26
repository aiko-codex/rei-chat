import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  Copy,
  KeyRound,
  LayoutDashboard,
  Users,
  UserPlus,
  Shield,
  LogOut,
  CircleCheck,
  CircleX,
  Clock,
  ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

type View = 'overview' | 'accounts' | 'create';

const NAV = [
  { id: 'overview' as View, label: 'Overview', icon: LayoutDashboard },
  { id: 'accounts' as View, label: 'Accounts', icon: Users },
  { id: 'create' as View, label: 'Create account', icon: UserPlus },
];

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [tempPws, setTempPws] = useState<Record<string, string>>(readTempPws);

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

  // Poll accounts every 30s while panel is open
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => void refresh(pw), 30_000);
    return () => clearInterval(id);
  }, [authed, pw]);

  if (!authed) {
    return <LoginGate pw={pw} setPw={setPw} error={error} busy={busy} onSubmit={unlock} onBack={onBack} />;
  }

  return (
    <SidebarProvider defaultOpen className='h-full min-h-0'>
      <div className='flex h-full w-full overflow-hidden bg-background'>
        <Sidebar collapsible='icon' className='border-r'>
          <SidebarHeader className='px-4 py-4'>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
                <Shield className='h-4 w-4' />
              </div>
              <div className='min-w-0 group-data-[collapsible=icon]:hidden'>
                <p className='text-sm font-semibold leading-none'>rei admin</p>
                <p className='mt-0.5 text-[11px] text-muted-foreground'>Super-admin panel</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className='px-2'>
            <SidebarMenu>
              {NAV.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={view === id}
                    onClick={() => setView(id)}
                    tooltip={label}
                  >
                    <Icon className='h-4 w-4' />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className='px-2 py-3'>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onBack} tooltip='Back to app'>
                  <ChevronLeft className='h-4 w-4' />
                  <span>Back to app</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => { setAuthed(false); setPw(''); }}
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
          {/* Top bar */}
          <header className='flex h-12 shrink-0 items-center gap-3 border-b px-4'>
            <SidebarTrigger className='-ml-1' />
            <div className='h-4 w-px bg-border' />
            <h1 className='text-sm font-semibold'>
              {NAV.find((n) => n.id === view)?.label}
            </h1>
          </header>

          <main className='flex-1 overflow-y-auto p-6'>
            <AnimatePresence mode='wait'>
              {view === 'overview' && (
                <OverviewView key='overview' accounts={accounts} onNavigate={setView} />
              )}
              {view === 'accounts' && (
                <AccountsView
                  key='accounts'
                  accounts={accounts}
                  tempPws={tempPws}
                  onToggleDisabled={(a) => void toggleDisabled(a, pw, refresh, setError)}
                />
              )}
              {view === 'create' && (
                <CreateView
                  key='create'
                  adminPw={pw}
                  onCreated={(map) => {
                    writeTempPws(map);
                    setTempPws(map);
                    void refresh(pw);
                    setView('accounts');
                  }}
                />
              )}
            </AnimatePresence>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

async function toggleDisabled(
  a: AdminAccount,
  pw: string,
  refresh: (pw: string) => Promise<void>,
  setError: (e: string | null) => void,
) {
  try {
    await setAccountDisabled(pw, a.userId, !a.disabled);
    await refresh(pw);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed');
  }
}

// ─── Login gate ───────────────────────────────────────────────────────────────

function LoginGate({
  pw, setPw, error, busy, onSubmit, onBack,
}: {
  pw: string; setPw: (v: string) => void; error: string | null;
  busy: boolean; onSubmit: (e: React.FormEvent) => void; onBack: () => void;
}) {
  return (
    <div className='flex h-full flex-col items-center justify-center bg-background px-6'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-full max-w-sm space-y-6'
      >
        <button
          onClick={onBack}
          className='flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
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

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewView({
  accounts,
  onNavigate,
}: {
  accounts: AdminAccount[];
  onNavigate: (v: View) => void;
}) {
  const total = accounts.length;
  const active = accounts.filter((a) => !a.disabled && !a.mustSetPassword).length;
  const pending = accounts.filter((a) => a.mustSetPassword && !a.disabled).length;
  const disabled = accounts.filter((a) => a.disabled).length;

  return (
    <PageSlide>
      <div className='space-y-6'>
        <div>
          <h2 className='text-lg font-semibold'>Welcome back</h2>
          <p className='text-sm text-muted-foreground'>Here's a quick look at the user base.</p>
        </div>

        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <StatCard label='Total accounts' value={total} icon={Users} color='text-primary' />
          <StatCard label='Active' value={active} icon={CircleCheck} color='text-emerald-500' />
          <StatCard label='Pending setup' value={pending} icon={Clock} color='text-amber-500' />
          <StatCard label='Disabled' value={disabled} icon={CircleX} color='text-destructive' />
        </div>

        {/* Recent accounts */}
        <div className='rounded-xl border'>
          <div className='flex items-center justify-between border-b px-4 py-3'>
            <p className='text-sm font-medium'>Recent accounts</p>
            <Button variant='ghost' size='sm' onClick={() => onNavigate('accounts')} className='text-xs'>
              View all
            </Button>
          </div>
          {accounts.length === 0 ? (
            <p className='px-4 py-6 text-center text-sm text-muted-foreground'>No accounts yet.</p>
          ) : (
            <ul className='divide-y'>
              {[...accounts]
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 5)
                .map((a) => (
                  <AccountRow key={a.userId} account={a} tempPws={{}} minimal />
                ))}
            </ul>
          )}
        </div>

        <Button onClick={() => onNavigate('create')} className='gap-2'>
          <UserPlus className='h-4 w-4' /> Create account
        </Button>
      </div>
    </PageSlide>
  );
}

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className='rounded-xl border bg-card p-4'>
      <div className={`mb-2 ${color}`}>
        <Icon className='h-5 w-5' />
      </div>
      <p className='text-2xl font-bold'>{value}</p>
      <p className='mt-0.5 text-xs text-muted-foreground'>{label}</p>
    </div>
  );
}

// ─── Accounts list ────────────────────────────────────────────────────────────

function AccountsView({
  accounts,
  tempPws,
  onToggleDisabled,
}: {
  accounts: AdminAccount[];
  tempPws: Record<string, string>;
  onToggleDisabled: (a: AdminAccount) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = accounts.filter(
    (a) =>
      a.username.includes(search.toLowerCase()) ||
      a.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (a.email ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PageSlide>
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search accounts…'
            className='max-w-xs'
          />
          <span className='text-sm text-muted-foreground'>{filtered.length} account{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className='rounded-xl border'>
          {filtered.length === 0 ? (
            <p className='px-4 py-8 text-center text-sm text-muted-foreground'>
              {accounts.length === 0 ? 'No accounts yet.' : 'No results.'}
            </p>
          ) : (
            <ul className='divide-y'>
              {filtered.map((a) => (
                <AccountRow
                  key={a.userId}
                  account={a}
                  tempPws={tempPws}
                  onToggleDisabled={() => onToggleDisabled(a)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageSlide>
  );
}

function AccountRow({
  account: a,
  tempPws,
  onToggleDisabled,
  minimal = false,
}: {
  account: AdminAccount;
  tempPws: Record<string, string>;
  onToggleDisabled?: () => void;
  minimal?: boolean;
}) {
  const statusLabel = a.disabled ? 'Disabled' : a.mustSetPassword ? 'Pending' : 'Active';
  const statusVariant = a.disabled
    ? 'destructive'
    : a.mustSetPassword
      ? 'secondary'
      : 'default';

  return (
    <li className='flex items-center gap-3 px-4 py-3'>
      {/* Avatar */}
      <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase text-foreground'>
        {a.displayName.slice(0, 1)}
      </div>

      {/* Info */}
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <p className='text-sm font-medium leading-none'>{a.displayName}</p>
          <span className='text-xs text-muted-foreground'>@{a.username}</span>
          <Badge variant={statusVariant} className='px-1.5 py-0 text-[10px]'>
            {statusLabel}
          </Badge>
        </div>
        {a.email && (
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>{a.email}</p>
        )}
        <p className='mt-0.5 text-[11px] text-muted-foreground'>
          Joined {new Date(a.createdAt * 1000).toLocaleDateString()}
        </p>
      </div>

      {/* Actions */}
      {!minimal && (
        <div className='flex shrink-0 items-center gap-1.5'>
          <IconCopyBtn value={a.username} label='Copy username' icon={<Copy className='h-3.5 w-3.5' />} />
          {tempPws[a.username] && (
            <IconCopyBtn
              value={tempPws[a.username]}
              label='Copy temp password'
              icon={<KeyRound className='h-3.5 w-3.5' />}
            />
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={onToggleDisabled}
            className='h-7 rounded-full px-3 text-xs'
          >
            {a.disabled ? 'Enable' : 'Disable'}
          </Button>
        </div>
      )}
    </li>
  );
}

function IconCopyBtn({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(label.replace('Copy ', '') + ' copied');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <button
      onClick={copy}
      title={label}
      aria-label={label}
      className='flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted'
    >
      {copied ? <Check className='h-3.5 w-3.5 text-emerald-600' /> : icon}
    </button>
  );
}

// ─── Create account ────────────────────────────────────────────────────────────

function CreateView({
  adminPw,
  onCreated,
}: {
  adminPw: string;
  onCreated: (tempPws: Record<string, string>) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = username.trim().length > 0 && displayName.trim().length > 0 && tempPassword.length >= 4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await createAccount(adminPw, {
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        tempPassword,
      });
      const creds = { username: res.username, password: tempPassword };
      setCreated(creds);
      const map = { ...readTempPws(), [res.username]: tempPassword };
      toast.success(`Account @${res.username} created`);
      setTimeout(() => onCreated(map), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageSlide>
      <div className='mx-auto max-w-md space-y-6'>
        <div>
          <h2 className='text-base font-semibold'>New account</h2>
          <p className='text-sm text-muted-foreground'>
            The user will be asked to set their own password on first login. The admin can't read their messages.
          </p>
        </div>

        <form onSubmit={submit} className='space-y-4'>
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

          {created && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className='space-y-3 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4'
              data-testid='admin-created-card'
            >
              <p className='text-sm font-medium text-emerald-600'>Account created — share these credentials</p>
              <CredentialRow label='Username' value={created.username} testId='admin-copy-username' />
              <CredentialRow label='Password' value={created.password} testId='admin-copy-password' />
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`Username: ${created.username}\nPassword: ${created.password}`)
                    .then(() => toast('Credentials copied'))
                }
                data-testid='admin-copy-both'
              >
                <Copy className='h-3.5 w-3.5' /> Copy both
              </Button>
            </motion.div>
          )}

          {error && <p className='text-sm text-destructive'>{error}</p>}

          <Button type='submit' className='w-full' disabled={busy || !valid}>
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      </div>
    </PageSlide>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1.5'>
      <label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function PageSlide({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

function CredentialRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div className='flex items-center gap-2'>
      <div className='min-w-0 flex-1'>
        <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
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
