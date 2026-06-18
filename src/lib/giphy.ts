/**
 * Giphy GIF + sticker source via the official SDK (Tenor stopped issuing new API
 * clients Jan 2026). Free key from https://developers.giphy.com/ — set as
 * VITE_GIPHY_KEY.
 *
 * Privacy: only the search text + this device's IP reach Giphy. The chosen GIF
 * is a public Giphy CDN url that rides the message frame as-is (MediaAttachment
 * with `remote: true`) — personal photos/videos never touch this path.
 */
import { GiphyFetch } from '@giphy/js-fetch-api';
import { GIPHY_KEY } from './config';

export function gifProviderEnabled(): boolean {
    return Boolean(GIPHY_KEY);
}

/** shared SDK client (only constructed when a key exists) */
export const gf = new GiphyFetch(GIPHY_KEY);
