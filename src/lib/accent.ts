// Per-device accent color. The brand carrier is the `--primary` CSS var
// (sent bubbles, primary buttons, links, rings). We override it (+ ring +
// sidebar-primary) inline on <html>, which beats both the :root and .dark
// stylesheet rules, so one set of overrides themes light and dark alike.
// Persisted per device; applied before first paint to avoid a flash.

const STORAGE_KEY = 'rei-accent';

export interface AccentOption {
  id: string;
  label: string;
  /** oklch for --primary (the swatch + brand carrier) */
  primary: string;
  /** oklch for --ring (focus outline) */
  ring: string;
}

// mid-lightness, saturated hues — white foreground stays legible on all.
// 'rose' matches the original DESIGN.md brand exactly (default).
export const ACCENTS: AccentOption[] = [
  { id: 'rose', label: 'Rose', primary: 'oklch(0.55 0.16 353.3)', ring: 'oklch(0.6 0.12 353.3)' },
  { id: 'red', label: 'Red', primary: 'oklch(0.55 0.21 25)', ring: 'oklch(0.6 0.16 25)' },
  { id: 'orange', label: 'Orange', primary: 'oklch(0.6 0.16 55)', ring: 'oklch(0.65 0.13 55)' },
  { id: 'amber', label: 'Amber', primary: 'oklch(0.62 0.15 75)', ring: 'oklch(0.67 0.12 75)' },
  { id: 'emerald', label: 'Emerald', primary: 'oklch(0.58 0.15 160)', ring: 'oklch(0.63 0.12 160)' },
  { id: 'teal', label: 'Teal', primary: 'oklch(0.56 0.11 200)', ring: 'oklch(0.61 0.09 200)' },
  { id: 'blue', label: 'Blue', primary: 'oklch(0.55 0.18 255)', ring: 'oklch(0.6 0.14 255)' },
  { id: 'violet', label: 'Violet', primary: 'oklch(0.55 0.2 290)', ring: 'oklch(0.6 0.15 290)' },
];

const DEFAULT = ACCENTS[0];
const PRIMARY_FOREGROUND = 'oklch(0.985 0 0)'; // near-white text on the accent

export function getAccentId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && ACCENTS.some((a) => a.id === raw)) return raw;
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT.id;
}

export function applyAccent(id: string = getAccentId()): void {
  const accent = ACCENTS.find((a) => a.id === id) ?? DEFAULT;
  const root = document.documentElement.style;
  root.setProperty('--primary', accent.primary);
  root.setProperty('--primary-foreground', PRIMARY_FOREGROUND);
  root.setProperty('--ring', accent.ring);
  root.setProperty('--sidebar-primary', accent.primary);
  root.setProperty('--sidebar-primary-foreground', PRIMARY_FOREGROUND);
  root.setProperty('--sidebar-ring', accent.ring);
}

export function setAccent(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore persistence failure */
  }
  applyAccent(id);
}
