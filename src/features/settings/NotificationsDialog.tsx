import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  disablePush,
  enablePush,
  isPushEnabled,
  notificationPermission,
  pushSupported,
  sendTestPush,
} from '@/lib/push';

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsDialog({
  open,
  onOpenChange,
}: NotificationsDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = pushSupported();
  const blocked = notificationPermission() === 'denied';

  useEffect(() => {
    if (!open) return;
    void isPushEnabled().then(setEnabled);
  }, [open]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    const ok = await enablePush();
    setBusy(false);
    if (ok) {
      setEnabled(true);
    } else {
      setError(
        notificationPermission() === 'denied'
          ? 'Permission blocked. Enable notifications for this app in your browser/OS settings.'
          : 'Could not enable notifications. Make sure the app is installed and try again.',
      );
    }
  };

  const disable = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setEnabled(false);
  };

  const test = async () => {
    setBusy(true);
    setError(null);
    const result = await sendTestPush();
    setBusy(false);
    if (result.ok) {
      toast('Push delivered ✓ — notifications are working', {
        description:
          'The banner only shows when the app is in the background. Background the app and send a test again to see it.',
      });
    } else {
      setError(
        result.reason === 'no subscription for this device'
          ? 'No subscription found. Toggle notifications off and on again.'
          : result.reason === 'server push not configured'
            ? 'Server push isn’t configured (VAPID keys missing in secrets.php).'
            : `Test failed (${result.reason ?? 'unknown'}).`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-sm font-medium mb-1">
              {enabled ? 'Enabled' : 'Disabled'}
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? 'This device will be woken for new messages, calls, and invites — even when the app is closed.'
                : 'You will not be notified when the app is closed.'}
            </p>
          </div>

          {!supported && (
            <p className="text-xs text-destructive">
              Push notifications aren’t available here. Install the app to your
              home screen first (iOS needs 16.4+), and make sure the server is
              configured.
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            {!enabled ? (
              <Button
                onClick={enable}
                disabled={busy || !supported || blocked}
                className="w-full cursor-pointer"
                data-testid="notifications-enable"
              >
                {busy ? 'Enabling…' : 'Enable notifications'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={disable}
                disabled={busy}
                className="w-full cursor-pointer"
                data-testid="notifications-disable"
              >
                {busy ? 'Disabling…' : 'Disable notifications'}
              </Button>
            )}
          </div>

          {enabled && (
            <Button
              variant="outline"
              onClick={test}
              disabled={busy}
              className="w-full cursor-pointer"
              data-testid="notifications-test"
            >
              {busy ? 'Sending…' : 'Send test notification'}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Notifications only say “New message” — never the content. Your
            messages stay end-to-end encrypted; the app loads them when you
            open it. Requires installing as a PWA on iOS 16.4+.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
