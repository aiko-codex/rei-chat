import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/account-api';

/**
 * Minimalist sign-in. No public sign-up — accounts are created by the admin.
 * On success, the caller decides where to go (set-password vs the app).
 */
export function SignInScreen({
  onSignedIn,
  onOpenAdmin,
}: {
  onSignedIn: (mustSetPassword: boolean) => void;
  onOpenAdmin?: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !identifier.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { mustSetPassword } = await login(identifier.trim(), password);
      onSignedIn(mustSetPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
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
          <h1 className='text-2xl font-semibold tracking-tight text-primary'>rei</h1>
          <p className='text-sm text-muted-foreground'>Sign in to your account</p>
        </div>

        <div className='space-y-2.5'>
          <Input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder='Username or email'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='username'
            data-testid='signin-identifier'
          />
          <Input
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='Password'
            autoComplete='current-password'
            data-testid='signin-password'
          />
        </div>

        {error && (
          <p className='text-center text-sm text-destructive' data-testid='signin-error'>
            {error}
          </p>
        )}

        <Button
          type='submit'
          className='w-full'
          disabled={busy || !identifier.trim() || !password}
          data-testid='signin-submit'
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className='text-center text-xs leading-relaxed text-muted-foreground'>
          Accounts are created by invitation. Ask the admin for yours.
        </p>

        {onOpenAdmin && (
          <button
            type='button'
            onClick={onOpenAdmin}
            className='mx-auto block text-xs text-muted-foreground underline-offset-2 hover:underline'
            data-testid='signin-admin-link'
          >
            Admin
          </button>
        )}
      </motion.form>
    </div>
  );
}
