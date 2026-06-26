export type UserId = 'me' | 'her';

export interface User {
  id: UserId;
  name: string;
  avatarUrl?: string;
  online: boolean;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MediaKind = 'image' | 'video' | 'file' | 'voice';

export interface MediaAttachment {
  kind: MediaKind;
  /** object URL in the mock phase; later a decrypted blob from the data channel */
  url: string;
  name: string;
  size: number; // bytes
  mimeType: string;
  /** voice notes / videos, in seconds */
  duration?: number;
  /** the url is a public remote link (e.g. a Tenor GIF) — never uploaded,
   *  downloaded, or backed up as an encrypted blob; it rides the message frame
   *  as-is like text. */
  remote?: boolean;
  /** render frameless + small (transparent Tenor sticker / drawn doodle) */
  sticker?: boolean;
  /** shared-location messages: render an "Open in Maps" action over the image */
  coords?: { lat: number; lng: number };
  /** the encrypted bytes are stored as crypto_secretstream chunks (media_blobs)
   *  rather than one whole-file blob — tells the download path which endpoint to
   *  use. Absent on remote media and on messages predating chunked upload. */
  chunked?: boolean;
}

/** per-device profile, set by each user on their own device and exchanged
 *  over the encrypted data channel — never stored on the server */
export interface Profile {
  name: string;
  /** avatar background color (hex) — fallback behind the initial */
  color: string;
  /** optional avatar image as a compressed jpeg data URL. Encrypted at rest on
   *  the server like everything else; falls back to color + initial if absent. */
  avatar?: string;
}

/** the one DM channel between the two devices */
export const DM_CHANNEL_ID = 'dm';

export interface Channel {
  id: string;
  /** 'dm' syncs P2P + encrypted server store; 'personal' and 'todo' start
   *  device-local and only sync once shared via an accepted collab invite */
  kind: 'dm' | 'personal' | 'todo';
  name: string;
  createdAt: number;
  /** true once this channel is collaborative (invited + accepted) — only then
   *  is it backed up room-keyed and synced between the two devices */
  shared?: boolean;
  /** accounts mode: the connection this channel is shared with (synced via
   *  conv_local under that connection). Set on the sharer and the adopter. */
  sharedConnId?: string;
}

/** a pending collaboration invite for a personal/todo channel, surfaced as a
 *  home-screen notification on the invitee's device */
export interface CollabInvite {
  channelId: string;
  name: string;
  kind: 'personal' | 'todo';
  /** inviter's display name, for the notification copy */
  fromName: string;
  createdAt: number;
}

/** notice on the *inviter's* notifications page that the peer accepted a
 *  collab invite (informational — just dismiss / open the channel) */
export interface AcceptedNotice {
  channelId: string;
  name: string;
  kind: 'personal' | 'todo';
}

export interface Message {
  id: string;
  /** which channel this belongs to; legacy rows without it are the DM */
  channelId?: string;
  senderId: UserId;
  text?: string;
  media?: MediaAttachment;
  sentAt: number; // epoch ms
  status: MessageStatus;
  /** one reaction per user, keyed by who reacted */
  reactions?: Partial<Record<UserId, string>>;
  /** id of the message this one replies to */
  replyToId?: string;
  /** true once the sender has edited the text after sending */
  edited?: boolean;
  /** pinned into the shared "Memories" album (synced via the meta overlay) */
  pinned?: boolean;
  /** optional caption shown under this memory in the album */
  memoryCaption?: string;
  /** when it was pinned (epoch ms) — orders the album, newest first */
  pinnedAt?: number;
  /** moved to this device's password-protected Hidden vault — filtered out of
   *  the chat, search, memories and the normal gallery. Device-local, never
   *  synced (a personal hide, not a shared action). */
  hidden?: boolean;
  /** todo channels reuse message rows as items; checked state lives here */
  done?: boolean;
  /** todo: optional deadline (epoch ms) — drives the time progress bar */
  deadline?: number;
  /** todo: when the item was checked off — used for the on-time/late verdict */
  completedAt?: number;
  /** todo: manually entered time worked, in minutes */
  timeSpent?: number;
  /** todo: recurring chore — respawns when checked off */
  repeat?: 'daily' | 'weekly';
  /** todo: manual sort position (assigned on first drag-reorder) */
  order?: number;
  /** an active/ended live location share (synced via the meta overlay, key
   *  `loc:<id>`) — the message itself is sent once; position updates patch
   *  this field in place without re-sending the whole message */
  liveLocation?: {
    lat: number;
    lng: number;
    startedAt: number;
    /** epoch ms it auto-stops; "Until I stop" uses a far-future sentinel */
    expiresAt: number;
    /** sender manually stopped sharing */
    stoppedAt?: number;
    /** true while the sender's app is backgrounded — updates have frozen.
     *  Broadcast explicitly by the sender rather than guessed from staleness,
     *  since only the sender's device knows its own foreground state. */
    paused?: boolean;
  };
}

/** a shared anniversary/birthday/important date for a conversation, synced via
 *  the encrypted meta overlay (key `date:<id>`) — same model as Memories pins */
export interface ImportantDate {
  id: string;
  title: string;
  /** epoch ms of the date (midnight local time) */
  date: number;
  /** icon id from lib/important-dates.ts DATE_ICONS — never an emoji */
  icon: string;
  /** accent id from lib/accent.ts ACCENTS — colors the icon badge + countdown chip */
  color?: string;
  /** anniversaries/birthdays: the countdown re-targets next year once passed */
  repeatYearly?: boolean;
  /** epoch ms last edited — resolves last-writer-wins on sync */
  updatedAt: number;
}

export type Screen =
  | 'lock'
  | 'sign-in'
  | 'set-password'
  | 'reset-password'
  | 'admin'
  | 'connections'
  | 'profile-setup'
  | 'pairing'
  | 'home'
  | 'chat'
  | 'chat-details'
  | 'call'
  | 'voice-channel'
  | 'settings'
  | 'notifications';
