// Full emoji set for the reaction picker, sourced from `unicode-emoji-json`
// (all ~1900 emojis, grouped, with names/slugs for search). We keep our own
// category labels/tab icons and the [emoji, searchName] shape so the picker UI
// (ReactionEmojiSheet) stays unchanged.
import groupsRaw from 'unicode-emoji-json/data-by-group.json';

interface RawEmoji {
  emoji: string;
  name: string;
  slug: string;
}
interface RawGroup {
  name: string;
  slug: string;
  emojis: RawEmoji[];
}

export interface EmojiCategory {
  id: string;
  label: string;
  /** emoji used as the category tab icon */
  icon: string;
  emojis: [string, string][];
}

// short label + tab icon per unicode group (in display order)
const GROUP_META: Record<string, { id: string; label: string; icon: string }> = {
  'Smileys & Emotion': { id: 'smileys', label: 'Smileys', icon: '😀' },
  'People & Body': { id: 'people', label: 'People', icon: '👋' },
  'Animals & Nature': { id: 'nature', label: 'Nature', icon: '🐶' },
  'Food & Drink': { id: 'food', label: 'Food', icon: '🍔' },
  'Travel & Places': { id: 'travel', label: 'Travel', icon: '✈️' },
  Activities: { id: 'activity', label: 'Activity', icon: '⚽' },
  Objects: { id: 'objects', label: 'Objects', icon: '💡' },
  Symbols: { id: 'symbols', label: 'Symbols', icon: '💯' },
  Flags: { id: 'flags', label: 'Flags', icon: '🏳️' },
};

const groups = groupsRaw as unknown as RawGroup[];

export const EMOJI_CATEGORIES: EmojiCategory[] = groups.map((g) => {
  const meta = GROUP_META[g.name] ?? { id: g.slug, label: g.name, icon: g.emojis[0]?.emoji ?? '⭐' };
  return {
    id: meta.id,
    label: meta.label,
    icon: meta.icon,
    // name + de-underscored slug gives search a few keywords to match on
    emojis: g.emojis.map((e) => [e.emoji, `${e.name} ${e.slug.replace(/_/g, ' ')}`] as [string, string]),
  };
});

export const ALL_EMOJIS: [string, string][] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

export function searchEmojis(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_EMOJIS.filter(([, name]) => name.includes(q)).map(([e]) => e);
}
