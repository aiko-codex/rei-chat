/**
 * App changelog — user-facing "what's new" notes, shown in Settings → What's new.
 *
 * HOW TO MAINTAIN: when you ship a change worth telling the other person about,
 * add an entry to the TOP of `CHANGELOG` (newest first). Keep `changes` short and
 * human ("Reactions now sync instantly"), not technical. Bump `version` when you
 * bump package.json; otherwise reuse the current one and rely on the date.
 *
 * This is intentionally a hand-maintained, app-bundled list (no server call) so
 * the notes ship with the build the user is actually running.
 */
export type ChangeKind = 'new' | 'fix' | 'improve';

export interface ChangelogEntry {
  /** app version (matches package.json when bumped) */
  version: string;
  /** ISO date (YYYY-MM-DD) the entry shipped */
  date: string;
  /** short headline for the release */
  title: string;
  /** the individual notes */
  changes: Array<{ kind: ChangeKind; text: string }>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.11.0',
    date: '2026-06-26',
    title: 'Pinch to zoom',
    changes: [
      { kind: 'new', text: 'Open a photo and pinch to zoom in and out, drag to pan around, and double-tap to zoom. Swipe down to close.' },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-06-26',
    title: 'Faster, lighter media',
    changes: [
      { kind: 'improve', text: 'Photos and videos now send and load in small pieces — much lighter on memory and far more reliable, especially in the installed app.' },
    ],
  },
  {
    version: '0.9.1',
    date: '2026-06-26',
    title: 'Photos load reliably',
    changes: [
      { kind: 'fix', text: 'Photos and screenshots your partner sends no longer get stuck on “Loading…” in the installed app.' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-06-24',
    title: 'Password recovery',
    changes: [
      { kind: 'new', text: 'Set a recovery key when you pick your password — it lets you reset a forgotten password without losing any chats.' },
      { kind: 'new', text: '“Forgot password?” on the sign-in screen resets your password with that recovery key.' },
      { kind: 'new', text: 'Change your password anytime in Settings → Security — your chats stay intact.' },
    ],
  },
  {
    version: '0.8.1',
    date: '2026-06-23',
    title: 'View profile photo',
    changes: [
      { kind: 'new', text: 'Tap the photo in Chat Details to see it full-screen.' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-06-23',
    title: 'Mood check-ins',
    changes: [
      { kind: 'new', text: 'Tap your avatar on Home to set a mood — she sees a little animated face badge on your photo for a few hours.' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-23',
    title: 'Live location sharing',
    changes: [
      { kind: 'new', text: 'Share your live location from the location picker for 15 min, 1 hour, 8 hours, or until you stop — she sees it move on a live map right in the chat.' },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-06-23',
    title: 'Important dates polish',
    changes: [
      { kind: 'fix', text: 'The new-date sheet no longer gets hidden behind the keyboard.' },
      { kind: 'improve', text: 'Icons now have labels and a colour theme to make each date stand out.' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-06-23',
    title: 'Important dates',
    changes: [
      { kind: 'new', text: 'Chat Details → Important dates: keep anniversaries, birthdays and trips together with a countdown to each.' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-06-23',
    title: 'Hidden vault',
    changes: [
      { kind: 'new', text: 'A private, password-protected Hidden vault for photos & videos. In Media & links, select items and tap “Hide” to move them in.' },
      { kind: 'new', text: 'The vault stays out of sight: tap the name at the top of a chat’s profile 5 times to reveal it, then enter your password to open it. Hidden items also disappear from the chat itself.' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-22',
    title: 'Clean up your shared media',
    changes: [
      { kind: 'new', text: 'In a chat’s Media & links, tap “Select” to pick multiple photos, videos or links at once.' },
      { kind: 'new', text: 'Delete the selected items just for you, or unsend them for both of you (also removed from the server).' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-22',
    title: 'Shared memories',
    changes: [
      { kind: 'new', text: 'Pin your favourite messages and photos to a shared Memories album — long-press a message and tap “Pin to memories”. Find the album in the chat profile.' },
      { kind: 'new', text: 'Add a caption to each memory; the album stays in sync on both phones.' },
    ],
  },
  {
    version: '0.2.1',
    date: '2026-06-17',
    title: 'Faster chat & syncing',
    changes: [
      { kind: 'improve', text: 'When you’re both in the chat, messages, reactions, edits, unsends, read receipts and photos now go directly phone-to-phone for instant delivery — falling back to the server when one of you is away.' },
      { kind: 'fix', text: 'Chat wallpaper now actually syncs to both phones when you change it.' },
      { kind: 'fix', text: 'Reactions show up instantly instead of lagging.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-17',
    title: 'Connections polish',
    changes: [
      { kind: 'fix', text: 'You stay signed in after a refresh — no more re-login (lasts until you sign out or clear the browser).' },
      { kind: 'fix', text: 'Double-tap a message to react now works in your chats again.' },
      { kind: 'fix', text: "Reactions now sync in near real-time instead of only when the next message arrives." },
      { kind: 'fix', text: "Voice/video calls wait for the connection to come up instead of saying “not connected” when you tap too soon." },
      { kind: 'new', text: 'Chat wallpaper now syncs to both phones.' },
      { kind: 'improve', text: 'The chat header shows a gray pulsing “connecting…” while the secure link is being set up.' },
      { kind: 'improve', text: 'Removed the old “Reset pairing” option from Settings.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-17',
    title: 'Accounts & people',
    changes: [
      { kind: 'new', text: 'Sign in with your own username + password — your identity now follows you across devices.' },
      { kind: 'new', text: 'Find people by @username, send a connection request, and chat once they accept.' },
      { kind: 'new', text: 'Set a profile photo and display name that the other person sees.' },
      { kind: 'new', text: 'Typing indicator and instant delivery in conversations.' },
      { kind: 'improve', text: 'Messages are end-to-end encrypted per connection — the server only ever sees ciphertext.' },
    ],
  },
  {
    version: '0.1.5',
    date: '2026-06-15',
    title: 'Conversation profile & wallpaper',
    changes: [
      { kind: 'new', text: 'Tap a chat’s name to open its profile: search the conversation, change the wallpaper, and browse shared photos, videos & links.' },
      { kind: 'new', text: 'Web Push: get a notification when a message arrives while the app is closed.' },
      { kind: 'improve', text: 'Swipe a message to reply, plus a more native look and feel throughout.' },
    ],
  },
  {
    version: '0.1.4',
    date: '2026-06-14',
    title: 'Reactions, editing & security',
    changes: [
      { kind: 'new', text: 'React with any emoji and customize your six quick reactions.' },
      { kind: 'new', text: 'Edit a message you already sent.' },
      { kind: 'new', text: 'Choose a theme (light/dark/system) and an accent color.' },
      { kind: 'improve', text: 'Reactions and read receipts now survive the other person being offline.' },
      { kind: 'improve', text: 'Your space is locked to two devices for safety.' },
    ],
  },
  {
    version: '0.1.3',
    date: '2026-06-13',
    title: 'Calls, voice room & media',
    changes: [
      { kind: 'new', text: 'Voice and video calls, peer-to-peer and end-to-end encrypted.' },
      { kind: 'new', text: 'An always-open voice room, Discord-style.' },
      { kind: 'new', text: 'Send photos, videos, files and voice notes — backed up encrypted so they restore on a new device.' },
      { kind: 'improve', text: 'Clearer, gap-free call audio on mobile networks.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-12',
    title: 'First release',
    changes: [
      { kind: 'new', text: 'Private, end-to-end encrypted chat for two.' },
      { kind: 'new', text: 'Personal channels and to-do lists with deadlines.' },
      { kind: 'new', text: 'PIN lock and QR device pairing.' },
    ],
  },
];
