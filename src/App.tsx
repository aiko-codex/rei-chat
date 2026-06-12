import { useState } from 'react';
import { ChatScreen } from '@/features/chat/ChatScreen';
import type { Screen } from '@/lib/types';

export default function App() {
  // state-driven navigation; call/settings/lock screens land here next
  const [screen, setScreen] = useState<Screen>('chat');

  return (
    <div className="h-full bg-muted/40">
      <div
        className="mx-auto h-full max-w-xl bg-background shadow-sm md:border-x"
        data-testid="app-shell"
      >
        {screen === 'chat' && (
          <ChatScreen
            onVoiceCall={() => setScreen('call')}
            onVideoCall={() => setScreen('call')}
            onOpenSettings={() => setScreen('settings')}
          />
        )}
        {screen !== 'chat' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-sm">“{screen}” screen — not built yet</p>
            <button
              className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setScreen('chat')}
              data-testid="back-to-chat-btn"
            >
              back to chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
