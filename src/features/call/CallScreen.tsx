import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

export type CallType = 'voice' | 'video';

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

interface ControlButtonProps {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}

function ControlButton({ label, active, danger, onClick, children, testId }: ControlButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        className={cn(
          'flex size-14 cursor-pointer items-center justify-center rounded-full transition-colors active:scale-95 [&_svg]:size-6',
          danger
            ? 'bg-red-500 text-white hover:bg-red-600'
            : active
              ? 'bg-white text-neutral-900'
              : 'bg-white/15 text-white hover:bg-white/25',
        )}
      >
        {children}
      </button>
      <span className="text-[11px] text-white/70">{label}</span>
    </div>
  );
}

interface CallScreenProps {
  peer: User;
  type: CallType;
  onEnd: () => void;
}

export function CallScreen({ peer, type, onEnd }: CallScreenProps) {
  // UI-only phase: mock connection — "calling…" for 2s, then connected timer
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [videoOn, setVideoOn] = useState(type === 'video');

  useEffect(() => {
    const t = setTimeout(() => setConnected(true), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [connected]);

  const isVideo = type === 'video';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="relative flex h-full flex-col bg-neutral-950 text-white"
      data-testid="call-screen"
    >
      {/* remote video placeholder (video calls) */}
      {isVideo && (
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-800 to-neutral-950" data-testid="remote-video" />
      )}

      {/* local preview PiP (video calls) */}
      {isVideo && videoOn && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-4 right-4 z-10 h-40 w-28 rounded-xl border border-white/20 bg-neutral-700 shadow-lg"
          data-testid="local-video-pip"
        />
      )}

      {/* peer identity + status */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4">
        {!isVideo && (
          <motion.div
            animate={connected ? {} : { scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          >
            <Avatar className="size-24">
              <AvatarFallback className="text-3xl">{peer.name[0]}</AvatarFallback>
            </Avatar>
          </motion.div>
        )}
        <div className="flex flex-col items-center gap-1">
          <p className="text-xl font-semibold" data-testid="call-peer-name">
            {peer.name}
          </p>
          <p className="text-sm text-white/60" data-testid="call-status">
            {connected ? formatDuration(seconds) : 'calling…'}
          </p>
        </div>
      </div>

      {/* controls */}
      <div className="relative z-10 flex items-end justify-center gap-5 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <ControlButton
          label={muted ? 'Unmute' : 'Mute'}
          active={muted}
          onClick={() => setMuted((m) => !m)}
          testId="mute-btn"
        >
          {muted ? <MicOff /> : <Mic />}
        </ControlButton>
        {isVideo ? (
          <ControlButton
            label={videoOn ? 'Camera off' : 'Camera on'}
            active={!videoOn}
            onClick={() => setVideoOn((v) => !v)}
            testId="camera-btn"
          >
            {videoOn ? <Video /> : <VideoOff />}
          </ControlButton>
        ) : (
          <ControlButton
            label="Speaker"
            active={speaker}
            onClick={() => setSpeaker((s) => !s)}
            testId="speaker-btn"
          >
            <Volume2 />
          </ControlButton>
        )}
        <ControlButton label="End" danger onClick={onEnd} testId="end-call-btn">
          <PhoneOff />
        </ControlButton>
      </div>
    </motion.div>
  );
}
