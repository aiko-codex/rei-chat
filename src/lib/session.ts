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

export interface Account {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

let token: string | null = localStorage.getItem(TOKEN_KEY);
let account: Account | null = readAccount();
let keys: KeyPair | null = readKeys();

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
  return keys;
}

export function isLoggedIn(): boolean {
  return Boolean(token && account);
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
  localStorage.setItem(PUB_KEY, toB64(k.publicKey));
  localStorage.setItem(PRIV_KEY, toB64(k.privateKey));
}

export function clearSession(): void {
  token = null;
  account = null;
  keys = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(PUB_KEY);
  localStorage.removeItem(PRIV_KEY);
}
