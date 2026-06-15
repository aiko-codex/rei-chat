/// <reference lib="webworker" />
/**
 * Custom service worker (vite-plugin-pwa `injectManifest` mode).
 *
 * Keeps the Workbox precache (offline app shell) AND adds Web Push:
 * we receive a *payload-less* "ping" — the push carries no message content,
 * so the SW just shows a generic notification. Tapping it opens/focuses the
 * app, which then syncs the real (E2E-encrypted) message itself. The server
 * therefore never handles message content for notifications.
 */
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// injected at build time by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// NOTE: do NOT call skipWaiting() on install. We're in vite-plugin-pwa
// `prompt` mode — a freshly deployed SW must *wait* (stay installed but not
// activate) so `virtual:pwa-register` fires `onNeedRefresh`, which is what shows
// the "Update available · Reload" toast. Skipping the wait here makes every
// deploy activate silently → the toast never appears (regression from when this
// custom SW was added). The waiting SW activates only when the user taps
// "Reload", which posts the SKIP_WAITING message handled below.
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// the update toast's "Reload" posts this (virtual:pwa-register, prompt mode):
// activate the waiting SW now, then the page reloads onto the new build
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        void self.skipWaiting();
    }
});

// A push arrives with no body (payload-less). Optionally the server could one
// day send a tag to differentiate message/call/invite; we read it defensively.
self.addEventListener('push', (event) => {
    let tag = 'rei-message';
    let title = 'rei';
    let body = 'New message';
    try {
        if (event.data) {
            const data = event.data.json() as {
                tag?: string;
                title?: string;
                body?: string;
            };
            if (data.tag) tag = data.tag;
            if (data.title) title = data.title;
            if (data.body) body = data.body;
        }
    } catch {
        // payload-less / non-JSON — keep the generic defaults
    }

    event.waitUntil(
        (async () => {
            // If the app is already open AND focused/visible, the user is right
            // here — don't fire a notification (it already updates live over
            // P2P / the sync poll). Only notify when backgrounded or closed.
            const clients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });
            const active = clients.some(
                (c) => c.visibilityState === 'visible' && c.focused,
            );
            if (active) return;

            await self.registration.showNotification(title, {
                body,
                tag,
                // collapse repeats of the same kind into one notification
                renotify: true,
                icon: './pwa-192.png',
                badge: './pwa-192.png',
                data: { url: './' },
            } as NotificationOptions);
        })(),
    );
});

// focus an existing window if open, otherwise open the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || './';
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                for (const client of clients) {
                    if ('focus' in client) return client.focus();
                }
                return self.clients.openWindow(url);
            }),
    );
});
