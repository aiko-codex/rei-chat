/**
 * Peer-to-peer chat connection: one RTCPeerConnection with a 'chat' data
 * channel, negotiated over the PHP signaling endpoint using the
 * "perfect negotiation" pattern (polite peer = lower clientId).
 *
 * Content flows only over the data channel (DTLS-encrypted, E2E) —
 * the signaling server sees SDP/ICE envelopes only.
 */

import { SignalingClient, type SignalEnvelope } from './signaling';

export type PeerStatus = 'offline' | 'connecting' | 'connected';

export interface ConnDiag {
  /** how the media flows: 'relay (TURN)' | 'direct (STUN)' | 'direct (LAN)' */
  path: string;
  /** ms from announcing ourselves to the data channel opening */
  ms: number;
}

export interface PeerChatCallbacks {
  onStatus: (status: PeerStatus) => void;
  onChat: (data: unknown) => void;
  /** raw binary media chunk (in order) over the dedicated media channel */
  onMediaChunk?: (chunk: ArrayBuffer) => void;
  /** connection diagnostics emitted once the channel opens */
  onDiag?: (diag: ConnDiag) => void;
  /** remote audio/video stream during a call */
  onTrack?: (stream: MediaStream) => void;
}

/** keep the media channel from buffering an unbounded amount in memory */
const MEDIA_BUFFER_HIGH = 1_000_000; // 1 MB
const MEDIA_BUFFER_LOW = 256_000; // resume sending below this

/**
 * Tune the Opus audio codec in an SDP for clear, gap-free voice:
 *  - useinbandfec=1  → forward error correction recovers lost packets
 *    (kills the choppy/cut-out feeling on lossy/cellular/TURN paths)
 *  - usedtx=0        → no discontinuous transmission, so quiet speech and
 *    word onsets aren't clipped by silence suppression
 *  - maxaveragebitrate + cbr → fuller, steadier voice
 * Applied to both the offer and the answer so both directions benefit.
 */
function tuneOpusAudio(sdp: string | undefined): string | undefined {
  if (!sdp) return sdp;
  const rtpmap = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];
  const want: Record<string, string> = {
    useinbandfec: '1',
    usedtx: '0',
    stereo: '0',
    maxaveragebitrate: '48000',
    cbr: '1',
    minptime: '10',
  };
  const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const merge = (existing: string) => {
    const params: Record<string, string> = {};
    for (const kv of existing.split(';')) {
      const [k, v] = kv.split('=');
      if (k) params[k.trim()] = (v ?? '').trim();
    }
    Object.assign(params, want);
    return Object.entries(params)
      .map(([k, v]) => (v === '' ? k : `${k}=${v}`))
      .join(';');
  };
  if (fmtp.test(sdp)) {
    return sdp.replace(fmtp, (_m, params) => `a=fmtp:${pt} ${merge(params)}`);
  }
  const desired = Object.entries(want)
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
  return sdp.replace(rtpmap[0], `${rtpmap[0]}\r\na=fmtp:${pt} ${desired}`);
}

export class PeerChat {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private mediaChannel: RTCDataChannel | null = null;
  private callSenders: RTCRtpSender[] = [];
  private signaling: SignalingClient;
  private peerId: string | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;

  constructor(
    endpoint: string,
    room: string,
    private readonly cb: PeerChatCallbacks,
    private readonly iceServers: RTCIceServer[],
  ) {
    this.signaling = new SignalingClient(endpoint, room, (s) => void this.handleSignal(s));
  }

  private negotiateStart = 0;

  async start(): Promise<void> {
    this.cb.onStatus('connecting');
    this.negotiateStart = Date.now();
    await this.signaling.start();
    // StrictMode double-mount: the first instance may be closed before
    // this point — never announce a dead client to the room
    if (this.closed) return;
    // announce ourselves; whoever is already in the room answers with hello-ack
    await this.signaling.send('hello', null);
  }

  close(): void {
    this.closed = true;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.signaling.stop();
    this.channel?.close();
    this.mediaChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.channel = null;
    this.mediaChannel = null;
    this.callSenders = [];
  }

  /** true if the message was sent over the open channel */
  sendChat(data: unknown): boolean {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(data));
    return true;
  }

  /** send one binary media chunk; false if the media channel isn't open */
  sendMediaChunk(chunk: ArrayBuffer): boolean {
    if (this.mediaChannel?.readyState !== 'open') return false;
    this.mediaChannel.send(chunk);
    return true;
  }

  /** resolves once the media channel has drained below the low-water mark,
   *  so a large transfer can pace itself instead of ballooning memory */
  async waitForMediaDrain(): Promise<void> {
    const ch = this.mediaChannel;
    if (!ch || ch.bufferedAmount < MEDIA_BUFFER_HIGH) return;
    await new Promise<void>((resolve) => {
      const onLow = () => {
        ch.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      ch.addEventListener('bufferedamountlow', onLow);
    });
  }

  /** add local mic/camera tracks for a call — triggers renegotiation */
  addCallStream(stream: MediaStream): void {
    const pc = this.pc;
    if (!pc) return;
    for (const track of stream.getTracks()) {
      this.callSenders.push(pc.addTrack(track, stream));
    }
  }

  /** remove our call tracks at hang-up — triggers renegotiation back to data-only */
  stopCallTracks(): void {
    for (const sender of this.callSenders) {
      try {
        this.pc?.removeTrack(sender);
      } catch {
        // connection already torn down
      }
    }
    this.callSenders = [];
  }

  get connected(): boolean {
    return this.channel?.readyState === 'open';
  }

  get mediaReady(): boolean {
    return this.mediaChannel?.readyState === 'open';
  }

  /** polite peer yields on offer collisions; tie-broken by clientId */
  private get polite(): boolean {
    return this.peerId !== null && this.signaling.clientId < this.peerId;
  }

  private setupPeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;
    // pre-gather candidates so they're ready the moment the offer is created
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceCandidatePoolSize: 1 });
    this.pc = pc;

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        const offer = await pc.createOffer();
        offer.sdp = tuneOpusAudio(offer.sdp);
        await pc.setLocalDescription(offer);
        await this.signaling.send('description', pc.localDescription);
      } finally {
        this.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      void this.signaling.send('candidate', candidate);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.cb.onStatus('connecting');
        if (pc.connectionState === 'failed') this.restart();
      }
    };
    pc.ontrack = ({ streams }) => {
      if (streams[0]) this.cb.onTrack?.(streams[0]);
    };
    pc.ondatachannel = ({ channel }) => {
      if (channel.label === 'media') this.attachMediaChannel(channel);
      else this.attachChannel(channel);
    };
    return pc;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.cb.onStatus('connected');
      void this.reportDiag();
    };
    channel.onclose = () => {
      if (!this.closed) this.cb.onStatus('connecting');
    };
    channel.onmessage = (e) => {
      try {
        this.cb.onChat(JSON.parse(e.data));
      } catch {
        // ignore malformed frames
      }
    };
  }

  private attachMediaChannel(channel: RTCDataChannel): void {
    this.mediaChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = MEDIA_BUFFER_LOW;
    channel.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this.cb.onMediaChunk?.(e.data);
    };
  }

  /** inspect the selected ICE candidate pair so the UI can show the path */
  private async reportDiag(): Promise<void> {
    const pc = this.pc;
    if (!pc || !this.cb.onDiag) return;
    try {
      const stats = await pc.getStats();
      let pair: RTCIceCandidatePairStats | undefined;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded') {
          const p = r as RTCIceCandidatePairStats & { nominated?: boolean };
          if (!pair || p.nominated) pair = p;
        }
      });
      let path = 'connected';
      if (pair) {
        const local = stats.get(pair.localCandidateId ?? '') as { candidateType?: string } | undefined;
        const remote = stats.get(pair.remoteCandidateId ?? '') as { candidateType?: string } | undefined;
        const relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
        const t = local?.candidateType;
        path = relayed
          ? 'relay (TURN)'
          : t === 'srflx' || t === 'prflx'
            ? 'direct (STUN)'
            : t === 'host'
              ? 'direct (LAN)'
              : 'direct';
      }
      this.cb.onDiag({ path, ms: this.negotiateStart ? Date.now() - this.negotiateStart : 0 });
    } catch {
      // stats unavailable — skip the diagnostic, connection still works
    }
  }

  private restart(): void {
    if (this.closed) return;
    this.pc?.close();
    this.pc = null;
    this.channel = null;
    this.mediaChannel = null;
    this.callSenders = [];
    // forget the peer so we can re-latch onto whoever answers next
    this.peerId = null;
    void this.signaling.send('hello', null);
  }

  /**
   * Latch onto a peer. Ghost clients (dev StrictMode double-mounts, stale
   * tabs) also send hellos — so we may only switch peers while we have no
   * connection attempt in flight; stuck attempts are cleared by a timer.
   */
  private adoptPeer(from: string): boolean {
    if (this.peerId === from) return true;
    if (this.pc !== null) return false; // negotiation in progress — don't trash it
    this.peerId = from;
    return true;
  }

  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  private armConnectTimeout(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      // negotiation went nowhere (e.g. we latched onto a dead client, or ICE
      // stalled) — fail fast and re-announce rather than waiting on the long
      // default; with TURN configured a clean connect is well under this
      if (!this.connected) this.restart();
    }, 6000);
  }

  private beginAsCaller(): void {
    // creating the channel triggers negotiationneeded → offer
    const pc = this.setupPeerConnection();
    if (!this.channel) {
      this.attachChannel(pc.createDataChannel('chat'));
    }
    if (!this.mediaChannel) {
      // dedicated binary channel for chunked photo/file/voice transfer
      this.attachMediaChannel(pc.createDataChannel('media'));
    }
  }

  private async handleSignal(signal: SignalEnvelope): Promise<void> {
    if (this.closed) return;

    switch (signal.type) {
      case 'hello': {
        if (this.connected || !this.adoptPeer(signal.from)) break;
        await this.signaling.send('hello-ack', null);
        // deterministic caller avoids double-offer glare on join
        if (!this.polite) this.beginAsCaller();
        this.armConnectTimeout();
        break;
      }
      case 'hello-ack': {
        if (this.connected || !this.adoptPeer(signal.from)) break;
        if (!this.polite) this.beginAsCaller();
        this.armConnectTimeout();
        break;
      }
      case 'description': {
        if (signal.from !== this.peerId) break;
        const description = signal.payload as RTCSessionDescriptionInit | null;
        if (!description) break;
        const pc = this.setupPeerConnection();
        const offerCollision =
          description.type === 'offer' &&
          (this.makingOffer || pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) break;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          const answer = await pc.createAnswer();
          answer.sdp = tuneOpusAudio(answer.sdp);
          await pc.setLocalDescription(answer);
          await this.signaling.send('description', pc.localDescription);
        }
        break;
      }
      case 'candidate': {
        if (signal.from !== this.peerId) break;
        const candidate = signal.payload as RTCIceCandidateInit | null;
        if (!this.pc) break;
        try {
          await this.pc.addIceCandidate(candidate ?? undefined);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
        break;
      }
    }
  }
}
