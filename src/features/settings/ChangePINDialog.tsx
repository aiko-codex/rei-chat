import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPIN, setPIN, verifyPIN } from '@/lib/pin';

interface ChangePINDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePINDialog({ open, onOpenChange }: ChangePINDialogProps) {
  const [step, setStep] = useState<'verify' | 'new' | 'confirm'>('verify');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  const handleVerifyCurrent = () => {
    if (!verifyPIN(currentPin)) {
      setError('Incorrect PIN');
      return;
    }
    setError('');
    setCurrentPin('');
    setStep('new');
  };

  const handleSetNew = () => {
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    if (newPin === getPIN()) {
      setError('New PIN must be different');
      return;
    }
    setError('');
    setStep('confirm');
  };

  const handleConfirm = () => {
    if (newPin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    setPIN(newPin);
    toast.success('PIN changed');
    onOpenChange(false);
    handleReset();
  };

  const handleReset = () => {
    setStep('verify');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
  };

  const onClose = (open: boolean) => {
    if (!open) handleReset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'verify' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Current PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) => {
                    setCurrentPin(e.target.value.replace(/\D/g, ''));
                    setError('');
                  }}
                  placeholder="••••"
                  autoFocus
                  data-testid="change-pin-current"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4" />
                  {error}
                </div>
              )}
            </>
          )}

          {step === 'new' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">New PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => {
                    setNewPin(e.target.value.replace(/\D/g, ''));
                    setError('');
                  }}
                  placeholder="••••"
                  autoFocus
                  data-testid="change-pin-new"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4" />
                  {error}
                </div>
              )}
            </>
          )}

          {step === 'confirm' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Confirm New PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => {
                    setConfirmPin(e.target.value.replace(/\D/g, ''));
                    setError('');
                  }}
                  placeholder="••••"
                  autoFocus
                  data-testid="change-pin-confirm"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onClose(false)}
            className="cursor-pointer"
            data-testid="change-pin-cancel"
          >
            Cancel
          </Button>
          {step === 'verify' && (
            <Button
              onClick={handleVerifyCurrent}
              disabled={currentPin.length !== 4}
              className="cursor-pointer"
              data-testid="change-pin-verify-btn"
            >
              Next
            </Button>
          )}
          {step === 'new' && (
            <Button
              onClick={handleSetNew}
              disabled={newPin.length !== 4}
              className="cursor-pointer"
              data-testid="change-pin-set-btn"
            >
              Next
            </Button>
          )}
          {step === 'confirm' && (
            <Button
              onClick={handleConfirm}
              disabled={confirmPin.length !== 4}
              className="cursor-pointer"
              data-testid="change-pin-confirm-btn"
            >
              Save PIN
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
