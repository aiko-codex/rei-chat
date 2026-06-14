/** Local message cache (plaintext, this device only) — IndexedDB via idb. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Channel, Message } from './types';

interface ReiDB extends DBSchema {
  messages: {
    key: string;
    value: Message;
    indexes: { bySentAt: number };
  };
  channels: {
    key: string;
    value: Channel;
  };
  meta: {
    key: string;
    value: number;
  };
  /** media payloads (photos/files/voice), keyed by message id — the message
   *  row holds only the metadata; the Blob lives here so it survives reload */
  blobs: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<ReiDB>> | null = null;

function db(): Promise<IDBPDatabase<ReiDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ReiDB>('rei-chat', 3, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const store = d.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('bySentAt', 'sentAt');
          d.createObjectStore('meta');
        }
        if (oldVersion < 2) {
          d.createObjectStore('channels', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          d.createObjectStore('blobs');
        }
      },
    });
  }
  return dbPromise;
}

export async function loadChannels(): Promise<Channel[]> {
  return (await db()).getAll('channels');
}

export async function putChannel(channel: Channel): Promise<void> {
  await (await db()).put('channels', channel);
}

export async function deleteChannel(id: string): Promise<void> {
  await (await db()).delete('channels', id);
}

export async function loadMessages(): Promise<Message[]> {
  return (await db()).getAllFromIndex('messages', 'bySentAt');
}

export async function putMessage(message: Message): Promise<void> {
  await (await db()).put('messages', message);
}

export async function deleteMessage(id: string): Promise<void> {
  const d = await db();
  await d.delete('messages', id);
  await d.delete('blobs', id);
}

export async function clearMessages(): Promise<void> {
  const d = await db();
  await d.clear('messages');
  await d.clear('blobs');
}

export async function deleteMessagesForChannel(channelId: string): Promise<void> {
  const d = await db();
  const all = await d.getAll('messages');
  const tx = d.transaction(['messages', 'blobs'], 'readwrite');
  for (const m of all) {
    if (m.channelId === channelId) {
      void tx.objectStore('messages').delete(m.id);
      void tx.objectStore('blobs').delete(m.id);
    }
  }
  await tx.done;
}

/** persist a media payload alongside its message row */
export async function putBlob(id: string, blob: Blob): Promise<void> {
  await (await db()).put('blobs', blob, id);
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await db()).get('blobs', id);
}

/** all stored media blobs, keyed by message id — used to rebuild object URLs on load */
export async function loadBlobs(): Promise<Map<string, Blob>> {
  const d = await db();
  const keys = await d.getAllKeys('blobs');
  const values = await d.getAll('blobs');
  const map = new Map<string, Blob>();
  keys.forEach((k, i) => map.set(k, values[i]));
  return map;
}

/** server history cursor (last seen seq) */
export async function getHistoryCursor(): Promise<number> {
  return (await (await db()).get('meta', 'history-cursor')) ?? 0;
}

export async function setHistoryCursor(seq: number): Promise<void> {
  await (await db()).put('meta', seq, 'history-cursor');
}

/** server overlay cursor (reactions + read receipts, last seen seq) */
export async function getMetaCursor(): Promise<number> {
  return (await (await db()).get('meta', 'meta-cursor')) ?? 0;
}

export async function setMetaCursor(seq: number): Promise<void> {
  await (await db()).put('meta', seq, 'meta-cursor');
}

/** personal-channel/todo backup cursor (last seen seq) */
export async function getLocalCursor(): Promise<number> {
  return (await (await db()).get('meta', 'local-cursor')) ?? 0;
}

export async function setLocalCursor(seq: number): Promise<void> {
  await (await db()).put('meta', seq, 'local-cursor');
}
