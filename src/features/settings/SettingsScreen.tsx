import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  AtSign,
  Bell,
  Check,
  ChevronRight,
  Eraser,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Type,
  Unplug,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useChatStore } from '@/store/chat-store';
import { clearPairing } from '@/lib/pairing';
import { sendPeerProfile } from '@/lib/peer-service';
import { UI_SCALES, getUIScale, setUIScale } from '@/lib/ui-scale';
import { THEMES, getTheme, setTheme, type ThemeId } from '@/lib/theme';
import { ACCENTS, getAccentId, setAccent } from '@/lib/accent';
import { cn } from '@/lib/utils';
import { clearServerCiphertext, fetchVersions, type DeviceVersion } from '@/lib/message-api';
import { forceRefresh } from '@/lib/pwa-update';
import { getAccount, clearSession } from '@/lib/session';
import { logout } from '@/lib/account-api';
import { clearConversationKeys } from '@/lib/conversation-api';
import { AccountPanel } from './AccountPanel';
import { WhatsNewPanel } from './WhatsNewPanel';
import { ChangePINDialog } from './ChangePINDialog';
import { ManageDevicesDialog } from './ManageDevicesDialog';
import { AccountSecurityDialog } from './AccountSecurityDialog';
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

function TextSizeControl() {
  const [scale, setScale] = useState(() => getUIScale());

  const pick = (value: number) => {
    setScale(value);
    setUIScale(value); // applies live to the whole UI
  };

  return (
    <div className="px-4 py-3" data-testid="settings-text-size">
      <div className="mb-2 flex items-center gap-3">
        <Type className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Text size</span>
        <span className="text-xs text-muted-foreground">Aa</span>
      </div>
      <div className="flex items-stretch gap-1 rounded-xl bg-muted p-1">
        {UI_SCALES.map((opt) => {
          const active = Math.abs(scale - opt.value) < 0.001;
          return (
            <button
              key={opt.id}
              onClick={() => pick(opt.value)}
              aria-pressed={active}
              data-testid={`text-size-${opt.id}`}
              className={cn(
                'flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-colors',
                active ? 'bg-background shadow-sm' : 'hover:bg-background/50',
              )}
            >
              <span
                className={cn('font-semibold leading-none', active ? 'text-primary' : 'text-foreground')}
                style={{ fontSize: `${8 + opt.value * 9}px` }}
              >
                A
              </span>
              <span className="text-[10px] text-muted-foreground">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const THEME_ICONS: Record<ThemeId, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function ThemeControl() {
  const [theme, setThemeState] = useState<ThemeId>(() => getTheme());

  const pick = (id: string) => {
    if (id !== 'light' && id !== 'dark' && id !== 'system') return; // ignore deselect
    setThemeState(id);
    setTheme(id); // applies live to the whole UI
  };

  return (
    <div className="px-4 py-3" data-testid="settings-theme">
      <div className="mb-2 flex items-center gap-3">
        <Moon className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Theme</span>
      </div>
      <ToggleGroup
        type="single"
        value={theme}
        onValueChange={pick}
        variant="outline"
        spacing={0}
        className="w-full"
      >
        {THEMES.map((opt) => {
          const Icon = THEME_ICONS[opt.id];
          return (
            <ToggleGroupItem
              key={opt.id}
              value={opt.id}
              aria-label={opt.label}
              data-testid={`theme-${opt.id}`}
              className="h-auto flex-1 flex-col gap-1 py-2.5 data-[state=on]:text-primary"
            >
              <Icon className="size-4.5" />
              <span className="text-[11px]">{opt.label}</span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

function AccentControl() {
  const [accent, setAccentState] = useState(() => getAccentId());

  const pick = (id: string) => {
    setAccentState(id);
    setAccent(id); // applies live to the whole UI
  };

  return (
    <div className="px-4 py-3" data-testid="settings-accent">
      <div className="mb-2 flex items-center gap-3">
        <Palette className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Accent color</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {ACCENTS.map((opt) => {
          const active = accent === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => pick(opt.id)}
              aria-label={opt.label}
              aria-pressed={active}
              title={opt.label}
              data-testid={`accent-${opt.id}`}
              className={cn(
                'flex size-9 cursor-pointer items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-transform hover:scale-105 [&_svg]:size-4.5',
                active && 'ring-2 ring-foreground/30',
              )}
              style={{ backgroundColor: opt.primary }}
            >
              {active && <Check />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function DeviceVersions() {
  const [devices, setDevices] = useState<DeviceVersion[]>([]);

  useEffect(() => {
    let active = true;
    void fetchVersions().then((d) => {
      if (active) setDevices(d);
    });
    return () => {
      active = false;
    };
  }, []);

  if (devices.length === 0) return null;

  return (
    <div data-testid="settings-device-versions">
      <SectionLabel>Updates</SectionLabel>
      <ul className="space-y-1 px-4">
        {devices.map((d) => (
          <li key={d.deviceId} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {d.mine ? 'This device' : 'Her device'}
            </span>
            <span className="text-muted-foreground/80">
              v{d.version} · {relativeTime(d.updatedAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
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

  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const account = getAccount();
  // accounts mode replaces device pairing — hide the legacy pairing/device rows
  const accountsMode = Boolean(account);
  const [manageDevicesOpen, setManageDevicesOpen] = useState(false);
  const [securityMode, setSecurityMode] = useState<'password' | 'recovery' | null>(null);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [pairDeviceOpen, setPairDeviceOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [clearCiphertextOpen, setClearCiphertextOpen] = useState(false);
  const [revokePushOpen, setRevokePushOpen] = useState(false);

  const handleEditProfile = () => {
    setEditProfileOpen(true);
  };

  const handleSaveProfile = (profile: Profile) => {
    setMyProfile(profile); // persists locally + publishes to the server
    sendPeerProfile(profile); // instant push if currently P2P-connected
  };

  const handleClearCiphertext = async () => {
    const success = await clearServerCiphertext();
    if (success) {
      toast.success('Server messages cleared');
    } else {
      toast.error('Failed to clear messages');
    }
  };

  const handleForceRefresh = () => {
    toast.info('Fetching the latest version…');
    void forceRefresh(); // clears SW + caches, keeps your data, then reloads
  };

  const handleRevokePush = () => {
    // TODO: implement when push notification system is set up
    toast.info('Push subscription revocation not yet implemented');
  };

  const handleSignOut = async () => {
    await logout();
    clearConversationKeys();
    clearSession();
    window.location.href = '/';
  };

  return (
    <div className="flex h-full flex-col" data-testid="settings-screen">
      <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
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
          onClick={accountsMode ? () => setAccountOpen(true) : handleEditProfile}
          className="flex w-full items-center gap-3 px-4 py-5 text-left transition-colors hover:bg-muted"
          data-testid="settings-edit-profile"
        >
          <Avatar className="size-14">
            {myProfile?.avatar && <AvatarImage src={myProfile.avatar} alt={myProfile.name} />}
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

        {account && (
          <>
            <SectionLabel>Account</SectionLabel>
            <Row
              icon={<AtSign className="size-4" />}
              label="Username & name"
              hint={`@${account.username}`}
              onClick={() => setAccountOpen(true)}
              testId="settings-account"
            />
          </>
        )}

        <SectionLabel>Security</SectionLabel>
        <Row
          icon={<Lock className="size-4" />}
          label="Change PIN"
          hint="App lock for this device"
          onClick={() => setChangePinOpen(true)}
          testId="settings-change-pin"
        />
        {accountsMode && (
          <>
            <Row
              icon={<Lock className="size-4" />}
              label="Change password"
              hint="Keeps all your chats"
              onClick={() => setSecurityMode('password')}
              testId="settings-change-password"
            />
            <Row
              icon={<KeyRound className="size-4" />}
              label="Recovery key"
              hint="Reset a forgotten password without losing chats"
              onClick={() => setSecurityMode('recovery')}
              testId="settings-recovery-key"
            />
          </>
        )}
        {!accountsMode && (
          <>
            <Row
              icon={<QrCode className="size-4" />}
              label="Pair a device"
              hint="Show QR to set up her phone"
              onClick={() => setPairDeviceOpen(true)}
              testId="settings-pair-device"
            />
            <Row
              icon={<Smartphone className="size-4" />}
              label="Manage devices"
              hint="Locked to 2 devices · remove one to free a slot"
              onClick={() => setManageDevicesOpen(true)}
              testId="settings-manage-devices"
            />
          </>
        )}

        <SectionLabel>Appearance</SectionLabel>
        <Row
          icon={<Palette className="size-4" />}
          label="Appearance"
          hint="Theme & text size"
          onClick={() => setAppearanceOpen(true)}
          testId="settings-appearance"
        />

        <SectionLabel>General</SectionLabel>
        <Row
          icon={<Bell className="size-4" />}
          label="Notifications"
          onClick={() => setNotificationsOpen(true)}
          testId="settings-notifications"
        />
        <Row
          icon={<RefreshCw className="size-4" />}
          label="Check for updates"
          hint="Clear cache & reload the latest version (keeps your chats)"
          onClick={handleForceRefresh}
          testId="settings-force-refresh"
        />
        <Row
          icon={<Sparkles className="size-4" />}
          label="What's new"
          hint={`Version history · v${__APP_VERSION__}`}
          onClick={() => setWhatsNewOpen(true)}
          testId="settings-whats-new"
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

        {accountsMode && (
          <Row
            icon={<LogOut className="size-4" />}
            label="Sign out"
            hint={account ? `@${account.username}` : undefined}
            destructive
            onClick={() => void handleSignOut()}
            testId="settings-sign-out"
          />
        )}

        {!accountsMode && <DeviceVersions />}

        <button
          onClick={() => setVersionTaps((t) => t + 1)}
          className="mt-6 w-full cursor-default px-4 text-center text-xs text-muted-foreground/60"
          data-testid="settings-version-label"
        >
          rei-chat {__APP_VERSION__}{manageVisible && ' · manage unlocked'}
        </button>
      </div>

      <ChangePINDialog open={changePinOpen} onOpenChange={setChangePinOpen} />
      <ManageDevicesDialog open={manageDevicesOpen} onOpenChange={setManageDevicesOpen} />
      {securityMode && (
        <AccountSecurityDialog
          open={securityMode !== null}
          onOpenChange={(o) => !o && setSecurityMode(null)}
          mode={securityMode}
        />
      )}
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

      {/* Appearance sub-page — slides over Settings to keep the main list lean */}
      <AnimatePresence>
        {appearanceOpen && (
          <motion.div
            key="appearance"
            className="absolute inset-0 z-10 flex flex-col bg-background"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            data-testid="settings-appearance-page"
          >
            <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                onClick={() => setAppearanceOpen(false)}
                aria-label="Back"
                data-testid="settings-appearance-back"
              >
                <ArrowLeft />
              </Button>
              <p className="text-sm font-semibold">Appearance</p>
            </header>
            <div className="flex-1 overflow-y-auto pt-2 pb-6">
              <ThemeControl />
              <AccentControl />
              <TextSizeControl />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* What's new sub-page — app-bundled changelog timeline */}
      <AnimatePresence>
        {whatsNewOpen && (
          <motion.div
            key="whats-new"
            className="absolute inset-0 z-10 flex flex-col bg-background"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            data-testid="settings-whats-new-page"
          >
            <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                onClick={() => setWhatsNewOpen(false)}
                aria-label="Back"
                data-testid="settings-whats-new-back"
              >
                <ArrowLeft />
              </Button>
              <p className="text-sm font-semibold">What's new</p>
            </header>
            <div className="flex-1 overflow-y-auto pt-3 pb-6">
              <WhatsNewPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account sub-page — username + display name with live validation */}
      <AnimatePresence>
        {accountOpen && (
          <motion.div
            key="account"
            className="absolute inset-0 z-10 flex flex-col bg-background"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            data-testid="settings-account-page"
          >
            <header className="flex items-center gap-2 border-b px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                onClick={() => setAccountOpen(false)}
                aria-label="Back"
                data-testid="settings-account-back"
              >
                <ArrowLeft />
              </Button>
              <p className="text-sm font-semibold">Account</p>
            </header>
            <div className="flex-1 overflow-y-auto pt-2 pb-6">
              <AccountPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
