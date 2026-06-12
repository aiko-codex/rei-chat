import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CallScreen, type CallType } from '@/features/call/CallScreen';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { PinScreen } from '@/features/lock/PinScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { Toaster } from '@/components/ui/sonner';
import { VoiceChannelScreen } from '@/features/voice/VoiceChannelScreen';
import { users } from '@/lib/mock-data';
import type { Screen } from '@/lib/types';

export default function App() {
    // state-driven navigation; app always boots locked
    const [screen, setScreen] = useState<Screen>('lock');
    const [callType, setCallType] = useState<CallType>('voice');

    const startCall = (type: CallType) => {
        setCallType(type);
        setScreen('call');
    };

    return (
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
                            <PinScreen onUnlock={() => setScreen('chat')} />
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* chat stays mounted under overlays so local message state survives */}
                {(screen === 'chat' ||
                    screen === 'lock' ||
                    screen === 'call') && (
                    <ChatScreen
                        onVoiceCall={() => startCall('voice')}
                        onVideoCall={() => startCall('video')}
                        onOpenVoiceChannel={() => setScreen('voice-channel')}
                        onOpenSettings={() => setScreen('settings')}
                    />
                )}
                {screen === 'voice-channel' && (
                    <VoiceChannelScreen onBack={() => setScreen('chat')} />
                )}
                {screen === 'settings' && (
                    <SettingsScreen onBack={() => setScreen('chat')} />
                )}
                {screen === 'call' && (
                    <div className='absolute inset-0 z-10'>
                        <CallScreen
                            peer={users.her}
                            type={callType}
                            onEnd={() => setScreen('chat')}
                        />
                    </div>
                )}
            </div>
            <Toaster position='top-center' />
        </div>
    );
}
