import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import { ArrowRight, Check, Copy, Heart, MessageCircle, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  formatCode,
  generatePairingCode,
  joinLink,
  normalizeCode,
  savePairing,
} from '@/lib/pairing';

type Mode = 'choose' | 'create' | 'join';

interface PairingScreenProps {
  /** code carried in from a #join= link, if any */
  prefillCode?: string | null;
  onPaired: () => void;
}

/**
 * One couple = one code. Create on one device, enter on the other —
 * by QR (in person), copied code, or join link (long distance).
 */
export function PairingScreen({ prefillCode, onPaired }: PairingScreenProps) {
  const [mode, setMode] = useState<Mode>(prefillCode ? 'join' : 'choose');
  const [code] = useState(generatePairingCode);
  const [joinInput, setJoinInput] = useState(prefillCode ? formatCode(prefillCode) : '');
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode !== 'create') return;
    QRCode.toDataURL(joinLink(normalizeCode(code)!), { margin: 1, width: 220 })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [mode, code]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Share the code over WhatsApp. The code IS the encryption key, so this
  // hands it to a third party — convenient, but less private than QR/in-person.
  const shareWhatsApp = () => {
    const text = `Here's our code for our private space 🖤\n\n${code}\n\nOpen the app, tap “I have a code”, and enter it.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const finishCreate = async () => {
    await savePairing(normalizeCode(code)!);
    onPaired();
  };

  const finishJoin = async () => {
    const secret = normalizeCode(joinInput);
    if (!secret) {
      toast.error('That code doesn’t look right — check it and try again');
      return;
    }
    await savePairing(secret);
    onPaired();
  };

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto px-8 py-10"
      data-testid="pairing-screen"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-7">
          <Heart />
        </span>
        <h1 className="text-xl font-semibold">Your space for two</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          One shared code is the key to everything. We can never read your
          chats — which also means we can never recover them. Keep the code safe.
        </p>
      </motion.div>

      {mode === 'choose' && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button
            onClick={() => setMode('create')}
            className="h-11 cursor-pointer rounded-xl"
            data-testid="pairing-create-btn"
          >
            Create our space
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode('join')}
            className="h-11 cursor-pointer rounded-xl"
            data-testid="pairing-join-btn"
          >
            I have a code
          </Button>
        </div>
      )}

      {mode === 'create' && (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Pairing QR code"
              className="rounded-xl border"
              data-testid="pairing-qr"
            />
          ) : (
            <span className="flex size-[220px] items-center justify-center rounded-xl border text-muted-foreground [&_svg]:size-8">
              <QrCode />
            </span>
          )}
          <p
            className="text-center font-mono text-sm font-semibold tracking-wider select-all"
            data-testid="pairing-code"
          >
            {code}
          </p>
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              onClick={copy}
              className="h-10 flex-1 cursor-pointer rounded-xl"
              data-testid="copy-code-btn"
            >
              {copied ? <Check /> : <Copy />} Copy code
            </Button>
            <Button
              variant="outline"
              onClick={shareWhatsApp}
              className="h-10 flex-1 cursor-pointer rounded-xl"
              data-testid="share-whatsapp-btn"
            >
              <MessageCircle /> WhatsApp
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Best shared in person — show the QR or read the code aloud. Sending
            it over WhatsApp is handy but less private, since the code is the key
            to everything.
          </p>
          <Button
            onClick={finishCreate}
            className="h-11 w-full cursor-pointer rounded-xl"
            data-testid="pairing-create-done"
          >
            Continue <ArrowRight />
          </Button>
        </div>
      )}

      {mode === 'join' && (
        <div className="flex w-full max-w-xs flex-col gap-4">
          <Input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && finishJoin()}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            className="h-11 rounded-xl text-center font-mono tracking-wider"
            autoFocus
            data-testid="join-code-input"
          />
          <Button
            onClick={finishJoin}
            disabled={!joinInput.trim()}
            className="h-11 cursor-pointer rounded-xl"
            data-testid="pairing-join-done"
          >
            Join our space <ArrowRight />
          </Button>
          <button
            onClick={() => setMode('choose')}
            className="cursor-pointer text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
