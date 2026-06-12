import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message, UserId } from '@/lib/types';

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

interface MessageListProps {
  messages: Message[];
  currentUserId: UserId;
  onLongPress: (message: Message) => void;
}

export function MessageList({ messages, currentUserId, onLongPress }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="message-list">
      <div className="flex flex-col gap-1">
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.sentAt) !== dayLabel(msg.sentAt);
          const isGroupEnd = !next || next.senderId !== msg.senderId;
          return (
            <div key={msg.id} className={isGroupEnd ? 'mb-2' : undefined}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {dayLabel(msg.sentAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isMine={msg.senderId === currentUserId}
                isGroupEnd={isGroupEnd}
                onLongPress={onLongPress}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
