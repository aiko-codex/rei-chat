import { useCallback, useEffect, useRef, useState } from 'react';
import { Hash, Heart, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageActions } from './MessageActions';
import { Composer } from './Composer';
import { Lightbox } from './Lightbox';
import { TodoChannelScreen } from '@/features/todo/TodoChannelScreen';
import { SIGNAL_URL } from '@/lib/config';
import { putBlob } from '@/lib/db';
import {
    removeRemoteMessage,
    uploadMedia,
    uploadMessage,
} from '@/lib/message-api';
import {
    sendPeerMedia,
    sendPeerMessage,
    sendPeerRead,
    sendPeerRemove,
    sendPeerTyping,
} from '@/lib/peer-service';
import { currentUserId } from '@/lib/mock-data';
import { useChatStore } from '@/store/chat-store';
import { backgroundCss } from '@/lib/chat-theme';
import { DM_CHANNEL_ID, type MediaAttachment, type Message } from '@/lib/types';

interface ChatScreenProps {
    channelId: string;
    onBack: () => void;
    onVoiceCall: () => void;
    onVideoCall: () => void;
    onOpenVoiceChannel: () => void;
    /** open the conversation profile (search / theme / gallery) — DM only */
    onOpenDetails?: () => void;
    /** scroll to + highlight a message (e.g. from in-chat search) */
    jump?: { id: string; nonce: number } | null;
}

export function ChatScreen({
    channelId,
    onBack,
    onVoiceCall,
    onVideoCall,
    onOpenVoiceChannel,
    onOpenDetails,
    jump,
}: ChatScreenProps) {
    const isDm = channelId === DM_CHANNEL_ID;

    const allMessages = useChatStore((s) => s.messages);
    const peerStatus = useChatStore((s) => s.status);
    const connDiag = useChatStore((s) => s.connDiag);
    const peerTyping = useChatStore((s) => s.peerTyping);
    const peerProfile = useChatStore((s) => s.peerProfile);
    const channels = useChatStore((s) => s.channels);
    const chatBg = useChatStore((s) => s.chatBg);
    const chatBgUrl = useChatStore((s) => s.chatBgUrl);
    const upsert = useChatStore((s) => s.upsert);
    const setReaction = useChatStore((s) => s.setReaction);
    const removeLocal = useChatStore((s) => s.remove);
    const markSeen = useChatStore((s) => s.markSeen);

    const [actionTarget, setActionTarget] = useState<Message | null>(null);
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);
    const [editTarget, setEditTarget] = useState<Message | null>(null);
    const [lightboxTarget, setLightboxTarget] = useState<Message | null>(null);

    const messages = allMessages.filter(
        (m) => (m.channelId ?? DM_CHANNEL_ID) === channelId,
    );
    const channel = channels.find((c) => c.id === channelId);

    // clear the unread badge when the channel opens
    useEffect(() => {
        markSeen(channelId);
    }, [channelId, markSeen]);

    // Mark "read" only when the user is genuinely viewing the latest message
    // (channel open + scrolled to the bottom), not merely because a new message
    // arrived while they're scrolled up reading history. When connected, also
    // push the receipt over P2P so "Seen" flips instantly instead of waiting
    // for the next server poll; the server upload (markSeen→markRead) is the
    // offline fallback.
    const lastReadSent = useRef(0);
    const onViewedBottom = useCallback(() => {
        markSeen(channelId);
        if (!isDm) return;
        const newest = messages.reduce((max, m) => (m.sentAt > max ? m.sentAt : max), 0);
        if (newest > lastReadSent.current) {
            lastReadSent.current = newest;
            sendPeerRead(newest);
        }
    }, [channelId, isDm, messages, markSeen]);

    const imageMessages = messages.filter((m) => m.media?.kind === 'image');

    // the shared chat wallpaper applies to the DM only (personal channels stay
    // plain). Recomputed per render so a theme toggle re-resolves light/dark.
    const isDark = document.documentElement.classList.contains('dark');
    const bgCss = isDm ? backgroundCss(chatBg, isDark, chatBgUrl) : undefined;
    const backgroundStyle = bgCss ? { background: bgCss } : undefined;

    // server store is what reaches her when she's offline — surface failures
    // instead of swallowing them; only downgrade if the P2P ack hasn't
    // already flipped the status to delivered
    const storeOnServer = async (message: Message) => {
        const ok = await uploadMessage(message);
        if (ok) return;
        const current = useChatStore
            .getState()
            .messages.find((m) => m.id === message.id);
        if (current && current.status === 'sent') {
            upsert({ ...current, status: 'failed' });
        }
    };

    const send = (text: string) => {
        const message: Message = {
            id: `local-${Date.now()}`,
            channelId,
            senderId: currentUserId,
            text,
            sentAt: Date.now(),
            status: 'sent',
            replyToId: replyTarget?.id,
        };
        // optimistic: shows immediately; DM additionally goes P2P (ack flips
        // to 'delivered') and as ciphertext to the server store
        upsert(message);
        if (isDm) {
            sendPeerMessage(message);
            if (SIGNAL_URL) void storeOnServer(message);
        }
        setReplyTarget(null);
    };

    const retry = (message: Message) => {
        const optimistic: Message = { ...message, status: 'sent' };
        upsert(optimistic);
        sendPeerMessage(optimistic);
        if (SIGNAL_URL) void storeOnServer(optimistic);
    };

    const sendMedia = (media: MediaAttachment, blob: Blob) => {
        const message: Message = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId,
            senderId: currentUserId,
            media,
            sentAt: Date.now(),
            status: 'sent',
            replyToId: replyTarget?.id,
        };
        // persist the bytes locally (survives reload) and show immediately
        if (SIGNAL_URL) void putBlob(message.id, blob);
        upsert(message);
        if (isDm) {
            // stream the bytes to the peer live over the binary media channel
            sendPeerMedia(message, blob);
            if (SIGNAL_URL) {
                // back up to the server so it restores on a new device: the
                // metadata row (object URL stripped) + the encrypted bytes,
                // surfacing upload progress on the bubble as it streams up
                void storeOnServer({
                    ...message,
                    media: { ...message.media!, url: '' },
                });
                const store = useChatStore.getState();
                store.setTransfer(message.id, 0.01);
                void uploadMedia(message.id, blob, (p) =>
                    store.setTransfer(message.id, p),
                ).finally(() => store.clearTransfer(message.id));
            }
        }
        setReplyTarget(null);
    };

    const react = (emoji: string) => {
        if (!actionTarget) return;
        // tapping the same emoji again removes your reaction
        const next =
            actionTarget.reactions?.[currentUserId] === emoji
                ? undefined
                : emoji;
        setReaction(actionTarget.id, currentUserId, next);
        setActionTarget(null);
    };

    // double-tap a message → toggle the default (first) quick reaction
    const toggleDefaultReaction = (message: Message) => {
        const def = useChatStore.getState().quickReactions[0];
        const current = message.reactions?.[currentUserId];
        setReaction(
            message.id,
            currentUserId,
            current === def ? undefined : def,
        );
    };

    // E2E means the server can never restore deleted content — both removal
    // paths get a 5s undo window instead of an irreversible single tap
    const deleteForMe = () => {
        if (!actionTarget) return;
        const removed = actionTarget;
        removeLocal(removed.id);
        setActionTarget(null);
        toast('Deleted for you', {
            duration: 5000,
            action: { label: 'Undo', onClick: () => upsert(removed) },
        });
    };

    const unsend = () => {
        if (!actionTarget) return;
        const removed = actionTarget;
        removeLocal(removed.id);
        setActionTarget(null);
        // instant, no undo — remove our copy, the server copy, and hers now
        if (isDm && SIGNAL_URL) {
            void removeRemoteMessage(removed.id);
            sendPeerRemove(removed.id);
        }
        toast('Unsent');
    };

    const copyMessage = async () => {
        if (actionTarget?.text) {
            try {
                await navigator.clipboard.writeText(actionTarget.text);
                toast('Copied');
            } catch {
                toast.error("Couldn't copy");
            }
        }
        setActionTarget(null);
    };

    const reply = () => {
        setReplyTarget(actionTarget);
        setActionTarget(null);
    };

    // Instagram-style: load the message text into the composer to edit in place
    const startEdit = () => {
        if (!actionTarget) return;
        setEditTarget(actionTarget);
        setReplyTarget(null);
        setActionTarget(null);
    };

    const submitEdit = (newText: string) => {
        if (!editTarget) return;
        const trimmed = newText.trim();
        if (!trimmed) {
            setEditTarget(null);
            return;
        }
        // editing = re-send the same id with new text (+ edited flag): reuses the
        // P2P upsert path and the server upsert so it reaches her offline too
        const edited: Message = { ...editTarget, text: trimmed, edited: true };
        upsert(edited);
        sendPeerMessage(edited);
        if (SIGNAL_URL) void storeOnServer(edited);
        setEditTarget(null);
    };

    const displayName = useChatStore((s) => s.displayName);

    // todo channels get their own checklist UI instead of the message list
    if (channel?.kind === 'todo') {
        return <TodoChannelScreen channel={channel} onBack={onBack} />;
    }

    return (
        <div
            className='relative flex h-full flex-col'
            data-testid='chat-screen'
        >
            {isDm ? (
                <ChatHeader
                    title={peerProfile?.name ?? 'Her'}
                    avatarColor={peerProfile?.color}
                    avatarUrl={peerProfile?.avatar}
                    online={!SIGNAL_URL || peerStatus === 'connected'}
                    subtitle={
                        SIGNAL_URL
                            ? peerStatus === 'connected'
                                ? connDiag
                                    ? `online · ${connDiag.path} · ${(connDiag.ms / 1000).toFixed(1)}s`
                                    : 'online'
                                : peerStatus === 'connecting'
                                  ? 'connecting…'
                                  : 'offline'
                            : 'online'
                    }
                    onBack={onBack}
                    onVoiceCall={onVoiceCall}
                    onVideoCall={onVideoCall}
                    onOpenVoiceChannel={onOpenVoiceChannel}
                    onOpenProfile={onOpenDetails}
                />
            ) : (
                <ChatHeader
                    title={channel?.name ?? 'channel'}
                    subtitle={
                        channel?.shared
                            ? `synced with ${peerProfile?.name ?? 'her'}`
                            : 'personal · only on this device'
                    }
                    isChannel
                    onBack={onBack}
                />
            )}
            <MessageList
                key={channelId}
                messages={messages}
                currentUserId={currentUserId}
                peerTyping={isDm && peerTyping}
                onLongPress={setActionTarget}
                onOpenImage={setLightboxTarget}
                onRetry={retry}
                onDoubleTapReact={isDm ? toggleDefaultReaction : undefined}
                onViewedBottom={onViewedBottom}
                backgroundStyle={backgroundStyle}
                jumpToId={jump?.id}
                jumpNonce={jump?.nonce}
                emptyState={
                    isDm ? (
                        <div className='flex max-w-xs flex-col items-center gap-3 text-center'>
                            <span className='flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-7'>
                                <Heart />
                            </span>
                            <p className='text-sm font-semibold'>
                                Just you two
                            </p>
                            <p className='text-xs leading-relaxed text-muted-foreground'>
                                Say hi 🖤 — your first message will be waiting
                                even if {peerProfile?.name ?? 'she'} isn't here
                                yet.
                            </p>
                            <p className='flex items-center gap-1 text-xs text-muted-foreground [&_svg]:size-3'>
                                <LockKeyhole /> End-to-end encrypted
                            </p>
                        </div>
                    ) : (
                        <div className='flex max-w-xs flex-col items-center gap-3 text-center'>
                            <span className='flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-7'>
                                <Hash />
                            </span>
                            <p className='text-sm font-semibold'>
                                {channel?.name ?? 'Your channel'}
                            </p>
                            <p className='text-xs leading-relaxed text-muted-foreground'>
                                Notes, links, ideas — this space lives only on
                                this phone. She'll never see it.
                            </p>
                        </div>
                    )
                }
            />
            <Composer
                onSend={send}
                onSendMedia={sendMedia}
                onTyping={isDm ? sendPeerTyping : undefined}
                replyTo={replyTarget}
                replyToName={
                    replyTarget ? displayName(replyTarget.senderId) : undefined
                }
                onCancelReply={() => setReplyTarget(null)}
                editing={
                    editTarget
                        ? { id: editTarget.id, text: editTarget.text ?? '' }
                        : null
                }
                onEditSubmit={submitEdit}
                onCancelEdit={() => setEditTarget(null)}
            />
            <MessageActions
                message={actionTarget}
                isMine={actionTarget?.senderId === currentUserId}
                onClose={() => setActionTarget(null)}
                onReact={react}
                onReply={reply}
                onCopy={copyMessage}
                onEdit={startEdit}
                onDeleteForMe={deleteForMe}
                onUnsend={unsend}
            />
            <Lightbox
                message={lightboxTarget}
                imageMessages={imageMessages}
                onClose={() => setLightboxTarget(null)}
            />
        </div>
    );
}
