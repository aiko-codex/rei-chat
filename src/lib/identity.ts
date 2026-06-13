/** Stable per-device id — lets the server tag ciphertext rows with a sender
 *  without any account, and lets each client tell "mine" from "hers". */
const KEY = 'rei-device-id';

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(KEY, id);
  }
  return id;
}
