import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus, Mic, SendHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaAttachment, Message } from '@/lib/types';

function mediaKindFor(file: File): MediaAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function replySnippet(m: Message) {
  if (m.text) return m.text;
  switch (m.media?.kind) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'voice':
      return 'Voice note';
    default:
      return m.media?.name ?? 'Message';
  }
}

interface ComposerProps {
  onSend: (text: string) => void;
  onSendMedia: (media: MediaAttachment, blob: Blob) => void;
  /** typing feedback for the peer; throttling happens upstream */
  onTyping?: (typing: boolean) => void;
  replyTo: Message | null;
  replyToName?: string;
  onCancelReply: () => void;
}

export function Composer({ onSend, onSendMedia, onTyping, replyTo, replyToName, onCancelReply }: ComposerProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // voice note recording via MediaRecorder
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  // pointer can lift before getUserMedia resolves — remember the intent
  const pendingStopRef = useRef<null | 'send' | 'cancel'>(null);

  useEffect(() => {
    if (replyTo) textInputRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!recording) return;
    const i = setInterval(() => setRecordSeconds((s) => s + 0.1), 100);
    return () => clearInterval(i);
  }, [recording]);

  // release the mic if the composer unmounts mid-recording
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    onTyping?.(false);
  };

  // media goes over the data channel eventually — cap what can even be queued
  const MAX_FILE_BYTES = 100_000_000; // 100 MB

  const pickFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is too large (max 100 MB)`);
        continue;
      }
      onSendMedia(
        {
          kind: mediaKindFor(file),
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
        },
        file,
      );
    }
  };

  const teardownMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  const finishRecording = (intent: 'send' | 'cancel') => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    // ignore accidental taps shorter than half a second
    cancelledRef.current = intent === 'cancel' || elapsed < 0.5;
    if (recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
    setRecordSeconds(0);
  };

  const startRecording = async () => {
    pendingStopRef.current = null;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Microphone not available');
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      if (!cancelledRef.current && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
        onSendMedia(
          {
            kind: 'voice',
            url: URL.createObjectURL(blob),
            name: 'voice-note',
            size: blob.size,
            mimeType: blob.type,
            duration: elapsed,
          },
          blob,
        );
      }
      chunksRef.current = [];
      teardownMic();
    };
    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start(250);
    // the finger may already have lifted while we waited for mic permission
    if (pendingStopRef.current) {
      finishRecording(pendingStopRef.current);
      pendingStopRef.current = null;
      return;
    }
    setRecordSeconds(0);
    setRecording(true);
  };

  const stopRecording = () => {
    if (!recorderRef.current) {
      pendingStopRef.current = 'send';
      return;
    }
    finishRecording('send');
  };

  const cancelRecording = () => {
    if (!recorderRef.current) {
      pendingStopRef.current = 'cancel';
      return;
    }
    finishRecording('cancel');
  };

  return (
    <footer
      className="border-t bg-background pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      data-testid="composer"
    >
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
            data-testid="reply-preview"
          >
            <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs">
              <span className="shrink-0 font-semibold text-primary">{replyToName}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{replySnippet(replyTo)}</span>
              <button
                onClick={onCancelReply}
                aria-label="Cancel reply"
                data-testid="cancel-reply-btn"
                className="cursor-pointer p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4"
              >
                <X />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 px-3 py-2.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = '';
          }}
          data-testid="file-input"
        />

        <AnimatePresence mode="wait" initial={false}>
          {recording ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-9 flex-1 items-center gap-3 rounded-full bg-muted px-4"
              data-testid="recording-bar"
            >
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="size-2.5 rounded-full bg-red-500"
              />
              <span className="text-sm tabular-nums" data-testid="recording-timer">
                {Math.floor(recordSeconds / 60)}:{String(Math.floor(recordSeconds % 60)).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate text-xs text-muted-foreground">
                release to send · slide off to cancel
              </span>
              <button
                onClick={cancelRecording}
                aria-label="Cancel recording"
                data-testid="cancel-recording-btn"
                className="cursor-pointer text-muted-foreground hover:text-destructive [&_svg]:size-4"
              >
                <Trash2 />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 items-center gap-2"
            >
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach media"
                data-testid="attach-btn"
              >
                <ImagePlus />
              </Button>
              <Input
                ref={textInputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onTyping?.(e.target.value.length > 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Message"
                className="h-9 rounded-full px-4"
                data-testid="composer-input"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {text.trim() ? (
          <Button
            size="icon"
            className="cursor-pointer rounded-full"
            onClick={submit}
            aria-label="Send"
            data-testid="send-btn"
          >
            <SendHorizontal />
          </Button>
        ) : (
          <Button
            size="icon"
            className={`cursor-pointer rounded-full transition-transform ${recording ? 'scale-125 bg-red-500 hover:bg-red-500' : ''}`}
            onPointerDown={() => void startRecording()}
            onPointerUp={stopRecording}
            // sliding off the button cancels (messenger convention) — only a
            // deliberate release on the mic sends
            onPointerLeave={() => recording && cancelRecording()}
            aria-label="Hold to record voice note"
            data-testid="voice-record-btn"
          >
            <Mic />
          </Button>
        )}
      </div>
    </footer>
  );
}
