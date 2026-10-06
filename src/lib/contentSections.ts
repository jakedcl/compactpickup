import type {ContentFlags} from '@/lib/truckDisplay'

type HeadingBlock = {
  _type: string
  style?: string
  children?: unknown
}

/**
 * Portable-text h2 headings that repeat structured fields.
 * A heading is removed only when that structured data exists.
 * Photographs inside the skipped span still render.
 */
export const SUPPRESSED_CONTENT_HEADINGS: Record<string, keyof ContentFlags> = {
  engines: 'hasEngines',
  specifications: 'hasSpecs',
  'related models': 'hasRelated',
  sources: 'hasSources',
}

function headingText(block: HeadingBlock): string | null {
  if (block._type !== 'block' || block.style !== 'h2' || !Array.isArray(block.children)) return null
  const text = block.children
    .map((child) => {
      if (typeof child === 'object' && child && 'text' in child && typeof child.text === 'string') {
        return child.text
      }
      return ''
    })
    .join('')
    .trim()
    .toLowerCase()
  return text || null
}

export function visibleContentBlocks<T extends HeadingBlock>(
  blocks: T[] | null | undefined,
  flags: ContentFlags,
): T[] {
  if (!Array.isArray(blocks)) return []

  const visible: T[] = []
  let skipping = false

  for (const block of blocks) {
    const heading = headingText(block)
    if (heading) {
      const flag = SUPPRESSED_CONTENT_HEADINGS[heading]
      skipping = Boolean(flag && flags[flag])
      if (skipping) continue
    }

    if (skipping && block._type !== 'image') continue
    visible.push(block)
  }

  return visible
}
