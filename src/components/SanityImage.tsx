import Image from 'next/image'
import type { CSSProperties } from 'react'
import {
  IMAGE_QUALITY,
  blurDataUrl,
  hotspotPosition,
  sanityImageLoader,
  type SanityImageValue,
} from '@/lib/sanityImage'

type SanityImageProps = {
  image: SanityImageValue
  alt: string
  sizes: string
  className?: string
  style?: CSSProperties
  priority?: boolean
  eager?: boolean
  onLoad?: () => void
  fill?: boolean
  width?: number
  height?: number
  /** Height divided by width. Set this when the frame is a fixed crop so the CDN uses the hotspot. */
  cropRatio?: number
}

export default function SanityImage({
  image,
  alt,
  sizes,
  className,
  style,
  priority = false,
  eager = false,
  onLoad,
  fill = false,
  width,
  height,
  cropRatio,
}: SanityImageProps) {
  if (!image.asset?._ref) return null

  const blur = blurDataUrl(image)
  const frameWidth = image.dimensions?.width || width || 1200
  const frameHeight = image.dimensions?.height || height || 800

  return (
    <Image
      loader={sanityImageLoader(image, cropRatio)}
      src={image.asset._ref}
      alt={alt}
      sizes={sizes}
      quality={IMAGE_QUALITY}
      className={className}
      style={{ objectPosition: hotspotPosition(image), ...style }}
      {...(priority ? { priority: true } : { loading: eager ? 'eager' as const : 'lazy' as const })}
      placeholder={blur ? 'blur' : 'empty'}
      blurDataURL={blur}
      onLoad={onLoad}
      {...(fill
        ? { fill: true }
        : { width: frameWidth, height: frameHeight })}
    />
  )
}
