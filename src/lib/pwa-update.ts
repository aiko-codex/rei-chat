/**
 * Service-worker update flow. We use vite-plugin-pwa's `prompt` mode: when a
 * new build is deployed, the SW downloads it in the background and fires
 * `onNeedRefresh` instead of silently swapping it in. We surface that as a
 * Sonner toast with a "Reload" action so the update applies on the user's tap.
 *
 * Also reports this device's running build to the server DB on boot, so both
 * devices' versions are tracked (visible in Settings).
 */
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { reportVersion } from './message-api';

let started = false;

/**
 * Hard-refresh onto the latest deployed code: unregister the service worker and
 * delete all of its caches, then reload from the network. This is the manual
 * escape hatch when the auto update prompt doesn't show or a device is stuck on
 * a stale build. Deliberately does NOT touch IndexedDB or localStorage — the
 * conversation cache, pairing, keys, profile, and settings all survive.
 */
export async function forceRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // best effort — reload regardless so the user isn't left stuck
  } finally {
    // SW gone + caches cleared → this reload pulls fresh assets from the server
    window.location.reload();
  }
}

export function setupPWAUpdates(): void {
  if (started) return;
  started = true;

  // log the build we're currently running
  void reportVersion();

  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Update available', {
        description: `A new version (${__APP_VERSION__}) is ready.`,
        duration: Infinity,
        action: {
          label: 'Reload',
          // true = activate the waiting SW and reload the page
          onClick: () => void updateSW(true),
        },
      });
    },
    onRegisteredSW(_swUrl, registration) {
      // check for a new deploy every 30 min while the app stays open
      if (registration) {
        setInterval(() => void registration.update(), 30 * 60 * 1000);
      }
    },
  });
}
