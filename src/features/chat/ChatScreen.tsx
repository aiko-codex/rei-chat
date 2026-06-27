import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    sendPeerReaction,
    sendPeerRead,
    sendPeerRemove,
    sendPeerTyping,
    startConnectionPeer,
    stopPeerService,
} from '@/lib/peer-service';
import {
    pollConv,
    removeConvMessage,
    setConvTyping,
    uploadConvMedia,
    uploadConvMessage,
} from '@/lib/conversation-api';
import { isLoggedIn } from '@/lib/session';
import { currentUserId } from '@/lib/mock-data';
import { useChatStore } from '@/store/chat-store';
import { useCallStore } from '@/store/call-store';
import { backgroundCss } from '@/lib/chat-theme';
import { expiresAtFor } from '@/lib/live-location';
import { pushLiveLocationNow, startLiveLocationWatch, stopLiveLocationWatch } from '@/lib/live-location-service';
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
    const peerMood = useChatStore((s) => s.peerMood);
    const channels = useChatStore((s) => s.channels);
    const chatBg = useChatStore((s) => s.chatBg);
    const chatBgUrl = useChatStore((s) => s.chatBgUrl);
    const upsert = useChatStore((s) => s.upsert);
    const setReaction = useChatStore((s) => s.setReaction);
    const setMemory = useChatStore((s) => s.setMemory);
    const setLiveLocation = useChatStore((s) => s.setLiveLocation);
    const removeLocal = useChatStore((s) => s.remove);
    const markSeen = useChatStore((s) => s.markSeen);

    const [actionTarget, setActionTarget] = useState<Message | null>(null);
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);
    const [editTarget, setEditTarget] = useState<Message | null>(null);
    const [lightboxTarget, setLightboxTarget] = useState<Message | null>(null);

    // memoized so background re-renders (peer typing, presence, the 1s poll)
    // don't rebuild the array → MessageList only re-renders when messages change
    const messages = useMemo(
        () =>
            allMessages.filter(
                (m) => (m.channelId ?? DM_CHANNEL_ID) === channelId && !m.hidden,
            ),
        [allMessages, channelId],
    );
    const channel = channels.find((c) => c.id === channelId);

    // accounts mode: a connection conversation is any open channel that isn't
    // the legacy DM and isn't one of this device's local channels.
    const isConnection = !isDm && !channel && isLoggedIn() && Boolean(SIGNAL_URL);
    const connectionPeers = useChatStore((s) => s.connectionPeers);
    const setActiveConnection = useChatStore((s) => s.setActiveConnection);
    const syncConversation = useChatStore((s) => s.syncConversation);
    const syncConvMeta = useChatStore((s) => s.syncConvMeta);
    const setStorePeerTyping = useChatStore((s) => s.setPeerTyping);
    const connPeer = isConnection ? connectionPeers[channelId] : undefined;
    // peer presence for a connection conversation, fed by the c_poll response
    const [connPeerOnline, setConnPeerOnline] = useState(false);

    // clear the unread badge when the channel opens
    useEffect(() => {
        markSeen(channelId);
    }, [channelId, markSeen]);

    // connection conversation: mark active + long-poll the server for instant
    // delivery + the peer's typing flag (the PHP host can't hold WebSockets, so
    // the long-poll returns the moment a message lands or typing changes)
    useEffect(() => {
        if (!isConnection) return;
        setActiveConnection(channelId);
        // bring up a P2P link for this connection so voice/video calls + the
        // voice room can negotiate (messages still ride the server truth lane)
        startConnectionPeer(channelId);
        let active = true;
        const cursorKey = `rei-conv-cursor:${channelId}`;
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const loop = async () => {
            while (active) {
                if (document.visibilityState !== 'visible') {
                    await sleep(1000);
                    continue;
                }
                const since = Number(localStorage.getItem(cursorKey)) || 0;
                try {
                    const r = await pollConv(channelId, since);
                    if (!active) break;
                    setStorePeerTyping(r.peerTyping);
                    setConnPeerOnline(r.peerOnline);
                    if (r.messages) await syncConversation(channelId);
                    // reactions + read receipts ride a separate overlay store
                    // that the long-poll doesn't wake on — pull it every tick
                    // (cursor-based, so it's a cheap no-op when nothing changed)
                    // so a reaction shows in near-real-time, not only when the
                    // next message happens to arrive
                    void syncConvMeta(channelId);
                } catch {
                    if (!active) break;
                    setConnPeerOnline(false);
                    await sleep(2500); // backoff on error
                }
                await sleep(500); // gentle pacing (caps server hits during typing)
            }
        };
        void loop();
        return () => {
            active = false;
            setActiveConnection(null);
            setStorePeerTyping(false);
            setConnPeerOnline(false);
            // tear down the P2P link unless a call is still in progress
            if (useCallStore.getState().state === 'idle') stopPeerService();
        };
    }, [isConnection, channelId, setActiveConnection, syncConversation, syncConvMeta, setStorePeerTyping]);

    // throttled typing sender for connections
    const lastTypingRef = useRef(0);
    const sendConnTyping = useCallback(
        (typing: boolean) => {
            // FAST: P2P typing frame (instant when the peer is live)
            sendPeerTyping(typing);
            // DURABLE: server typing flag (the long-poll surfaces it otherwise)
            const now = Date.now();
            if (typing && now - lastTypingRef.current < 1500) return;
            lastTypingRef.current = typing ? now : 0;
            void setConvTyping(channelId, typing);
        },
        [channelId],
    );

    // Mark "read" only when the user is genuinely viewing the latest message
    // (channel open + scrolled to the bottom), not merely because a new message
    // arrived while they're scrolled up reading history. When connected, also
    // push the receipt over P2P so "Seen" flips instantly instead of waiting
    // for the next server poll; the server upload (markSeen→markRead) is the
    // offline fallback.
    const lastReadSent = useRef(0);
    const onViewedBottom = useCallback(() => {
        markSeen(channelId);
        // DM + connections both get an instant P2P read receipt (the peer-service
        // routes it to the right conversation); markSeen handles the server lane
        if (!isDm && !isConnection) return;
        const newest = messages.reduce((max, m) => (m.sentAt > max ? m.sentAt : max), 0);
        if (newest > lastReadSent.current) {
            lastReadSent.current = newest;
            sendPeerRead(newest);
        }
    }, [channelId, isDm, isConnection, messages, markSeen]);

    const imageMessages = messages.filter((m) => m.media?.kind === 'image');

    // the shared chat wallpaper applies to the DM only (personal channels stay
    // plain). Recomputed per render so a theme toggle re-resolves light/dark.
    const isDark = document.documentElement.classList.contains('dark');
    const bgCss = isDm || isConnection ? backgroundCss(chatBg, isDark, chatBgUrl) : undefined;
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

    // connection conversation: store on the server truth lane; mark failed if it
    // doesn't land (no P2P fast lane for connections yet — server is the path)
    const storeConv = async (message: Message) => {
        const ok = await uploadConvMessage(channelId, message);
        if (ok) return;
        const current = useChatStore.getState().messages.find((m) => m.id === message.id);
        if (current && current.status !== 'failed') upsert({ ...current, status: 'failed' });
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
        // optimistic: shows immediately. Both DM and connections take the same
        // two-lane path — FAST over the P2P data channel (ack flips to
        // 'delivered'), DURABLE as ciphertext on the server store so it still
        // reaches her when the peers aren't both present.
        upsert(message);
        if (isConnection) {
            sendPeerMessage(message);
            void storeConv(message);
        } else if (isDm) {
            sendPeerMessage(message);
            if (SIGNAL_URL) void storeOnServer(message);
        }
        setReplyTarget(null);
    };

    const retry = (message: Message) => {
        const optimistic: Message = { ...message, status: 'sent' };
        upsert(optimistic);
        sendPeerMessage(optimistic);
        if (isConnection) {
            void storeConv(optimistic);
            return;
        }
        if (SIGNAL_URL) void storeOnServer(optimistic);
    };

    const sendMedia = (media: MediaAttachment, blob: Blob) => {
        const message: Message = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId,
            senderId: currentUserId,
            // connection uploads ride the chunked (crypto_secretstream) path, so
            // tag the message — the receiver's download then knows to reassemble
            // chunks instead of fetching a single whole-file blob.
            media: isConnection ? { ...media, chunked: true } : media,
            sentAt: Date.now(),
            status: 'sent',
            replyToId: replyTarget?.id,
        };
        // persist the bytes locally (survives reload) and show immediately
        if (SIGNAL_URL) void putBlob(message.id, blob);
        upsert(message);
        if (isConnection) {
            // FAST: stream the bytes straight to the peer if it's live
            sendPeerMedia(message, blob);
            const store = useChatStore.getState();
            store.setTransfer(message.id, 0.01);
            void (async () => {
                // DURABLE: encrypted server backup so it restores / reaches her later
                const ok = await uploadConvMedia(channelId, message.id, blob, (p) =>
                    store.setTransfer(message.id, p),
                );
                store.clearTransfer(message.id);
                if (ok) {
                    // the metadata row makes it appear in the peer's history
                    void storeConv({ ...message, media: { ...message.media!, url: '' } });
                } else {
                    const cur = store.messages.find((m) => m.id === message.id);
                    if (cur) upsert({ ...cur, status: 'failed' });
                }
            })();
            setReplyTarget(null);
            return;
        }
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

    // remote media (Tenor GIF/sticker): no blob, no encrypted upload — the
    // public url rides the normal message frame exactly like text. `remote:true`
    // on the attachment keeps the sync layer from trying to download/back it up.
    const sendRemoteMedia = (media: MediaAttachment) => {
        const message: Message = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId,
            senderId: currentUserId,
            media,
            sentAt: Date.now(),
            status: 'sent',
            replyToId: replyTarget?.id,
        };
        upsert(message);
        if (isConnection) {
            sendPeerMessage(message);
            void storeConv(message);
        } else if (isDm) {
            sendPeerMessage(message);
            if (SIGNAL_URL) void storeOnServer(message);
        }
        setReplyTarget(null);
    };

    // draw-and-guess game: send the drawing as a normal sticker but attach
    // the game round so the guesser sees the guess UI under the drawing
    const sendGame = (media: MediaAttachment, blob: Blob, word: string) => {
        const message: Message = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId,
            senderId: currentUserId,
            media: isConnection ? { ...media, chunked: true } : media,
            sentAt: Date.now(),
            status: 'sent',
            game: { word, status: 'active', guessesLeft: 3, drawerId: currentUserId },
        };
        if (SIGNAL_URL) void putBlob(message.id, blob);
        upsert(message);
        if (isConnection) {
            sendPeerMedia(message, blob);
            const store = useChatStore.getState();
            store.setTransfer(message.id, 0.01);
            void (async () => {
                const ok = await uploadConvMedia(channelId, message.id, blob, (p) =>
                    store.setTransfer(message.id, p),
                );
                store.clearTransfer(message.id);
                if (ok) void storeConv({ ...message, media: { ...message.media!, url: '' } });
                else {
                    const cur = store.messages.find((m) => m.id === message.id);
                    if (cur) upsert({ ...cur, status: 'failed' });
                }
            })();
        } else if (isDm) {
            sendPeerMedia(message, blob);
            if (SIGNAL_URL) {
                void storeOnServer({ ...message, media: { ...message.media!, url: '' } });
                const store = useChatStore.getState();
                store.setTransfer(message.id, 0.01);
                void uploadMedia(message.id, blob, (p) =>
                    store.setTransfer(message.id, p),
                ).finally(() => store.clearTransfer(message.id));
            }
        }
    };

    // process a guess for an active draw-and-guess game
    const submitGuess = useCallback((msgId: string, guess: string) => {
        const msg = useChatStore.getState().messages.find((m) => m.id === msgId);
        if (!msg?.game || msg.game.status !== 'active') return;
        const correct = guess.trim().toLowerCase() === msg.game.word.toLowerCase();
        if (correct) {
            useChatStore.getState().updateGameState(msgId, channelId, 'won', 0, true);
            toast.success('🎉 Correct! You guessed it!');
        } else {
            const remaining = msg.game.guessesLeft - 1;
            if (remaining <= 0) {
                useChatStore.getState().updateGameState(msgId, channelId, 'lost', 0, true);
                toast.error(`❌ Out of guesses! The word was "${msg.game.word}"`);
            } else {
                useChatStore.getState().updateGameState(msgId, channelId, 'active', remaining, true);
                toast.error(`Wrong! ${remaining} ${remaining === 1 ? 'guess' : 'guesses'} left.`);
            }
        }
    }, [channelId]);

    // live location share: the message (with its starting position) goes
    // through the normal send path once; position updates patch it in place
    // via the store's encrypted meta overlay (no re-send of the whole message)
    const sendLiveLocation = (durationMs: number, coords: { lat: number; lng: number }) => {
        const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const startedAt = Date.now();
        const message: Message = {
            id,
            channelId,
            senderId: currentUserId,
            sentAt: startedAt,
            status: 'sent',
            liveLocation: {
                lat: coords.lat,
                lng: coords.lng,
                startedAt,
                expiresAt: expiresAtFor(durationMs, startedAt),
                paused: false,
            },
        };
        upsert(message);
        if (isConnection) {
            sendPeerMessage(message);
            void storeConv(message);
        } else if (isDm) {
            sendPeerMessage(message);
            if (SIGNAL_URL) void storeOnServer(message);
        }
    };

    const stopLiveLocation = (message: Message) => {
        setLiveLocation(channelId, message.id, { stoppedAt: Date.now() });
        stopLiveLocationWatch();
    };

    // id of my own still-active live share in this channel (if any) — drives
    // the watch effect below; re-runs only when which share is active changes
    const myActiveLiveLocationId = messages.find(
        (m) => m.senderId === currentUserId && m.liveLocation && !m.liveLocation.stoppedAt,
    )?.id;

    // drive the geolocation watch for that share — updates only flow while
    // this device's app is foregrounded (no reliable background geolocation
    // in a browser/PWA); leaving the chat also stops the watch (a known
    // limitation, surfaced honestly via the `paused` flag the peer sees).
    useEffect(() => {
        const mine = messages.find((m) => m.id === myActiveLiveLocationId);
        if (!mine?.liveLocation) return;
        const { id, liveLocation } = mine;

        const expireTimer = setTimeout(() => {
            stopLiveLocationWatch();
            setLiveLocation(channelId, id, { stoppedAt: Date.now() });
        }, Math.max(0, liveLocation.expiresAt - Date.now()));

        const push = (lat: number, lng: number) => setLiveLocation(channelId, id, { lat, lng, paused: false });
        startLiveLocationWatch(push);

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                stopLiveLocationWatch();
                setLiveLocation(channelId, id, { paused: true });
            } else {
                setLiveLocation(channelId, id, { paused: false });
                pushLiveLocationNow(push);
                startLiveLocationWatch(push);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            clearTimeout(expireTimer);
            document.removeEventListener('visibilitychange', onVisibility);
            stopLiveLocationWatch();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myActiveLiveLocationId, channelId]);

    const react = (emoji: string) => {
        if (!actionTarget) return;
        // tapping the same emoji again removes your reaction
        const next =
            actionTarget.reactions?.[currentUserId] === emoji
                ? undefined
                : emoji;
        setReaction(actionTarget.id, currentUserId, next);
        sendPeerReaction(actionTarget.id, next ?? null); // instant over P2P
        setActionTarget(null);
    };

    // double-tap a message → toggle the default (first) quick reaction
    const toggleDefaultReaction = (message: Message) => {
        const def = useChatStore.getState().quickReactions[0];
        const current = message.reactions?.[currentUserId];
        const next = current === def ? undefined : def;
        setReaction(message.id, currentUserId, next);
        sendPeerReaction(message.id, next ?? null); // instant over P2P
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
        // (P2P for the live case, server for the durable/offline case)
        if (isConnection) {
            sendPeerRemove(removed.id);
            void removeConvMessage(channelId, removed.id);
        } else if (isDm && SIGNAL_URL) {
            void removeRemoteMessage(removed.id);
            sendPeerRemove(removed.id);
        }
        toast('Unsent');
    };

    const pinMemory = () => {
        if (!actionTarget) return;
        const target = actionTarget;
        const nowPinned = !target.pinned;
        setMemory(target.id, nowPinned, target.memoryCaption);
        setActionTarget(null);
        toast(nowPinned ? 'Pinned to memories 🖤' : 'Removed from memories');
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
        sendPeerMessage(edited); // fast P2P (same id replaces on the peer)
        if (isConnection) {
            void storeConv(edited);
        } else if (SIGNAL_URL) {
            void storeOnServer(edited);
        }
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
                    connState={
                        !SIGNAL_URL || peerStatus === 'connected'
                            ? 'online'
                            : peerStatus === 'connecting'
                              ? 'connecting'
                              : 'offline'
                    }
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
                    peerMood={peerMood}
                />
            ) : isConnection ? (
                <ChatHeader
                    title={connPeer?.displayName ?? 'Chat'}
                    avatarUrl={connPeer?.avatar ?? undefined}
                    peerMood={connPeer?.mood}
                    connState={
                        connPeerOnline || peerStatus === 'connected'
                            ? 'online'
                            : peerStatus === 'connecting'
                              ? 'connecting'
                              : 'offline'
                    }
                    subtitle={
                        connPeerOnline || peerStatus === 'connected'
                            ? peerTyping
                                ? 'typing…'
                                : 'online'
                            : peerStatus === 'connecting'
                              ? 'connecting…'
                              : connPeer
                                ? `@${connPeer.username}`
                                : 'end-to-end encrypted'
                    }
                    onBack={onBack}
                    onVoiceCall={onVoiceCall}
                    onVideoCall={onVideoCall}
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
                peerTyping={(isDm || isConnection) && peerTyping}
                onLongPress={setActionTarget}
                onOpenImage={setLightboxTarget}
                onRetry={retry}
                onDoubleTapReact={isDm || isConnection ? toggleDefaultReaction : undefined}
                onStopLiveLocation={stopLiveLocation}
                onGuess={submitGuess}
                onSwipeReply={(m) => {
                    setEditTarget(null);
                    setReplyTarget(m);
                }}
                onViewedBottom={onViewedBottom}
                backgroundStyle={backgroundStyle}
                jumpToId={jump?.id}
                jumpNonce={jump?.nonce}
                emptyState={
                    isDm || isConnection ? (
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
                onSendRemoteMedia={sendRemoteMedia}
                onSendGame={isDm || isConnection ? sendGame : undefined}
                onShareLiveLocation={isDm || isConnection ? sendLiveLocation : undefined}
                onTyping={isDm ? sendPeerTyping : isConnection ? sendConnTyping : undefined}
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
                onPin={pinMemory}
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
