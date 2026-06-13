/**
 * Message encryption: libsodium secretbox with a key derived from the
 * pre-shared passphrase (Argon2id via crypto_pwhash, salt derived from the
 * room id). No custom crypto — standard libsodium primitives only.
 *
 * The server only ever sees the base64 output of encryptJson.
 */
import sodium from 'libsodium-wrappers-sumo';

let key: Uint8Array | null = null;

export async function initCrypto(passphrase: string, roomId: string): Promise<void> {
  await sodium.ready;
  // deterministic salt from the room id so both devices derive the same key
  const salt = sodium.crypto_generichash(sodium.crypto_pwhash_SALTBYTES, `rei-salt:${roomId}`, null);
  key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function requireKey(): Uint8Array {
  if (!key) throw new Error('crypto not initialized');
  return key;
}

/** encrypt any JSON value → base64(nonce + box) */
export function encryptJson(value: unknown): string {
  const k = requireKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const box = sodium.crypto_secretbox_easy(JSON.stringify(value), nonce, k);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return sodium.to_base64(out, sodium.base64_variants.ORIGINAL);
}

/** encrypt raw bytes (e.g. a media chunk) → base64(nonce + box) */
export function encryptBytes(bytes: Uint8Array): string {
  const k = requireKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const box = sodium.crypto_secretbox_easy(bytes, nonce, k);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return sodium.to_base64(out, sodium.base64_variants.ORIGINAL);
}

/** decrypt base64(nonce + box) → raw bytes, or null if tampered/wrong key */
export function decryptBytes(ciphertext: string): Uint8Array | null {
  try {
    const k = requireKey();
    const raw = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
    const nonce = raw.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const box = raw.slice(sodium.crypto_secretbox_NONCEBYTES);
    return sodium.crypto_secretbox_open_easy(box, nonce, k);
  } catch {
    return null;
  }
}

/** decrypt base64(nonce + box) → parsed JSON, or null if tampered/wrong key */
export function decryptJson<T>(ciphertext: string): T | null {
  try {
    const k = requireKey();
    const raw = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
    const nonce = raw.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const box = raw.slice(sodium.crypto_secretbox_NONCEBYTES);
    const plain = sodium.crypto_secretbox_open_easy(box, nonce, k);
    return JSON.parse(sodium.to_string(plain)) as T;
  } catch {
    return null;
  }
}
