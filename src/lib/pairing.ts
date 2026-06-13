/**
 * Couple pairing: one shared code is the entire identity of a couple.
 *
 * The code (e.g. ABCD-EFGH-JKMN-PQRS-TUVW, ~100 bits) is generated on one
 * device and entered on the other (QR, copy, or join link). From it we
 * derive — client-side only — both the room id the server sees and the
 * encryption key (Argon2id in crypto.ts). The server never sees the code,
 * so it can't link the room to the key. Losing the code = losing the chat;
 * that's the product promise, not a bug.
 */
import sodium from 'libsodium-wrappers-sumo';

const PAIRING_KEY = 'rei-pairing';

// Crockford-style base32: no 0/O/1/I/L confusion when read over a call
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_CHARS = 20; // 5 groups of 4 ≈ 99 bits of entropy

export interface Pairing {
  /** the shared secret code, normalized (no dashes, uppercase) */
  secret: string;
  /** room id derived from the secret — what the server keys everything by */
  roomId: string;
}

export function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_CHARS);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_CHARS; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
    if (i % 4 === 3 && i < CODE_CHARS - 1) code += '-';
  }
  return code;
}

/** strip dashes/spaces, uppercase; returns null if it isn't a valid code */
export function normalizeCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== CODE_CHARS) return null;
  for (const ch of raw) {
    if (!ALPHABET.includes(ch)) return null;
  }
  return raw;
}

/** pretty-print a normalized secret back to grouped form */
export function formatCode(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1-');
}

export async function deriveRoomId(secret: string): Promise<string> {
  await sodium.ready;
  // 15 bytes -> 24 base32-ish hex chars; plenty against collisions
  const hash = sodium.crypto_generichash(15, `rei-room:${secret}`, null);
  return sodium.to_hex(hash);
}

export function getPairing(): Pairing | null {
  try {
    const raw = localStorage.getItem(PAIRING_KEY);
    return raw ? (JSON.parse(raw) as Pairing) : null;
  } catch {
    return null;
  }
}

export async function savePairing(secret: string): Promise<Pairing> {
  const pairing: Pairing = { secret, roomId: await deriveRoomId(secret) };
  localStorage.setItem(PAIRING_KEY, JSON.stringify(pairing));
  return pairing;
}

export function clearPairing(): void {
  localStorage.removeItem(PAIRING_KEY);
}

/** join link that pre-fills the code on the partner's device */
export function joinLink(secret: string): string {
  return `${location.origin}${location.pathname}#join=${formatCode(secret)}`;
}

/** code from a #join= link, if the app was opened through one */
export function joinCodeFromUrl(): string | null {
  const m = location.hash.match(/#join=([A-Za-z0-9-]+)/);
  return m ? normalizeCode(m[1]) : null;
}
