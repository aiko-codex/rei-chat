import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  Hash,
  ListTodo,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  onOpenNotifications: () => void;
}

export function HomeScreen({ onOpenChannel, onOpenSettings, onOpenNotifications }: HomeScreenProps) {
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
  const inviteToChannel = useChatStore((s) => s.inviteToChannel);
  const renameChannel = useChatStore((s) => s.renameChannel);
  const invites = useChatStore((s) => s.invites);
  const acceptances = useChatStore((s) => s.acceptances);
  const notifCount = invites.length + acceptances.length;

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

  /** per-channel menu (edit / invite / delete) + the rename dialog */
  const [menuChannelId, setMenuChannelId] = useState<string | null>(null);
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const menuChannel = channels.find((c) => c.id === menuChannelId) ?? null;

  const invite = (channelId: string) => {
    inviteToChannel(channelId);
    setMenuChannelId(null);
    toast(`Invited ${peerName} to collaborate — she'll see it in her notifications`);
  };

  const openRename = (channelId: string, current: string) => {
    setEditChannelId(channelId);
    setEditName(current);
    setMenuChannelId(null);
  };

  const submitRename = () => {
    if (editChannelId && editName.trim()) renameChannel(editChannelId, editName);
    setEditChannelId(null);
  };

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
            className="relative cursor-pointer"
            onClick={onOpenNotifications}
            aria-label="Notifications"
            data-testid="home-notifications-btn"
          >
            <Bell />
            {notifCount > 0 && (
              <span
                className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                data-testid="home-notifications-badge"
              >
                {notifCount}
              </span>
            )}
          </Button>
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
            <Avatar className="size-8" data-testid="home-my-avatar">
              {myProfile.avatar && <AvatarImage src={myProfile.avatar} alt={myProfile.name} />}
              <AvatarFallback
                className="text-sm font-semibold text-white"
                style={{ backgroundColor: myProfile.color }}
              >
                {myProfile.name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
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
            {peerProfile?.avatar && <AvatarImage src={peerProfile.avatar} alt={peerName} />}
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

        {/* personal channels (device-local until shared via an accepted invite) */}
        {channels.length > 0 && (
          <p className="px-5 pt-4 pb-1 text-xs font-medium text-muted-foreground">
            Your channels
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
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{channel.name}</span>
                    {channel.shared && (
                      <span
                        className="flex items-center text-primary [&_svg]:size-3.5"
                        title={`Synced with ${peerName}`}
                        data-testid={`channel-shared-${channel.id}`}
                      >
                        <RefreshCw />
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {channel.kind === 'todo' ? todoPreview(channel.id) : previewOf(last)}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{timeOf(last)}</span>
              </button>
              <button
                onClick={() => setMenuChannelId(channel.id)}
                aria-label={`${channel.name} menu`}
                data-testid={`channel-menu-${channel.id}`}
                className="cursor-pointer p-1 text-muted-foreground/50 transition-colors hover:text-foreground [&_svg]:size-4.5"
              >
                <MoreVertical />
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

      {/* per-channel menu: edit name / invite to collaborate / delete */}
      <Drawer open={menuChannel !== null} onOpenChange={(open) => !open && setMenuChannelId(null)}>
        <DrawerContent data-testid="channel-menu-sheet">
          <DrawerHeader>
            <DrawerTitle className="truncate">#{menuChannel?.name}</DrawerTitle>
            <p className="text-xs text-muted-foreground">
              {menuChannel?.shared
                ? `Collaborating with ${peerName} — changes sync to both of you.`
                : `Only on this phone. Invite ${peerName} to collaborate.`}
            </p>
          </DrawerHeader>
          <div className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => menuChannel && openRename(menuChannel.id, menuChannel.name)}
              data-testid="channel-menu-edit"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted [&_svg]:size-4.5"
            >
              <Pencil />
              <span className="text-sm font-medium">Edit name</span>
            </button>
            {!menuChannel?.shared && (
              <button
                onClick={() => menuChannel && invite(menuChannel.id)}
                data-testid="channel-menu-invite"
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted [&_svg]:size-4.5"
              >
                <UserPlus />
                <span>
                  <span className="block text-sm font-medium">Invite to collaborate</span>
                  <span className="block text-xs text-muted-foreground">
                    Sends {peerName} a notification to join
                  </span>
                </span>
              </button>
            )}
            <button
              onClick={() => {
                if (menuChannel) deleteChannel(menuChannel.id);
                setMenuChannelId(null);
              }}
              data-testid="channel-menu-delete"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-destructive transition-colors hover:bg-destructive/10 [&_svg]:size-4.5"
            >
              <Trash2 />
              <span className="text-sm font-medium">Delete channel</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={editChannelId !== null} onOpenChange={(open) => !open && setEditChannelId(null)}>
        <DialogContent className="max-w-sm" data-testid="rename-channel-dialog">
          <DialogHeader>
            <DialogTitle>Edit channel name</DialogTitle>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
            autoFocus
            data-testid="rename-channel-input"
          />
          <DialogFooter>
            <Button
              onClick={submitRename}
              disabled={!editName.trim()}
              className="cursor-pointer"
              data-testid="rename-channel-confirm"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
