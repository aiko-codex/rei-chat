/**
 * Connection-keyed conversation client (2026-06-17 accounts pivot). Messages
 * and media are encrypted with the per-connection conversation key; the server
 * stores ciphertext only and tags each row with the sender's account user_id.
 *
 * This replaces the room-keyed paths in message-api.ts for the DM/conversation.
 */
import { SIGNAL_URL } from './config';
import { decryptBytesWith, decryptJsonWith, encryptBytesWith, encryptJsonWith, fromB64, toB64 } from './account-crypto';
import { getConversationKey } from './account-api';
import { getAccount, getToken } from './session';
import type { Message } from './types';

// conversation keys are opened once per connection and cached in memory
const keyCache = new Map<string, Uint8Array>();

async function convKey(connectionId: string): Promise<Uint8Array> {
  const cached = keyCache.get(connectionId);
  if (cached) return cached;
  const key = await getConversationKey(connectionId);
  keyCache.set(connectionId, key);
  return key;
}

/** clear cached keys (e.g. on logout) */
export function clearConversationKeys(): void {
  keyCache.clear();
}

function tokenParam(): string {
  const t = getToken();
  return t ? `&token=${encodeURIComponent(t)}` : '';
}

export interface RemoteConvMessage {
  seq: number;
  mine: boolean;
  message: Message;
}

interface HistoryRow {
  seq: number;
  id: string;
  sender: string;
  ciphertext: string;
}

/** encrypt + store a message for a connection. The local 'me'/'her' senderId is
 *  irrelevant on the wire — the server tags the row with our account user_id. */
export async function uploadConvMessage(connectionId: string, message: Message): Promise<boolean> {
  try {
    const key = await convKey(connectionId);
    // never persist a local object URL — media bytes ride media_upload
    const onWire: Message = message.media
      ? { ...message, media: { ...message.media, url: '' } }
      : message;
    const res = await fetch(`${SIGNAL_URL}?action=c_store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: getToken(),
        connectionId,
        id: message.id,
        ciphertext: encryptJsonWith(onWire, key),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** fetch + decrypt everything after `since`; undecryptable rows are skipped */
export async function fetchConvHistory(
  connectionId: string,
  since: number,
): Promise<{ messages: RemoteConvMessage[]; cursor: number }> {
  const key = await convKey(connectionId);
  const myId = getAccount()?.userId;
  const res = await fetch(
    `${SIGNAL_URL}?action=c_history&connectionId=${encodeURIComponent(connectionId)}&since=${since}${tokenParam()}`,
  );
  if (!res.ok) throw new Error(`c_history ${res.status}`);
  const data: { messages: HistoryRow[]; cursor: number } = await res.json();
  const out: RemoteConvMessage[] = [];
  for (const row of data.messages) {
    const message = decryptJsonWith<Message>(row.ciphertext, key);
    if (!message) continue;
    const mine = row.sender === myId;
    // re-stamp the local sender perspective so the UI renders correctly
    out.push({ seq: row.seq, mine, message: { ...message, senderId: mine ? 'me' : 'her' } });
  }
  return { messages: out, cursor: data.cursor };
}

/** unsend: remove a message (+ any media file) from a connection */
export async function removeConvMessage(connectionId: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${SIGNAL_URL}?action=c_remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), connectionId, id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** upload client-encrypted media bytes as a file on the server */
export async function uploadConvMedia(
  connectionId: string,
  id: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  try {
    const key = await convKey(connectionId);
    const raw = new Uint8Array(await blob.arrayBuffer());
    // secretbox of the whole blob → base64(nonce+box); send the raw bytes
    const sealed = fromB64(encryptBytesWith(raw, key));
    onProgress?.(0.1);
    const res = await fetch(
      `${SIGNAL_URL}?action=media_upload&connectionId=${encodeURIComponent(connectionId)}&id=${encodeURIComponent(id)}&mime=${encodeURIComponent(blob.type || 'application/octet-stream')}${tokenParam()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Blob([sealed as BlobPart]),
      },
    );
    onProgress?.(1);
    return res.ok;
  } catch {
    return false;
  }
}

// ── realtime: typing + long-poll for instant delivery ──────────────────────

/** set my typing flag for a connection (ephemeral, no content) */
export async function setConvTyping(connectionId: string, typing: boolean): Promise<void> {
  try {
    await fetch(`${SIGNAL_URL}?action=c_typing_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), connectionId, typing }),
    });
  } catch {
    /* best effort */
  }
}

/**
 * Long-poll a connection: resolves the moment a new message lands (instant
 * delivery) or the peer's typing flag changes, else after the server's poll
 * window. `sinceMsg` is the highest message seq the client already has.
 */
export async function pollConv(
  connectionId: string,
  sinceMsg: number,
): Promise<{ messages: boolean; cursor: number; peerTyping: boolean; peerOnline: boolean }> {
  const res = await fetch(
    `${SIGNAL_URL}?action=c_poll&connectionId=${encodeURIComponent(connectionId)}&sinceMsg=${sinceMsg}${tokenParam()}`,
  );
  if (!res.ok) throw new Error(`c_poll ${res.status}`);
  return res.json();
}

// ── shared channels / todos (conv_local) ───────────────────────────────────

export interface ConvLocalRow {
  seq: number;
  key: string;
  value: unknown; // null = tombstone
}

/** back up a shared channel/item for a connection (value null = tombstone) */
export async function uploadConvLocal(
  connectionId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  try {
    const ck = await convKey(connectionId);
    const ciphertext = value === null ? '' : encryptJsonWith(value, ck);
    const res = await fetch(`${SIGNAL_URL}?action=c_local_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), connectionId, key, ciphertext }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** tombstone a shared channel/item for a connection */
export function deleteConvLocal(connectionId: string, key: string): Promise<boolean> {
  return uploadConvLocal(connectionId, key, null);
}

/** pull + decrypt shared-channel rows after a seq cursor */
export async function fetchConvLocal(
  connectionId: string,
  since: number,
): Promise<{ rows: ConvLocalRow[]; cursor: number }> {
  const ck = await convKey(connectionId);
  const res = await fetch(
    `${SIGNAL_URL}?action=c_local&connectionId=${encodeURIComponent(connectionId)}&since=${since}${tokenParam()}`,
  );
  if (!res.ok) throw new Error(`c_local ${res.status}`);
  const data: { rows: Array<{ seq: number; key: string; ciphertext: string }>; cursor: number } =
    await res.json();
  const rows: ConvLocalRow[] = [];
  for (const r of data.rows) {
    rows.push({ seq: r.seq, key: r.key, value: r.ciphertext === '' ? null : decryptJsonWith(r.ciphertext, ck) });
  }
  return { rows, cursor: data.cursor };
}

// ── overlay (reactions + read receipts) ────────────────────────────────────

export interface ConvMetaRow {
  seq: number;
  mine: boolean;
  key: string;
  value: unknown;
}

/** store an encrypted overlay row (react:<id> → {e} | read → {at}) */
export async function uploadConvMeta(
  connectionId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  try {
    const ck = await convKey(connectionId);
    const res = await fetch(`${SIGNAL_URL}?action=c_meta_put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: getToken(),
        connectionId,
        key,
        ciphertext: encryptJsonWith(value, ck),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** pull + decrypt overlay rows after a seq cursor */
export async function fetchConvMeta(
  connectionId: string,
  since: number,
): Promise<{ rows: ConvMetaRow[]; cursor: number }> {
  const ck = await convKey(connectionId);
  const res = await fetch(
    `${SIGNAL_URL}?action=c_meta&connectionId=${encodeURIComponent(connectionId)}&since=${since}${tokenParam()}`,
  );
  if (!res.ok) throw new Error(`c_meta ${res.status}`);
  const data: { rows: Array<{ seq: number; mine: boolean; key: string; ciphertext: string }>; cursor: number } =
    await res.json();
  const rows: ConvMetaRow[] = [];
  for (const r of data.rows) {
    const value = decryptJsonWith<unknown>(r.ciphertext, ck);
    rows.push({ seq: r.seq, mine: r.mine, key: r.key, value });
  }
  return { rows, cursor: data.cursor };
}

/** download + decrypt a media file; null if unavailable */
export async function downloadConvMedia(
  connectionId: string,
  id: string,
  mimeType: string,
): Promise<Blob | null> {
  try {
    const key = await convKey(connectionId);
    const res = await fetch(
      `${SIGNAL_URL}?action=media_fetch&connectionId=${encodeURIComponent(connectionId)}&id=${encodeURIComponent(id)}${tokenParam()}`,
    );
    if (!res.ok) return null;
    const raw = new Uint8Array(await res.arrayBuffer());
    const bytes = decryptBytesWith(toB64(raw), key);
    if (!bytes) return null;
    return new Blob([bytes as BlobPart], { type: mimeType });
  } catch {
    return null;
  }
}
