import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { checkUsername, updateAccount } from '@/lib/account-api';
import { getAccount } from '@/lib/session';
import { fileToAvatarDataUrl } from '@/lib/image';
import { useChatStore } from '@/store/chat-store';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'current';

/**
 * Username + display name editor with live availability checking. The Update
 * button only enables once the typed username is valid, changed, and confirmed
 * available by the server (debounced).
 */
export function AccountPanel() {
  const account = getAccount();
  const current = account?.username ?? '';

  const [username, setUsername] = useState(current);
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [avatar, setAvatar] = useState<string | null>(account?.avatar ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // keep the local profile (home/header avatar + name) in step with the account
  const refreshMyProfile = (acc: { displayName: string; avatar: string | null }) => {
    const color = useChatStore.getState().myProfile?.color ?? '#b03a6e';
    useChatStore.getState().setMyProfile({
      name: acc.displayName,
      color,
      avatar: acc.avatar ?? undefined,
    });
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const acc = await updateAccount({ avatar: dataUrl });
      setAvatar(dataUrl);
      refreshMyProfile(acc);
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update photo');
    } finally {
      setAvatarBusy(false);
    }
  };
  const [status, setStatus] = useState<Status>('current');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const normalized = username.trim().toLowerCase();
  const usernameChanged = normalized !== current;
  const displayChanged = displayName.trim() !== (account?.displayName ?? '') && displayName.trim() !== '';

  // debounced live availability check
  useEffect(() => {
    if (!usernameChanged) {
      setStatus('current');
      return;
    }
    if (!/^[a-z0-9._]{3,32}$/.test(normalized)) {
      setStatus('invalid');
      return;
    }
    setStatus('checking');
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const { valid, available } = await checkUsername(normalized);
        if (mySeq !== seq.current) return; // a newer keystroke superseded this
        setStatus(!valid ? 'invalid' : available ? 'available' : 'taken');
      } catch {
        if (mySeq === seq.current) setStatus('idle');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [normalized, usernameChanged]);

  const canSave =
    !saving &&
    ((usernameChanged && status === 'available') || (!usernameChanged && displayChanged));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const acc = await updateAccount({
        ...(usernameChanged ? { username: normalized } : {}),
        ...(displayChanged ? { displayName: displayName.trim() } : {}),
      });
      refreshMyProfile(acc);
      toast.success('Profile updated');
      setStatus('current');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='px-4 py-3' data-testid='settings-account-panel'>
      <div className='mb-5 flex flex-col items-center gap-2'>
        <button
          type='button'
          onClick={() => fileRef.current?.click()}
          className='relative cursor-pointer'
          data-testid='account-avatar-btn'
        >
          <Avatar className='size-20'>
            {avatar && <AvatarImage src={avatar} alt={displayName} />}
            <AvatarFallback className='bg-primary/90 text-2xl font-semibold text-white'>
              {(displayName || current)[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <span className='absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background [&_svg]:size-3.5'>
            {avatarBusy ? <Loader2 className='animate-spin' /> : <Camera />}
          </span>
        </button>
        <input
          ref={fileRef}
          type='file'
          accept='image/*'
          className='hidden'
          onChange={(e) => void pickAvatar(e.target.files?.[0])}
        />
      </div>

      <label className='mb-1.5 block text-xs font-medium text-muted-foreground'>Display name</label>
      <Input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder='Display name'
        data-testid='account-display-name'
      />

      <label className='mb-1.5 mt-4 block text-xs font-medium text-muted-foreground'>Username</label>
      <div className='relative'>
        <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground'>
          @
        </span>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder='username'
          autoCapitalize='none'
          autoCorrect='off'
          spellCheck={false}
          className='pl-7'
          data-testid='account-username'
        />
        <span className='absolute right-3 top-1/2 -translate-y-1/2'>
          {status === 'checking' && <Loader2 className='size-4 animate-spin text-muted-foreground' />}
          {status === 'available' && <Check className='size-4 text-emerald-600' />}
          {(status === 'taken' || status === 'invalid') && <X className='size-4 text-destructive' />}
        </span>
      </div>

      <p
        className={cn(
          'mt-1.5 min-h-4 text-xs',
          status === 'available' && 'text-emerald-600',
          (status === 'taken' || status === 'invalid') && 'text-destructive',
          (status === 'idle' || status === 'current' || status === 'checking') && 'text-muted-foreground',
        )}
        data-testid='account-username-status'
      >
        {status === 'checking' && 'Checking availability…'}
        {status === 'available' && `@${normalized} is available`}
        {status === 'taken' && `@${normalized} is already taken`}
        {status === 'invalid' && '3–32 chars: letters, numbers, dot, underscore'}
        {status === 'idle' && "Couldn't check — try again"}
        {status === 'current' && 'This is your current username'}
      </p>

      <Button
        className='mt-4 w-full'
        disabled={!canSave}
        onClick={save}
        data-testid='account-update-btn'
      >
        {saving ? 'Updating…' : 'Update'}
      </Button>
    </div>
  );
}
