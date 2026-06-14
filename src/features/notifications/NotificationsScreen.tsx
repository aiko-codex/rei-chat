import { ArrowLeft, BellOff, Check, Hash, ListTodo, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat-store';

interface NotificationsScreenProps {
  onBack: () => void;
  /** jump into a channel once an invite is accepted */
  onOpenChannel: (channelId: string) => void;
}

export function NotificationsScreen({ onBack, onOpenChannel }: NotificationsScreenProps) {
  const invites = useChatStore((s) => s.invites);
  const acceptances = useChatStore((s) => s.acceptances);
  const peerName = useChatStore((s) => s.peerProfile?.name ?? 'She');
  const acceptInvite = useChatStore((s) => s.acceptInvite);
  const declineInvite = useChatStore((s) => s.declineInvite);
  const dismissAcceptance = useChatStore((s) => s.dismissAcceptance);

  const accept = async (channelId: string, name: string) => {
    await acceptInvite(channelId);
    toast(`Joined #${name}`);
    onOpenChannel(channelId);
  };

  const isEmpty = invites.length === 0 && acceptances.length === 0;

  return (
    <div className="flex h-full flex-col" data-testid="notifications-screen">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer"
          onClick={onBack}
          aria-label="Back"
          data-testid="notifications-back"
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-lg font-semibold">Notifications</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-7">
              <BellOff />
            </span>
            <p className="text-sm font-semibold">You're all caught up</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Collaboration invites show up here. When one of you shares a channel, the other can
              accept it to start syncing.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 py-2">
            {acceptances.map((notice) => (
              <li
                key={`acc-${notice.channelId}`}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3"
                data-testid={`acceptance-${notice.channelId}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 [&_svg]:size-4.5">
                  <Check />
                </span>
                <button
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => {
                    dismissAcceptance(notice.channelId);
                    onOpenChannel(notice.channelId);
                  }}
                >
                  <p className="truncate text-sm">
                    <span className="font-semibold">{peerName}</span> accepted — you're now
                    collaborating
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground [&_svg]:size-3">
                    <RefreshCw /> #{notice.name} · synced
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => dismissAcceptance(notice.channelId)}
                  data-testid={`acceptance-dismiss-${notice.channelId}`}
                >
                  Got it
                </Button>
              </li>
            ))}
            {invites.map((invite) => (
              <li
                key={invite.channelId}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3"
                data-testid={`invite-${invite.channelId}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4.5">
                  {invite.kind === 'todo' ? <ListTodo /> : <Hash />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{invite.fromName}</span> invited you to
                    collaborate
                  </p>
                  <p className="truncate text-xs text-muted-foreground">#{invite.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => declineInvite(invite.channelId)}
                    data-testid={`invite-decline-${invite.channelId}`}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => void accept(invite.channelId, invite.name)}
                    data-testid={`invite-accept-${invite.channelId}`}
                  >
                    Accept
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
