import { useRef, useState } from 'react';
import { ArrowLeft, Check, ImagePlus, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { fileToWallpaperBlob } from '@/lib/image';
import { CHAT_BACKGROUNDS } from '@/lib/chat-theme';

interface ChatThemePanelProps {
  onBack: () => void;
}

export function ChatThemePanel({ onBack }: ChatThemePanelProps) {
  const chatBg = useChatStore((s) => s.chatBg);
  const chatBgUrl = useChatStore((s) => s.chatBgUrl);
  const setChatBackground = useChatStore((s) => s.setChatBackground);
  const peerName = useChatStore((s) => s.peerProfile?.name ?? 'her');

  const isDark = document.documentElement.classList.contains('dark');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const activeId = chatBg?.id ?? 'default';

  const pickPreset = (id: string) => {
    void setChatBackground({ id, at: Date.now() });
  };

  const pickCustom = async (file: File) => {
    setUploading(true);
    try {
      const blob = await fileToWallpaperBlob(file);
      const wid = `wallpaper-${Date.now()}`;
      await setChatBackground({ id: 'custom', wid, mime: 'image/jpeg', at: Date.now() }, blob);
      toast.success('Wallpaper updated');
    } catch {
      toast.error("Couldn't use that image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="chat-theme-panel">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="theme-back">
          <ArrowLeft />
        </Button>
        <p className="text-sm font-semibold">Theme & chat background</p>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" /> Shared — also changes on {peerName}'s phone.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {CHAT_BACKGROUNDS.map((preset) => {
            const active = activeId === preset.id;
            const bg = isDark ? preset.dark : preset.light;
            return (
              <button
                key={preset.id}
                onClick={() => pickPreset(preset.id)}
                aria-pressed={active}
                data-testid={`wallpaper-${preset.id}`}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1 transition-transform hover:scale-[1.02]',
                  active && 'ring-2 ring-primary',
                )}
              >
                <span
                  className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg border"
                  style={bg ? { background: bg } : undefined}
                >
                  {active && (
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground [&_svg]:size-4">
                      <Check />
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{preset.label}</span>
              </button>
            );
          })}

          {/* custom photo wallpaper */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="wallpaper-custom"
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1 transition-transform hover:scale-[1.02] disabled:opacity-60',
              activeId === 'custom' && 'ring-2 ring-primary',
            )}
          >
            <span className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground [&_svg]:size-6">
              {activeId === 'custom' && chatBgUrl ? (
                <img src={chatBgUrl} alt="Custom wallpaper" className="size-full object-cover" />
              ) : uploading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ImagePlus />
              )}
            </span>
            <span className="text-xs text-muted-foreground">Photo</span>
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void pickCustom(file);
          }}
          data-testid="wallpaper-file-input"
        />
      </div>
    </div>
  );
}
