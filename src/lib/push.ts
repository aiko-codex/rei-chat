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

/** Is this device currently subscribed? */
export async function isPushEnabled(): Promise<boolean> {
    if (!pushSupported()) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return Boolean(sub);
    } catch {
        return false;
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

        const res = await fetch(`${SIGNAL_URL}?action=push_subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room: getRoomId(),
                deviceId: getDeviceId(),
                sub: sub.toJSON(),
            }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Unsubscribe locally and drop the subscription on the server. */
export async function disablePush(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (sub) await sub.unsubscribe();
        if (SIGNAL_URL) {
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
