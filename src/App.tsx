import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { CallScreen } from '@/features/call/CallScreen';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { PinScreen } from '@/features/lock/PinScreen';
import { PairingScreen } from '@/features/pairing/PairingScreen';
import { ProfileSetupScreen } from '@/features/profile/ProfileSetupScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { Toaster } from '@/components/ui/sonner';
import { VoiceChannelScreen } from '@/features/voice/VoiceChannelScreen';
import {
    sendPeerProfile,
    startPeerService,
    stopPeerService,
} from '@/lib/peer-service';
import { isPaired, SIGNAL_URL } from '@/lib/config';
import { isUnlockFresh, touchUnlock } from '@/lib/pin';
import { syncTodoReminders } from '@/lib/todo-reminders';
import { joinCodeFromUrl } from '@/lib/pairing';
import { useChatStore } from '@/store/chat-store';
import { useCallStore } from '@/store/call-store';
import { useVoiceRoomStore } from '@/store/voice-room-store';
import { Headphones, PhoneOff } from 'lucide-react';
import { DM_CHANNEL_ID, type Screen } from '@/lib/types';

// read once at boot, then clean the hash so the code isn't left in the URL
const initialJoinCode = joinCodeFromUrl();
if (initialJoinCode) history.replaceState(null, '', location.pathname);

/** where to land at boot: skip the lock screen if still within the grace window */
function bootScreen(): Screen {
    if (!isUnlockFresh()) return 'lock';
    if (!useChatStore.getState().myProfile) return 'profile-setup';
    return isPaired() || !SIGNAL_URL ? 'home' : 'pairing';
}

export default function App() {
    // boots locked unless a recent unlock is still within its grace window
    const [screen, setScreen] = useState<Screen>(bootScreen);
    const [activeChannel, setActiveChannel] = useState<string>(DM_CHANNEL_ID);
    const [paired, setPaired] = useState(isPaired());

    const myProfile = useChatStore((s) => s.myProfile);
    const setMyProfile = useChatStore((s) => s.setMyProfile);
    // a call (incoming/outgoing/active) overlays everything, driven by call-store
    const inCall = useCallStore((s) => s.state) !== 'idle';
    // voice room is persistent — a banner lets you return/leave while elsewhere
    const inVoiceRoom = useVoiceRoomStore((s) => s.joined);
    const leaveVoiceRoom = useVoiceRoomStore((s) => s.leave);

    const unlocked = screen !== 'lock';
    const peerStatus = useChatStore((s) => s.status);

    // connection + history live at app level: receiving works on any screen
    useEffect(() => {
        if (!unlocked || !paired) return;
        void useChatStore.getState().hydrate();
        startPeerService();
        return () => stopPeerService();
    }, [unlocked, paired]);

    // Reliable delivery independent of the P2P link: every message is also
    // written to the encrypted server store, so poll it on an interval. This is
    // what lets her messages arrive when the peers aren't directly connected
    // (one side refreshed, backgrounded, on cellular, or still negotiating).
    // Poll fast while disconnected; slow safety-net cadence once P2P is live
    // (messages then arrive instantly over the data channel). Also sync the
    // moment the tab regains focus.
    useEffect(() => {
        if (!unlocked || !paired || !SIGNAL_URL) return;
        const tick = () => {
            if (document.visibilityState === 'visible') {
                void useChatStore.getState().syncHistory();
            }
        };
        const delay = peerStatus === 'connected' ? 15_000 : 3_000;
        const id = setInterval(tick, delay);
        const onVisible = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [unlocked, paired, peerStatus]);

    // keep the unlock grace window alive while the app is open + visible, so an
    // in-use session never locks mid-chat; if it lapsed while away, re-lock
    useEffect(() => {
        if (!unlocked) return;
        touchUnlock();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') touchUnlock();
        }, 60_000);
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (isUnlockFresh()) touchUnlock();
            else setScreen('lock');
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [unlocked]);

    // best-effort local reminders for todo deadlines while the app is open
    useEffect(() => {
        if (!unlocked) return;
        const sync = () => {
            const s = useChatStore.getState();
            syncTodoReminders(s.messages, s.channels);
        };
        sync();
        return useChatStore.subscribe(sync);
    }, [unlocked]);

    const afterProfile = () =>
        setScreen(paired || !SIGNAL_URL ? 'home' : 'pairing');

    const openChannel = (channelId: string) => {
        setActiveChannel(channelId);
        setScreen('chat');
    };

    return (
        // honor prefers-reduced-motion across every motion/react animation
        <MotionConfig reducedMotion='user'>
        <div className='h-full bg-muted/40'>
            <div
                className='relative mx-auto h-full max-w-xl overflow-hidden bg-background shadow-sm md:border-x'
                data-testid='app-shell'
            >
                <AnimatePresence>
                    {screen === 'lock' && (
                        <motion.div
                            key='lock'
                            className='absolute inset-0 z-10 bg-background'
                            exit={{
                                y: '-100%',
                                transition: {
                                    duration: 0.35,
                                    ease: [0.32, 0.72, 0, 1],
                                },
                            }}
                        >
                            <PinScreen
                                onUnlock={() => {
                                    touchUnlock();
                                    myProfile
                                        ? afterProfile()
                                        : setScreen('profile-setup');
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {screen === 'profile-setup' && (
                    <ProfileSetupScreen
                        onDone={(profile) => {
                            setMyProfile(profile);
                            sendPeerProfile(profile);
                            afterProfile();
                        }}
                    />
                )}

                {screen === 'pairing' && (
                    <PairingScreen
                        prefillCode={initialJoinCode}
                        onPaired={() => {
                            setPaired(true);
                            // land straight in the conversation — the empty
                            // state invites the first message (the aha moment)
                            setActiveChannel(DM_CHANNEL_ID);
                            setScreen('chat');
                        }}
                    />
                )}

                {/* home stays mounted under chat overlays for instant back */}
                {(screen === 'home' ||
                    screen === 'lock' ||
                    screen === 'chat') &&
                    myProfile && (
                        <HomeScreen
                            onOpenChannel={openChannel}
                            onOpenSettings={() => setScreen('settings')}
                        />
                    )}

                <AnimatePresence>
                    {screen === 'chat' && (
                        <motion.div
                            key={`chat-${activeChannel}`}
                            // z-10: the home screen stays mounted underneath and
                            // its online AvatarBadge is z-10 — match it so the
                            // overlay actually covers it
                            className='absolute inset-0 z-10 bg-background'
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{
                                duration: 0.25,
                                ease: [0.32, 0.72, 0, 1],
                            }}
                        >
                            <ChatScreen
                                channelId={activeChannel}
                                onBack={() => setScreen('home')}
                                onVoiceCall={() =>
                                    void useCallStore
                                        .getState()
                                        .startCall('voice')
                                }
                                onVideoCall={() =>
                                    void useCallStore
                                        .getState()
                                        .startCall('video')
                                }
                                onOpenVoiceChannel={() =>
                                    setScreen('voice-channel')
                                }
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {screen === 'voice-channel' && (
                    <div className='absolute inset-0 z-10 bg-background'>
                        <VoiceChannelScreen onBack={() => setScreen('chat')} />
                    </div>
                )}
                {screen === 'settings' && (
                    <div className='absolute inset-0 z-10 bg-background'>
                        <SettingsScreen onBack={() => setScreen('home')} />
                    </div>
                )}
                {inVoiceRoom && screen !== 'voice-channel' && !inCall && (
                    <div className='absolute inset-x-0 top-0 z-[15] flex items-center gap-2 bg-emerald-600 px-4 py-2 text-sm text-white'>
                        <Headphones className='size-4' />
                        <button
                            className='flex-1 cursor-pointer text-left font-medium'
                            onClick={() => setScreen('voice-channel')}
                            data-testid='voice-room-banner'
                        >
                            In voice room — tap to return
                        </button>
                        <button
                            className='flex cursor-pointer items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs hover:bg-white/30 [&_svg]:size-3.5'
                            onClick={leaveVoiceRoom}
                            data-testid='voice-room-leave'
                        >
                            <PhoneOff /> Leave
                        </button>
                    </div>
                )}

                {inCall && (
                    <div className='absolute inset-0 z-20'>
                        <CallScreen />
                    </div>
                )}
            </div>
            <Toaster position='top-center' />
        </div>
        </MotionConfig>
    );
}
