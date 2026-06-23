// Mood / check-in status: a small, expiring, per-device status shown as a
// badge on the avatar. Each icon is imported from its own deep subpath
// (`react-fluentui-emoji/icons/modern/<Name>`) so the bundle only ever pays
// for the ~9 faces actually used here, not the library's full icon set —
// important on a slow connection. Synced via the same encrypted meta overlay
// mechanism as Memories/Important dates/Live location (key `mood`).
import type { ComponentType, SVGProps } from 'react';
import IconMSmilingFaceWithSmilingEyes from 'react-fluentui-emoji/icons/modern/IconMSmilingFaceWithSmilingEyes';
import IconMSmilingFaceWithHeartEyes from 'react-fluentui-emoji/icons/modern/IconMSmilingFaceWithHeartEyes';
import IconMPartyingFace from 'react-fluentui-emoji/icons/modern/IconMPartyingFace';
import IconMSmilingFaceWithSunglasses from 'react-fluentui-emoji/icons/modern/IconMSmilingFaceWithSunglasses';
import IconMHuggingFace from 'react-fluentui-emoji/icons/modern/IconMHuggingFace';
import IconMTiredFace from 'react-fluentui-emoji/icons/modern/IconMTiredFace';
import IconMSleepyFace from 'react-fluentui-emoji/icons/modern/IconMSleepyFace';
import IconMWearyFace from 'react-fluentui-emoji/icons/modern/IconMWearyFace';
import IconMSadButRelievedFace from 'react-fluentui-emoji/icons/modern/IconMSadButRelievedFace';

export type MoodIconComponent = ComponentType<SVGProps<SVGElement> & { size?: number | string }>;

export interface MoodOption {
  id: string;
  label: string;
  icon: MoodIconComponent;
}

export const MOOD_OPTIONS: MoodOption[] = [
  { id: 'happy', label: 'Happy', icon: IconMSmilingFaceWithSmilingEyes },
  { id: 'loved', label: 'Loved', icon: IconMSmilingFaceWithHeartEyes },
  { id: 'celebrating', label: 'Celebrating', icon: IconMPartyingFace },
  { id: 'relaxed', label: 'Relaxed', icon: IconMSmilingFaceWithSunglasses },
  { id: 'missing-you', label: 'Missing you', icon: IconMHuggingFace },
  { id: 'tired', label: 'Tired', icon: IconMTiredFace },
  { id: 'sleepy', label: 'Sleepy', icon: IconMSleepyFace },
  { id: 'stressed', label: 'Stressed', icon: IconMWearyFace },
  { id: 'down', label: 'A bit down', icon: IconMSadButRelievedFace },
];

export function moodOption(id: string): MoodOption | undefined {
  return MOOD_OPTIONS.find((m) => m.id === id);
}

export interface MoodExpiryOption {
  ms: number;
  label: string;
}

export const MOOD_EXPIRY_OPTIONS: MoodExpiryOption[] = [
  { ms: 4 * 60 * 60 * 1000, label: '4 hours' },
  { ms: 12 * 60 * 60 * 1000, label: '12 hours' },
  { ms: 24 * 60 * 60 * 1000, label: '24 hours' },
];

export interface Mood {
  icon: string;
  label?: string;
  setAt: number;
  expiresAt: number;
}

export function isMoodFresh(mood: Mood, now = Date.now()): boolean {
  return now < mood.expiresAt;
}

/** within the last 10 minutes — drives the badge's gentle pulse */
export function isMoodJustSet(mood: Mood, now = Date.now()): boolean {
  return now - mood.setAt < 10 * 60 * 1000;
}

export function moodAgeLabel(mood: Mood, now = Date.now()): string {
  const mins = Math.round((now - mood.setAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}
