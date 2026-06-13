/** PIN storage and verification — local device access lock */
const PIN_KEY = 'rei-pin';
const DEFAULT_PIN = '1234';

/**
 * Unlock grace: after a successful unlock the app stays unlocked for a short
 * window, so a refresh reconnects instantly instead of blocking on the PIN.
 * While the app is open and visible we keep extending it (sliding window), so
 * an in-use session never locks mid-chat; closing/backgrounding lets it lapse.
 */
const UNLOCK_KEY = 'rei-unlock-until';
const GRACE_MS = 10 * 60 * 1000; // 10 minutes

/** start/extend the grace window (call on unlock and on activity) */
export function touchUnlock(): void {
  localStorage.setItem(UNLOCK_KEY, String(Date.now() + GRACE_MS));
}

/** still within the grace window? (lets boot skip the lock screen) */
export function isUnlockFresh(): boolean {
  return Number(localStorage.getItem(UNLOCK_KEY) ?? 0) > Date.now();
}

/** drop the grace window (forces the PIN next time) */
export function clearUnlock(): void {
  localStorage.removeItem(UNLOCK_KEY);
}

export function getPIN(): string {
  return localStorage.getItem(PIN_KEY) ?? DEFAULT_PIN;
}

export function setPIN(newPin: string): void {
  if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  localStorage.setItem(PIN_KEY, newPin);
}

export function verifyPIN(pin: string): boolean {
  return pin === getPIN();
}
