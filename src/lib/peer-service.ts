/**
 * App-level singleton owning the live P2P connection — runs for the whole
 * session (not per screen) so messages, typing, and profile exchange keep
 * working from any screen. Feeds the chat store directly.
 *
 * Reliability: sent messages stay in an outbox until the peer acks them;
 * the outbox is flushed on every (re)connect, and history re-syncs from the
 * encrypted server store at the same time.
 */
import { PeerChat } from './webrtc';
import { getIceServers, getRoomId, isPaired, SIGNAL_URL } from './config';
import { putBlob } from './db';
import { useChatStore } from '@/store/chat-store';
import { useCallStore } from '@/store/call-store';
import { useVoiceRoomStore } from '@/store/voice-room-store';
import { DM_CHANNEL_ID, type Message, type Profile } from './types';

/** call control frames (the media itself rides RTP tracks, not the channel) */
export type CallFrame =
  | { kind: 'call-offer'; callType: 'voice' | 'video' }
  | { kind: 'call-accept' }
  | { kind: 'call-decline' }
  | { kind: 'call-end' };

/** voice-channel presence frames (Discord-style always-open audio room) */
export type VoiceFrame =
  | { kind: 'vc-join' } // I just joined
  | { kind: 'vc-here' } // reply: I'm already here (avoids announce loops)
  | { kind: 'vc-leave' };

/** frames exchanged over the chat data channel */
type ChatFrame =
  | { kind: 'message'; message: Message }
  | { kind: 'ack'; id: string }
  | { kind: 'typing'; typing: boolean }
  | { kind: 'remove'; id: string }
  | { kind: 'profile'; profile: Profile }
  // announces a media transfer; the bytes follow over the binary media channel
  | { kind: 'media-meta'; message: Message }
  | CallFrame
  | VoiceFrame;

function asChatFrame(data: unknown): ChatFrame | null {
  if (typeof data !== 'object' || data === null) return null;
  const f = data as ChatFrame;
  if (f.kind === 'message' && typeof f.message === 'object') return f;
  if (f.kind === 'ack' && typeof f.id === 'string') return f;
  if (f.kind === 'typing' && typeof f.typing === 'boolean') return f;
  if (f.kind === 'remove' && typeof f.id === 'string') return f;
  if (f.kind === 'profile' && typeof f.profile === 'object') return f;
  if (f.kind === 'media-meta' && typeof f.message === 'object') return f;
  if (f.kind === 'call-offer' && (f.callType === 'voice' || f.callType === 'video')) return f;
  if (f.kind === 'call-accept' || f.kind === 'call-decline' || f.kind === 'call-end') return f;
  if (f.kind === 'vc-join' || f.kind === 'vc-here' || f.kind === 'vc-leave') return f;
  return null;
}

const TYPING_EXPIRE_MS = 3000;
const TYPING_RESEND_MS = 1500;
const MEDIA_CHUNK_BYTES = 16384;

let peer: PeerChat | null = null;
let starting = false;
const outbox = new Map<string, Message>();
let typingExpire: ReturnType<typeof setTimeout> | null = null;
let lastTypingSent = 0;

/** receive-side reassembly: at most one transfer in flight (sender serializes) */
interface IncomingMedia {
  message: Message;
  size: number;
  parts: ArrayBuffer[];
  received: number;
}
let incoming: IncomingMedia | null = null;
// chunks that beat their meta frame (chat + media are separate SCTP streams)
let orphanChunks: ArrayBuffer[] = [];
// serialize outgoing transfers so their chunks don't interleave on the wire
let mediaSendQueue: Promise<void> = Promise.resolve();

function flushOutbox(p: PeerChat): void {
  const pending = [...outbox.values()].sort((a, b) => a.sentAt - b.sentAt);
  for (const message of pending) {
    p.sendChat({ kind: 'message', message } satisfies ChatFrame);
  }
}

export function startPeerService(): void {
  if (!SIGNAL_URL || peer || starting || !isPaired()) return;
  starting = true;
  const store = useChatStore.getState();

  // fetch (short-lived, server-minted) TURN creds before connecting so the
  // first ICE attempt has a relay candidate — STUN-only stalls on CGNAT/mobile
  void getIceServers().then((iceServers) => {
    starting = false;
    if (peer || !isPaired()) return; // stopped or already started during the await

  const p = new PeerChat(SIGNAL_URL, getRoomId(), {
    onStatus: (s) => {
      store.setStatus(s);
      if (s === 'connected') {
        // she sees the name I typed on my device — and vice versa
        const profile = useChatStore.getState().myProfile;
        if (profile) p.sendChat({ kind: 'profile', profile } satisfies ChatFrame);
        flushOutbox(p);
        // catch anything that went through the server while we were apart
        void store.syncHistory();
        void store.syncMeta();
        void store.syncLocal();
      } else {
        store.setPeerTyping(false);
      }
    },
    onChat: (data) => {
      const frame = asChatFrame(data);
      if (!frame) return;
      switch (frame.kind) {
        case 'message': {
          // always ack — the sender may have missed our previous ack
          p.sendChat({ kind: 'ack', id: frame.message.id } satisfies ChatFrame);
          store.setPeerTyping(false);
          // the sender labels messages from their own perspective — flip it
          store.upsert({
            ...frame.message,
            channelId: DM_CHANNEL_ID,
            senderId: 'her',
            status: 'delivered',
          });
          break;
        }
        case 'ack': {
          // text lives in the outbox; media doesn't — mark delivered either way
          outbox.delete(frame.id);
          store.markDelivered(frame.id);
          break;
        }
        case 'media-meta': {
          incoming = {
            message: frame.message,
            size: frame.message.media?.size ?? 0,
            parts: [],
            received: 0,
          };
          // drain any chunks that arrived ahead of this meta
          const early = orphanChunks;
          orphanChunks = [];
          for (const c of early) acceptChunk(c);
          break;
        }
        case 'remove': {
          // peer unsent a message — drop our local copy too
          store.remove(frame.id);
          break;
        }
        case 'profile': {
          store.setPeerProfile(frame.profile);
          break;
        }
        case 'typing': {
          store.setPeerTyping(frame.typing);
          if (typingExpire) clearTimeout(typingExpire);
          if (frame.typing) {
            // expire on our own clock in case the final "stopped" frame is lost
            typingExpire = setTimeout(() => store.setPeerTyping(false), TYPING_EXPIRE_MS);
          }
          break;
        }
        case 'call-offer':
          useCallStore.getState().receiveOffer(frame.callType);
          break;
        case 'call-accept':
          useCallStore.getState().remoteAccepted();
          break;
        case 'call-decline':
          useCallStore.getState().remoteDeclined();
          break;
        case 'call-end':
          useCallStore.getState().remoteEnded();
          break;
        case 'vc-join':
          useVoiceRoomStore.getState().onPeerJoin();
          break;
        case 'vc-here':
          useVoiceRoomStore.getState().onPeerHere();
          break;
        case 'vc-leave':
          useVoiceRoomStore.getState().onPeerLeave();
          break;
      }
    },
    onMediaChunk: (chunk) => acceptChunk(chunk),
    onDiag: (diag) => store.setConnDiag(diag),
    onTrack: (stream) => {
      // a 1:1 call and the voice room can't run at once — route the remote
      // stream to whichever is active (call takes precedence)
      if (useCallStore.getState().state !== 'idle') {
        useCallStore.getState().setRemoteStream(stream);
      } else {
        useVoiceRoomStore.getState().setRemoteStream(stream);
      }
    },
  }, iceServers);
  peer = p;
  void p.start();
  });
}

/** append a received binary chunk; finalize once we have the whole payload */
function acceptChunk(chunk: ArrayBuffer): void {
  if (!incoming) {
    orphanChunks.push(chunk);
    return;
  }
  incoming.parts.push(chunk);
  incoming.received += chunk.byteLength;
  if (incoming.received >= incoming.size) finalizeIncoming();
}

async function finalizeIncoming(): Promise<void> {
  const job = incoming;
  incoming = null;
  if (!job || !job.message.media) return;
  const { message } = job;
  const blob = new Blob(job.parts, { type: message.media!.mimeType });
  await putBlob(message.id, blob);
  const store = useChatStore.getState();
  store.upsert({
    ...message,
    channelId: DM_CHANNEL_ID,
    senderId: 'her',
    status: 'delivered',
    media: { ...message.media!, url: URL.createObjectURL(blob) },
  });
  // tell the sender it landed (reuses the text ack path)
  peer?.sendChat({ kind: 'ack', id: message.id } satisfies ChatFrame);
}

export function stopPeerService(): void {
  peer?.close();
  peer = null;
  starting = false;
  if (typingExpire) clearTimeout(typingExpire);
  const store = useChatStore.getState();
  store.setStatus('offline');
  store.setPeerTyping(false);
}

/** queues for resend until acked; returns true if it left over the channel now */
export function sendPeerMessage(message: Message): boolean {
  if (!SIGNAL_URL) return false;
  outbox.set(message.id, message);
  return peer?.sendChat({ kind: 'message', message } satisfies ChatFrame) ?? false;
}

/**
 * Send a media message: a meta frame over the chat channel, then the raw
 * bytes chunked over the binary media channel (paced by backpressure).
 * Transfers are queued so their chunks never interleave. Returns false if
 * the peer/media channel isn't ready (caller leaves it for the server backup).
 */
export function sendPeerMedia(message: Message, blob: Blob): boolean {
  if (!SIGNAL_URL || !peer?.mediaReady) return false;
  const p = peer;
  mediaSendQueue = mediaSendQueue.then(async () => {
    if (!p.mediaReady) return;
    // never ship the local object URL — the receiver builds its own
    const meta: Message = { ...message, media: { ...message.media!, url: '' } };
    p.sendChat({ kind: 'media-meta', message: meta } satisfies ChatFrame);
    const buf = await blob.arrayBuffer();
    for (let off = 0; off < buf.byteLength; off += MEDIA_CHUNK_BYTES) {
      if (!p.mediaReady) return;
      await p.waitForMediaDrain();
      p.sendMediaChunk(buf.slice(off, off + MEDIA_CHUNK_BYTES));
    }
  });
  return true;
}

/** true if the data channel is open (a call can only run over a live connection) */
export function isPeerConnected(): boolean {
  return peer?.connected ?? false;
}

/** send a call control frame (offer/accept/decline/end) */
export function sendCallFrame(frame: CallFrame): void {
  peer?.sendChat(frame satisfies ChatFrame);
}

/** send a voice-room presence frame (join/here/leave) */
export function sendVoiceFrame(frame: VoiceFrame): void {
  peer?.sendChat(frame satisfies ChatFrame);
}

/** add our mic/camera tracks to the live connection (renegotiates) */
export function addCallStream(stream: MediaStream): void {
  peer?.addCallStream(stream);
}

/** remove our call tracks at hang-up (renegotiates back to data-only) */
export function stopCallTracks(): void {
  peer?.stopCallTracks();
}

/** tell the peer to drop their local copy (unsend); best effort if offline */
export function sendPeerRemove(id: string): void {
  peer?.sendChat({ kind: 'remove', id } satisfies ChatFrame);
}

/** push my profile to the peer (call after editing it) */
export function sendPeerProfile(profile: Profile): void {
  peer?.sendChat({ kind: 'profile', profile } satisfies ChatFrame);
}

/** call on every keystroke (throttled here) and with false when the input empties/sends */
export function sendPeerTyping(typing: boolean): void {
  if (!peer?.connected) return;
  const now = Date.now();
  if (typing && now - lastTypingSent < TYPING_RESEND_MS) return;
  lastTypingSent = typing ? now : 0;
  peer.sendChat({ kind: 'typing', typing } satisfies ChatFrame);
}
