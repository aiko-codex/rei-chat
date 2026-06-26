import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setPassword } from '@/lib/account-api';
import { formatRecoveryKey } from '@/lib/recovery';
import { getAccount } from '@/lib/session';
import { Lock, CheckCircle2, Eye, EyeOff, Copy, KeyRound } from 'lucide-react';

/**
 * First-login: set your own password. This is when the account keypair is
 * generated and the private key is wrapped under the new password — so the
 * admin (who set the temp password) can never decrypt your conversations.
 */
export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const account = getAccount();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  const valid = pw.length >= 6 && pw === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const { recoveryKey: rk } = await setPassword(pw);
      // show the recovery key once before entering the app — it's the only way
      // to reset a forgotten password without losing data.
      setRecoveryKey(rk);
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set password');
      setBusy(false);
    }
  };

  if (recoveryKey) {
    return <RecoveryKeyReveal recoveryKey={recoveryKey} onDone={onDone} />;
  }

  return (
    <div className='flex h-full flex-col items-center justify-center bg-linear-to-br from-background via-background to-background px-6 py-8'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        className='w-full max-w-sm'
      >
        {/* Header with Icon */}
        <div className='mb-8 flex flex-col items-center space-y-4'>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className='flex items-center justify-center'
          >
            <div className='rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 p-3'>
              <Lock className='h-6 w-6 text-primary' />
            </div>
          </motion.div>
          <div className='space-y-2 text-center'>
            <h1 className='text-3xl font-bold tracking-tight text-foreground'>
              Secure Your Account
            </h1>
            <p className='text-sm leading-relaxed text-muted-foreground'>
              Set a strong password that only you know. It encrypts all your messages and can't be recovered if forgotten.
            </p>
          </div>
        </div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          onSubmit={submit}
          className='space-y-4'
        >
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <label htmlFor='password' className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                New Password
              </label>
              <div className='relative'>
                <Input
                  id='password'
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder='••••••••'
                  autoComplete='new-password'
                  data-testid='setpw-password'
                  className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 pr-10 transition-all focus:bg-background'
                />
                <button
                  type='button'
                  onClick={() => setShowPw(!showPw)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>

            <div className='space-y-1.5'>
              <label htmlFor='confirm' className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                Confirm Password
              </label>
              <div className='relative'>
                <Input
                  id='confirm'
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder='••••••••'
                  autoComplete='new-password'
                  data-testid='setpw-confirm'
                  className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 pr-10 transition-all focus:bg-background'
                />
                <button
                  type='button'
                  onClick={() => setShowConfirm(!showConfirm)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>
          </div>

          {/* Password Requirements */}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className='space-y-2 rounded-lg bg-muted/30 px-3.5 py-3'
          >
            <div className='flex items-center gap-2'>
              <motion.div
                animate={{ scale: pw.length >= 6 ? 1 : 0.8 }}
                className={`shrink-0 text-xs font-medium ${pw.length >= 6 ? 'text-emerald-500' : 'text-muted-foreground'}`}
              >
                {pw.length >= 6 ? <CheckCircle2 className='h-4 w-4' /> : <div className='h-4 w-4 rounded-full border border-muted-foreground' />}
              </motion.div>
              <span className='text-xs font-medium text-muted-foreground'>At least 6 characters</span>
            </div>
            <div className='flex items-center gap-2'>
              <motion.div
                animate={{ scale: pw === confirm && confirm.length > 0 ? 1 : 0.8 }}
                className={`shrink-0 text-xs font-medium ${pw === confirm && confirm.length > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}
              >
                {pw === confirm && confirm.length > 0 ? <CheckCircle2 className='h-4 w-4' /> : <div className='h-4 w-4 rounded-full border border-muted-foreground' />}
              </motion.div>
              <span className='text-xs font-medium text-muted-foreground'>Passwords match</span>
            </div>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className='rounded-lg bg-destructive/10 px-3.5 py-2.5 text-center text-sm font-medium text-destructive'
            >
              {error}
            </motion.div>
          )}

          <Button
            type='submit'
            className='h-12 w-full rounded-full text-base font-semibold shadow-md transition-all hover:shadow-lg disabled:shadow-none'
            disabled={busy || !valid}
            data-testid='setpw-submit'
          >
            {busy ? 'Setting up…' : 'Secure & Continue'}
          </Button>
        </motion.form>

        {/* Footer Text */}
        <p className='mt-6 text-center text-xs text-muted-foreground'>
          Welcome{account ? `, @${account.username}` : ''}! Your password is never shared with anyone.
        </p>
      </motion.div>
    </div>
  );
}

/**
 * Shown once, right after a password is set: the recovery key. It's the only
 * way to reset a forgotten password without losing your chats — we can't
 * recover it for you, so it must be saved now.
 */
export function RecoveryKeyReveal({
  recoveryKey,
  onDone,
}: {
  recoveryKey: string;
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatRecoveryKey(recoveryKey));
      toast.success('Recovery key copied');
    } catch {
      toast.error('Could not copy — write it down instead');
    }
  };

  return (
    <div className='flex h-full flex-col items-center justify-center px-6 py-8'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        className='w-full max-w-sm'
      >
        <div className='mb-6 flex flex-col items-center space-y-4 text-center'>
          <div className='rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 p-3'>
            <KeyRound className='h-6 w-6 text-primary' />
          </div>
          <h1 className='text-2xl font-bold tracking-tight'>Save your recovery key</h1>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            This is the only way to get back in if you ever forget your password —
            without it your chats are lost. Keep it somewhere safe (password
            manager or written down). We can never see it.
          </p>
        </div>

        <button
          type='button'
          onClick={copy}
          className='group w-full rounded-2xl border border-border/60 bg-muted/40 px-4 py-5 transition-colors hover:bg-muted/70'
          data-testid='recovery-key-value'
        >
          <span className='block break-all text-center font-mono text-lg font-semibold tracking-wider'>
            {formatRecoveryKey(recoveryKey)}
          </span>
          <span className='mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground'>
            <Copy className='h-3.5 w-3.5' /> Tap to copy
          </span>
        </button>

        <label className='mt-6 flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground'>
          <input
            type='checkbox'
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className='mt-0.5 size-4 accent-primary'
            data-testid='recovery-key-confirm'
          />
          <span>I've saved my recovery key somewhere safe.</span>
        </label>

        <Button
          onClick={onDone}
          disabled={!confirmed}
          className='mt-6 h-12 w-full rounded-full text-base font-semibold shadow-md transition-all hover:shadow-lg disabled:shadow-none'
          data-testid='recovery-key-done'
        >
          Continue
        </Button>
      </motion.div>
    </div>
  );
}
