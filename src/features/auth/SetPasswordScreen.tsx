import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setPassword } from '@/lib/account-api';
import { getAccount } from '@/lib/session';

/**
 * First-login: set your own password. This is when the account keypair is
 * generated and the private key is wrapped under the new password — so the
 * admin (who set the temp password) can never decrypt your conversations.
 */
export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const account = getAccount();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = pw.length > 0 && pw.length < 6;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const valid = pw.length >= 6 && pw === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await setPassword(pw);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set password');
      setBusy(false);
    }
  };

  return (
    <div className='flex h-full flex-col items-center justify-center bg-background px-8'>
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        onSubmit={submit}
        className='w-full max-w-xs space-y-5'
      >
        <div className='space-y-1 text-center'>
          <h1 className='text-xl font-semibold tracking-tight'>
            Welcome{account ? `, @${account.username}` : ''}
          </h1>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            Set a password only you know. It encrypts your messages — if you forget it,
            your chats can't be recovered.
          </p>
        </div>

        <div className='space-y-2.5'>
          <Input
            type='password'
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder='New password'
            autoComplete='new-password'
            data-testid='setpw-password'
          />
          <Input
            type='password'
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder='Confirm password'
            autoComplete='new-password'
            data-testid='setpw-confirm'
          />
          {tooShort && <p className='text-xs text-muted-foreground'>At least 6 characters.</p>}
          {mismatch && <p className='text-xs text-destructive'>Passwords don't match.</p>}
        </div>

        {error && <p className='text-center text-sm text-destructive'>{error}</p>}

        <Button type='submit' className='w-full' disabled={busy || !valid} data-testid='setpw-submit'>
          {busy ? 'Setting up…' : 'Continue'}
        </Button>
      </motion.form>
    </div>
  );
}
