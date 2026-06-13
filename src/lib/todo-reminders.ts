/**
 * Local deadline reminders for todo items. Best-effort: timers only fire
 * while the app is open (no push server involvement — todos never leave the
 * device). Re-synced from the store on every state change.
 */
import type { Channel, Message } from './types';

let timers: number[] = [];

export async function ensureNotifyPermission(): Promise<void> {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

const MAX_HORIZON_MS = 24 * 3600_000; // only schedule within the next day

export function syncTodoReminders(messages: Message[], channels: Channel[]): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const todoChannels = new Set(
    channels.filter((c) => c.kind === 'todo').map((c) => c.id),
  );
  for (const m of messages) {
    if (!todoChannels.has(m.channelId ?? '')) continue;
    if (m.done || m.deadline === undefined || !m.text) continue;
    const delay = m.deadline - Date.now();
    if (delay <= 0 || delay > MAX_HORIZON_MS) continue;
    const body = m.text;
    timers.push(
      window.setTimeout(() => {
        new Notification('⏰ Task due', { body, tag: `todo-${m.id}` });
      }, delay),
    );
  }
}
