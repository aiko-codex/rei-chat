import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Images, Palette, Search, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat-store';
import { DM_CHANNEL_ID } from '@/lib/types';
import { ChatSearchPanel } from './ChatSearchPanel';
import { ChatThemePanel } from './ChatThemePanel';
import { ChatGalleryPanel } from './ChatGalleryPanel';

type Panel = 'search' | 'theme' | 'gallery';

interface ChatDetailsScreenProps {
  onBack: () => void;
  /** jump to a message in the conversation (from search) */
  onJump: (id: string) => void;
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

export function ChatDetailsScreen({ onBack, onJump }: ChatDetailsScreenProps) {
  const peerProfile = useChatStore((s) => s.peerProfile);
  const allMessages = useChatStore((s) => s.messages);
  const [panel, setPanel] = useState<Panel | null>(null);

  const dmMessages = useMemo(
    () => allMessages.filter((m) => (m.channelId ?? DM_CHANNEL_ID) === DM_CHANNEL_ID),
    [allMessages],
  );

  const name = peerProfile?.name ?? 'Her';

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
            {peerProfile?.avatar && <AvatarImage src={peerProfile.avatar} alt={name} />}
            <AvatarFallback
              className="text-3xl font-semibold text-white"
              style={peerProfile?.color ? { backgroundColor: peerProfile.color } : undefined}
            >
              {name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold">{name}</p>
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
            icon={<Images className="size-5" />}
            label="Media & links"
            hint="Photos, videos and links shared here"
            onClick={() => setPanel('gallery')}
            testId="details-gallery"
          />
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
                messages={dmMessages}
                onBack={() => setPanel(null)}
                onJump={onJump}
              />
            )}
            {panel === 'theme' && <ChatThemePanel onBack={() => setPanel(null)} />}
            {panel === 'gallery' && (
              <ChatGalleryPanel messages={dmMessages} onBack={() => setPanel(null)} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
