import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus, Mic, SendHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaAttachment } from '@/lib/types';

function mediaKindFor(file: File): MediaAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

interface ComposerProps {
  onSend: (text: string) => void;
  onSendMedia: (media: MediaAttachment) => void;
}

export function Composer({ onSend, onSendMedia }: ComposerProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // voice note recording (mock: timer only, no real mic yet)
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const i = setInterval(() => setRecordSeconds((s) => s + 0.1), 100);
    return () => clearInterval(i);
  }, [recording]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const pickFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of files) {
      onSendMedia({
        kind: mediaKindFor(file),
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      });
    }
  };

  const startRecording = () => {
    cancelledRef.current = false;
    setRecordSeconds(0);
    setRecording(true);
  };

  const stopRecording = () => {
    if (!recording) return;
    setRecording(false);
    // ignore accidental taps shorter than half a second
    if (!cancelledRef.current && recordSeconds >= 0.5) {
      onSendMedia({
        kind: 'voice',
        url: '',
        name: 'voice-note',
        size: 0,
        mimeType: 'audio/webm',
        duration: recordSeconds,
      });
    }
    setRecordSeconds(0);
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    setRecording(false);
    setRecordSeconds(0);
  };

  return (
    <footer
      className="flex items-center gap-2 border-t bg-background px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      data-testid="composer"
    >
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
            <span className="flex-1 text-sm tabular-nums" data-testid="recording-timer">
              {Math.floor(recordSeconds / 60)}:{String(Math.floor(recordSeconds % 60)).padStart(2, '0')}
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
              value={text}
              onChange={(e) => setText(e.target.value)}
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
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={() => recording && stopRecording()}
          aria-label="Hold to record voice note"
          data-testid="voice-record-btn"
        >
          <Mic />
        </Button>
      )}
    </footer>
  );
}
