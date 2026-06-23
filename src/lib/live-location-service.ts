// Module-level geolocation watch for an active outgoing live-location share.
// One share at a time (the app only supports a single active outgoing
// share). The caller (ChatScreen) owns pause/resume around visibilitychange.
type Listener = (lat: number, lng: number) => void;

let watchId: number | null = null;
let lastPush = 0;
const PUSH_INTERVAL_MS = 15000;

export function startLiveLocationWatch(onUpdate: Listener): void {
  stopLiveLocationWatch();
  if (!('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastPush < PUSH_INTERVAL_MS) return;
      lastPush = now;
      onUpdate(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      /* ignore transient errors — the last known position keeps showing */
    },
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
}

/** push a fresh position right away (e.g. on resume from background) */
export function pushLiveLocationNow(onUpdate: Listener): void {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    lastPush = Date.now();
    onUpdate(pos.coords.latitude, pos.coords.longitude);
  });
}

export function stopLiveLocationWatch(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
