/**
 * Account recovery key (accounts model). A high-entropy code the user saves at
 * password-set. It lets a FORGOTTEN password be reset without losing data: the
 * account private key is wrapped under this key (server-side, ciphertext only),
 * so recovery restores the SAME keypair and every sealed conversation key still
 * opens. The server never sees the recovery key — only a one-way verifier.
 *
 * Same Crockford-base32 alphabet as the old pairing code: ~99 bits, no
 * 0/O/1/I/L confusion when read aloud.
 */
import sodium from 'libsodium-wrappers-sumo';
import { toB64 } from './account-crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_CHARS = 20; // 5 groups of 4 ≈ 99 bits

/** a fresh recovery key, normalized (no dashes, uppercase) */
export function generateRecoveryKey(): string {
  const bytes = new Uint8Array(CODE_CHARS);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_CHARS; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** strip dashes/spaces, uppercase; null if it isn't a valid recovery key */
export function normalizeRecoveryKey(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== CODE_CHARS) return null;
  for (const ch of raw) {
    if (!ALPHABET.includes(ch)) return null;
  }
  return raw;
}

/** pretty-print a normalized recovery key back to grouped form (XXXX-XXXX-…) */
export function formatRecoveryKey(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

/**
 * One-way verifier the server stores to prove (on reset) that the caller knows
 * the recovery key — WITHOUT the server ever learning it. generichash is
 * preimage-resistant and the key has ~99 bits, so a leaked verifier can't be
 * reversed. Must be computed identically at set-up and at reset.
 */
export function recoveryVerifier(recoveryKey: string): string {
  return toB64(sodium.crypto_generichash(32, recoveryKey, null));
}
