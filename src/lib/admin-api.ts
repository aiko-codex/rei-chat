/**
 * Admin client for the /admin panel. Auth = the admin password (separate from
 * user session tokens), sent via the X-Admin-Password header. The password is
 * held only in memory for the open panel session, never persisted.
 */
import { ADMIN_PUBLIC_KEY, SIGNAL_URL } from './config';
import { openSealedStringWithKeys, unwrapPrivateKey, wrapPrivateKey } from './account-crypto';
import { recoveryVerifier } from './recovery';

async function adminPost<T>(
  action: string,
  adminPassword: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${SIGNAL_URL}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
    body: JSON.stringify({ ...body, adminPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || `${action} ${res.status}`);
  return data as T;
}

/** plain POST (no admin/session auth) — for the public reset_begin/reset_finish */
async function plainPost<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SIGNAL_URL}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || `${action} ${res.status}`);
  return data as T;
}

export interface AdminAccount {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  mustSetPassword: boolean;
  disabled: boolean;
  createdAt: number;
}

export function listAccounts(adminPassword: string): Promise<{ accounts: AdminAccount[] }> {
  return adminPost('admin_list_accounts', adminPassword);
}

export function createAccount(
  adminPassword: string,
  input: { username: string; displayName: string; email?: string; tempPassword: string },
): Promise<{ ok: boolean; userId: string; username: string }> {
  return adminPost('admin_create_account', adminPassword, input);
}

export function setAccountDisabled(
  adminPassword: string,
  userId: string,
  disabled: boolean,
): Promise<{ ok: boolean }> {
  return adminPost('admin_set_disabled', adminPassword, { userId, disabled });
}

/**
 * Fetch the sealed escrow blob (`admin_wrap`) for an account — the account's
 * recovery key, sealed to the OFFLINE admin escrow public key. The server never
 * opens it; the admin unseals it client-side with the offline escrow PRIVATE key
 * (openSealedStringWithKeys) to recover the user's recovery key. 404s with
 * 'no admin escrow on file' for accounts created before escrow was configured.
 */
export function getAdminRecovery(
  adminPassword: string,
  identifier: string,
): Promise<{ userId: string; adminWrap: string }> {
  return adminPost('admin_get_recovery', adminPassword, { identifier });
}

/**
 * Reset ANY account's password from the admin side — KEYPAIR-PRESERVING, so no
 * chats are lost. Drives the same crypto as the user's own "Forgot password"
 * flow, but sources the recovery key from the OFFLINE escrow key instead of the
 * user, and never touches the admin's own local session:
 *   1. unseal the account's recovery key from its escrow blob (escrow priv key)
 *   2. fetch + unwrap the account private key with that recovery key
 *   3. re-wrap the SAME private key under the new password, prove recovery-key
 *      knowledge via the one-way verifier, and upload it.
 * The user's other devices are signed out (a reset kills sessions); their data
 * is intact (pubkey unchanged → every sealed conversation key still opens).
 * Requires the account to have an escrow blob (created at first-login set-password
 * once VITE_ADMIN_PUBLIC_KEY is configured).
 */
export async function adminResetPassword(
  adminProof: string,
  escrowPrivKeyB64: string,
  identifier: string,
  newPassword: string,
): Promise<void> {
  const priv = escrowPrivKeyB64.trim();
  if (!priv) throw new Error('Admin escrow key not loaded.');
  const { adminWrap } = await getAdminRecovery(adminProof, identifier);
  const recoveryKey = openSealedStringWithKeys(adminWrap, ADMIN_PUBLIC_KEY, priv);
  if (!recoveryKey) throw new Error("Couldn't unseal recovery key — wrong escrow key for this deployment.");
  const begin = await plainPost<{ userId: string; pubkey: string; recoveryWrap: string }>('reset_begin', {
    identifier,
  });
  const accountPriv = unwrapPrivateKey(begin.recoveryWrap, recoveryKey);
  if (!accountPriv) throw new Error('Recovery data mismatch — could not unlock the account key.');
  const wrapped = wrapPrivateKey(accountPriv, newPassword);
  await plainPost('reset_finish', {
    userId: begin.userId,
    recoveryVerifier: recoveryVerifier(recoveryKey),
    newPassword,
    wrappedPrivkey: wrapped,
  });
}
