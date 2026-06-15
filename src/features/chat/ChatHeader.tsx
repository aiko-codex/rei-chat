import { useState } from 'react';
import { ChevronLeft, ChevronRight, Hash, Headphones, ListTodo, MoreVertical, Phone, Video, Settings } from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  /** avatar background; ignored for channels */
  avatarColor?: string;
  /** avatar image (data URL); falls back to color + initial */
  avatarUrl?: string;
  online?: boolean;
  /** connection state for the status dot in the subtitle (DM only) */
  connState?: 'online' | 'connecting' | 'offline';
  /** personal text channel: # icon, no call buttons */
  isChannel?: boolean;
  /** todo channel: checklist icon instead of # */
  isTodo?: boolean;
  onBack: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onOpenVoiceChannel?: () => void;
  onOpenSettings?: () => void;
  /** tap the avatar/name to open the conversation profile (DM only) */
  onOpenProfile?: () => void;
}

export function ChatHeader({
  title,
  subtitle,
  avatarColor,
  avatarUrl,
  online,
  connState,
  isChannel,
  isTodo,
  onBack,
  onVoiceCall,
  onVideoCall,
  onOpenVoiceChannel,
  onOpenSettings,
  onOpenProfile,
}: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasActions = Boolean(onVoiceCall || onVideoCall || onOpenVoiceChannel);
  const run = (fn?: () => void) => {
    setMenuOpen(false);
    fn?.();
  };
  return (
    <header
      className="flex items-center gap-2 border-b bg-background/95 px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur supports-backdrop-filter:bg-background/80"
      data-testid="chat-header"
    >
      <Button
        variant="ghost"
        size="icon"
        className="cursor-pointer"
        onClick={onBack}
        aria-label="Back"
        data-testid="back-btn"
      >
        <ChevronLeft />
      </Button>
      <button
        type="button"
        onClick={onOpenProfile}
        disabled={!onOpenProfile}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 text-left disabled:cursor-default enabled:cursor-pointer enabled:hover:bg-muted/60"
        data-testid="chat-profile-trigger"
      >
        {isChannel ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-4.5">
            {isTodo ? <ListTodo /> : <Hash />}
          </span>
        ) : (
          <Avatar size="lg">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={title} />}
            <AvatarFallback
              className="text-white"
              style={avatarColor ? { backgroundColor: avatarColor } : undefined}
            >
              {title[0]?.toUpperCase()}
            </AvatarFallback>
            {online && <AvatarBadge className="bg-emerald-500" data-testid="peer-online-badge" />}
          </Avatar>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate text-[15px] font-semibold" data-testid="peer-name">
              {title}
            </span>
            {/* chevron hints the name/avatar is tappable → conversation profile */}
            {onOpenProfile && (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" data-testid="profile-chevron" />
            )}
          </span>
          {subtitle && (
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground" data-testid="peer-status">
              {connState && (
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    connState === 'online' && 'bg-emerald-500',
                    connState === 'connecting' && 'animate-pulse bg-amber-500',
                    connState === 'offline' && 'bg-muted-foreground/40',
                  )}
                  data-testid="conn-dot"
                />
              )}
              {subtitle}
            </span>
          )}
        </span>
      </button>
      {hasActions && (
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              aria-label="More options"
              data-testid="chat-actions-btn"
            >
              <MoreVertical />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 gap-0.5 p-1.5">
            {onVoiceCall && (
              <button
                onClick={() => run(onVoiceCall)}
                data-testid="voice-call-btn"
                className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted [&_svg]:size-4.5 [&_svg]:text-muted-foreground"
              >
                <Phone /> Voice call
              </button>
            )}
            {onVideoCall && (
              <button
                onClick={() => run(onVideoCall)}
                data-testid="video-call-btn"
                className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted [&_svg]:size-4.5 [&_svg]:text-muted-foreground"
              >
                <Video /> Video call
              </button>
            )}
            {onOpenVoiceChannel && (
              <button
                onClick={() => run(onOpenVoiceChannel)}
                data-testid="voice-channel-btn"
                className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted [&_svg]:size-4.5 [&_svg]:text-muted-foreground"
              >
                <Headphones /> Voice room
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
      {onOpenSettings && (
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onOpenSettings} aria-label="Settings" data-testid="settings-btn">
          <Settings />
        </Button>
      )}
    </header>
  );
}
