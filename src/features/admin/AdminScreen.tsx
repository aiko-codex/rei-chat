import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronLeft, Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/**
 * Minimalist super-admin panel: gate on the admin password, then create / list
 * / disable accounts. The admin never sees message content — only account rows.
 */
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // new-account form
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  // the just-created credentials, shown with copy buttons (the plaintext temp
  // password exists only here — the server stores a hash, never the password)
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [tempPws, setTempPws] = useState<Record<string, string>>(readTempPws);

  const refresh = async (adminPw: string) => {
    const { accounts } = await listAccounts(adminPw);
    setAccounts(accounts);
    // prune cached temp passwords for accounts that have set their real password
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await createAccount(pw, {
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        tempPassword,
      });
      setCreated({ username: res.username, password: tempPassword });
      const map = { ...readTempPws(), [res.username]: tempPassword };
      writeTempPws(map);
      setTempPws(map);
      setUsername('');
      setDisplayName('');
      setEmail('');
      setTempPassword('');
      await refresh(pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  };

  const toggleDisabled = async (a: AdminAccount) => {
    try {
      await setAccountDisabled(pw, a.userId, !a.disabled);
      await refresh(pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className='flex h-full flex-col bg-background'>
      <header className='flex items-center gap-2 border-b px-3 py-3'>
        <button onClick={onBack} className='rounded-full p-1 hover:bg-muted [&_svg]:size-5'>
          <ChevronLeft />
        </button>
        <h1 className='text-[15px] font-semibold'>Admin</h1>
      </header>

      <div className='flex-1 overflow-y-auto px-5 py-6'>
        {!authed ? (
          <form onSubmit={unlock} className='mx-auto max-w-xs space-y-4'>
            <p className='text-sm text-muted-foreground'>Enter the admin password to manage accounts.</p>
            <Input
              type='password'
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder='Admin password'
              autoComplete='off'
              data-testid='admin-password'
            />
            {error && <p className='text-sm text-destructive'>{error}</p>}
            <Button type='submit' className='w-full' disabled={busy || !pw}>
              {busy ? 'Checking…' : 'Unlock'}
            </Button>
          </form>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className='mx-auto max-w-md space-y-8'
          >
            <form onSubmit={create} className='space-y-3'>
              <h2 className='text-sm font-semibold'>Create account</h2>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder='username (a–z, 0–9, . _)'
                autoCapitalize='none'
                data-testid='admin-new-username'
              />
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder='Display name'
                data-testid='admin-new-display'
              />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder='Email (optional)'
                autoCapitalize='none'
              />
              <Input
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder='Temporary password'
                data-testid='admin-new-temp'
              />
              {created && (
                <div className='space-y-2 rounded-xl border border-emerald-600/40 bg-emerald-600/5 p-3' data-testid='admin-created-card'>
                  <p className='text-xs font-medium text-emerald-600'>Account created — share these credentials</p>
                  <CredentialRow label='Username' value={created.username} testId='admin-copy-username' />
                  <CredentialRow label='Password' value={created.password} testId='admin-copy-password' />
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='w-full cursor-pointer'
                    onClick={() => void copyText(`Username: ${created.username}\nPassword: ${created.password}`, 'Credentials copied')}
                    data-testid='admin-copy-both'
                  >
                    <Copy className='size-3.5' /> Copy both
                  </Button>
                </div>
              )}
              {error && <p className='text-sm text-destructive'>{error}</p>}
              <Button
                type='submit'
                className='w-full'
                disabled={busy || !username.trim() || !displayName.trim() || tempPassword.length < 4}
              >
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </form>

            <div className='space-y-2'>
              <h2 className='text-sm font-semibold'>Accounts ({accounts.length})</h2>
              <ul className='divide-y rounded-xl border'>
                {accounts.map((a) => (
                  <li key={a.userId} className='flex items-center justify-between gap-2 px-3 py-2.5'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>
                        {a.displayName} <span className='text-muted-foreground'>@{a.username}</span>
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {a.disabled ? 'disabled' : a.mustSetPassword ? 'awaiting first login' : 'active'}
                      </p>
                    </div>
                    <div className='flex shrink-0 items-center gap-1.5'>
                      <button
                        onClick={() => void copyText(a.username, 'Username copied')}
                        className='rounded-full border p-1.5 text-muted-foreground hover:bg-muted [&_svg]:size-3.5'
                        aria-label='Copy username'
                        title='Copy username'
                      >
                        <Copy />
                      </button>
                      {tempPws[a.username] && (
                        <button
                          onClick={() => void copyText(tempPws[a.username], 'Password copied')}
                          className='rounded-full border p-1.5 text-muted-foreground hover:bg-muted [&_svg]:size-3.5'
                          aria-label='Copy password'
                          title='Copy temporary password'
                        >
                          <KeyRound />
                        </button>
                      )}
                      <button
                        onClick={() => toggleDisabled(a)}
                        className='rounded-full border px-3 py-1 text-xs hover:bg-muted'
                      >
                        {a.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </div>
                  </li>
                ))}
                {accounts.length === 0 && (
                  <li className='px-3 py-4 text-center text-sm text-muted-foreground'>No accounts yet.</li>
                )}
              </ul>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

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
        <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
        <p className='truncate font-mono text-sm'>{value}</p>
      </div>
      <button
        type='button'
        onClick={copy}
        className='shrink-0 rounded-lg border p-2 text-muted-foreground hover:bg-muted [&_svg]:size-4'
        aria-label={`Copy ${label.toLowerCase()}`}
        data-testid={testId}
      >
        {copied ? <Check className='text-emerald-600' /> : <Copy />}
      </button>
    </div>
  );
}
