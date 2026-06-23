import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { MOOD_EXPIRY_OPTIONS, MOOD_OPTIONS, type Mood } from '@/lib/mood';

interface MoodPickerSheetProps {
  open: boolean;
  onClose: () => void;
  current: Mood | null;
  onSet: (mood: Mood | null) => void;
}

export function MoodPickerSheet({ open, onClose, current, onSet }: MoodPickerSheetProps) {
  const [iconId, setIconId] = useState(current?.icon ?? MOOD_OPTIONS[0].id);
  const [label, setLabel] = useState(current?.label ?? '');
  const [expiryMs, setExpiryMs] = useState(MOOD_EXPIRY_OPTIONS[1].ms);

  useEffect(() => {
    if (open) {
      setIconId(current?.icon ?? MOOD_OPTIONS[0].id);
      setLabel(current?.label ?? '');
      setExpiryMs(MOOD_EXPIRY_OPTIONS[1].ms);
    }
  }, [open, current]);

  const save = () => {
    const now = Date.now();
    onSet({ icon: iconId, label: label.trim() || undefined, setAt: now, expiresAt: now + expiryMs });
    onClose();
    toast.success('Mood set');
  };

  const clear = () => {
    onSet(null);
    onClose();
    toast('Mood cleared');
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <DrawerContent data-testid="mood-picker-sheet">
        <DrawerHeader className="pb-3">
          <DrawerTitle className="text-base">How are you feeling?</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
          <div className="grid grid-cols-3 gap-3">
            {MOOD_OPTIONS.map(({ id, label: moodLabel, icon: Icon }) => {
              const selected = iconId === id;
              return (
                <motion.button
                  key={id}
                  type="button"
                  onClick={() => setIconId(id)}
                  whileTap={{ scale: 0.92 }}
                  animate={{ scale: selected ? 1.04 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  data-testid={`mood-icon-${id}`}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border py-3 transition-colors',
                    selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                  )}
                >
                  <Icon size="1.75rem" />
                  <span className="text-[11px] font-medium text-muted-foreground">{moodLabel}</span>
                </motion.button>
              );
            })}
          </div>

          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Add a note (optional)"
            maxLength={24}
            className="h-11 rounded-xl"
            data-testid="mood-label-input"
          />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Show for</p>
            <div className="flex gap-2">
              {MOOD_EXPIRY_OPTIONS.map((d) => (
                <motion.button
                  key={d.ms}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setExpiryMs(d.ms)}
                  data-testid={`mood-expiry-${d.ms}`}
                  className={cn(
                    'flex-1 cursor-pointer rounded-xl border py-2 text-sm font-medium transition-colors',
                    expiryMs === d.ms ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {d.label}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {current && (
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  className="h-11 cursor-pointer rounded-xl text-muted-foreground"
                  onClick={clear}
                  data-testid="mood-clear-btn"
                >
                  Clear
                </Button>
              </motion.div>
            )}
            <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
              <Button className="h-11 w-full cursor-pointer rounded-xl" onClick={save} data-testid="mood-save-btn">
                Set mood
              </Button>
            </motion.div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
