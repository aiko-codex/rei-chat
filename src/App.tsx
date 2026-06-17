import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AdminScreen } from '@/features/admin/AdminScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { SetPasswordScreen } from '@/features/auth/SetPasswordScreen';
import { CallScreen } from '@/features/call/CallScreen';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { ConnectionsScreen } from '@/features/connections/ConnectionsScreen';
import { ChatDetailsScreen } from '@/features/chat/ChatDetailsScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { PinScreen } from '@/features/lock/PinScreen';
import { PairingScreen } from '@/features/pairing/PairingScreen';
import { ProfileSetupScreen } from '@/features/profile/ProfileSetupScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';
import { Toaster } from '@/components/ui/sonner';
import { VoiceChannelScreen } from '@/features/voice/VoiceChannelScreen';
import {
    sendPeerProfile,
    startPeerService,
    stopPeerService,
} from '@/lib/peer-service';
import { isPaired, SIGNAL_URL } from '@/lib/config';
import { getAccount, hasStoredKeys, isLoggedIn, mustSetPassword } from '@/lib/session';
import { isUnlockFresh, touchUnlock } from '@/lib/pin';
import { syncTodoReminders } from '@/lib/todo-reminders';
import { setupPWAUpdates } from '@/lib/pwa-update';
import { joinCodeFromUrl } from '@/lib/pairing';
import { useChatStore } from '@/store/chat-store';
import { useCallStore } from '@/store/call-store';
import { useVoiceRoomStore } from '@/store/voice-room-store';
import { Headphones, PhoneOff, ShieldX } from 'lucide-react';
import { DM_CHANNEL_ID, type Profile, type Screen } from '@/lib/types';

// read once at boot, then clean the hash so the code isn't left in the URL
const initialJoinCode = joinCodeFromUrl();
if (initialJoinCode) history.replaceState(null, '', location.pathname);

// /admin is reachable directly (path `/admin` or hash `#admin`) for account
// management.
const ADMIN_ROUTE =
    location.hash.replace('#', '') === 'admin' ||
    location.pathname.replace(/\/+$/, '').endsWith('/admin');

/** accounts mode: a real server is configured → email/password accounts.
 *  Mock mode (no SIGNAL_URL) keeps the legacy profile/pairing flow. */
function accountsMode(): boolean {
    return Boolean(SIGNAL_URL);
}

/** where to land once unlocked (post-PIN), per auth state */
function landingScreen(): Screen {
    if (accountsMode()) {
        if (!isLoggedIn()) return 'sign-in';
        // logged in with the temp password but keypair not yet created
        if (mustSetPassword()) return 'set-password';
        // keys missing (e.g. cleared storage) — can't decrypt without the
        // password, so re-authenticate to unwrap them. NOTE: this is a
        // sodium-free presence check — decoding the keys needs libsodium's
        // WASM, which isn't ready at this synchronous boot point.
        if (!hasStoredKeys()) return 'sign-in';
        return 'home';
    }
    // legacy mock mode (no server): profile + pairing
    if (!useChatStore.getState().myProfile) return 'profile-setup';
    return isPaired() ? 'home' : 'pairing';
}

/** where to land at boot: skip the lock screen if still within the grace window.
 *  In accounts mode a persisted login IS the gate (survives until storage is
 *  cleared), so we never fall back to the PIN lock — no repeated password ask. */
function bootScreen(): Screen {
    if (ADMIN_ROUTE) return 'admin';
    if (accountsMode() && isLoggedIn()) return landingScreen();
    if (!isUnlockFresh()) return 'lock';
    return landingScreen();
}

/** derive a usable Profile from the signed-in account so the app can render
 *  without the legacy profile-setup step (accounts carry the display name). */
function profileFromAccount(): Profile | null {
    const a = getAccount();
    if (!a) return null;
    return { name: a.displayName || a.username, color: '#b03a6e', avatar: a.avatar ?? undefined };
}

export default function App() {
    // boots locked unless a recent unlock is still within its grace window
    const [screen, setScreen] = useState<Screen>(bootScreen);
    const [activeChannel, setActiveChannel] = useState<string>(DM_CHANNEL_ID);
    const [paired, setPaired] = useState(isPaired());
    // a pending scroll-to-message request (from in-conversation search)
    const [jump, setJump] = useState<{ id: string; nonce: number } | null>(null);

    const myProfile = useChatStore((s) => s.myProfile);
    const setMyProfile = useChatStore((s) => s.setMyProfile);
    // a call (incoming/outgoing/active) overlays everything, driven by call-store
    const inCall = useCallStore((s) => s.state) !== 'idle';
    // voice room is persistent — a banner lets you return/leave while elsewhere
    const inVoiceRoom = useVoiceRoomStore((s) => s.joined);
    const leaveVoiceRoom = useVoiceRoomStore((s) => s.leave);

    const unlocked = screen !== 'lock';
    const peerStatus = useChatStore((s) => s.status);

    // register the service-worker update prompt + report our build to the DB
    useEffect(() => {
        setupPWAUpdates();
    }, []);

    // accounts mode: restore the profile from the signed-in account on reload
    // (so `home` renders without the legacy profile-setup step)
    useEffect(() => {
        if (accountsMode() && isLoggedIn() && !useChatStore.getState().myProfile) {
            const p = profileFromAccount();
            if (p) setMyProfile(p);
        }
    }, []);

    // accounts mode: load the local message cache once unlocked (the legacy
    // `hydrate` is gated on pairing, which accounts mode never sets)
    useEffect(() => {
        if (!unlocked || !accountsMode() || !isLoggedIn()) return;
        void useChatStore.getState().hydrateAccount();
    }, [unlocked]);

    // accounts mode: poll the connection list so incoming requests + new
    // connections surface (drives the bell badge + Notifications + chats list)
    useEffect(() => {
        if (!unlocked || !accountsMode() || !isLoggedIn()) return;
        const tick = () => {
            if (document.visibilityState === 'visible') {
                void useChatStore.getState().syncConnections();
            }
        };
        tick();
        const id = setInterval(tick, 5000);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [unlocked]);

    // device-membership lock: the room admits only its two devices. Claim our
    // slot first; if the space is full (a 3rd device), don't sync or connect.
    const membership = useChatStore((s) => s.membership);
    useEffect(() => {
        if (!unlocked || !paired) return;
        let cancelled = false;
        void (async () => {
            await useChatStore.getState().registerDevice();
            if (cancelled || useChatStore.getState().membership === 'full') return;
            void useChatStore.getState().hydrate();
            startPeerService();
        })();
        return () => {
            cancelled = true;
            stopPeerService();
        };
    }, [unlocked, paired]);

    // Reliable delivery independent of the P2P link: every message is also
    // written to the encrypted server store, so poll it on an interval. This is
    // what lets her messages arrive when the peers aren't directly connected
    // (one side refreshed, backgrounded, on cellular, or still negotiating).
    // Poll fast while disconnected; slow safety-net cadence once P2P is live
    // (messages then arrive instantly over the data channel). Also sync the
    // moment the tab regains focus.
    useEffect(() => {
        if (!unlocked || !paired || !SIGNAL_URL || membership === 'full') return;
        const tick = () => {
            if (document.visibilityState === 'visible') {
                const s = useChatStore.getState();
                void s.syncHistory();
                void s.syncProfiles();
                void s.syncMeta();
                void s.syncLocal();
                void s.syncInvites();
                void s.syncAccepted();
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
    }, [unlocked, paired, peerStatus, membership]);

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
            // accounts mode: the persisted login is the gate — never re-lock
            if (accountsMode() && isLoggedIn()) return;
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
                                    setScreen(landingScreen());
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {screen === 'admin' && (
                    <div className='absolute inset-0 z-40 bg-background'>
                        <AdminScreen onBack={() => { location.hash = ''; setScreen(bootScreen()); }} />
                    </div>
                )}

                {screen === 'sign-in' && (
                    <div className='absolute inset-0 z-40 bg-background'>
                        <SignInScreen
                            onSignedIn={(mustSetPassword) => {
                                if (mustSetPassword) {
                                    setScreen('set-password');
                                    return;
                                }
                                const p = profileFromAccount();
                                if (p) setMyProfile(p);
                                setScreen('home');
                            }}
                            onOpenAdmin={() => setScreen('admin')}
                        />
                    </div>
                )}

                {screen === 'set-password' && (
                    <div className='absolute inset-0 z-40 bg-background'>
                        <SetPasswordScreen
                            onDone={() => {
                                const p = profileFromAccount();
                                if (p) setMyProfile(p);
                                setScreen('home');
                            }}
                        />
                    </div>
                )}

                {screen === 'connections' && (
                    <div className='absolute inset-0 z-10 bg-background'>
                        <ConnectionsScreen
                            onBack={() => setScreen('home')}
                            onOpenConnection={(connectionId, account) => {
                                useChatStore.getState().rememberConnectionPeer(connectionId, {
                                    displayName: account.displayName,
                                    username: account.username,
                                    avatar: account.avatar,
                                });
                                openChannel(connectionId);
                            }}
                        />
                    </div>
                )}

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
                            onOpenNotifications={() => setScreen('notifications')}
                            onOpenPeople={
                                accountsMode() ? () => setScreen('connections') : undefined
                            }
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
                                onOpenDetails={() => setScreen('chat-details')}
                                jump={jump}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {screen === 'chat-details' && (
                    <div className='absolute inset-0 z-10 bg-background'>
                        <ChatDetailsScreen
                            channelId={activeChannel}
                            onBack={() => setScreen('chat')}
                            onJump={(id) => {
                                setJump({ id, nonce: Date.now() });
                                setScreen('chat');
                            }}
                        />
                    </div>
                )}

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
                {screen === 'notifications' && (
                    <div className='absolute inset-0 z-10 bg-background'>
                        <NotificationsScreen
                            onBack={() => setScreen('home')}
                            onOpenChannel={openChannel}
                        />
                    </div>
                )}
                {inVoiceRoom && screen !== 'voice-channel' && !inCall && (
                    <div className='absolute inset-x-0 top-0 z-[15] flex items-center gap-2 bg-emerald-600 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-white'>
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

                {/* membership lock: a 3rd device is refused access to the space */}
                {unlocked && paired && membership === 'full' && (
                    <div
                        className='absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background px-8 text-center'
                        data-testid='space-full-screen'
                    >
                        <span className='flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-8'>
                            <ShieldX />
                        </span>
                        <h1 className='text-lg font-semibold'>This space is full</h1>
                        <p className='max-w-xs text-sm leading-relaxed text-muted-foreground'>
                            Your space is locked to two devices for safety. To use this device,
                            open the other phone → <strong>Settings → Manage devices</strong> and
                            remove a device to free a slot.
                        </p>
                        <button
                            onClick={() => void useChatStore.getState().registerDevice()}
                            className='cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground'
                            data-testid='space-full-retry'
                        >
                            Try again
                        </button>
                    </div>
                )}
            </div>
            <Toaster position='top-center' />
        </div>
        </MotionConfig>
    );
}
