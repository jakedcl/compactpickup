import type { ImageLoader } from 'next/image'
import { urlFor } from '@/lib/sanity'

export { sanityImageFields } from '@/lib/sanity'

export const IMAGE_QUALITY = 75

export type SanityImageValue = {
  asset?: {
    _ref?: string
  } | null
  crop?: {
    top: number
    bottom: number
    left: number
    right: number
  } | null
  hotspot?: {
    x: number
    y: number
    height?: number
    width?: number
  } | null
  lqip?: string | null
  dimensions?: {
    width?: number
    height?: number
    aspectRatio?: number
  } | null
  alt?: string | null
  caption?: string | null
}

export function sanityImageLoader(image: SanityImageValue, cropRatio?: number): ImageLoader {
  return ({ width, quality }) => {
    const builder = urlFor(image).width(width).auto('format').quality(quality || IMAGE_QUALITY)
    if (cropRatio && cropRatio > 0) {
      return builder.height(Math.max(1, Math.round(width * cropRatio))).url()
    }
    return builder.fit('max').url()
  }
}

export function hotspotPosition(image: SanityImageValue): string {
  const x = image.hotspot?.x ?? 0.5
  const y = image.hotspot?.y ?? 0.5
  return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`
}

export function blurDataUrl(image: SanityImageValue): string | undefined {
  const lqip = image.lqip
  if (typeof lqip === 'string' && lqip.startsWith('data:image/')) return lqip
  return undefined
}
