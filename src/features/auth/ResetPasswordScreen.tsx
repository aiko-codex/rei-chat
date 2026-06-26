import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetPassword } from '@/lib/account-api';
import { formatRecoveryKey, normalizeRecoveryKey } from '@/lib/recovery';
import { KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';

/**
 * Forgotten-password reset using the recovery key. Recovers the account's
 * existing keypair (so no chats are lost) and sets a new password. The old
 * password is never needed and can't be recovered — by design.
 */
export function ResetPasswordScreen({
  onReset,
  onBack,
}: {
  onReset: () => void;
  onBack: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recoveryKey = normalizeRecoveryKey(recoveryInput);
  const valid = Boolean(identifier.trim()) && Boolean(recoveryKey) && pw.length >= 6 && pw === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid || !recoveryKey) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(identifier.trim(), recoveryKey, pw);
      onReset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      // friendlier message for the common server responses
      setError(
        /no recoverable|no recovery/i.test(msg)
          ? "No recovery key is on file for that account — ask the admin to recover it."
          : msg,
      );
      setBusy(false);
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
        <button
          type='button'
          onClick={onBack}
          className='mb-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
          data-testid='reset-back'
        >
          <ArrowLeft className='h-4 w-4' /> Back
        </button>

        <div className='mb-6 flex flex-col items-center space-y-3 text-center'>
          <div className='rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 p-3'>
            <KeyRound className='h-6 w-6 text-primary' />
          </div>
          <h1 className='text-2xl font-bold tracking-tight'>Reset password</h1>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            Enter your recovery key to set a new password. Your chats stay intact —
            the old password isn't needed.
          </p>
        </div>

        <form onSubmit={submit} className='space-y-4'>
          <div className='space-y-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Username or Email
            </label>
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder='you@example.com'
              autoCapitalize='none'
              autoCorrect='off'
              autoComplete='username'
              data-testid='reset-identifier'
              className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 transition-all focus:bg-background'
            />
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Recovery key
            </label>
            <Input
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(formatRecoveryKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')))}
              placeholder='XXXX-XXXX-XXXX-XXXX-XXXX'
              autoCapitalize='characters'
              autoCorrect='off'
              data-testid='reset-recovery-key'
              className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 text-center font-mono tracking-wider transition-all focus:bg-background'
            />
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              New password
            </label>
            <div className='relative'>
              <Input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder='••••••••'
                autoComplete='new-password'
                data-testid='reset-password'
                className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 pr-10 transition-all focus:bg-background'
              />
              <button
                type='button'
                onClick={() => setShowPw(!showPw)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground'
                tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </button>
            </div>
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Confirm new password
            </label>
            <Input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder='••••••••'
              autoComplete='new-password'
              data-testid='reset-confirm'
              className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 transition-all focus:bg-background'
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className='rounded-lg bg-destructive/10 px-3.5 py-2.5 text-center text-sm font-medium text-destructive'
              data-testid='reset-error'
            >
              {error}
            </motion.div>
          )}

          <Button
            type='submit'
            disabled={busy || !valid}
            className='h-12 w-full rounded-full text-base font-semibold shadow-md transition-all hover:shadow-lg disabled:shadow-none'
            data-testid='reset-submit'
          >
            {busy ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
