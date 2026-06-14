import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ImagePlus, Mic, Pencil, SendHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VoiceRecorderModal } from './VoiceRecorderModal';
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
  /** when set, the composer edits this message's text in place (Instagram-style) */
  editing?: { id: string; text: string } | null;
  onEditSubmit?: (text: string) => void;
  onCancelEdit?: () => void;
}

export function Composer({
  onSend,
  onSendMedia,
  onTyping,
  replyTo,
  replyToName,
  onCancelReply,
  editing,
  onEditSubmit,
  onCancelEdit,
}: ComposerProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // voice note recording happens in a modal (tap to open, no hold gesture)
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    if (replyTo) textInputRef.current?.focus();
  }, [replyTo]);

  // entering edit mode loads the message text into the input and focuses it
  useEffect(() => {
    if (editing) {
      setText(editing.text);
      textInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const cancelEdit = () => {
    setText('');
    onCancelEdit?.();
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (editing) cancelEdit();
      return;
    }
    if (editing) {
      onEditSubmit?.(trimmed);
    } else {
      onSend(trimmed);
    }
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

  return (
    <footer
      className="border-t bg-background pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      data-testid="composer"
    >
      <AnimatePresence>
        {editing ? (
          <motion.div
            key="editing"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
            data-testid="edit-preview"
          >
            <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs">
              <Pencil className="size-3.5 shrink-0 text-primary" />
              <span className="shrink-0 font-semibold text-primary">Editing message</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{editing.text}</span>
              <button
                onClick={cancelEdit}
                aria-label="Cancel edit"
                data-testid="cancel-edit-btn"
                className="cursor-pointer p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4"
              >
                <X />
              </button>
            </div>
          </motion.div>
        ) : replyTo ? (
          <motion.div
            key="replying"
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
        ) : null}
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
            if (!editing) onTyping?.(e.target.value.length > 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message"
          className="h-9 flex-1 rounded-full px-4"
          data-testid="composer-input"
        />

        {editing ? (
          <Button
            size="icon"
            className="cursor-pointer rounded-full"
            onClick={submit}
            aria-label="Save edit"
            data-testid="edit-save-btn"
          >
            <Check />
          </Button>
        ) : text.trim() ? (
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
            className="cursor-pointer rounded-full"
            onClick={() => setVoiceOpen(true)}
            aria-label="Record voice note"
            data-testid="voice-record-btn"
          >
            <Mic />
          </Button>
        )}
      </div>

      <VoiceRecorderModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSend={onSendMedia}
      />
    </footer>
  );
}
