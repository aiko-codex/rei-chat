import { useEffect, useState } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { Delete, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { verifyPIN } from '@/lib/pin';

const PIN_LENGTH = 4;

interface PinScreenProps {
  onUnlock: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function PinScreen({ onUnlock }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const dots = useAnimationControls();

  useEffect(() => {
    if (pin.length < PIN_LENGTH) return;
    if (verifyPIN(pin)) {
      const t = setTimeout(onUnlock, 150);
      return () => clearTimeout(t);
    }
    setError(true);
    void dots.start({ x: [0, -10, 10, -7, 7, -3, 3, 0], transition: { duration: 0.4 } });
    const t = setTimeout(() => {
      setPin('');
      setError(false);
    }, 450);
    return () => clearTimeout(t);
  }, [pin, dots, onUnlock]);

  const press = (key: (typeof KEYS)[number]) => {
    if (error) return;
    if (key === 'del') setPin((p) => p.slice(0, -1));
    else if (key !== '' && pin.length < PIN_LENGTH) setPin((p) => p + key);
  };

  // desktop: allow typing the PIN
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-10 bg-background px-8 pb-[max(2rem,env(safe-area-inset-bottom))]"
      data-testid="pin-screen"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Enter your PIN</p>
      </div>

      <motion.div animate={dots} className="flex gap-4" data-testid="pin-dots">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'size-3.5 rounded-full border transition-colors duration-150',
              i < pin.length
                ? error
                  ? 'border-destructive bg-destructive'
                  : 'border-primary bg-primary'
                : 'border-muted-foreground/40',
            )}
          />
        ))}
      </motion.div>

      {import.meta.env.DEV && (
        <button
          onClick={onUnlock}
          data-testid="dev-autofill-btn"
          className="cursor-pointer rounded-full border border-dashed border-muted-foreground/40 px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          dev: auto-unlock
        </button>
      )}

      <div className="grid w-full max-w-2xs grid-cols-3 gap-3" data-testid="pin-keypad">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(key)}
              aria-label={key === 'del' ? 'Delete digit' : key}
              data-testid={key === 'del' ? 'pin-key-del' : `pin-key-${key}`}
              className="flex h-16 cursor-pointer items-center justify-center rounded-full text-xl font-medium transition-colors select-none hover:bg-muted active:bg-muted active:scale-95"
            >
              {key === 'del' ? <Delete className="size-5" /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
