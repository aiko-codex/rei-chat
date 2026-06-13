import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Headphones, HeadphoneOff, Mic, MicOff, PhoneOff } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useVoiceRoomStore } from '@/store/voice-room-store';
import { useChatStore } from '@/store/chat-store';

/** light-weight mic-level meter → drives the green "speaking" ring */
function useSpeaking(stream: MediaStream | null, active: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || !active || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setSpeaking(avg > 12);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream, active]);
  return speaking;
}

interface ParticipantTileProps {
  name: string;
  color?: string;
  inChannel: boolean;
  speaking: boolean;
  muted: boolean;
}

function ParticipantTile({ name, color, inChannel, speaking, muted }: ParticipantTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border bg-card px-6 py-5 transition-opacity',
        !inChannel && 'opacity-40',
      )}
      data-testid="voice-participant"
    >
      <div className={cn('rounded-full p-[3px] transition-colors', speaking ? 'bg-emerald-500' : 'bg-transparent')}>
        <Avatar className="size-16">
          <AvatarFallback className="text-xl" style={color ? { backgroundColor: color } : undefined}>
            {name[0]}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{name}</span>
        {inChannel && muted && <MicOff className="size-3.5 text-muted-foreground" />}
      </div>
      <span className="text-xs text-muted-foreground">
        {inChannel ? (speaking ? 'speaking' : 'in the room') : 'not here'}
      </span>
    </div>
  );
}

interface VoiceChannelScreenProps {
  onBack: () => void;
}

export function VoiceChannelScreen({ onBack }: VoiceChannelScreenProps) {
  const joined = useVoiceRoomStore((s) => s.joined);
  const peerJoined = useVoiceRoomStore((s) => s.peerJoined);
  const muted = useVoiceRoomStore((s) => s.muted);
  const localStream = useVoiceRoomStore((s) => s.localStream);
  const remoteStream = useVoiceRoomStore((s) => s.remoteStream);
  const join = useVoiceRoomStore((s) => s.join);
  const leave = useVoiceRoomStore((s) => s.leave);
  const toggleMute = useVoiceRoomStore((s) => s.toggleMute);

  const myProfile = useChatStore((s) => s.myProfile);
  const peerProfile = useChatStore((s) => s.peerProfile);

  const [deafened, setDeafened] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      void audioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = deafened;
  }, [deafened]);

  const iSpeak = useSpeaking(localStream, joined && !muted);
  const peerSpeaks = useSpeaking(remoteStream, peerJoined && !deafened);

  return (
    <div className="flex h-full flex-col" data-testid="voice-channel-screen">
      <audio ref={audioRef} autoPlay className="hidden" />
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="voice-back-btn">
          <ArrowLeft />
        </Button>
        <Headphones className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Our room</p>
          <p className="text-xs text-muted-foreground">
            {joined ? (peerJoined ? 'connected · always open' : 'waiting for them · always open') : 'always open'}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <ParticipantTile
            name={myProfile?.name ?? 'You'}
            color={myProfile?.color}
            inChannel={joined}
            speaking={iSpeak}
            muted={muted}
          />
          <ParticipantTile
            name={peerProfile?.name ?? 'Her'}
            color={peerProfile?.color}
            inChannel={peerJoined}
            speaking={peerSpeaks}
            muted={false}
          />
        </div>
        {!joined && (
          <p className="text-center text-xs text-muted-foreground">
            A voice room that's always there — hop in whenever, like sitting in the same room.
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
              onClick={toggleMute}
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
              onClick={() => void join()}
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
