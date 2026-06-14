// Light / dark / system theme. Dark styles key off a `.dark` class on <html>
// (`@custom-variant dark (&:is(.dark *))` in index.css), so we toggle that
// class. 'system' follows the OS via prefers-color-scheme and live-updates.
// Persisted per device; applied before first paint to avoid a flash.

const STORAGE_KEY = 'rei-theme';

export type ThemeId = 'light' | 'dark' | 'system';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export function getTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** resolve to the concrete light/dark and toggle the `.dark` class on <html> */
export function applyTheme(theme: ThemeId = getTheme()): void {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore persistence failure */
  }
  applyTheme(theme);
}

/** keep 'system' in sync with OS changes; call once at startup */
export function watchSystemTheme(): void {
  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getTheme() === 'system') applyTheme('system');
    });
}
