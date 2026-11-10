import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { THUMB_LONG_EDGE, THUMB_QUALITY } from '@/lib/binder/limits'

export { MAX_UPLOAD_BYTES, THUMB_CACHE_VERSION, THUMB_LONG_EDGE, THUMB_QUALITY } from '@/lib/binder/limits'

/** Long edge of the single stored copy. Smaller originals are not enlarged. */
export const WEBP_LONG_EDGE = 1600
export const WEBP_QUALITY = 80
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024
/** Rejects decompression bombs before sharp allocates the pixels. */
export const SHARP_PIXEL_LIMIT = 40_000_000
export const MAX_INPUT_PIXELS = SHARP_PIXEL_LIMIT

const UPLOAD_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif'])

function decode(input: Buffer) {
  return sharp(input, { failOn: 'none', limitInputPixels: SHARP_PIXEL_LIMIT })
}

export function pixelCountAllowed(width: number | undefined, height: number | undefined): boolean {
  if (width == null || height == null) return false
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false
  if (width < 1 || height < 1) return false
  return width * height <= SHARP_PIXEL_LIMIT
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Owner uploads may be jpeg, png, webp, heif, or avif. The format comes from the bytes. */
export async function assertUploadFormat(input: Buffer): Promise<void> {
  const meta = await decode(input).metadata()
  if (!meta.format || !UPLOAD_FORMATS.has(meta.format)) throw new Error('unsupported image')
}

export async function compressToWebp(
  input: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const meta = await decode(input).metadata()
  if (!pixelCountAllowed(meta.width, meta.height)) throw new Error('image has too many pixels')
  const { data, info } = await decode(input)
    .rotate()
    .resize({
      width: WEBP_LONG_EDGE,
      height: WEBP_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true })

  return { data, width: info.width, height: info.height }
}

export async function compressToThumb(input: Buffer): Promise<Buffer> {
  return decode(input)
    .rotate()
    .resize({
      width: THUMB_LONG_EDGE,
      height: THUMB_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer()
}
