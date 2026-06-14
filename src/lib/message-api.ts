/**
 * Encrypted conversation store on the PHP server. Plaintext never leaves
 * the device: messages are secretbox-encrypted before upload and decrypted
 * after download (crypto.ts). The server sees {room, sender deviceId,
 * message id, ciphertext} — nothing else.
 */
import { getRoomId, SIGNAL_URL } from './config';
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from './crypto';
import { getDeviceId } from './identity';
import type { Message, Profile } from './types';

/** raw bytes per encrypted media chunk (server caps the encoded request size) */
const MEDIA_CHUNK_BYTES = 256 * 1024;

interface HistoryRow {
  seq: number;
  id: string;
  sender: string;
  ciphertext: string;
}

export interface RemoteMessage {
  seq: number;
  mine: boolean;
  message: Message;
}

export async function uploadMessage(message: Message): Promise<boolean> {
  try {
    const res = await fetch(`${SIGNAL_URL}?action=store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: getRoomId(),
        deviceId: getDeviceId(),
        id: message.id,
        ciphertext: encryptJson(message),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** fetch + decrypt everything after `since`; undecryptable rows are skipped */
export async function fetchHistory(
  since: number,
): Promise<{ messages: RemoteMessage[]; cursor: number }> {
  const res = await fetch(
    `${SIGNAL_URL}?action=history&room=${encodeURIComponent(getRoomId())}&since=${since}`,
  );
  if (!res.ok) throw new Error(`history ${res.status}`);
  const data: { messages: HistoryRow[]; cursor: number } = await res.json();
  const deviceId = getDeviceId();
  const messages: RemoteMessage[] = [];
  for (const row of data.messages) {
    const message = decryptJson<Message>(row.ciphertext);
    if (message) {
      messages.push({ seq: row.seq, mine: row.sender === deviceId, message });
    }
  }
  return { messages, cursor: data.cursor };
}

/**
 * Back up a media payload to the server as encrypted chunks so it can be
 * restored on another device. Each chunk is secretbox-encrypted client-side;
 * the server only ever stores ciphertext. Best effort — false on any failure.
 */
export async function uploadMedia(
  id: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const total = Math.max(1, Math.ceil(buf.length / MEDIA_CHUNK_BYTES));
    for (let idx = 0; idx < total; idx++) {
      const slice = buf.subarray(idx * MEDIA_CHUNK_BYTES, (idx + 1) * MEDIA_CHUNK_BYTES);
      const res = await fetch(`${SIGNAL_URL}?action=media_put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: getRoomId(),
          deviceId: getDeviceId(),
          id,
          idx,
          total,
          ciphertext: encryptBytes(slice),
        }),
      });
      if (!res.ok) return false;
      onProgress?.((idx + 1) / total);
    }
    return true;
  } catch {
    return false;
  }
}

/** download + decrypt all chunks for a media message; null if unavailable */
export async function downloadMedia(id: string, mimeType: string): Promise<Blob | null> {
  try {
    const room = encodeURIComponent(getRoomId());
    const parts: Uint8Array[] = [];
    let idx = 0;
    let total = 1;
    while (idx < total) {
      const res = await fetch(`${SIGNAL_URL}?action=media_get&room=${room}&id=${encodeURIComponent(id)}&idx=${idx}`);
      if (!res.ok) return null;
      const data: { idx: number; total: number; ciphertext: string } = await res.json();
      total = data.total;
      const bytes = decryptBytes(data.ciphertext);
      if (!bytes) return null;
      parts.push(bytes);
      idx++;
    }
    return new Blob(parts as BlobPart[], { type: mimeType });
  } catch {
    return null;
  }
}

export interface RemoteProfile {
  deviceId: string;
  mine: boolean;
  profile: Profile;
  updatedAt: number;
}

/**
 * Publish my profile (name, color, avatar image) to the server, encrypted.
 * This is what lets the peer see my name + picture immediately on load,
 * without waiting for a P2P connection. Best effort.
 */
export async function uploadProfile(profile: Profile): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=profile_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: getRoomId(),
        deviceId: getDeviceId(),
        ciphertext: encryptJson(profile),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** read + decrypt both devices' published profiles for this room. */
export async function fetchProfiles(): Promise<RemoteProfile[]> {
  if (!SIGNAL_URL) return [];
  try {
    const res = await fetch(
      `${SIGNAL_URL}?action=profiles&room=${encodeURIComponent(getRoomId())}`,
    );
    if (!res.ok) return [];
    const data: { profiles: Array<{ deviceId: string; ciphertext: string; updatedAt: number }> } =
      await res.json();
    const me = getDeviceId();
    const out: RemoteProfile[] = [];
    for (const row of data.profiles) {
      const profile = decryptJson<Profile>(row.ciphertext);
      if (profile) {
        out.push({ deviceId: row.deviceId, mine: row.deviceId === me, profile, updatedAt: row.updatedAt });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Per-message overlay state (reactions + read receipts) that has to survive a
 * peer being offline — so it lives on the encrypted server store like messages,
 * not just P2P. Keyed by (device, key): `react:<msgId>` holds one device's
 * reaction emoji; `read` holds that device's read high-water-mark. The value is
 * secretbox-encrypted client-side; the server only ever stores ciphertext.
 */
export interface RemoteMeta {
  seq: number;
  deviceId: string;
  mine: boolean;
  key: string;
  value: unknown;
}

/** publish one overlay row (best effort); REPLACE-upserts on (room, device, key) */
export async function uploadMeta(key: string, value: unknown): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=meta_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: getRoomId(),
        deviceId: getDeviceId(),
        key,
        ciphertext: encryptJson(value),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** fetch + decrypt overlay rows after `since`; undecryptable rows are skipped */
export async function fetchMeta(since: number): Promise<{ rows: RemoteMeta[]; cursor: number }> {
  if (!SIGNAL_URL) return { rows: [], cursor: since };
  try {
    const res = await fetch(
      `${SIGNAL_URL}?action=meta&room=${encodeURIComponent(getRoomId())}&since=${since}`,
    );
    if (!res.ok) return { rows: [], cursor: since };
    const data: { rows: Array<{ seq: number; deviceId: string; key: string; ciphertext: string }>; cursor: number } =
      await res.json();
    const me = getDeviceId();
    const rows: RemoteMeta[] = [];
    for (const row of data.rows) {
      const value = decryptJson<unknown>(row.ciphertext);
      if (value !== null) {
        rows.push({ seq: row.seq, deviceId: row.deviceId, mine: row.deviceId === me, key: row.key, value });
      }
    }
    return { rows, cursor: data.cursor };
  } catch {
    return { rows: [], cursor: since };
  }
}

/**
 * Encrypted backup of the personal channels + todos (device-local until now).
 * Room-keyed: both of the couple's devices converge and the data survives
 * losing a phone. Each item is `ch:<id>` (a Channel) or `msg:<id>` (a note /
 * todo row). `value === null` from fetchLocal means a tombstone (deleted).
 */
export interface RemoteLocalItem {
  seq: number;
  key: string;
  /** null = tombstone (the item was deleted) */
  value: unknown;
}

/** publish one personal-channel/todo backup item (best effort). */
export async function uploadLocalItem(key: string, value: unknown): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=local_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: getRoomId(), key, ciphertext: encryptJson(value) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** tombstone one backup item so the delete propagates and never resurrects. */
export async function deleteLocalItem(key: string): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=local_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: getRoomId(), key, ciphertext: '' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** fetch + decrypt backup rows after `since`; empty ciphertext → value null. */
export async function fetchLocal(since: number): Promise<{ rows: RemoteLocalItem[]; cursor: number }> {
  if (!SIGNAL_URL) return { rows: [], cursor: since };
  try {
    const res = await fetch(
      `${SIGNAL_URL}?action=local&room=${encodeURIComponent(getRoomId())}&since=${since}`,
    );
    if (!res.ok) return { rows: [], cursor: since };
    const data: { rows: Array<{ seq: number; key: string; ciphertext: string }>; cursor: number } =
      await res.json();
    const rows: RemoteLocalItem[] = [];
    for (const row of data.rows) {
      const value = row.ciphertext === '' ? null : decryptJson<unknown>(row.ciphertext);
      // a non-tombstone row that won't decrypt is dropped (don't treat as delete)
      if (row.ciphertext !== '' && value === null) continue;
      rows.push({ seq: row.seq, key: row.key, value });
    }
    return { rows, cursor: data.cursor };
  } catch {
    return { rows: [], cursor: since };
  }
}

/**
 * Collaboration invites. The channel name/kind/inviter ride inside the
 * ciphertext (shared-key encrypted); the server sees only a status + the
 * sending device. The invitee polls `fetchInvites`, then `respondInvite`.
 */
export async function sendInvite(channelId: string, payload: unknown): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=invite_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: getRoomId(),
        deviceId: getDeviceId(),
        channelId,
        ciphertext: encryptJson(payload),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface RemoteInvite {
  channelId: string;
  fromDevice: string;
  payload: unknown;
}

/** pending invites addressed to this device (i.e. sent by the other one). */
export async function fetchInvites(): Promise<RemoteInvite[]> {
  if (!SIGNAL_URL) return [];
  try {
    const res = await fetch(
      `${SIGNAL_URL}?action=invites&room=${encodeURIComponent(getRoomId())}&deviceId=${encodeURIComponent(getDeviceId())}`,
    );
    if (!res.ok) return [];
    const data: { invites: Array<{ channelId: string; fromDevice: string; ciphertext: string }> } =
      await res.json();
    const out: RemoteInvite[] = [];
    for (const row of data.invites) {
      const payload = decryptJson<unknown>(row.ciphertext);
      if (payload !== null) out.push({ channelId: row.channelId, fromDevice: row.fromDevice, payload });
    }
    return out;
  } catch {
    return [];
  }
}

export interface RemoteAccepted {
  channelId: string;
  payload: unknown;
}

/** invites this device sent that the peer has accepted (inviter-side notice). */
export async function fetchAccepted(): Promise<RemoteAccepted[]> {
  if (!SIGNAL_URL) return [];
  try {
    const res = await fetch(
      `${SIGNAL_URL}?action=accepted&room=${encodeURIComponent(getRoomId())}&deviceId=${encodeURIComponent(getDeviceId())}`,
    );
    if (!res.ok) return [];
    const data: { accepted: Array<{ channelId: string; ciphertext: string }> } = await res.json();
    const out: RemoteAccepted[] = [];
    for (const row of data.accepted) {
      const payload = decryptJson<unknown>(row.ciphertext);
      if (payload !== null) out.push({ channelId: row.channelId, payload });
    }
    return out;
  } catch {
    return [];
  }
}

/** inviter acknowledges the acceptance — clears the server invite row. */
export async function ackInvite(channelId: string): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=invite_ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: getRoomId(), channelId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function respondInvite(channelId: string, status: 'accepted' | 'declined'): Promise<boolean> {
  if (!SIGNAL_URL) return false;
  try {
    const res = await fetch(`${SIGNAL_URL}?action=invite_respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: getRoomId(), channelId, status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface DeviceVersion {
  deviceId: string;
  mine: boolean;
  version: string;
  build: string;
  updatedAt: number;
}

/** record this device's running build in the server DB (best effort). */
export async function reportVersion(): Promise<void> {
  if (!SIGNAL_URL) return;
  try {
    await fetch(`${SIGNAL_URL}?action=version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: getRoomId(),
        deviceId: getDeviceId(),
        version: __APP_VERSION__,
        build: __BUILD_ID__,
      }),
    });
  } catch {
    // best effort — version tracking is non-critical
  }
}

/** read both devices' last-reported versions for this room. */
export async function fetchVersions(): Promise<DeviceVersion[]> {
  if (!SIGNAL_URL) return [];
  try {
    const res = await fetch(
      `${SIGNAL_URL}?action=versions&room=${encodeURIComponent(getRoomId())}`,
    );
    if (!res.ok) return [];
    const data: { devices: Array<{ deviceId: string; version: string; build: string; updatedAt: number }> } =
      await res.json();
    const me = getDeviceId();
    return data.devices.map((d) => ({ ...d, mine: d.deviceId === me }));
  } catch {
    return [];
  }
}

export async function removeRemoteMessage(id: string): Promise<void> {
  try {
    await fetch(`${SIGNAL_URL}?action=remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: getRoomId(), id }),
    });
  } catch {
    // best effort — a failed unsend leaves the ciphertext row behind
  }
}

/** Clear all server-side ciphertext for this room (housekeeping) */
export async function clearServerCiphertext(): Promise<boolean> {
  try {
    const res = await fetch(`${SIGNAL_URL}?action=wipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: getRoomId() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
