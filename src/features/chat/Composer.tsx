import { useState } from 'react';
import { ImagePlus, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ComposerProps {
  onSend: (text: string) => void;
}

export function Composer({ onSend }: ComposerProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <footer
      className="flex items-center gap-2 border-t bg-background px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      data-testid="composer"
    >
      <Button variant="ghost" size="icon" className="cursor-pointer" aria-label="Attach image" data-testid="attach-btn">
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
      <Button
        size="icon"
        className="cursor-pointer rounded-full"
        onClick={submit}
        disabled={!text.trim()}
        aria-label="Send"
        data-testid="send-btn"
      >
        <SendHorizontal />
      </Button>
    </footer>
  );
}
