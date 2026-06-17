/**
 * Per-user E2E crypto for the accounts model (2026-06-17 pivot).
 *
 * Each account has a libsodium box keypair. The PUBLIC key is stored plain on
 * the server; the PRIVATE key is wrapped (secretbox) under a key derived from
 * the user's password (Argon2id) and only ever decrypted on the device — the
 * server never holds anything that can decrypt a conversation.
 *
 * Each connection has a symmetric CONVERSATION KEY (secretbox). It is sealed
 * (crypto_box_seal) to each member's public key so both can recover it; all
 * messages/media in that conversation are encrypted with it.
 *
 * Standard libsodium primitives only — no custom crypto.
 */
import sodium from 'libsodium-wrappers-sumo';

const B64 = () => sodium.base64_variants.ORIGINAL;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export async function readyCrypto(): Promise<void> {
  await sodium.ready;
}

// ── base64 transport helpers ───────────────────────────────────────────────
export function toB64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, B64());
}
export function fromB64(s: string): Uint8Array {
  return sodium.from_base64(s, B64());
}

// ── account keypair ─────────────────────────────────────────────────────────
/** generate a fresh box keypair (run once, on first password-set) */
export function generateKeyPair(): KeyPair {
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * wrap a private key under the password → base64(salt + nonce + box).
 * The salt is random and travels with the ciphertext so unwrap is self-contained.
 */
export function wrapPrivateKey(privateKey: Uint8Array, password: string): string {
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const box = sodium.crypto_secretbox_easy(privateKey, nonce, key);
  const out = new Uint8Array(salt.length + nonce.length + box.length);
  out.set(salt);
  out.set(nonce, salt.length);
  out.set(box, salt.length + nonce.length);
  return toB64(out);
}

/** unwrap a private key with the password, or null if the password is wrong */
export function unwrapPrivateKey(wrapped: string, password: string): Uint8Array | null {
  try {
    const raw = fromB64(wrapped);
    const sl = sodium.crypto_pwhash_SALTBYTES;
    const nl = sodium.crypto_secretbox_NONCEBYTES;
    const salt = raw.slice(0, sl);
    const nonce = raw.slice(sl, sl + nl);
    const box = raw.slice(sl + nl);
    const key = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
    return sodium.crypto_secretbox_open_easy(box, nonce, key);
  } catch {
    return null;
  }
}

// ── conversation key ──────────────────────────────────────────────────────
/** a fresh symmetric conversation key (run by the accepter of a connection) */
export function generateConversationKey(): Uint8Array {
  return sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
}

/** seal a conversation key to a recipient's public key → base64 */
export function sealKeyTo(convKey: Uint8Array, recipientPubKeyB64: string): string {
  const sealed = sodium.crypto_box_seal(convKey, fromB64(recipientPubKeyB64));
  return toB64(sealed);
}

/** open a sealed conversation key with my keypair, or null on failure */
export function openSealedKey(sealedB64: string, myKeys: KeyPair): Uint8Array | null {
  try {
    return sodium.crypto_box_seal_open(fromB64(sealedB64), myKeys.publicKey, myKeys.privateKey);
  } catch {
    return null;
  }
}

// ── message / media encryption with a conversation key ──────────────────────
/** encrypt any JSON value with a conversation key → base64(nonce + box) */
export function encryptJsonWith(value: unknown, convKey: Uint8Array): string {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const box = sodium.crypto_secretbox_easy(JSON.stringify(value), nonce, convKey);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return toB64(out);
}

/** decrypt base64(nonce + box) → parsed JSON, or null */
export function decryptJsonWith<T>(ciphertext: string, convKey: Uint8Array): T | null {
  try {
    const raw = fromB64(ciphertext);
    const nl = sodium.crypto_secretbox_NONCEBYTES;
    const plain = sodium.crypto_secretbox_open_easy(raw.slice(nl), raw.slice(0, nl), convKey);
    return JSON.parse(sodium.to_string(plain)) as T;
  } catch {
    return null;
  }
}

/** encrypt raw bytes (media) with a conversation key → base64(nonce + box) */
export function encryptBytesWith(bytes: Uint8Array, convKey: Uint8Array): string {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const box = sodium.crypto_secretbox_easy(bytes, nonce, convKey);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return toB64(out);
}

/** decrypt base64(nonce + box) → raw bytes, or null */
export function decryptBytesWith(ciphertext: string, convKey: Uint8Array): Uint8Array | null {
  try {
    const raw = fromB64(ciphertext);
    const nl = sodium.crypto_secretbox_NONCEBYTES;
    return sodium.crypto_secretbox_open_easy(raw.slice(nl), raw.slice(0, nl), convKey);
  } catch {
    return null;
  }
}
