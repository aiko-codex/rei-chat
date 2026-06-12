import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Eraser,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { users } from '@/lib/mock-data';

interface RowProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  destructive?: boolean;
  onClick?: () => void;
  testId: string;
}

function Row({ icon, label, hint, destructive, onClick, testId }: RowProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
    >
      <span className={destructive ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
      <span className="flex-1">
        <span className={`block text-sm font-medium ${destructive ? 'text-destructive' : ''}`}>
          {label}
        </span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="size-4 text-muted-foreground/50" />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-5 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  // hidden manage section: revealed by tapping the version label 5 times
  const [versionTaps, setVersionTaps] = useState(0);
  const manageVisible = versionTaps >= 5;
  const me = users.me;

  return (
    <div className="flex h-full flex-col" data-testid="settings-screen">
      <header className="flex items-center gap-2 border-b px-2 py-2.5">
        <Button variant="ghost" size="icon" className="cursor-pointer" onClick={onBack} aria-label="Back" data-testid="settings-back-btn">
          <ArrowLeft />
        </Button>
        <p className="text-sm font-semibold">Settings</p>
      </header>

      <div className="flex-1 overflow-y-auto pb-6">
        <div className="flex items-center gap-3 px-4 py-5">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg">{me.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{me.name}</p>
            <p className="flex items-center gap-1 text-xs text-emerald-600">
              <ShieldCheck className="size-3.5" /> end-to-end encrypted
            </p>
          </div>
        </div>

        <SectionLabel>Security</SectionLabel>
        <Row icon={<Lock className="size-4" />} label="Change PIN" hint="App lock for this device" testId="settings-change-pin" />
        <Row icon={<QrCode className="size-4" />} label="Pair a device" hint="Show QR to set up her phone" testId="settings-pair-device" />

        <SectionLabel>General</SectionLabel>
        <Row icon={<Bell className="size-4" />} label="Notifications" testId="settings-notifications" />

        <AnimatePresence>
          {manageVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              data-testid="settings-manage-section"
            >
              <SectionLabel>Manage</SectionLabel>
              <Row
                icon={<KeyRound className="size-4" />}
                label="Reset pairing"
                hint="Both devices will need the passphrase again"
                destructive
                testId="settings-reset-pairing"
              />
              <Row
                icon={<Eraser className="size-4" />}
                label="Clear server ciphertext"
                hint="Deletes stored offline messages from the server"
                destructive
                testId="settings-clear-ciphertext"
              />
              <Row
                icon={<Unplug className="size-4" />}
                label="Revoke push subscriptions"
                hint="Disconnect lost devices from notifications"
                destructive
                testId="settings-revoke-push"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setVersionTaps((t) => t + 1)}
          className="mt-6 w-full cursor-default px-4 text-center text-xs text-muted-foreground/60"
          data-testid="settings-version-label"
        >
          rei-chat 0.1.0{manageVisible && ' · manage unlocked'}
        </button>
      </div>
    </div>
  );
}
