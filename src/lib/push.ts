/**
 * Web Push (client side). We subscribe to a *payload-less* push: the server
 * only ever sends a wake "ping" (no message content), and the service worker
 * shows a generic notification. The actual E2E-encrypted message is synced by
 * the app itself when it opens.
 *
 * Flow: ask Notification permission → pushManager.subscribe with the VAPID
 * public key → POST the subscription to the server (membership-gated). The
 * private VAPID key never leaves the server.
 */
import { getRoomId, SIGNAL_URL, VAPID_PUBLIC_KEY } from './config';
import { getDeviceId } from './identity';
import { getToken, isLoggedIn } from './session';

/** Web Push needs the VAPID key as a Uint8Array (applicationServerKey). */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    // explicit ArrayBuffer backing so the type matches applicationServerKey
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

/** True if this browser can do Web Push at all (and we have a key + endpoint). */
export function pushSupported(): boolean {
    return (
        Boolean(SIGNAL_URL) &&
        Boolean(VAPID_PUBLIC_KEY) &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    );
}

/** Current permission state, normalized. */
export function notificationPermission(): NotificationPermission {
    return 'Notification' in window ? Notification.permission : 'denied';
}

/** localStorage flag: the user opted into push and wants it kept alive. */
const PUSH_OPTIN_KEY = 'rei-push-optin';

function setPushOptIn(on: boolean): void {
    try {
        if (on) localStorage.setItem(PUSH_OPTIN_KEY, '1');
        else localStorage.removeItem(PUSH_OPTIN_KEY);
    } catch {
        // ignore
    }
}

function wantsPush(): boolean {
    try {
        return localStorage.getItem(PUSH_OPTIN_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Is this device currently subscribed? Treats "opted in + permission granted"
 * as enabled even if the browser dropped the subscription object between app
 * launches (common on iOS PWAs) — `ensurePushRegistered()` re-creates it on
 * boot, so the settings UI shouldn't keep asking the user to re-enable.
 */
export async function isPushEnabled(): Promise<boolean> {
    if (!pushSupported()) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) return true;
        return wantsPush() && notificationPermission() === 'granted';
    } catch {
        return wantsPush() && notificationPermission() === 'granted';
    }
}

/**
 * Called on app boot: if the user previously opted into push and the OS
 * permission is still granted, silently re-subscribe and re-register with the
 * server so notifications survive app restarts (no UI, best effort).
 */
export async function ensurePushRegistered(): Promise<void> {
    if (!pushSupported()) return;
    if (!wantsPush()) return;
    if (notificationPermission() !== 'granted') return;
    try {
        await enablePush();
    } catch {
        // best effort
    }
}

/**
 * Request permission, subscribe, and register with the server. Returns true on
 * success. Safe to call repeatedly (subscribe is idempotent per browser).
 */
export async function enablePush(): Promise<boolean> {
    if (!pushSupported()) return false;
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }

        // accounts mode: subscribe against the account (token); else the legacy room
        if (isLoggedIn()) {
            const res = await fetch(`${SIGNAL_URL}?action=c_push_subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: getToken(), sub: sub.toJSON() }),
            });
            if (res.ok) setPushOptIn(true);
            return res.ok;
        }
        const res = await fetch(`${SIGNAL_URL}?action=push_subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room: getRoomId(),
                deviceId: getDeviceId(),
                sub: sub.toJSON(),
            }),
        });
        if (res.ok) setPushOptIn(true);
        return res.ok;
    } catch {
        return false;
    }
}

/** Unsubscribe locally and drop the subscription on the server. */
export async function disablePush(): Promise<void> {
    setPushOptIn(false);
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (sub) await sub.unsubscribe();
        if (SIGNAL_URL && isLoggedIn()) {
            await fetch(`${SIGNAL_URL}?action=c_push_unsubscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: getToken(), endpoint }),
            });
        } else if (SIGNAL_URL) {
            await fetch(`${SIGNAL_URL}?action=push_unsubscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room: getRoomId(),
                    deviceId: getDeviceId(),
                    endpoint,
                }),
            });
        }
    } catch {
        // best effort
    }
}

export interface PushTestResult {
    ok: boolean;
    sent: number;
    reason?: string;
    codes?: number[];
}

/**
 * Self-test: ask the server to push to THIS device. If the notification
 * appears, the whole chain works. Returns the server's report (ok = a push
 * service accepted it for delivery).
 */
export async function sendTestPush(): Promise<PushTestResult> {
    if (!SIGNAL_URL) return { ok: false, sent: 0, reason: 'no server configured' };
    try {
        // accounts mode: test against the account (token); else the legacy room
        const res = isLoggedIn()
            ? await fetch(`${SIGNAL_URL}?action=c_push_test`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: getToken() }),
              })
            : await fetch(`${SIGNAL_URL}?action=push_test`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ room: getRoomId(), deviceId: getDeviceId() }),
              });
        if (!res.ok) return { ok: false, sent: 0, reason: `server ${res.status}` };
        return (await res.json()) as PushTestResult;
    } catch {
        return { ok: false, sent: 0, reason: 'network error' };
    }
}

/**
 * Wake the other device (used when starting a call: WebRTC needs both peers
 * online, so we ping to foreground the callee's PWA). Best effort.
 */
export async function pushPing(): Promise<void> {
    if (!SIGNAL_URL) return;
    try {
        await fetch(`${SIGNAL_URL}?action=push_ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: getRoomId(), deviceId: getDeviceId() }),
        });
    } catch {
        // ignore
    }
}
