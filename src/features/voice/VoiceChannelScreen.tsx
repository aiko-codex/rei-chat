import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Headphones, HeadphoneOff, Mic, MicOff, PhoneOff } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { users } from '@/lib/mock-data';
import type { User } from '@/lib/types';

interface ParticipantTileProps {
  user: User;
  inChannel: boolean;
  speaking: boolean;
  muted: boolean;
}

function ParticipantTile({ user, inChannel, speaking, muted }: ParticipantTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border bg-card px-6 py-5 transition-opacity',
        !inChannel && 'opacity-40',
      )}
      data-testid={`voice-participant-${user.id}`}
    >
      <div
        className={cn(
          'rounded-full p-[3px] transition-colors',
          speaking ? 'bg-emerald-500' : 'bg-transparent',
        )}
      >
        <Avatar className="size-16">
          <AvatarFallback className="text-xl">{user.name[0]}</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{user.name}</span>
        {inChannel && muted && <MicOff className="size-3.5 text-muted-foreground" />}
      </div>
      <span className="text-xs text-muted-foreground">
        {inChannel ? (speaking ? 'speaking' : 'in channel') : 'not connected'}
      </span>
    </div>
  );
}

interface VoiceChannelScreenProps {
  onBack: () => void;
}

export function VoiceChannelScreen({ onBack }: VoiceChannelScreenProps) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  // UI-only phase: fake the peer talking now and then while joined
  const [peerSpeaking, setPeerSpeaking] = useState(false);

  useEffect(() => {
    if (!joined) {
      setPeerSpeaking(false);
      return;
    }
    const i = setInterval(() => setPeerSpeaking((s) => !s), 2500);
    return () => clearInterval(i);
  }, [joined]);

  const leave = () => {
    setJoined(false);
    setMuted(false);
    setDeafened(false);
  };

  return (
    <div className="flex h-full flex-col" data-testid="voice-channel-screen">
      <header className="flex items-center gap-2 border-b px-2 py-2.5">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="voice-back-btn">
          <ArrowLeft />
        </Button>
        <Headphones className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Our room</p>
          <p className="text-xs text-muted-foreground">
            {joined ? 'connected · always open' : 'always open'}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <ParticipantTile user={users.me} inChannel={joined} speaking={false} muted={muted} />
          <ParticipantTile user={users.her} inChannel={joined} speaking={peerSpeaking} muted={false} />
        </div>
        {!joined && (
          <p className="text-center text-xs text-muted-foreground">
            A voice room that's always there — join whenever, like sitting in the same room.
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-t px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {joined ? (
          <>
            <Button
              variant={muted ? 'default' : 'secondary'}
              size="icon-lg"
              className="cursor-pointer rounded-full"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              aria-pressed={muted}
              data-testid="voice-mute-btn"
            >
              {muted ? <MicOff /> : <Mic />}
            </Button>
            <Button
              variant={deafened ? 'default' : 'secondary'}
              size="icon-lg"
              className="cursor-pointer rounded-full"
              onClick={() => setDeafened((d) => !d)}
              aria-label={deafened ? 'Undeafen' : 'Deafen'}
              aria-pressed={deafened}
              data-testid="voice-deafen-btn"
            >
              {deafened ? <HeadphoneOff /> : <Headphones />}
            </Button>
            <Button
              size="icon-lg"
              className="cursor-pointer rounded-full bg-red-500 text-white hover:bg-red-600"
              onClick={leave}
              aria-label="Leave channel"
              data-testid="voice-leave-btn"
            >
              <PhoneOff />
            </Button>
          </>
        ) : (
          <motion.div whileTap={{ scale: 0.97 }} className="w-full max-w-sm">
            <Button
              className="w-full cursor-pointer rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              size="lg"
              onClick={() => setJoined(true)}
              data-testid="voice-join-btn"
            >
              <Headphones /> Join voice
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
