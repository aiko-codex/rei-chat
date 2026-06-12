import { useState } from 'react';
import { toast } from 'sonner';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageActions } from './MessageActions';
import { Composer } from './Composer';
import { currentUserId, mockMessages, users } from '@/lib/mock-data';
import type { MediaAttachment, Message } from '@/lib/types';

interface ChatScreenProps {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenVoiceChannel: () => void;
  onOpenSettings: () => void;
}

export function ChatScreen({
  onVoiceCall,
  onVideoCall,
  onOpenVoiceChannel,
  onOpenSettings,
}: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);

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

  const sendMedia = (media: MediaAttachment) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${media.name}`,
        senderId: currentUserId,
        media,
        sentAt: Date.now(),
        status: 'sent',
      },
    ]);
  };

  const react = (emoji: string) => {
    if (!actionTarget) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === actionTarget.id
          ? {
              ...m,
              reactions: {
                ...m.reactions,
                // tapping the same emoji again removes your reaction
                [currentUserId]: m.reactions?.[currentUserId] === emoji ? undefined : emoji,
              },
            }
          : m,
      ),
    );
    setActionTarget(null);
  };

  const removeMessage = () => {
    if (!actionTarget) return;
    setMessages((prev) => prev.filter((m) => m.id !== actionTarget.id));
    setActionTarget(null);
  };

  const copyMessage = async () => {
    if (actionTarget?.text) {
      await navigator.clipboard.writeText(actionTarget.text);
      toast('Copied');
    }
    setActionTarget(null);
  };

  const reply = () => {
    // mock phase: reply threading comes with the data layer
    toast('Reply — coming soon');
    setActionTarget(null);
  };

  return (
    <div className="relative flex h-full flex-col" data-testid="chat-screen">
      <ChatHeader
        peer={users.her}
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
        onOpenVoiceChannel={onOpenVoiceChannel}
        onOpenSettings={onOpenSettings}
      />
      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        onLongPress={setActionTarget}
      />
      <Composer onSend={send} onSendMedia={sendMedia} />
      <MessageActions
        message={actionTarget}
        isMine={actionTarget?.senderId === currentUserId}
        onClose={() => setActionTarget(null)}
        onReact={react}
        onReply={reply}
        onCopy={copyMessage}
        onDeleteForMe={removeMessage}
        onUnsend={removeMessage}
      />
    </div>
  );
}
