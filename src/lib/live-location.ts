// Live location sharing: a continuously-updating position attached to a
// message, synced via the encrypted meta overlay (key `loc:<msgId>`) — same
// model as Memories pins and Important dates. Updates only happen while the
// sender's app is foregrounded (no reliable background geolocation API in a
// browser/PWA); the sender broadcasts an explicit `paused` flag rather than
// the receiver guessing from staleness, so the UI is honest about it.
import type { Message } from './types';

export interface LiveLocationDuration {
  /** 0 = no auto-expiry ("Until I stop") */
  ms: number;
  label: string;
}

export const LIVE_LOCATION_DURATIONS: LiveLocationDuration[] = [
  { ms: 15 * 60 * 1000, label: '15 min' },
  { ms: 60 * 60 * 1000, label: '1 hour' },
  { ms: 8 * 60 * 60 * 1000, label: '8 hours' },
  { ms: 0, label: 'Until I stop' },
];

// sentinel for "Until I stop" — far enough out to read as indefinite
const INDEFINITE_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export function expiresAtFor(durationMs: number, startedAt = Date.now()): number {
  return startedAt + (durationMs || INDEFINITE_MS);
}

function isIndefinite(loc: NonNullable<Message['liveLocation']>): boolean {
  return loc.expiresAt - loc.startedAt > 300 * 24 * 60 * 60 * 1000;
}

export type LiveLocationStatus = 'active' | 'paused' | 'ended';

export function liveLocationStatus(loc: NonNullable<Message['liveLocation']>, now = Date.now()): LiveLocationStatus {
  if (loc.stoppedAt || now >= loc.expiresAt) return 'ended';
  if (loc.paused) return 'paused';
  return 'active';
}

export function timeLeftLabel(loc: NonNullable<Message['liveLocation']>, now = Date.now()): string {
  if (isIndefinite(loc)) return 'Live';
  const mins = Math.round((loc.expiresAt - now) / 60000);
  if (mins <= 0) return 'Ending…';
  if (mins < 60) return `Live · ${mins} min left`;
  const hrs = Math.round(mins / 60);
  return `Live · ${hrs}h left`;
}
