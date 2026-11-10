const IMAGE_REF = /^image-([A-Za-z0-9]+)-(\d+x\d+)-([a-z0-9]+)$/

export type FoundImage = {
  assetRef: string
  alt: string | null
  caption: string | null
}

export function parseImageRef(ref: string): { assetId: string; cdnPath: string } | null {
  const match = IMAGE_REF.exec(ref)
  if (!match) return null
  const [, id, size, format] = match
  return { assetId: `image-${id}`, cdnPath: `${id}-${size}.${format}` }
}

/** Downloads must come from the Sanity CDN, not an arbitrary host on an asset record. */
export function assertSanityCdnUrl(url: string): void {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.sanity.io') {
    throw new Error('unexpected image host')
  }
}

export function sanityImageUrl(ref: string, projectId: string, dataset: string): string | null {
  const parsed = parseImageRef(ref)
  if (!parsed) return null
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${parsed.cdnPath}`
}

/** Strip CDN transforms so a repeat import matches the row already stored. */
export function canonicalSanityUrl(url: string): string {
  assertSanityCdnUrl(url)
  const parsed = new URL(url)
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

/**
 * A bounded derivative, never the original file.
 * A 2000px JPEG stays under the import cap. A PNG derivative of a huge original can still be enormous.
 */
export function sanityDerivativeUrl(url: string): string {
  const parsed = new URL(canonicalSanityUrl(url))
  parsed.searchParams.set('w', '2000')
  parsed.searchParams.set('fit', 'max')
  parsed.searchParams.set('fm', 'jpg')
  parsed.searchParams.set('q', '82')
  return parsed.toString()
}

function readRef(asset: unknown): string | null {
  if (!asset || typeof asset !== 'object') return null
  const ref = (asset as { _ref?: unknown })._ref
  return typeof ref === 'string' ? ref : null
}

/** Walk a truck document for image blocks, including fields outside `content`. */
export function collectImages(node: unknown, found: FoundImage[] = []): FoundImage[] {
  if (Array.isArray(node)) {
    for (const item of node) collectImages(item, found)
    return found
  }
  if (!node || typeof node !== 'object') return found
  const record = node as Record<string, unknown>
  if (record._type === 'image') {
    const ref = readRef(record.asset)
    if (ref?.startsWith('image-')) {
      found.push({
        assetRef: ref,
        alt: typeof record.alt === 'string' ? record.alt : null,
        caption: typeof record.caption === 'string' ? record.caption : null,
      })
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') collectImages(value, found)
  }
  return found
}
