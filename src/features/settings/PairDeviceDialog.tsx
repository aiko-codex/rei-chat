import { useEffect, useState } from 'react';
import { Copy, RefreshCw, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCode, joinLink, getPairing } from '@/lib/pairing';

interface PairDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerateRequested: () => void;
}

export function PairDeviceDialog({
  open,
  onOpenChange,
  onRegenerateRequested,
}: PairDeviceDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const pairing = getPairing();
  const code = pairing?.secret ?? '';
  const displayCode = formatCode(code);
  const link = joinLink(code);

  useEffect(() => {
    if (!open || !code) return;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR error:', err));
  }, [open, code, link]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast.success('Link copied');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="text-center">
          <DialogTitle>Pair a device</DialogTitle>
          <p className="text-xs text-muted-foreground mt-2">
            Show this QR code to her phone
          </p>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {code && (
            <>
              {qrDataUrl && (
                <div className="bg-muted p-3 rounded-lg">
                  <img
                    src={qrDataUrl}
                    alt="Pairing QR code"
                    className="w-32 h-32"
                    data-testid="pair-qr-code"
                  />
                </div>
              )}

              <div className="w-full space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">
                  Pairing code
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs font-mono text-center">
                    {displayCode}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyCode}
                    className="cursor-pointer"
                    data-testid="pair-copy-code"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full cursor-pointer text-xs"
                onClick={copyLink}
                data-testid="pair-copy-link"
              >
                <Link2 className="size-3 mr-2" />
                Copy join link
              </Button>

              <Button
                variant="outline"
                className="w-full cursor-pointer"
                onClick={onRegenerateRequested}
                data-testid="pair-regenerate"
              >
                <RefreshCw className="size-4 mr-2" />
                Regenerate code
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
