/**
 * Admin client for the /admin panel. Auth = the admin password (separate from
 * user session tokens), sent via the X-Admin-Password header. The password is
 * held only in memory for the open panel session, never persisted.
 */
import { SIGNAL_URL } from './config';

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
