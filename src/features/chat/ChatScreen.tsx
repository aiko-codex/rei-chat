import { useState } from 'react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { currentUserId, mockMessages, users } from '@/lib/mock-data';
import type { Message } from '@/lib/types';

interface ChatScreenProps {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenSettings: () => void;
}

export function ChatScreen({ onVoiceCall, onVideoCall, onOpenSettings }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>(mockMessages);

  const send = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        senderId: currentUserId,
        text,
        sentAt: Date.now(),
        status: 'sent',
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col" data-testid="chat-screen">
      <ChatHeader
        peer={users.her}
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
        onOpenSettings={onOpenSettings}
      />
      <MessageList messages={messages} currentUserId={currentUserId} />
      <Composer onSend={send} />
    </div>
  );
}
