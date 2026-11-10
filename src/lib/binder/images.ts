import { createHash } from 'node:crypto'
import sharp from 'sharp'

/** Long edge of the single stored copy. Smaller originals are not enlarged. */
export const WEBP_LONG_EDGE = 1600
export const WEBP_QUALITY = 80
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function compressToWebp(
  input: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: 'none' })
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

/**
 * Hash the original bytes (dedupe key) and keep one WebP. Originals are not stored.
 */
export async function prepareStoredPhoto(original: Buffer): Promise<{
  sha256: string
  webp: Buffer
  width: number
  height: number
}> {
  const sha256 = sha256Hex(original)
  const compressed = await compressToWebp(original)
  return {
    sha256,
    webp: compressed.data,
    width: compressed.width,
    height: compressed.height,
  }
}
