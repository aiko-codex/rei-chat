// Per-conversation chat wallpaper. Unlike the per-device accent/theme, this is
// a *shared* setting: changing it on one phone changes it on both. It rides the
// existing encrypted `meta` store (key `chat-bg`) — last-writer-wins by the
// embedded timestamp — and, for a custom photo, the chunked `media` store. The
// server only ever sees ciphertext. Persisted locally so it shows before sync.

const STORAGE_KEY = 'rei-chat-bg';

/** the active wallpaper selection, shared between the two devices */
export interface ChatBackground {
  /** a preset id from CHAT_BACKGROUNDS, or 'custom' for an uploaded photo */
  id: string;
  /** custom only: the media id the photo bytes are stored under (idb + server) */
  wid?: string;
  /** custom only: the image mime type, for rebuilding the blob */
  mime?: string;
  /** epoch ms the selection was made — resolves which device wrote last */
  at: number;
}

export interface BackgroundPreset {
  id: string;
  label: string;
  /** css `background` value used in light mode */
  light: string;
  /** css `background` value used in dark mode */
  dark: string;
}

// Decorative wallpapers that sit behind the (opaque) message bubbles, so
// readability is unaffected. Each has a light + dark variant. 'default' falls
// back to the plain app background.
export const CHAT_BACKGROUNDS: BackgroundPreset[] = [
  { id: 'default', label: 'Default', light: '', dark: '' },
  {
    id: 'rose',
    label: 'Rose',
    light: 'linear-gradient(165deg, #fdeaf1 0%, #fbeef6 55%, #f4e9fb 100%)',
    dark: 'linear-gradient(165deg, #1a1015 0%, #181016 55%, #14111c 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    light: 'linear-gradient(160deg, #ffe9d6 0%, #ffe1e6 50%, #ffe6f3 100%)',
    dark: 'linear-gradient(160deg, #1c140e 0%, #1a1012 50%, #170f15 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    light: 'linear-gradient(165deg, #e3f1fb 0%, #e8f6f4 55%, #eef1fb 100%)',
    dark: 'linear-gradient(165deg, #0e1620 0%, #0d1719 55%, #0f1320 100%)',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    light: 'linear-gradient(165deg, #efe9fb 0%, #f3eafb 55%, #fbeaf6 100%)',
    dark: 'linear-gradient(165deg, #15111f 0%, #16111d 55%, #1a1018 100%)',
  },
  {
    id: 'mint',
    label: 'Mint',
    light: 'linear-gradient(165deg, #e6f6ec 0%, #e9f6f2 55%, #eaf3fb 100%)',
    dark: 'linear-gradient(165deg, #0e1813 0%, #0e1817 55%, #0d1320 100%)',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    light: 'linear-gradient(165deg, #f2f1f3 0%, #ededf0 100%)',
    dark: 'linear-gradient(165deg, #16161a 0%, #121214 100%)',
  },
];

export function getStoredBackground(): ChatBackground | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatBackground) : null;
  } catch {
    return null;
  }
}

export function storeBackground(bg: ChatBackground | null): void {
  try {
    if (bg) localStorage.setItem(STORAGE_KEY, JSON.stringify(bg));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Resolve a wallpaper selection to a `background` CSS value for the current
 * theme. For a custom photo, `customUrl` is the rebuilt object URL (cover).
 * Returns undefined for the default (lets the plain app background show).
 */
export function backgroundCss(
  bg: ChatBackground | null,
  isDark: boolean,
  customUrl: string | null,
): string | undefined {
  if (!bg || bg.id === 'default') return undefined;
  if (bg.id === 'custom') {
    if (!customUrl) return undefined;
    return `center / cover no-repeat url("${customUrl}")`;
  }
  const preset = CHAT_BACKGROUNDS.find((p) => p.id === bg.id);
  if (!preset) return undefined;
  const value = isDark ? preset.dark : preset.light;
  return value || undefined;
}
