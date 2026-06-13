/**
 * All environment-driven config in one place (works on Vercel and as a
 * plain Apache dist/ — never hardcode endpoint URLs elsewhere).
 */

/** Live PHP signaling endpoint, e.g. https://example.com/rei-signal/index.php */
export const SIGNAL_URL: string = import.meta.env.VITE_SIGNAL_URL ?? '';

import { getPairing } from './pairing';

/**
 * Dev/legacy override: setting VITE_ROOM_ID (+ optional VITE_PASSPHRASE)
 * skips the pairing flow. Production builds leave these unset — couples
 * pair with a shared code, which derives both room id and key.
 */
const ENV_ROOM: string = import.meta.env.VITE_ROOM_ID ?? '';
const ENV_PASSPHRASE: string = import.meta.env.VITE_PASSPHRASE ?? 'rei-dev-passphrase';

export function isPaired(): boolean {
  return Boolean(getPairing()) || Boolean(ENV_ROOM);
}

/** room id the server keys everything by */
export function getRoomId(): string {
  return getPairing()?.roomId ?? ENV_ROOM;
}

/** shared secret that derives the encryption key */
export function getSecret(): string {
  return getPairing()?.secret ?? ENV_PASSPHRASE;
}

/** STUN-only fallback used when the server can't supply TURN credentials */
const STUN_FALLBACK: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * ICE servers for the peer connection. TURN credentials are short-lived and
 * minted server-side (the Cloudflare token never reaches the client), so we
 * fetch them from `?action=turn` at connect time and fall back to STUN-only
 * if TURN isn't configured or the endpoint is unreachable.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (!SIGNAL_URL) return STUN_FALLBACK;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=turn`);
    if (!res.ok) throw new Error(`turn ${res.status}`);
    const data: { iceServers?: RTCIceServer | RTCIceServer[] } = await res.json();
    const ice = data.iceServers;
    if (Array.isArray(ice) && ice.length) return [...ice, ...STUN_FALLBACK];
    // Cloudflare returns a single object with urls/username/credential
    if (ice && 'urls' in ice && ice.urls) return [ice, ...STUN_FALLBACK];
  } catch {
    // unreachable / unconfigured — STUN-only (works on most non-CGNAT networks)
  }
  return STUN_FALLBACK;
}
