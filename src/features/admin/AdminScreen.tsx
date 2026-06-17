import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createAccount,
  listAccounts,
  setAccountDisabled,
  type AdminAccount,
} from '@/lib/admin-api';

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
  const [created, setCreated] = useState<string | null>(null);

  const refresh = async (adminPw: string) => {
    const { accounts } = await listAccounts(adminPw);
    setAccounts(accounts);
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
      setCreated(`@${res.username} created · temp password: ${tempPassword}`);
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
              {created && <p className='text-sm text-emerald-600'>{created}</p>}
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
                    <button
                      onClick={() => toggleDisabled(a)}
                      className='shrink-0 rounded-full border px-3 py-1 text-xs hover:bg-muted'
                    >
                      {a.disabled ? 'Enable' : 'Disable'}
                    </button>
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
