import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isMoodFresh, isMoodJustSet, moodAgeLabel, moodOption, type Mood } from '@/lib/mood';

interface MoodBadgeProps {
  mood: Mood | null | undefined;
  /** whose mood this is, for the popover label */
  name: string;
  /** top-right is the default corner; bottom-right would collide with the online dot */
  className?: string;
}

/** a small animated face badge on a conversation avatar — pops in when the
 *  mood changes, gently breathes while fresh (<10 min), and silently stops
 *  rendering once it expires (no active clear needed, just a local check) */
export function MoodBadge({ mood, name, className }: MoodBadgeProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  if (!mood || !isMoodFresh(mood, now)) return null;
  const option = moodOption(mood.icon);
  if (!option) return null;
  const Icon = option.icon;
  const justSet = isMoodJustSet(mood, now);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          key={mood.icon + mood.setAt}
          initial={{ scale: 0, rotate: -15 }}
          animate={
            justSet
              ? { scale: [1, 1.12, 1], rotate: 0 }
              : { scale: 1, rotate: 0 }
          }
          transition={
            justSet
              ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
              : { type: 'spring', stiffness: 480, damping: 26 }
          }
          onClick={(e) => e.stopPropagation()}
          aria-label={`${name}'s mood: ${option.label}`}
          data-testid="mood-badge"
          className={
            className ??
            'absolute -right-0.5 -top-0.5 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background ring-2 ring-background'
          }
        >
          <Icon size="0.95rem" />
        </motion.button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto px-3 py-2 text-xs">
        <p className="font-medium">{option.label}</p>
        {mood.label && <p className="text-muted-foreground">{mood.label}</p>}
        <p className="text-muted-foreground">{moodAgeLabel(mood, now)}</p>
      </PopoverContent>
    </Popover>
  );
}
