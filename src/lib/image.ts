/**
 * Client-side image helpers. Avatars are downscaled + compressed on the device
 * before they ever leave it, so the encrypted payload stays small (well under
 * the server's per-row cap) and we never upload a multi-MB camera photo.
 */

const AVATAR_SIZE = 256; // final square px
const AVATAR_QUALITY = 0.72;

/**
 * Read an image File, center-crop to a square, scale to AVATAR_SIZE, and return
 * a compressed jpeg data URL. Rejects if the file isn't a decodable image.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();

  return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
}

const WALLPAPER_MAX = 1280; // longest edge, px
const WALLPAPER_QUALITY = 0.7;

/**
 * Read an image File and return a downscaled jpeg Blob suitable for a chat
 * wallpaper: scaled so the longest edge is WALLPAPER_MAX, aspect preserved.
 * Kept modest so the encrypted upload stays small. Rejects non-images.
 */
export async function fileToWallpaperBlob(file: File): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, WALLPAPER_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      WALLPAPER_QUALITY,
    );
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is fastest where available (handles EXIF orientation too)
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('bad image'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
