import type {PortableTextBlock} from '@portabletext/react'
import type {ContentFlags} from '@/lib/truckDisplay'
import type {SanityImageValue} from '@/lib/sanityImage'

type HeadingBlock = {
  _type: string
  style?: string
  children?: unknown
  listItem?: string
}

export type ContentPanelRow = {
  label?: string
  value: string
  fullWidth?: boolean
}

export type ContentPanelRows = ContentPanelRow[]

export type ParsedArticleSections = {
  overview: PortableTextBlock[]
  trims: ContentPanelRows
  cabBed: ContentPanelRows
  drivetrain: ContentPanelRows
  highlights: ContentPanelRows
}

const OVERVIEW_H2 = 'overview'
const TRIMS_H2 = 'trims, bodies and drivetrains'
const HIGHLIGHTS_H2 = 'highlights'

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

function blockPlainText(block: HeadingBlock): string {
  if (block._type !== 'block' || !Array.isArray(block.children)) return ''
  return block.children
    .map((child) => {
      if (typeof child === 'object' && child && 'text' in child && typeof child.text === 'string') {
        return child.text
      }
      return ''
    })
    .join('')
    .trim()
}

function isHeading(block: HeadingBlock, level: 'h2' | 'h3'): boolean {
  return block._type === 'block' && block.style === level
}

function h3SectionKey(heading: string | null): 'trims' | 'cabBed' | 'drivetrain' | null {
  if (!heading) return null
  if (heading === 'trims') return 'trims'
  if (heading.startsWith('cab and bed')) return 'cabBed'
  if (heading.startsWith('drivetrain')) return 'drivetrain'
  return null
}

export function textToPanelRow(text: string): ContentPanelRow {
  const colon = text.indexOf(':')
  if (colon > 0) {
    return {
      label: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
    }
  }
  const dash = text.indexOf(' — ')
  if (dash > 0) {
    return {
      label: text.slice(0, dash).trim(),
      value: text.slice(dash + 3).trim(),
    }
  }
  return {value: text, fullWidth: true}
}

function collectItemTexts(blocks: PortableTextBlock[]): string[] {
  const items: string[] = []
  for (const block of blocks) {
    if (block._type !== 'block') continue
    const typed = block as HeadingBlock
    if (typed.listItem) {
      const text = blockPlainText(typed)
      if (text) items.push(text)
      continue
    }
    if (!typed.style || typed.style === 'normal') {
      const text = blockPlainText(typed)
      if (text) items.push(text)
    }
  }
  return items
}

function blocksToPanelRows(blocks: PortableTextBlock[]): ContentPanelRows {
  return collectItemTexts(blocks).map((text) => textToPanelRow(text))
}

type ContentImage = SanityImageValue & {
  alt?: string | null
  caption?: string | null
}

export function extractContentImages(content?: PortableTextBlock[] | null): ContentImage[] {
  if (!Array.isArray(content)) return []
  return content.filter((block): block is PortableTextBlock & ContentImage => {
    return block._type === 'image' && Boolean((block as ContentImage).asset?._ref)
  })
}

export function parseArticleSections(blocks: PortableTextBlock[]): ParsedArticleSections {
  const empty: ParsedArticleSections = {
    overview: [],
    trims: [],
    cabBed: [],
    drivetrain: [],
    highlights: [],
  }
  if (!blocks.length) return empty

  let currentH2: string | null = null
  let currentH3: keyof Pick<ParsedArticleSections, 'trims' | 'cabBed' | 'drivetrain'> | null = null
  const buckets: Record<string, PortableTextBlock[]> = {
    overview: [],
    trims: [],
    cabBed: [],
    drivetrain: [],
    highlights: [],
  }

  const push = (key: string, block: PortableTextBlock) => {
    buckets[key].push(block)
  }

  for (const block of blocks) {
    const heading = headingText(block as HeadingBlock)
    if (isHeading(block as HeadingBlock, 'h2')) {
      currentH2 = heading
      currentH3 = null
      continue
    }

    if (currentH2 === OVERVIEW_H2) {
      if (block._type !== 'image') push('overview', block)
      continue
    }

    if (currentH2 === TRIMS_H2) {
      if (isHeading(block as HeadingBlock, 'h3')) {
        currentH3 = h3SectionKey(heading)
        continue
      }
      if (currentH3) push(currentH3, block)
      continue
    }

    if (currentH2 === HIGHLIGHTS_H2) {
      if (block._type !== 'image') push('highlights', block)
    }
  }

  const highlightTexts = collectItemTexts(buckets.highlights)

  return {
    overview: buckets.overview,
    trims: blocksToPanelRows(buckets.trims),
    cabBed: blocksToPanelRows(buckets.cabBed),
    drivetrain: blocksToPanelRows(buckets.drivetrain),
    highlights: highlightTexts.map((text, index) => ({
      label: String(index + 1).padStart(2, '0'),
      value: text,
    })),
  }
}
