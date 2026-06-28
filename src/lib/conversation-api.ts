/**
 * Connection-keyed conversation client (2026-06-17 accounts pivot). Messages
 * and media are encrypted with the per-connection conversation key; the server
 * stores ciphertext only and tags each row with the sender's account user_id.
 *
 * This replaces the room-keyed paths in message-api.ts for the DM/conversation.
 */
import { SIGNAL_URL } from './config';
import {
  createMediaDecryptor,
  createMediaEncryptor,
  decryptBytesRawWith,
  decryptJsonWith,
  encryptJsonWith,
  fromB64,
  toB64,
} from './account-crypto';
import { getConversationKey } from './account-api';
import { getAccount, getToken } from './session';
import type { Message } from './types';

// conversation keys are opened once per connection and cached in memory
const keyCache = new Map<string, Uint8Array>();

// plaintext bytes per media chunk. Small enough that one request stays well
// under any shared-host post_max_size and only one chunk is ever held in memory.
const MEDIA_CHUNK_SIZE = 1024 * 1024; // 1 MiB

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
    // never persist a local object URL — media bytes ride media_upload. EXCEPT
    // remote media (e.g. a Giphy GIF/sticker): its url is a public CDN link with
    // no uploaded bytes, so it must survive the round-trip or it can't render.
    const onWire: Message =
      message.media && !message.media.remote
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

/**
 * Upload client-encrypted media as a sequence of crypto_secretstream chunks.
 * Each ~1 MiB plaintext slice is encrypted and POSTed on its own (so no single
 * request is large and peak memory stays tiny), then `media_finish` writes the
 * manifest — the receiver can only fetch once that exists. Returns false if any
 * chunk fails, so the caller marks the message "failed · tap to retry" (a retry
 * re-runs the whole upload idempotently).
 */
export async function uploadConvMedia(
  connectionId: string,
  id: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  try {
    const key = await convKey(connectionId);
    const enc = createMediaEncryptor(key);
    const total = Math.max(1, Math.ceil(blob.size / MEDIA_CHUNK_SIZE));
    onProgress?.(0.02);
    for (let i = 0; i < total; i++) {
      const start = i * MEDIA_CHUNK_SIZE;
      // slice → only this one chunk's bytes are ever resident in memory
      const plain = new Uint8Array(await blob.slice(start, start + MEDIA_CHUNK_SIZE).arrayBuffer());
      const cipher = enc.push(plain, i === total - 1);
      const res = await fetch(
        `${SIGNAL_URL}?action=media_chunk_put&connectionId=${encodeURIComponent(connectionId)}&id=${encodeURIComponent(id)}&idx=${i}${tokenParam()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Blob([cipher as BlobPart]),
          cache: 'no-store',
        },
      );
      if (!res.ok) return false;
      onProgress?.((i + 1) / (total + 1));
    }
    const res = await fetch(`${SIGNAL_URL}?action=media_finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: getToken(),
        connectionId,
        id,
        mime: blob.type || 'application/octet-stream',
        total,
        header: toB64(enc.header),
        size: blob.size,
      }),
    });
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

/**
 * Download + decrypt a media file; null if unavailable.
 *
 * `chunked` tells us which storage path to use:
 *   true       → chunked (media_manifest + media_chunk_get, crypto_secretstream)
 *   false      → legacy whole-file (media_fetch, single secretbox)
 *   undefined  → unknown (a message predating the flag): try chunked, then fall
 *                back to legacy, so old photos keep loading.
 *
 * Every request is `cache: 'no-store'` + a unique `t`: an installed iOS
 * standalone PWA caches cross-origin GETs aggressively, so a transient 404 (we
 * polled a beat before her upload committed) would otherwise be replayed from
 * cache forever → the bubble stuck on "Loading…". Forcing a fresh hit fixes it.
 */
export async function downloadConvMedia(
  connectionId: string,
  id: string,
  mimeType: string,
  chunked?: boolean,
): Promise<Blob | null> {
  try {
    const key = await convKey(connectionId);
    if (chunked !== false) {
      const mres = await fetch(
        `${SIGNAL_URL}?action=media_manifest&connectionId=${encodeURIComponent(connectionId)}&id=${encodeURIComponent(id)}${tokenParam()}&t=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (mres.ok) {
        const manifest: { total: number; header: string; mime: string } = await mres.json();
        const dec = createMediaDecryptor(fromB64(manifest.header), key);
        if (!dec) return null;
        const parts: Uint8Array[] = [];
        for (let i = 0; i < manifest.total; i++) {
          const cres = await fetch(
            `${SIGNAL_URL}?action=media_chunk_get&connectionId=${encodeURIComponent(connectionId)}&id=${encodeURIComponent(id)}&idx=${i}${tokenParam()}&t=${Date.now()}`,
            { cache: 'no-store' },
          );
          if (!cres.ok) return null;
          const plain = dec.pull(new Uint8Array(await cres.arrayBuffer()));
          if (!plain) return null; // corrupt / out-of-order / forged chunk
          parts.push(plain);
        }
        return new Blob(parts as BlobPart[], { type: mimeType || manifest.mime || 'application/octet-stream' });
      }
      if (chunked === true) return null; // known-chunked but manifest missing
    }
    // legacy whole-file media (single secretbox blob)
    const res = await fetch(
      `${SIGNAL_URL}?action=media_fetch&connectionId=${encodeURIComponent(connectionId)}&id=${encodeURIComponent(id)}${tokenParam()}&t=${Date.now()}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const bytes = decryptBytesRawWith(new Uint8Array(await res.arrayBuffer()), key);
    if (!bytes) return null;
    return new Blob([bytes as BlobPart], { type: mimeType });
  } catch {
    return null;
  }
}

/** fetch unsent-message tombstones after a seq cursor */
export async function fetchConvDeletes(
  connectionId: string,
  since: number,
): Promise<{ ids: string[]; cursor: number }> {
  const res = await fetch(
    `${SIGNAL_URL}?action=c_deletes&connectionId=${encodeURIComponent(connectionId)}&since=${since}${tokenParam()}`,
  );
  if (!res.ok) return { ids: [], cursor: since };
  const data: { ids: string[]; cursor: number } = await res.json();
  return data;
}
