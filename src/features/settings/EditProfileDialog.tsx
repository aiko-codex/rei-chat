import { useState } from 'react';
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
import { AvatarPicker } from '@/features/profile/AvatarPicker';
import type { Profile } from '@/lib/types';

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  onSave: (profile: Profile) => void;
}

const COLORS = [
  '#e6194b',
  '#f58231',
  '#ffe119',
  '#3cb44b',
  '#469af8',
  '#4363d8',
  '#911eb4',
  '#e6beff',
  '#f032e6',
  '#fabebe',
];

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: EditProfileDialogProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  const [avatar, setAvatar] = useState<string | undefined>(profile?.avatar);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name required');
      return;
    }
    if (trimmed.length > 30) {
      toast.error('Name must be 30 characters or less');
      return;
    }
    onSave({ name: trimmed, color, avatar });
    toast.success('Profile updated');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <AvatarPicker name={name} color={color} avatar={avatar} onChange={setAvatar} />

          <div>
            <label className="block text-sm font-medium mb-3">Your Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={30}
              autoFocus
              data-testid="edit-profile-name"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {name.length}/30
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="relative size-10 rounded-full transition-transform hover:scale-110 active:scale-95"
                  style={{ backgroundColor: c }}
                  data-testid={`color-${c.slice(1)}`}
                >
                  {c === color && (
                    <div className="absolute inset-0 rounded-full border-2 border-white/60 shadow-md" />
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
            data-testid="edit-profile-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="cursor-pointer"
            data-testid="edit-profile-save"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
