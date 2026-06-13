import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsDialog({
  open,
  onOpenChange,
}: NotificationsDialogProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    if ('Notification' in window) {
      setEnabled(Notification.permission === 'granted');
    }
  }, [open]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Notifications not supported in this browser');
      return;
    }
    const permission = await Notification.requestPermission();
    setEnabled(permission === 'granted');
  };

  const disable = () => {
    setEnabled(false);
    // TODO: sync with server to revoke subscriptions
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
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
                ? 'You will receive notifications for new messages and calls'
                : 'You will not receive notifications'}
            </p>
          </div>

          <div className="flex gap-2">
            {!enabled ? (
              <Button
                onClick={requestPermission}
                className="w-full cursor-pointer"
                data-testid="notifications-enable"
              >
                Enable notifications
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={disable}
                className="w-full cursor-pointer"
                data-testid="notifications-disable"
              >
                Disable notifications
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Note: Notifications require this app to be installed as a PWA on iOS 16.4+.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
