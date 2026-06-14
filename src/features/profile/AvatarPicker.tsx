import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { fileToAvatarDataUrl } from '@/lib/image';

interface AvatarPickerProps {
  name: string;
  color: string;
  /** current avatar data URL (or undefined) */
  avatar?: string;
  onChange: (avatar: string | undefined) => void;
}

/**
 * Big tappable avatar with a camera badge. Picks an image, downscales +
 * compresses it on-device (lib/image), and hands back a small jpeg data URL.
 * Shows a remove (×) button once an image is set.
 */
export function AvatarPicker({ name, color, avatar, onChange }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      onChange(dataUrl);
    } catch {
      toast.error("Couldn't read that image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="avatar-picker"
          aria-label="Change profile picture"
        >
          <Avatar className="size-20">
            {avatar && <AvatarImage src={avatar} alt={name} />}
            <AvatarFallback
              className="text-2xl font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {name[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md [&_svg]:size-3.5">
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
          </span>
        </button>
        {avatar && !busy && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute -top-0.5 -left-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-muted text-foreground shadow [&_svg]:size-3.5"
            data-testid="avatar-remove"
            aria-label="Remove profile picture"
          >
            <X />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
        data-testid="avatar-file-input"
      />
    </div>
  );
}
