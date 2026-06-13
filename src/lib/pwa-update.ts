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
