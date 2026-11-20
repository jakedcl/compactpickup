import type { Metadata } from 'next'
import { urlFor, type SanityImageValue } from '@/lib/sanityImage'

export const SITE_ORIGIN = 'https://compactpickup.com'

/** Default social image (Next.js file-based `src/app/opengraph-image.png`). */
export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image.png',
  width: 1440,
  height: 900,
  alt: 'Compact Pickup',
} as const

export function canonicalUrl(path: string): string {
  if (!path || path === '/') return `${SITE_ORIGIN}/`
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE_ORIGIN}${normalized}`
}

export function sanityOgImageUrl(image: SanityImageValue): string | null {
  if (!image.asset?._ref) return null
  return urlFor(image).width(1200).height(630).fit('crop').auto('format').quality(75).url()
}

type ShareMetadataInput = {
  title: string
  description?: string | null
  path: string
  imageUrl?: string | null
}

/** Page-level metadata with canonical, Open Graph, and Twitter large image cards. */
export function buildShareMetadata({
  title,
  description,
  path,
  imageUrl,
}: ShareMetadataInput): Metadata {
  const canonical = canonicalUrl(path)
  const images = imageUrl
    ? [{ url: imageUrl, width: 1200, height: 630, alt: title }]
    : [DEFAULT_OG_IMAGE]
  const desc = description?.trim() || undefined

  return {
    title,
    ...(desc ? { description: desc } : {}),
    alternates: { canonical },
    openGraph: {
      title,
      ...(desc ? { description: desc } : {}),
      url: canonical,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      ...(desc ? { description: desc } : {}),
      images: images.map((image) => (typeof image.url === 'string' ? image.url : '')),
    },
  }
}

export const rootOpenGraph: NonNullable<Metadata['openGraph']> = {
  type: 'website',
  siteName: 'Compact Pickup',
  images: [DEFAULT_OG_IMAGE],
}

export const rootTwitter: NonNullable<Metadata['twitter']> = {
  card: 'summary_large_image',
  images: [DEFAULT_OG_IMAGE.url],
}