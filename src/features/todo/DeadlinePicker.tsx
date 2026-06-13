import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type Repeat = 'daily' | 'weekly' | undefined;

interface DeadlinePickerProps {
  /** current deadline (epoch ms), if any */
  value?: number;
  /** undefined = cleared */
  onChange: (deadline?: number) => void;
  /** recurring chore setting; the control renders only when a handler is given */
  repeat?: Repeat;
  onRepeatChange?: (repeat: Repeat) => void;
  /** the trigger element (rendered via asChild) */
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

/** shadcn calendar + time field in a popover — shared by "new task" and
 *  per-row deadline editing */
export function DeadlinePicker({
  value,
  onChange,
  repeat,
  onRepeatChange,
  children,
  align = 'end',
}: DeadlinePickerProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('18:00');

  const syncFromValue = () => {
    if (value !== undefined) {
      const d = new Date(value);
      setDate(d);
      setTime(format(d, 'HH:mm'));
    } else {
      setDate(undefined);
      setTime('18:00');
    }
  };

  const apply = () => {
    if (!date) {
      toast.error('Pick a date first');
      return;
    }
    const [h, m] = time.split(':').map(Number);
    const ts = new Date(date);
    ts.setHours(h ?? 0, m ?? 0, 0, 0);
    if (ts.getTime() <= Date.now()) {
      toast.error('That deadline is already in the past');
      return;
    }
    onChange(ts.getTime());
    setOpen(false);
  };

  const clear = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) syncFromValue();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto gap-0 overflow-hidden p-0" align={align} data-testid="deadline-popover">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          captionLayout="dropdown"
          disabled={{ before: new Date() }}
          onSelect={setDate}
        />
        {onRepeatChange && (
          <div className="flex items-center gap-1.5 border-t px-2.5 py-2" data-testid="repeat-row">
            <span className="text-xs text-muted-foreground">Repeat</span>
            {([undefined, 'daily', 'weekly'] as Repeat[]).map((r) => (
              <Button
                key={r ?? 'none'}
                variant={repeat === r ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => onRepeatChange(r)}
                className={cn('cursor-pointer rounded-full', repeat === r && 'font-semibold')}
                data-testid={`repeat-${r ?? 'none'}`}
              >
                {r ?? 'none'}
              </Button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 border-t p-2.5">
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Deadline time"
            data-testid="deadline-time-input"
            className="h-8 w-26 appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
          {value !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="cursor-pointer text-destructive"
              data-testid="deadline-clear-btn"
            >
              Remove
            </Button>
          )}
          <Button
            size="sm"
            onClick={apply}
            disabled={!date}
            className="ml-auto cursor-pointer"
            data-testid="deadline-apply-btn"
          >
            {value !== undefined ? 'Update' : 'Set deadline'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
