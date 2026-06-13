/**
 * Encrypted conversation store on the PHP server. Plaintext never leaves
 * the device: messages are secretbox-encrypted before upload and decrypted
 * after download (crypto.ts). The server sees {room, sender deviceId,
 * message id, ciphertext} — nothing else.
 */
import { getRoomId, SIGNAL_URL } from './config';
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from './crypto';
import { getDeviceId } from './identity';
import type { Message } from './types';

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
