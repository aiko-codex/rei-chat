import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useCallStore } from '@/store/call-store';
import { useChatStore } from '@/store/chat-store';

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

interface ControlButtonProps {
  label: string;
  active?: boolean;
  danger?: boolean;
  accept?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}

function ControlButton({ label, active, danger, accept, onClick, children, testId }: ControlButtonProps) {
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
            : accept
              ? 'bg-green-500 text-white hover:bg-green-600'
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

export function CallScreen() {
  const state = useCallStore((s) => s.state);
  const type = useCallStore((s) => s.type);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const muted = useCallStore((s) => s.muted);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const startedAt = useCallStore((s) => s.startedAt);
  const accept = useCallStore((s) => s.accept);
  const decline = useCallStore((s) => s.decline);
  const end = useCallStore((s) => s.end);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);

  const peerProfile = useChatStore((s) => s.peerProfile);
  const name = peerProfile?.name ?? 'Her';

  const isVideo = type === 'video';
  const showVideo = isVideo && state === 'active';

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // attach the remote stream to the visible video (video calls) or a hidden
  // audio sink (voice calls) — never both, or the audio plays twice
  useEffect(() => {
    if (!remoteStream) return;
    const sink = showVideo ? remoteVideoRef.current : remoteAudioRef.current;
    if (sink) {
      sink.srcObject = remoteStream;
      void sink.play().catch(() => {});
    }
  }, [remoteStream, showVideo]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, showVideo, cameraOff]);

  // duration timer (active calls only)
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (state !== 'active') {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const i = setInterval(tick, 500);
    return () => clearInterval(i);
  }, [state, startedAt]);

  const status =
    state === 'incoming'
      ? `Incoming ${isVideo ? 'video' : 'voice'} call`
      : state === 'outgoing'
        ? 'calling…'
        : formatDuration(seconds);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="relative flex h-full flex-col bg-neutral-950 text-white"
      data-testid="call-screen"
    >
      {showVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 size-full bg-neutral-900 object-cover"
          data-testid="remote-video"
        />
      )}
      {!isVideo && <audio ref={remoteAudioRef} autoPlay className="hidden" />}

      {showVideo && !cameraOff && (
        <motion.video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-4 right-4 z-10 h-40 w-28 rounded-xl border border-white/20 bg-neutral-700 object-cover shadow-lg"
          data-testid="local-video-pip"
        />
      )}

      {/* identity — always for voice, and for video until connected */}
      {(!isVideo || state !== 'active') && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4">
          <motion.div
            animate={state === 'active' ? {} : { scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          >
            <Avatar className="size-24">
              {peerProfile?.avatar && <AvatarImage src={peerProfile.avatar} alt={name} />}
              <AvatarFallback
                className="text-3xl"
                style={peerProfile?.color ? { backgroundColor: peerProfile.color } : undefined}
              >
                {name[0]}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xl font-semibold" data-testid="call-peer-name">
              {name}
            </p>
            <p className="text-sm text-white/60" data-testid="call-status">
              {status}
            </p>
          </div>
        </div>
      )}

      {/* a thin status strip over the remote video for active video calls */}
      {showVideo && (
        <div className="absolute top-4 left-4 z-10 rounded-full bg-black/40 px-3 py-1 text-sm backdrop-blur-sm">
          {name} · <span className="tabular-nums" data-testid="call-status">{status}</span>
        </div>
      )}

      {/* controls */}
      <div className="relative z-10 flex items-end justify-center gap-5 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {state === 'incoming' ? (
          <>
            <ControlButton label="Decline" danger onClick={decline} testId="decline-call-btn">
              <PhoneOff />
            </ControlButton>
            <ControlButton label="Accept" accept onClick={() => void accept()} testId="accept-call-btn">
              <Phone />
            </ControlButton>
          </>
        ) : (
          <>
            <ControlButton
              label={muted ? 'Unmute' : 'Mute'}
              active={muted}
              onClick={toggleMute}
              testId="mute-btn"
            >
              {muted ? <MicOff /> : <Mic />}
            </ControlButton>
            {isVideo && (
              <ControlButton
                label={cameraOff ? 'Camera on' : 'Camera off'}
                active={cameraOff}
                onClick={toggleCamera}
                testId="camera-btn"
              >
                {cameraOff ? <VideoOff /> : <Video />}
              </ControlButton>
            )}
            <ControlButton label="End" danger onClick={end} testId="end-call-btn">
              <PhoneOff />
            </ControlButton>
          </>
        )}
      </div>
    </motion.div>
  );
}
