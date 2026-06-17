/**
 * Long-polling client for the PHP signaling endpoint.
 * Carries only WebRTC negotiation envelopes — never chat content.
 */
import { getDeviceId } from './identity';

export interface SignalEnvelope {
  id: number;
  from: string;
  type: string;
  payload: unknown;
}

/** accounts-mode signaling rides a connection + session token instead of a
 *  room + deviceId, hitting the `c_signal*` endpoints. */
export interface ConnectionAuth {
  connectionId: string;
  token: string;
}

export class SignalingClient {
  readonly clientId = crypto.randomUUID().replace(/-/g, '');
  private cursor = 0;
  private running = false;
  private abort: AbortController | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly room: string,
    private readonly onSignal: (signal: SignalEnvelope) => void,
    /** when set, use connection-keyed signaling (accounts mode) */
    private readonly conn: ConnectionAuth | null = null,
  ) {}

  async send(type: string, payload: unknown): Promise<void> {
    try {
      if (this.conn) {
        await fetch(`${this.endpoint}?action=c_signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: this.conn.token,
            connectionId: this.conn.connectionId,
            clientId: this.clientId,
            type,
            payload,
          }),
        });
        return;
      }
      await fetch(`${this.endpoint}?action=signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: this.room, deviceId: getDeviceId(), clientId: this.clientId, type, payload }),
      });
    } catch {
      // endpoint unreachable — peer stays in 'connecting'/'offline'
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    // ignore anything posted before we joined
    try {
      const url = this.conn
        ? `${this.endpoint}?action=c_signal_cursor&connectionId=${encodeURIComponent(this.conn.connectionId)}&token=${encodeURIComponent(this.conn.token)}`
        : `${this.endpoint}?action=cursor&room=${encodeURIComponent(this.room)}&deviceId=${encodeURIComponent(getDeviceId())}`;
      const res = await fetch(url);
      const data: { cursor: number } = await res.json();
      this.cursor = data.cursor;
    } catch {
      // endpoint unreachable — the poll loop will keep retrying
    }
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        this.abort = new AbortController();
        const url = this.conn
          ? `${this.endpoint}?action=c_signal_poll&connectionId=${encodeURIComponent(this.conn.connectionId)}` +
            `&token=${encodeURIComponent(this.conn.token)}&clientId=${this.clientId}&since=${this.cursor}`
          : `${this.endpoint}?action=poll&room=${encodeURIComponent(this.room)}` +
            `&deviceId=${encodeURIComponent(getDeviceId())}&clientId=${this.clientId}&since=${this.cursor}`;
        const res = await fetch(url, { signal: this.abort.signal });
        if (!res.ok) throw new Error(`poll ${res.status}`);
        const data: { signals: SignalEnvelope[]; cursor: number } = await res.json();
        this.cursor = data.cursor;
        for (const s of data.signals) this.onSignal(s);
      } catch {
        if (!this.running) return;
        // brief backoff so a dead endpoint doesn't hot-loop
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}
