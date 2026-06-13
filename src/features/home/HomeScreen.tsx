import { useState } from 'react';
import { motion } from 'motion/react';
import { Hash, ListTodo, Plus, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/store/chat-store';
import { DM_CHANNEL_ID, type Message } from '@/lib/types';

function previewOf(m: Message | undefined): string {
  if (!m) return 'Say hi 👋';
  if (m.text) return m.text;
  switch (m.media?.kind) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'voice':
      return '🎤 Voice note';
    default:
      return `📎 ${m.media?.name ?? 'File'}`;
  }
}

function timeOf(m: Message | undefined): string {
  if (!m) return '';
  const d = new Date(m.sentAt);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

interface HomeScreenProps {
  onOpenChannel: (channelId: string) => void;
  onOpenSettings: () => void;
}

export function HomeScreen({ onOpenChannel, onOpenSettings }: HomeScreenProps) {
  const messages = useChatStore((s) => s.messages);
  const channels = useChatStore((s) => s.channels);
  const status = useChatStore((s) => s.status);
  const peerTyping = useChatStore((s) => s.peerTyping);
  const peerProfile = useChatStore((s) => s.peerProfile);
  const myProfile = useChatStore((s) => s.myProfile);
  const lastSeen = useChatStore((s) => s.lastSeen);
  const createChannel = useChatStore((s) => s.createChannel);
  const removeChannel = useChatStore((s) => s.removeChannel);
  const restoreChannel = useChatStore((s) => s.restoreChannel);

  // deleting a channel wipes its notes too — give a 5s undo window
  const deleteChannel = (channelId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) return;
    const channelMessages = messages.filter((m) => m.channelId === channelId);
    removeChannel(channelId);
    toast(`Deleted #${channel.name}`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => restoreChannel(channel, channelMessages),
      },
    });
  };

  /** FAB flow: pick a channel type in the sheet, then name it in the dialog */
  const [picking, setPicking] = useState(false);
  const [createKind, setCreateKind] = useState<'personal' | 'todo' | null>(null);
  const [channelName, setChannelName] = useState('');

  const lastIn = (channelId: string) =>
    [...messages].reverse().find((m) => (m.channelId ?? DM_CHANNEL_ID) === channelId);

  const dmLast = lastIn(DM_CHANNEL_ID);
  const dmUnread = messages.filter(
    (m) =>
      (m.channelId ?? DM_CHANNEL_ID) === DM_CHANNEL_ID &&
      m.senderId === 'her' &&
      m.sentAt > (lastSeen[DM_CHANNEL_ID] ?? 0),
  ).length;

  const peerName = peerProfile?.name ?? 'Her';

  const submitChannel = () => {
    const name = channelName.trim();
    if (!name || !createKind) return;
    const channel = createChannel(name, createKind);
    setChannelName('');
    setCreateKind(null);
    onOpenChannel(channel.id);
  };

  /** preview line for a todo channel: progress beats last-item text */
  const todoPreview = (channelId: string) => {
    const items = messages.filter((m) => m.channelId === channelId);
    if (items.length === 0) return 'No tasks yet';
    return `${items.filter((m) => m.done).length} of ${items.length} done`;
  };

  return (
    <div className="flex h-full flex-col" data-testid="home-screen">
      <header className="flex items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold">Chats</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            onClick={onOpenSettings}
            aria-label="Settings"
            data-testid="home-settings-btn"
          >
            <Settings />
          </Button>
          {myProfile && (
            <div
              className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: myProfile.color }}
              data-testid="home-my-avatar"
            >
              {myProfile.name[0].toUpperCase()}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* the DM */}
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onOpenChannel(DM_CHANNEL_ID)}
          className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/60"
          data-testid="home-dm-row"
        >
          <Avatar size="lg">
            <AvatarFallback
              className="text-white"
              style={peerProfile ? { backgroundColor: peerProfile.color } : undefined}
            >
              {peerName[0].toUpperCase()}
            </AvatarFallback>
            {status === 'connected' && (
              <AvatarBadge className="bg-emerald-500" data-testid="home-dm-online" />
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{peerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {peerTyping ? (
                <span className="text-primary">typing…</span>
              ) : (
                previewOf(dmLast)
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] text-muted-foreground">{timeOf(dmLast)}</span>
            {dmUnread > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
                data-testid="home-dm-unread"
              >
                {dmUnread}
              </span>
            )}
          </div>
        </motion.button>

        {/* personal channels — this device only */}
        {channels.length > 0 && (
          <p className="px-5 pt-4 pb-1 text-xs font-medium text-muted-foreground">
            Your channels · only you can see these
          </p>
        )}
        {channels.map((channel) => {
          const last = lastIn(channel.id);
          return (
            <div
              key={channel.id}
              className="group flex w-full items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60"
              data-testid={`home-channel-${channel.id}`}
            >
              <button
                onClick={() => onOpenChannel(channel.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-4.5">
                  {channel.kind === 'todo' ? <ListTodo /> : <Hash />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{channel.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {channel.kind === 'todo' ? todoPreview(channel.id) : previewOf(last)}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{timeOf(last)}</span>
              </button>
              <button
                onClick={() => deleteChannel(channel.id)}
                aria-label={`Delete ${channel.name}`}
                data-testid={`delete-channel-${channel.id}`}
                className="cursor-pointer p-1 text-muted-foreground/40 transition-colors hover:text-destructive [&_svg]:size-4"
              >
                <Trash2 />
              </button>
            </div>
          );
        })}
      </div>

      {/* create channel: FAB → type picker sheet → name dialog */}
      <Button
        size="icon"
        onClick={() => setPicking(true)}
        aria-label="New channel"
        data-testid="create-channel-btn"
        className="absolute right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] size-13 cursor-pointer rounded-full shadow-lg [&_svg]:size-5"
      >
        <Plus />
      </Button>

      <Drawer open={picking} onOpenChange={setPicking}>
        <DrawerContent data-testid="channel-type-sheet">
          <DrawerHeader>
            <DrawerTitle>New private space</DrawerTitle>
            <p className="text-xs text-muted-foreground">
              Lives only on this phone — she won't see it.
            </p>
          </DrawerHeader>
          <div className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => {
                setPicking(false);
                setCreateKind('personal');
              }}
              data-testid="channel-type-text"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-4.5">
                <Hash />
              </span>
              <span>
                <span className="block text-sm font-semibold">Text channel</span>
                <span className="block text-xs text-muted-foreground">
                  Notes, links, ideas
                </span>
              </span>
            </button>
            <button
              onClick={() => {
                setPicking(false);
                setCreateKind('todo');
              }}
              data-testid="channel-type-todo"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-4.5">
                <ListTodo />
              </span>
              <span>
                <span className="block text-sm font-semibold">To-do list</span>
                <span className="block text-xs text-muted-foreground">
                  Tasks you can check off
                </span>
              </span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={createKind !== null} onOpenChange={(open) => !open && setCreateKind(null)}>
        <DialogContent className="max-w-sm" data-testid="create-channel-dialog">
          <DialogHeader>
            <DialogTitle>
              {createKind === 'todo' ? 'New to-do list' : 'New text channel'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {createKind === 'todo'
              ? 'A checklist on this device — groceries, plans, gift ideas.'
              : "A private space on this device — notes, links, ideas. She won't see it."}
          </p>
          <Input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitChannel()}
            placeholder={createKind === 'todo' ? 'list-name' : 'channel-name'}
            autoFocus
            data-testid="channel-name-input"
          />
          <DialogFooter>
            <Button
              onClick={submitChannel}
              disabled={!channelName.trim()}
              className="cursor-pointer"
              data-testid="channel-create-confirm"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
