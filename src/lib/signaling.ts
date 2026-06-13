/**
 * Long-polling client for the PHP signaling endpoint.
 * Carries only WebRTC negotiation envelopes — never chat content.
 */

export interface SignalEnvelope {
  id: number;
  from: string;
  type: string;
  payload: unknown;
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
  ) {}

  async send(type: string, payload: unknown): Promise<void> {
    // fire-and-forget: callers don't handle failures, and recovery is driven
    // by the poll loop + hello retries, so an unreachable endpoint must not
    // surface as an unhandled rejection
    try {
      await fetch(`${this.endpoint}?action=signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: this.room, clientId: this.clientId, type, payload }),
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
      const res = await fetch(`${this.endpoint}?action=cursor&room=${encodeURIComponent(this.room)}`);
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
        const url =
          `${this.endpoint}?action=poll&room=${encodeURIComponent(this.room)}` +
          `&clientId=${this.clientId}&since=${this.cursor}`;
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
