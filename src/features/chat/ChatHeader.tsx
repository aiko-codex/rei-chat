import { ChevronLeft, Hash, Headphones, ListTodo, Phone, Video, Settings } from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  /** avatar background; ignored for channels */
  avatarColor?: string;
  /** avatar image (data URL); falls back to color + initial */
  avatarUrl?: string;
  online?: boolean;
  /** personal text channel: # icon, no call buttons */
  isChannel?: boolean;
  /** todo channel: checklist icon instead of # */
  isTodo?: boolean;
  onBack: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onOpenVoiceChannel?: () => void;
  onOpenSettings?: () => void;
}

export function ChatHeader({
  title,
  subtitle,
  avatarColor,
  avatarUrl,
  online,
  isChannel,
  isTodo,
  onBack,
  onVoiceCall,
  onVideoCall,
  onOpenVoiceChannel,
  onOpenSettings,
}: ChatHeaderProps) {
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" data-testid="peer-name">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground" data-testid="peer-status">
            {subtitle}
          </p>
        )}
      </div>
      {onVoiceCall && (
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onVoiceCall} aria-label="Voice call" data-testid="voice-call-btn">
          <Phone />
        </Button>
      )}
      {onVideoCall && (
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onVideoCall} aria-label="Video call" data-testid="video-call-btn">
          <Video />
        </Button>
      )}
      {onOpenVoiceChannel && (
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onOpenVoiceChannel} aria-label="Voice channel" data-testid="voice-channel-btn">
          <Headphones />
        </Button>
      )}
      {onOpenSettings && (
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onOpenSettings} aria-label="Settings" data-testid="settings-btn">
          <Settings />
        </Button>
      )}
    </header>
  );
}
