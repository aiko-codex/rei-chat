import { useEffect, useState } from 'react';
import { Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat-store';

interface ManageDevicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function when(ts: number): string {
  const d = Math.floor((Date.now() - ts * 1000) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

/**
 * The space is locked to two devices. This lists them and lets you remove the
 * other one to free a slot (e.g. to pair a reinstalled / new phone). Only a
 * current member can do this, so a stranger can never get in.
 */
export function ManageDevicesDialog({ open, onOpenChange }: ManageDevicesDialogProps) {
  const members = useChatStore((s) => s.members);
  const refreshMembers = useChatStore((s) => s.refreshMembers);
  const removeDevice = useChatStore((s) => s.removeDevice);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) void refreshMembers();
  }, [open, refreshMembers]);

  const remove = async (deviceId: string) => {
    setBusy(deviceId);
    await removeDevice(deviceId);
    setBusy(null);
    toast('Device removed — a slot is now free to pair');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="manage-devices-dialog">
        <DialogHeader>
          <DialogTitle>Manage devices</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Your space is locked to these devices. No one else can join. Remove a device to free a
          slot for a new or reinstalled phone.
        </p>
        <ul className="flex flex-col gap-2 py-1">
          {members.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">No devices yet.</li>
          )}
          {members.map((m) => (
            <li
              key={m.deviceId}
              className="flex items-center gap-3 rounded-xl border border-border/60 p-3"
              data-testid={`device-${m.deviceId}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4.5">
                <Smartphone />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m.mine ? 'This device' : `Device ${m.deviceId.slice(0, 6)}`}
                </p>
                <p className="text-xs text-muted-foreground">Added {when(m.addedAt)}</p>
              </div>
              {!m.mine && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer text-destructive"
                  disabled={busy === m.deviceId}
                  onClick={() => void remove(m.deviceId)}
                  aria-label="Remove device"
                  data-testid={`remove-device-${m.deviceId}`}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
