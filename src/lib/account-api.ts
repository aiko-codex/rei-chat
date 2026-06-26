/**
 * Client for the accounts-model server endpoints (2026-06-17 pivot).
 * Auth rides on `?token=` (Apache shared hosts often strip the Authorization
 * header, so we pass the token in the query/body instead).
 */
import { ADMIN_PUBLIC_KEY, SIGNAL_URL } from './config';
import {
  generateConversationKey,
  generateKeyPair,
  fromB64,
  openSealedKey,
  sealKeyTo,
  sealStringTo,
  toB64,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './account-crypto';
import { generateRecoveryKey, recoveryVerifier } from './recovery';
import {
  clearSession,
  getAccount,
  getKeys,
  getToken,
  getWrappedPrivkey,
  setAccount,
  setKeys,
  setMustSetPassword,
  setToken,
  setWrappedPrivkey,
  type Account,
} from './session';

function url(action: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ action, ...params });
  const t = getToken();
  if (t) q.set('token', t);
  return `${SIGNAL_URL}?${q.toString()}`;
}

async function postJson<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const t = getToken();
  const res = await fetch(`${SIGNAL_URL}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(t ? { ...body, token: t } : body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || `${action} ${res.status}`);
  return data as T;
}

async function getJson<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url(action, params));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || `${action} ${res.status}`);
  return data as T;
}

// ── auth ────────────────────────────────────────────────────────────────────

interface LoginResp {
  ok: boolean;
  token: string;
  mustSetPassword: boolean;
  account: Account;
  wrappedPrivkey: string | null;
  pubkey: string | null;
}

/**
 * Log in with username/email + password. On success the token + account are
 * stored. If the account already has a keypair, the private key is unwrapped
 * with the password and stored. Returns whether a first-login password set is
 * still required (keypair not yet created).
 */
export async function login(
  identifier: string,
  password: string,
): Promise<{ mustSetPassword: boolean }> {
  const data = await postJson<LoginResp>('login', { identifier, password });
  // clear any stale keys/account from a previously signed-in account on this device
  clearSession();
  setToken(data.token);
  setAccount(data.account);
  setMustSetPassword(data.mustSetPassword);
  if (!data.mustSetPassword && data.wrappedPrivkey && data.pubkey) {
    const priv = unwrapPrivateKey(data.wrappedPrivkey, password);
    if (!priv) throw new Error('could not unlock your keys (wrong password?)');
    setKeys({ publicKey: fromB64(data.pubkey), privateKey: priv });
    // keep the wrapped (ciphertext) key so the owner password can be re-verified
    // offline later (gates the Hidden vault) without another server round-trip
    setWrappedPrivkey(data.wrappedPrivkey);
  }
  return { mustSetPassword: data.mustSetPassword };
}

/**
 * Verify the entered password is the account owner's — used to gate the Hidden
 * vault. Tries OFFLINE first (unwrap the locally-stored wrapped private key);
 * falls back to a server `login` check (which also caches the wrapped key) for
 * accounts that logged in before the wrapped key was being stored. Does NOT
 * mutate the active session.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const wrapped = getWrappedPrivkey();
  if (wrapped) return unwrapPrivateKey(wrapped, password) !== null;
  const acct = getAccount();
  if (!acct) return false;
  try {
    const data = await postJson<LoginResp>('login', {
      identifier: acct.username,
      password,
    });
    if (data.wrappedPrivkey && unwrapPrivateKey(data.wrappedPrivkey, password)) {
      setWrappedPrivkey(data.wrappedPrivkey);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** the recovery blobs derived from a keypair + a fresh recovery key */
function buildRecoveryBlobs(
  privateKey: Uint8Array,
  recoveryKey: string,
): { recoveryWrap: string; recoveryVerifier: string; adminWrap?: string } {
  const blobs: { recoveryWrap: string; recoveryVerifier: string; adminWrap?: string } = {
    recoveryWrap: wrapPrivateKey(privateKey, recoveryKey),
    recoveryVerifier: recoveryVerifier(recoveryKey),
  };
  // escrow the RECOVERY KEY (not the privkey) to the offline admin key, so the
  // owner can recover a lost recovery key offline. Skipped if no admin key set.
  if (ADMIN_PUBLIC_KEY) blobs.adminWrap = sealStringTo(recoveryKey, ADMIN_PUBLIC_KEY);
  return blobs;
}

/**
 * First-login: generate the account keypair, set the real password, and upload
 * (pubkey plain, privkey wrapped under the new password). Also generates a
 * RECOVERY KEY — returned so the UI can show it once — and uploads the recovery
 * blobs so a forgotten password can later be reset without losing data.
 * Requires a live session from the temp-password login.
 */
export async function setPassword(newPassword: string): Promise<{ recoveryKey: string }> {
  const kp = generateKeyPair();
  const wrapped = wrapPrivateKey(kp.privateKey, newPassword);
  const recoveryKey = generateRecoveryKey();
  const recovery = buildRecoveryBlobs(kp.privateKey, recoveryKey);
  await postJson('set_password', {
    newPassword,
    pubkey: toB64(kp.publicKey),
    wrappedPrivkey: wrapped,
    ...recovery,
  });
  setKeys(kp);
  setWrappedPrivkey(wrapped);
  setMustSetPassword(false);
  return { recoveryKey };
}

/**
 * Set up (or rotate) account recovery for a logged-in user whose account
 * predates recovery, or who wants a fresh recovery key. Re-wraps the private
 * key the device already holds under a NEW recovery key. Returns the new key
 * to show once. Keypair is untouched.
 */
export async function setupRecovery(): Promise<{ recoveryKey: string }> {
  const keys = getKeys();
  if (!keys) throw new Error('keys not loaded');
  const recoveryKey = generateRecoveryKey();
  const recovery = buildRecoveryBlobs(keys.privateKey, recoveryKey);
  await postJson('setup_recovery', recovery);
  return { recoveryKey };
}

/**
 * Change the password for a logged-in user — KEYPAIR-PRESERVING. Re-wraps the
 * SAME private key under the new password (the pubkey is unchanged, so sealed
 * conversation keys keep working) and uploads it. Verifies the current password
 * offline first.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const keys = getKeys();
  if (!keys) throw new Error('keys not loaded');
  if (!(await verifyPassword(currentPassword))) {
    throw new Error('current password is incorrect');
  }
  const wrapped = wrapPrivateKey(keys.privateKey, newPassword);
  await postJson('change_password', { newPassword, wrappedPrivkey: wrapped });
  setWrappedPrivkey(wrapped);
}

interface ResetBeginResp {
  userId: string;
  pubkey: string;
  recoveryWrap: string;
}

/**
 * Forgotten-password reset (no session). Recovers the account private key with
 * the RECOVERY KEY, re-wraps it under a new password, and uploads it — the
 * keypair is preserved so no conversation data is lost. On success the new
 * session token + account are stored, exactly like a fresh login.
 *
 * Throws 'recovery key is incorrect' if the key can't open the wrapped privkey.
 */
export async function resetPassword(
  identifier: string,
  recoveryKey: string,
  newPassword: string,
): Promise<void> {
  // Step 1: fetch the wrapped privkey + pubkey for this account.
  const begin = await postJson<ResetBeginResp>('reset_begin', { identifier });
  // Step 2: locally unwrap the private key with the recovery key.
  const priv = unwrapPrivateKey(begin.recoveryWrap, recoveryKey);
  if (!priv) throw new Error('recovery key is incorrect');
  // Step 3: re-wrap under the new password; prove recovery-key knowledge via the
  // one-way verifier (the server never sees the recovery key itself).
  const wrapped = wrapPrivateKey(priv, newPassword);
  const data = await postJson<{ ok: boolean; token: string; account: Account }>('reset_finish', {
    userId: begin.userId,
    recoveryVerifier: recoveryVerifier(recoveryKey),
    newPassword,
    wrappedPrivkey: wrapped,
  });
  // adopt the new session + keys (same keypair → all sealed conv keys still open)
  clearSession();
  setToken(data.token);
  setAccount(data.account);
  setMustSetPassword(false);
  setKeys({ publicKey: fromB64(begin.pubkey), privateKey: priv });
  setWrappedPrivkey(wrapped);
}

/** live availability check for a candidate username (your own counts as free) */
export async function checkUsername(
  username: string,
): Promise<{ valid: boolean; available: boolean }> {
  return getJson<{ valid: boolean; available: boolean }>('username_available', { username });
}

/**
 * Update your own username (must be unique) and/or display name. Returns the
 * refreshed account, which is also written back into the session.
 */
export async function updateAccount(input: {
  username?: string;
  displayName?: string;
  avatar?: string;
}): Promise<Account> {
  const data = await postJson<{ ok: boolean; account: Account }>('update_account', input);
  setAccount(data.account);
  return data.account;
}

export async function logout(): Promise<void> {
  try {
    await postJson('logout', {});
  } catch {
    /* best effort */
  }
}

// ── discovery + connections ───────────────────────────────────────────────

export interface SearchResult {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export async function searchUsers(q: string): Promise<SearchResult[]> {
  const data = await getJson<{ results: SearchResult[] }>('user_search', { q });
  return data.results;
}

export interface Connection {
  connectionId: string;
  status: 'pending' | 'accepted';
  incoming: boolean;
  requestedByMe: boolean;
  updatedAt: number;
  account: SearchResult;
}

export async function listConnections(): Promise<Connection[]> {
  const data = await getJson<{ connections: Connection[] }>('connections');
  return data.connections;
}

export async function requestConnection(targetUserId: string): Promise<void> {
  await postJson('connect_request', { targetUserId });
}

async function fetchPubkey(userId: string): Promise<string> {
  const data = await getJson<{ pubkey: string }>('pubkey', { userId });
  return data.pubkey;
}

/**
 * Accept a connection request. Generates the conversation key and seals it to
 * BOTH members' public keys (mine + the other person's), so each can recover it.
 */
export async function acceptConnection(connectionId: string, otherUserId: string): Promise<void> {
  const myKeys = getKeys();
  if (!myKeys) throw new Error('keys not loaded');
  const otherPub = await fetchPubkey(otherUserId);
  const convKey = generateConversationKey();
  await postJson('connect_respond', {
    connectionId,
    accept: true,
    sealedKeyForSelf: sealKeyTo(convKey, toB64(myKeys.publicKey)),
    sealedKeyForOther: sealKeyTo(convKey, otherPub),
  });
}

export async function declineConnection(connectionId: string): Promise<void> {
  await postJson('connect_respond', { connectionId, accept: false });
}

/** fetch + open my sealed conversation key for an accepted connection */
export async function getConversationKey(connectionId: string): Promise<Uint8Array> {
  const myKeys = getKeys();
  if (!myKeys) throw new Error('keys not loaded');
  const data = await getJson<{ sealedKey: string }>('conv_key', { connectionId });
  const key = openSealedKey(data.sealedKey, myKeys);
  if (!key) throw new Error('could not open conversation key');
  return key;
}
