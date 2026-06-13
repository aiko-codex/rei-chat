import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/types';

const AVATAR_COLORS = ['#f43f5e', '#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];

interface ProfileSetupScreenProps {
  onDone: (profile: Profile) => void;
}

/** first-run: pick your own name + color on this device — the other phone
 *  receives it over the encrypted channel, so each of you names yourself */
export function ProfileSetupScreen({ onDone }: ProfileSetupScreenProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onDone({ name: trimmed, color });
  };

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-8 px-8"
      data-testid="profile-setup-screen"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6"
      >
        <div
          className="flex size-24 items-center justify-center rounded-full text-4xl font-semibold text-white"
          style={{ backgroundColor: color }}
          data-testid="profile-avatar-preview"
        >
          {name.trim() ? name.trim()[0].toUpperCase() : '?'}
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold">Who are you?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your name lives on this device and is shared only with your person.
          </p>
        </div>
      </motion.div>

      <div className="flex w-full max-w-xs flex-col gap-5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Your name"
          className="h-11 rounded-xl text-center"
          autoFocus
          data-testid="profile-name-input"
        />
        <div className="flex justify-center gap-3" data-testid="profile-color-row">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              style={{ backgroundColor: c }}
              className={cn(
                'size-8 cursor-pointer rounded-full transition-transform',
                color === c && 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background',
              )}
            />
          ))}
        </div>
        <Button
          onClick={submit}
          disabled={!name.trim()}
          className="h-11 cursor-pointer rounded-xl"
          data-testid="profile-done-btn"
        >
          Continue <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
