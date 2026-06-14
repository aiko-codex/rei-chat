// The 6 customizable quick reactions (per device). Slot 0 is the default used
// for double-tap react/unreact. Persisted to localStorage; the chat-store holds
// the live copy so components re-render on change.

const STORAGE_KEY = 'rei-reactions';

export const REACTION_SLOTS = 6;
export const DEFAULT_REACTIONS = ['🤍', '🖤', '😂', '😢', '😡', '😆'];

export function loadReactions(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === REACTION_SLOTS && parsed.every((e) => typeof e === 'string')) {
        return parsed;
      }
    }
  } catch {
    /* fall through to default */
  }
  return [...DEFAULT_REACTIONS];
}

export function persistReactions(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore persistence failure */
  }
}
