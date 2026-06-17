import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/account-api';
import { Heart, Eye, EyeOff } from 'lucide-react';

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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className='flex h-full flex-col items-center justify-center bg-linear-to-br from-background via-background to-background px-6 py-8'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        className='w-full max-w-sm'
      >
        {/* Logo & Branding */}
        <div className='mb-8 flex flex-col items-center space-y-3'>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className='flex items-center justify-center'
          >
            <div className='rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 p-3'>
              <Heart className='h-6 w-6 fill-primary text-primary' />
            </div>
          </motion.div>
          <div className='space-y-1 text-center'>
            <h1 className='text-4xl font-bold tracking-tight text-foreground'>rei</h1>
            <p className='text-sm font-medium text-muted-foreground'>Private & Encrypted Chat</p>
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
              <label htmlFor='identifier' className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                Username or Email
              </label>
              <Input
                id='identifier'
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder='you@example.com'
                autoCapitalize='none'
                autoCorrect='off'
                autoComplete='username'
                data-testid='signin-identifier'
                className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 transition-all focus:bg-background'
              />
            </div>
            <div className='space-y-1.5'>
              <label htmlFor='password' className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                Password
              </label>
              <div className='relative'>
                <Input
                  id='password'
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder='••••••••'
                  autoComplete='current-password'
                  data-testid='signin-password'
                  className='h-11 rounded-xl border-border/50 bg-muted/40 px-4 pr-10 transition-all focus:bg-background'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className='rounded-lg bg-destructive/10 px-3.5 py-2.5 text-center text-sm font-medium text-destructive'
              data-testid='signin-error'
            >
              {error}
            </motion.div>
          )}

          <Button
            type='submit'
            className='h-12 w-full rounded-full text-base font-semibold shadow-md transition-all hover:shadow-lg disabled:shadow-none'
            disabled={busy || !identifier.trim() || !password}
            data-testid='signin-submit'
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className='text-center text-xs leading-relaxed text-muted-foreground'>
            Accounts are created by invitation. Ask the admin for yours.
          </p>
        </motion.form>

        {/* Admin Link */}
        {onOpenAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className='mt-6 flex justify-center'
          >
            <button
              type='button'
              onClick={onOpenAdmin}
              className='text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground'
              data-testid='signin-admin-link'
            >
              Admin Portal
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
