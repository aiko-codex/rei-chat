import { useState } from 'react';
import { KeyRound, Lock, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePassword, setupRecovery } from '@/lib/account-api';
import { formatRecoveryKey } from '@/lib/recovery';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** which action to show first */
  mode: 'password' | 'recovery';
}

/**
 * Account security actions (accounts model):
 *  - Change password: re-wraps the SAME keypair under a new password, so chats
 *    are never lost (unlike the old keypair-regenerating rotation).
 *  - Recovery key: (re)generate the recovery key used to reset a forgotten
 *    password. Shown once; the server only ever stores ciphertext + a one-way
 *    verifier, never the key itself.
 */
export function AccountSecurityDialog({ open, onOpenChange, mode }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // change-password fields
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  // recovery reveal
  const [newKey, setNewKey] = useState<string | null>(null);

  const reset = () => {
    setBusy(false);
    setError(null);
    setCurrent('');
    setNext('');
    setConfirm('');
    setNewKey(null);
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const doChangePassword = async () => {
    if (busy) return;
    if (next.length < 6 || next !== confirm) {
      setError('New passwords must match and be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      toast.success('Password changed');
      close(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
      setBusy(false);
    }
  };

  const doSetupRecovery = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { recoveryKey } = await setupRecovery();
      setNewKey(recoveryKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set up recovery');
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(formatRecoveryKey(newKey));
      toast.success('Recovery key copied');
    } catch {
      toast.error('Could not copy — write it down instead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        {mode === 'password' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="size-4" /> Change password
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                data-testid="cp-current"
                className="h-11 rounded-xl"
              />
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                data-testid="cp-new"
                className="h-11 rounded-xl"
              />
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                data-testid="cp-confirm"
                className="h-11 rounded-xl"
              />
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button
                onClick={doChangePassword}
                disabled={busy || !current || next.length < 6 || next !== confirm}
                className="h-11 w-full rounded-xl"
                data-testid="cp-submit"
              >
                {busy ? 'Saving…' : 'Change password'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Your chats stay intact — only the password protecting your keys changes.
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4" /> Recovery key
              </DialogTitle>
            </DialogHeader>
            {newKey ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={copyKey}
                  className="group w-full rounded-2xl border border-border/60 bg-muted/40 px-4 py-5 transition-colors hover:bg-muted/70"
                  data-testid="recovery-key-value"
                >
                  <span className="block break-all text-center font-mono text-lg font-semibold tracking-wider">
                    {formatRecoveryKey(newKey)}
                  </span>
                  <span className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Copy className="h-3.5 w-3.5" /> Tap to copy
                  </span>
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  Save this somewhere safe. It's the only way to reset a forgotten
                  password without losing your chats. Any previous recovery key no
                  longer works.
                </p>
                <Button onClick={() => close(false)} className="h-11 w-full rounded-xl" data-testid="recovery-done">
                  I've saved it
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate a recovery key so you can reset your password if you ever
                  forget it — without losing your chats. We can never see it.
                  Generating a new one replaces any previous key.
                </p>
                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                <Button
                  onClick={doSetupRecovery}
                  disabled={busy}
                  className="h-11 w-full rounded-xl"
                  data-testid="recovery-generate"
                >
                  {busy ? 'Generating…' : 'Generate recovery key'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
