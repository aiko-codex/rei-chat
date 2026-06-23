// Shared "Important dates" (anniversaries, birthdays, trips) per conversation.
// Rides the existing encrypted meta overlay (key `date:<id>`) exactly like
// Memories pins — zero new server endpoints. Persisted locally per channel so
// the agenda shows instantly before the next sync.
import {
  Cake,
  Gift,
  Heart,
  Plane,
  PartyPopper,
  Star,
  Sparkles,
  CalendarHeart,
  Music,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { ACCENTS } from './accent';
import type { ImportantDate } from './types';

export interface DateIconOption {
  id: string;
  icon: LucideIcon;
  label: string;
}

// Curated set — deliberately icons, never emoji, to match the app's visual language.
export const DATE_ICONS: DateIconOption[] = [
  { id: 'heart', icon: Heart, label: 'Anniversary' },
  { id: 'cake', icon: Cake, label: 'Birthday' },
  { id: 'gift', icon: Gift, label: 'Gift' },
  { id: 'plane', icon: Plane, label: 'Trip' },
  { id: 'party', icon: PartyPopper, label: 'Celebration' },
  { id: 'star', icon: Star, label: 'Milestone' },
  { id: 'sparkles', icon: Sparkles, label: 'Special' },
  { id: 'calendar', icon: CalendarHeart, label: 'Date' },
  { id: 'music', icon: Music, label: 'Concert' },
  { id: 'sun', icon: Sun, label: 'Getaway' },
];

export function dateIcon(id: string): LucideIcon {
  return DATE_ICONS.find((d) => d.id === id)?.icon ?? CalendarHeart;
}

/** the per-date theme color (oklch), reusing the app's accent palette so a
 *  date's icon badge + countdown chip can stand out beyond the brand rose */
export function dateColor(id: string | undefined): string {
  return ACCENTS.find((a) => a.id === id)?.primary ?? ACCENTS[0].primary;
}

function storageKey(channelId: string): string {
  return `rei-dates:${channelId}`;
}

export function loadDates(channelId: string): ImportantDate[] {
  try {
    const raw = localStorage.getItem(storageKey(channelId));
    return raw ? (JSON.parse(raw) as ImportantDate[]) : [];
  } catch {
    return [];
  }
}

export function storeDates(channelId: string, dates: ImportantDate[]): void {
  try {
    localStorage.setItem(storageKey(channelId), JSON.stringify(dates));
  } catch {
    /* localStorage unavailable */
  }
}

/** the next occurrence of a date (epoch ms) — yearly repeats roll forward
 *  past midnight so a birthday counts down to *next* year once it's gone */
export function nextOccurrence(d: ImportantDate, now = Date.now()): number {
  if (!d.repeatYearly) return d.date;
  const original = new Date(d.date);
  const candidate = new Date(original);
  candidate.setFullYear(new Date(now).getFullYear());
  if (candidate.getTime() < now - 86400000) candidate.setFullYear(candidate.getFullYear() + 1);
  return candidate.getTime();
}

export function daysUntil(ts: number, now = Date.now()): number {
  return Math.ceil((ts - now) / 86400000);
}
