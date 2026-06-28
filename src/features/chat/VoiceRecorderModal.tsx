import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Mic, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MediaAttachment } from '@/lib/types';

interface VoiceRecorderModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (media: MediaAttachment, blob: Blob) => void;
}

type Phase = 'recording' | 'paused' | 'preview';

const BARS = 48; // how many waveform samples we keep on screen
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Tap-to-open voice recorder: live waveform while recording, pause/resume,
 * then a preview you can listen to before sending. Replaces the old
 * hold-to-record gesture. All mic plumbing + teardown lives here.
 */
export function VoiceRecorderModal({ open, onClose, onSend }: VoiceRecorderModalProps) {
  const [phase, setPhase] = useState<Phase>('recording');
  const [seconds, setSeconds] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playRatio, setPlayRatio] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('audio/webm');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const phaseRef = useRef<Phase>('recording');
  phaseRef.current = phase;
  // false once the modal has closed — guards against the mic getting set up
  // after teardown (getUserMedia resolves async)
  const activeRef = useRef(true);

  // current mic level (0..1) from the analyser
  const readLevel = (): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 3.2);
  };

  const stopSampling = () => {
    if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    sampleTimerRef.current = null;
  };

  const startSampling = () => {
    stopSampling();
    // 10fps: push the live level into the scrolling waveform + tick the timer
    sampleTimerRef.current = setInterval(() => {
      if (phaseRef.current !== 'recording') return;
      const level = readLevel();
      setWaveform((w) => [...w, level].slice(-BARS));
      setSeconds((s) => s + 0.1);
    }, 100);
  };

  const teardown = () => {
    stopSampling();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    blobRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
  };

  const begin = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      toast.error('Microphone not available');
      onClose();
      return;
    }
    // the modal may have closed while we waited for the permission prompt
    if (!activeRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4';
    mimeRef.current = mime;
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      blobRef.current = blob;
      urlRef.current = URL.createObjectURL(blob);
      setPlayRatio(0);
      setPlaying(false);
      setPhase('preview');
    };

    // live waveform via the Web Audio analyser
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    streamRef.current = stream;
    recorderRef.current = recorder;
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    recorder.start(250);
    setPhase('recording');
    startSampling();
  };

  // (re)start a fresh recording each time the modal opens; clean up on close
  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    setSeconds(0);
    setWaveform([]);
    setPlaying(false);
    setPlayRatio(0);
    void begin();
    return () => {
      activeRef.current = false;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pause = () => {
    recorderRef.current?.pause();
    setPhase('paused');
  };
  const resume = () => {
    recorderRef.current?.resume();
    setPhase('recording');
  };

  /** stop the recorder → onstop builds the blob and flips us to preview */
  const finish = () => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    stopSampling();
  };

  const reRecord = () => {
    teardown();
    setSeconds(0);
    setWaveform([]);
    setPlaying(false);
    setPlayRatio(0);
    void begin();
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const send = () => {
    const blob = blobRef.current;
    if (!blob) return;
    // hand the blob off; null our ref first so teardown doesn't revoke the URL
    // the message bubble will rebuild its own object URL from the blob
    blobRef.current = null;
    onSend(
      {
        kind: 'voice',
        url: URL.createObjectURL(blob),
        name: 'voice-note',
        size: blob.size,
        mimeType: blob.type,
        duration: seconds,
      },
      blob,
    );
    onClose();
  };

  const recording = phase === 'recording';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="voice-recorder-modal">
        <DialogHeader>
          <DialogTitle>
            {phase === 'preview' ? 'Preview voice note' : 'Recording voice note'}
          </DialogTitle>
        </DialogHeader>

        {/* timer + status dot */}
        <div className="flex items-center justify-center gap-2">
          {phase !== 'preview' && (
            <motion.span
              animate={recording ? { opacity: [1, 0.25, 1] } : { opacity: 0.4 }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="size-2.5 rounded-full bg-red-500"
            />
          )}
          <span className="text-2xl font-semibold tabular-nums" data-testid="voice-timer">
            {fmt(seconds)}
          </span>
        </div>

        {/* waveform */}
        <div className="flex h-20 items-center justify-center gap-[3px] px-2">
          {waveform.length === 0 ? (
            <span className="text-xs text-muted-foreground">Listening…</span>
          ) : (
            waveform.map((v, i) => {
              const played = phase === 'preview' && i / waveform.length <= playRatio;
              return (
                <motion.span
                  key={i}
                  initial={{ height: 4 }}
                  animate={{ height: 6 + v * 56 }}
                  transition={{ duration: 0.1 }}
                  className={cn(
                    'w-[3px] shrink-0 rounded-full',
                    phase === 'preview'
                      ? played
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30'
                      : 'bg-primary',
                  )}
                />
              );
            })
          )}
        </div>

        {phase === 'preview' && urlRef.current && (
          <audio
            ref={audioRef}
            src={urlRef.current}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration) setPlayRatio(el.currentTime / el.duration);
            }}
            onEnded={() => {
              setPlaying(false);
              setPlayRatio(0);
            }}
            className="hidden"
          />
        )}

        {/* controls */}
        <div className="flex items-center justify-center gap-3 pt-1">
          {phase === 'preview' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                className="size-12 cursor-pointer rounded-full"
                onClick={reRecord}
                aria-label="Re-record"
                data-testid="voice-rerecord"
              >
                <RotateCcw />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="size-14 cursor-pointer rounded-full [&_svg]:size-6"
                onClick={togglePlay}
                aria-label={playing ? 'Pause preview' : 'Play preview'}
                data-testid="voice-preview-play"
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button
                size="icon"
                className="size-14 cursor-pointer rounded-full [&_svg]:size-6"
                onClick={send}
                aria-label="Send voice note"
                data-testid="voice-send"
              >
                <Check />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                className="size-12 cursor-pointer rounded-full text-destructive"
                onClick={onClose}
                aria-label="Discard"
                data-testid="voice-discard"
              >
                <Trash2 />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="size-14 cursor-pointer rounded-full [&_svg]:size-6"
                onClick={recording ? pause : resume}
                aria-label={recording ? 'Pause' : 'Resume'}
                data-testid="voice-pause-resume"
              >
                {recording ? <Pause /> : <Mic />}
              </Button>
              <Button
                size="icon"
                className="size-14 cursor-pointer rounded-full [&_svg]:size-6"
                onClick={finish}
                aria-label="Done — preview before sending"
                data-testid="voice-stop"
              >
                <Check />
              </Button>
            </>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {phase === 'preview'
            ? 'Listen back, then send — or re-record.'
            : recording
              ? 'Tap ✓ when done, or pause to take a breath.'
              : 'Paused · tap the mic to resume.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
