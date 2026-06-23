import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { CalendarHeart, ChevronLeft, ChevronRight, Heart, Images, Lock, Palette, Search, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChatStore } from '@/store/chat-store';
import { SIGNAL_URL } from '@/lib/config';
import { removeRemoteMessage } from '@/lib/message-api';
import { removeConvMessage } from '@/lib/conversation-api';
import { sendPeerRemove } from '@/lib/peer-service';
import { verifyPassword } from '@/lib/account-api';
import { DM_CHANNEL_ID, type Message } from '@/lib/types';
import { ChatSearchPanel } from './ChatSearchPanel';
import { ChatThemePanel } from './ChatThemePanel';
import { ChatGalleryPanel } from './ChatGalleryPanel';
import { ChatMemoriesPanel } from './ChatMemoriesPanel';
import { ChatDatesPanel } from './ChatDatesPanel';

type Panel = 'search' | 'theme' | 'gallery' | 'memories' | 'vault' | 'dates';

interface ChatDetailsScreenProps {
  onBack: () => void;
  /** jump to a message in the conversation (from search) */
  onJump: (id: string) => void;
  /** which conversation: the legacy DM, or a connection id */
  channelId?: string;
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  testId: string;
}

function DetailRow({ icon, label, hint, onClick, testId }: DetailRowProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="size-4 text-muted-foreground/50" />
    </button>
  );
}

export function ChatDetailsScreen({ onBack, onJump, channelId = DM_CHANNEL_ID }: ChatDetailsScreenProps) {
  const peerProfile = useChatStore((s) => s.peerProfile);
  const connectionPeers = useChatStore((s) => s.connectionPeers);
  const allMessages = useChatStore((s) => s.messages);
  const removeLocal = useChatStore((s) => s.remove);
  const upsert = useChatStore((s) => s.upsert);
  const hideMessages = useChatStore((s) => s.hideMessages);
  const [panel, setPanel] = useState<Panel | null>(null);

  // Hidden vault gating. The vault row is invisible until the username is tapped
  // 5× (an easter-egg reveal), and then opening it requires the owner's login
  // password. Both reset every time the profile screen is freshly opened.
  const [nameTaps, setNameTaps] = useState(0);
  const [vaultRevealed, setVaultRevealed] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const isDm = channelId === DM_CHANNEL_ID;
  const isConnection = channelId !== DM_CHANNEL_ID && Boolean(connectionPeers[channelId]);
  const connPeer = isConnection ? connectionPeers[channelId] : undefined;

  const allConvMessages = useMemo(
    () => allMessages.filter((m) => (m.channelId ?? DM_CHANNEL_ID) === channelId),
    [allMessages, channelId],
  );
  // hidden items live only in the vault — everything else (search, memories,
  // gallery) sees the visible subset
  const convMessages = useMemo(() => allConvMessages.filter((m) => !m.hidden), [allConvMessages]);
  const hiddenMessages = useMemo(() => allConvMessages.filter((m) => m.hidden), [allConvMessages]);

  const onNameTap = () => {
    if (vaultRevealed) return;
    const next = nameTaps + 1;
    setNameTaps(next);
    if (next >= 5) {
      setVaultRevealed(true);
      toast('Hidden vault unlocked 🔒');
    }
  };

  const submitPassword = async () => {
    setPwBusy(true);
    setPwError(false);
    const ok = await verifyPassword(pw);
    setPwBusy(false);
    if (ok) {
      setPwOpen(false);
      setPw('');
      setPanel('vault');
    } else {
      setPwError(true);
    }
  };

  const hide = (ids: string[]) => {
    hideMessages(ids, true);
    toast(`Moved ${ids.length} to the vault`);
  };
  const unhide = (ids: string[]) => {
    hideMessages(ids, false);
    toast(`Restored ${ids.length} item${ids.length > 1 ? 's' : ''}`);
  };

  // Bulk delete from the gallery. Mirrors ChatScreen's per-message paths:
  // "for me" is local-only (with a 5s undo); "for everyone" removes our copy,
  // the server copy, and fires the live P2P removal (best effort — the durable
  // server delete is the reliable lane). Instant + irreversible (confirmed first).
  const bulkDeleteForMe = (ids: string[]) => {
    const removed = allMessages.filter((m) => ids.includes(m.id));
    removed.forEach((m) => removeLocal(m.id));
    toast(`Deleted ${removed.length} for you`, {
      duration: 5000,
      action: { label: 'Undo', onClick: () => removed.forEach((m: Message) => upsert(m)) },
    });
  };

  const bulkDeleteForEveryone = (ids: string[]) => {
    ids.forEach((id) => {
      removeLocal(id);
      if (isConnection) {
        sendPeerRemove(id);
        void removeConvMessage(channelId, id);
      } else if (isDm && SIGNAL_URL) {
        void removeRemoteMessage(id);
        sendPeerRemove(id);
      }
    });
    toast(`Unsent ${ids.length} item${ids.length > 1 ? 's' : ''}`);
  };

  const name = isConnection ? connPeer!.displayName : peerProfile?.name ?? 'Her';
  const avatar = isConnection ? connPeer!.avatar ?? undefined : peerProfile?.avatar;
  const avatarColor = isConnection ? undefined : peerProfile?.color;

  return (
    <div className="relative flex h-full flex-col" data-testid="chat-details-screen">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="details-back">
          <ChevronLeft />
        </Button>
        <p className="text-sm font-semibold">Details</p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Instagram-style profile block */}
        <div className="flex flex-col items-center gap-3 px-6 py-8">
          <Avatar className="size-24">
            {avatar && <AvatarImage src={avatar} alt={name} />}
            <AvatarFallback
              className="text-3xl font-semibold text-white"
              style={avatarColor ? { backgroundColor: avatarColor } : { backgroundColor: '#b03a6e' }}
            >
              {name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={onNameTap}
            className="cursor-default text-lg font-semibold"
            data-testid="profile-name"
          >
            {name}
          </button>
          {connPeer && <p className="-mt-2 text-xs text-muted-foreground">@{connPeer.username}</p>}
          <p className="flex items-center gap-1 text-xs text-emerald-600">
            <ShieldCheck className="size-3.5" /> End-to-end encrypted
          </p>
        </div>

        <div className="border-t">
          <DetailRow
            icon={<Search className="size-5" />}
            label="Search"
            hint="Find messages in this chat"
            onClick={() => setPanel('search')}
            testId="details-search"
          />
          <DetailRow
            icon={<Palette className="size-5" />}
            label="Theme & chat background"
            hint="Wallpaper shared with both phones"
            onClick={() => setPanel('theme')}
            testId="details-theme"
          />
          <DetailRow
            icon={<Heart className="size-5" />}
            label="Memories"
            hint="Photos & moments you both pinned"
            onClick={() => setPanel('memories')}
            testId="details-memories"
          />
          <DetailRow
            icon={<CalendarHeart className="size-5" />}
            label="Important dates"
            hint="Anniversaries, birthdays & trips"
            onClick={() => setPanel('dates')}
            testId="details-dates"
          />
          <DetailRow
            icon={<Images className="size-5" />}
            label="Media & links"
            hint="Photos, videos and links shared here"
            onClick={() => setPanel('gallery')}
            testId="details-gallery"
          />
          {vaultRevealed && (
            <DetailRow
              icon={<Lock className="size-5" />}
              label="Hidden vault"
              hint={`Password-protected · ${hiddenMessages.length} item${hiddenMessages.length === 1 ? '' : 's'}`}
              onClick={() => {
                setPw('');
                setPwError(false);
                setPwOpen(true);
              }}
              testId="details-vault"
            />
          )}
        </div>
      </div>

      {/* sub-panels slide over, matching the Settings → Appearance pattern */}
      <AnimatePresence>
        {panel && (
          <motion.div
            key={panel}
            className="absolute inset-0 z-10 bg-background"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          >
            {panel === 'search' && (
              <ChatSearchPanel
                messages={convMessages}
                onBack={() => setPanel(null)}
                onJump={onJump}
              />
            )}
            {panel === 'theme' && (
              <ChatThemePanel
                onBack={() => setPanel(null)}
                connectionId={isConnection ? channelId : null}
              />
            )}
            {panel === 'memories' && (
              <ChatMemoriesPanel
                messages={convMessages}
                onBack={() => setPanel(null)}
                onJump={onJump}
              />
            )}
            {panel === 'dates' && (
              <ChatDatesPanel channelId={channelId} onBack={() => setPanel(null)} />
            )}
            {panel === 'gallery' && (
              <ChatGalleryPanel
                messages={convMessages}
                onBack={() => setPanel(null)}
                onDeleteForMe={bulkDeleteForMe}
                onDeleteForEveryone={bulkDeleteForEveryone}
                onHide={hide}
              />
            )}
            {panel === 'vault' && (
              <ChatGalleryPanel
                mode="vault"
                messages={hiddenMessages}
                onBack={() => setPanel(null)}
                onDeleteForMe={bulkDeleteForMe}
                onDeleteForEveryone={bulkDeleteForEveryone}
                onUnhide={unhide}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* owner password gate for the Hidden vault */}
      <Dialog open={pwOpen} onOpenChange={(o) => { if (!o) { setPwOpen(false); setPw(''); setPwError(false); } }}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Lock className="size-5 text-muted-foreground" />
              <DialogTitle>Unlock Hidden vault</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter your account password to confirm it’s you.
          </p>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => { setPw(e.target.value); setPwError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && pw && !pwBusy && void submitPassword()}
            placeholder="Password"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            data-testid="vault-password-input"
          />
          {pwError && <p className="text-xs text-destructive">Incorrect password. Try again.</p>}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="cursor-pointer" onClick={() => { setPwOpen(false); setPw(''); setPwError(false); }}>
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={!pw || pwBusy}
              onClick={() => void submitPassword()}
              data-testid="vault-password-submit"
            >
              {pwBusy ? 'Checking…' : 'Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
