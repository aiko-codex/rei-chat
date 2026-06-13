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
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat-store';
import { clearPairing } from '@/lib/pairing';
import { clearServerCiphertext } from '@/lib/message-api';
import { ChangePINDialog } from './ChangePINDialog';
import { EditProfileDialog } from './EditProfileDialog';
import { PairDeviceDialog } from './PairDeviceDialog';
import { NotificationsDialog } from './NotificationsDialog';
import { ConfirmDialog } from './ConfirmDialog';
import type { Profile } from '@/lib/types';

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
  const myProfile = useChatStore((s) => s.myProfile);
  const setMyProfile = useChatStore((s) => s.setMyProfile);

  const [versionTaps, setVersionTaps] = useState(0);
  const manageVisible = versionTaps >= 5;

  const [changePinOpen, setChangePinOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [pairDeviceOpen, setPairDeviceOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [resetPairingOpen, setResetPairingOpen] = useState(false);
  const [clearCiphertextOpen, setClearCiphertextOpen] = useState(false);
  const [revokePushOpen, setRevokePushOpen] = useState(false);

  const handleEditProfile = () => {
    setEditProfileOpen(true);
  };

  const handleSaveProfile = (profile: Profile) => {
    setMyProfile(profile);
  };

  const handleResetPairing = () => {
    clearPairing();
    toast.success('Pairing reset');
    // Reload to go back to pairing screen
    window.location.href = '/';
  };

  const handleClearCiphertext = async () => {
    const success = await clearServerCiphertext();
    if (success) {
      toast.success('Server messages cleared');
    } else {
      toast.error('Failed to clear messages');
    }
  };

  const handleRevokePush = () => {
    // TODO: implement when push notification system is set up
    toast.info('Push subscription revocation not yet implemented');
  };

  return (
    <div className="flex h-full flex-col" data-testid="settings-screen">
      <header className="flex items-center gap-2 border-b px-2 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer"
          onClick={onBack}
          aria-label="Back"
          data-testid="settings-back-btn"
        >
          <ArrowLeft />
        </Button>
        <p className="text-sm font-semibold">Settings</p>
      </header>

      <div className="flex-1 overflow-y-auto pb-6">
        <button
          onClick={handleEditProfile}
          className="flex w-full items-center gap-3 px-4 py-5 text-left transition-colors hover:bg-muted"
          data-testid="settings-edit-profile"
        >
          <Avatar className="size-14">
            <AvatarFallback
              className="text-lg text-white font-semibold"
              style={{ backgroundColor: myProfile?.color }}
            >
              {myProfile?.name[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-semibold">{myProfile?.name ?? 'Unknown'}</p>
            <p className="flex items-center gap-1 text-xs text-emerald-600">
              <ShieldCheck className="size-3.5" /> end-to-end encrypted
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground/50" />
        </button>

        <SectionLabel>Security</SectionLabel>
        <Row
          icon={<Lock className="size-4" />}
          label="Change PIN"
          hint="App lock for this device"
          onClick={() => setChangePinOpen(true)}
          testId="settings-change-pin"
        />
        <Row
          icon={<QrCode className="size-4" />}
          label="Pair a device"
          hint="Show QR to set up her phone"
          onClick={() => setPairDeviceOpen(true)}
          testId="settings-pair-device"
        />

        <SectionLabel>General</SectionLabel>
        <Row
          icon={<Bell className="size-4" />}
          label="Notifications"
          onClick={() => setNotificationsOpen(true)}
          testId="settings-notifications"
        />

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
                onClick={() => setResetPairingOpen(true)}
                testId="settings-reset-pairing"
              />
              <Row
                icon={<Eraser className="size-4" />}
                label="Clear server ciphertext"
                hint="Deletes stored offline messages from the server"
                destructive
                onClick={() => setClearCiphertextOpen(true)}
                testId="settings-clear-ciphertext"
              />
              <Row
                icon={<Unplug className="size-4" />}
                label="Revoke push subscriptions"
                hint="Disconnect lost devices from notifications"
                destructive
                onClick={() => setRevokePushOpen(true)}
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

      <ChangePINDialog open={changePinOpen} onOpenChange={setChangePinOpen} />
      <EditProfileDialog
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        profile={myProfile}
        onSave={handleSaveProfile}
      />
      <PairDeviceDialog
        open={pairDeviceOpen}
        onOpenChange={setPairDeviceOpen}
        onRegenerateRequested={() => {
          clearPairing();
          toast.success('Pairing code regenerated');
          setPairDeviceOpen(false);
          window.location.href = '/';
        }}
      />
      <NotificationsDialog open={notificationsOpen} onOpenChange={setNotificationsOpen} />

      <ConfirmDialog
        open={resetPairingOpen}
        onOpenChange={setResetPairingOpen}
        title="Reset pairing"
        description="Both devices will need the pairing code again. Your local messages will remain, but you'll need to re-pair to sync."
        destructive
        confirmText="Reset"
        onConfirm={handleResetPairing}
      />

      <ConfirmDialog
        open={clearCiphertextOpen}
        onOpenChange={setClearCiphertextOpen}
        title="Clear server ciphertext"
        description="Delete all stored offline messages from the server. Your local copy will remain. This cannot be undone."
        destructive
        confirmText="Clear"
        onConfirm={handleClearCiphertext}
      />

      <ConfirmDialog
        open={revokePushOpen}
        onOpenChange={setRevokePushOpen}
        title="Revoke push subscriptions"
        description="Disconnect all devices from push notifications. They will no longer receive alerts for new messages."
        destructive
        confirmText="Revoke"
        onConfirm={handleRevokePush}
      />
    </div>
  );
}
