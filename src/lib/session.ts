/**
 * Account session state (2026-06-17 accounts pivot). Holds the logged-in
 * account, the bearer token, and the account keypair.
 *
 * Key-at-rest note: the unwrapped private key is persisted in localStorage so
 * the user doesn't re-enter their password on every reload. The device is
 * PIN-gated and the server never holds anything that can decrypt it, so this
 * matches the threat model (server breach can't read; device theft is mitigated
 * by the PIN). Cleared on logout.
 */
import type { KeyPair } from './account-crypto';
import { fromB64, toB64 } from './account-crypto';

const TOKEN_KEY = 'rei-session-token';
const ACCOUNT_KEY = 'rei-account';
const PUB_KEY = 'rei-acct-pub';
const PRIV_KEY = 'rei-acct-priv';
const WRAP_KEY = 'rei-acct-wrap';
const MUST_KEY = 'rei-must-set-password';

export interface Account {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

let token: string | null = localStorage.getItem(TOKEN_KEY);
let account: Account | null = readAccount();
// Keys are decoded lazily, NOT at module load: decoding goes through libsodium
// (`fromB64`), whose WASM isn't initialized yet when this module is first
// imported. Decoding eagerly here threw → keys came back null → a logged-in
// user got bounced to sign-in on every refresh. We keep the raw base64 in
// localStorage and decode on first `getKeys()` once sodium is ready.
let keys: KeyPair | null = null;
let keysDecoded = false;

function readAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function readKeys(): KeyPair | null {
  try {
    const pub = localStorage.getItem(PUB_KEY);
    const priv = localStorage.getItem(PRIV_KEY);
    if (!pub || !priv) return null;
    return { publicKey: fromB64(pub), privateKey: fromB64(priv) };
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return token;
}

export function getAccount(): Account | null {
  return account;
}

export function getKeys(): KeyPair | null {
  if (!keysDecoded) {
    keys = readKeys();
    // only latch as decoded once it actually succeeds — if sodium isn't ready
    // yet, retry on the next call rather than caching a spurious null
    if (keys) keysDecoded = true;
  }
  return keys;
}

/** sodium-free presence check: are wrapped keys persisted for this account?
 *  Used at boot to decide home-vs-sign-in without touching libsodium (whose
 *  WASM may not be initialized yet). The actual decode happens later. */
export function hasStoredKeys(): boolean {
  return Boolean(localStorage.getItem(PUB_KEY) && localStorage.getItem(PRIV_KEY));
}

export function isLoggedIn(): boolean {
  return Boolean(token && account);
}

/** true if this account still needs to set its real password (no keypair yet) */
export function mustSetPassword(): boolean {
  return localStorage.getItem(MUST_KEY) === '1';
}

export function setMustSetPassword(must: boolean): void {
  if (must) localStorage.setItem(MUST_KEY, '1');
  else localStorage.removeItem(MUST_KEY);
}

/** logged in and ready to do crypto (keys available) */
export function isUnlocked(): boolean {
  return isLoggedIn() && !mustSetPassword() && hasStoredKeys();
}

export function setToken(t: string): void {
  token = t;
  localStorage.setItem(TOKEN_KEY, t);
}

export function setAccount(a: Account): void {
  account = a;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
}

export function setKeys(k: KeyPair): void {
  keys = k;
  keysDecoded = true;
  localStorage.setItem(PUB_KEY, toB64(k.publicKey));
  localStorage.setItem(PRIV_KEY, toB64(k.privateKey));
}

/** The password-wrapped (ciphertext) private key, stored so the owner's password
 *  can be verified OFFLINE (unwrap attempt) to gate the Hidden vault. Safe at
 *  rest — it's ciphertext, and the plaintext key is already persisted anyway. */
export function setWrappedPrivkey(wrapped: string): void {
  localStorage.setItem(WRAP_KEY, wrapped);
}

export function getWrappedPrivkey(): string | null {
  return localStorage.getItem(WRAP_KEY);
}

export function clearSession(): void {
  token = null;
  account = null;
  keys = null;
  keysDecoded = false;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(PUB_KEY);
  localStorage.removeItem(PRIV_KEY);
  localStorage.removeItem(WRAP_KEY);
  localStorage.removeItem(MUST_KEY);
}
