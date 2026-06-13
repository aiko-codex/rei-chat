// Global UI text-size scale — iOS "Display & Text Size" style.
// Everything in the app is rem-based (Tailwind), so scaling the root <html>
// font-size scales the whole interface uniformly. Persisted per device.

const STORAGE_KEY = 'rei-ui-scale';
const BASE_PX = 16; // browser default root size

export interface UIScaleOption {
  id: string;
  label: string;
  value: number;
}

export const UI_SCALES: UIScaleOption[] = [
  { id: 'sm', label: 'Small', value: 0.9 },
  { id: 'md', label: 'Default', value: 1 },
  { id: 'lg', label: 'Large', value: 1.12 },
  { id: 'xl', label: 'Larger', value: 1.25 },
  { id: 'xxl', label: 'Largest', value: 1.4 },
];

export function getUIScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseFloat(raw) : NaN;
    if (Number.isFinite(n) && n >= 0.75 && n <= 1.6) return n;
  } catch {
    /* localStorage unavailable */
  }
  return 1;
}

export function applyUIScale(scale: number = getUIScale()): void {
  document.documentElement.style.fontSize = `${BASE_PX * scale}px`;
}

export function setUIScale(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    /* ignore persistence failure */
  }
  applyUIScale(scale);
}
