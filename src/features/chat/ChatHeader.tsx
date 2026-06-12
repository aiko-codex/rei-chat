import { Phone, Video, Settings } from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { User } from '@/lib/types';

interface ChatHeaderProps {
  peer: User;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenSettings: () => void;
}

export function ChatHeader({ peer, onVoiceCall, onVideoCall, onOpenSettings }: ChatHeaderProps) {
  return (
    <header
      className="flex items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      data-testid="chat-header"
    >
      <Avatar size="lg">
        <AvatarFallback>{peer.name[0]}</AvatarFallback>
        {peer.online && <AvatarBadge className="bg-emerald-500" data-testid="peer-online-badge" />}
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" data-testid="peer-name">
          {peer.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {peer.online ? 'online' : 'offline'}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onVoiceCall} aria-label="Voice call" data-testid="voice-call-btn">
        <Phone />
      </Button>
      <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onVideoCall} aria-label="Video call" data-testid="video-call-btn">
        <Video />
      </Button>
      <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onOpenSettings} aria-label="Settings" data-testid="settings-btn">
        <Settings />
      </Button>
    </header>
  );
}
