export type ScanCatalogTruck = {
  id: string
  slug: string
  title: string
  maker: string
  href: string
  years: string
}

export type ScanMatch = ScanCatalogTruck & {
  score: number
}

/**
 * Raw cosine floor for display rescaling. SigLIP2 photo-to-photo cosine for the
 * best truck sits around 0.79-0.89, so 0.70 shows as 0%, the 0.80 match line as 50%,
 * and 0.90+ as 100%.
 */
export const SCAN_SCORE_DISPLAY_FLOOR = 0.7
/** Span from floor to “strong match” on the visitor-facing meter. */
export const SCAN_SCORE_DISPLAY_SPAN = 0.2

/** Visitor-facing match strength. Underlying score stays 0–1 (cosine or probe probability). */
export function formatScanScorePercent(score: number): string {
  if (!Number.isFinite(score)) return '—%'
  const clamped = Math.min(1, Math.max(0, score))
  const scaled = ((clamped - SCAN_SCORE_DISPLAY_FLOOR) / SCAN_SCORE_DISPLAY_SPAN) * 100
  const display = Math.min(100, Math.max(0, scaled))
  return `${Math.round(display)}%`
}

export type ScanState = 'learning' | 'match' | 'guess'

export const SCAN_CONSENT_VALUE = 'yes'

export const SCAN_FIELDS = {
  photo: 'photo',
  consent: 'consent',
  verdict: 'verdict',
  guessedTruckId: 'guessedTruckId',
  guessedTruckSlug: 'guessedTruckSlug',
  correctedTruckId: 'correctedTruckId',
  correctedTruckSlug: 'correctedTruckSlug',
  correctedTruckCustomText: 'correctedTruckCustomText',
} as const

export type ScanVerdict = 'right' | 'wrong' | 'idk'

/** Catalog href is /maker/slug. Returns null when that shape is missing. */
export function toScanTruck(truck: {
  id: string
  title: string
  href: string
  maker: string
  years: string
}): ScanCatalogTruck | null {
  const [makerSlug, slug, extra] = truck.href.split('/').filter(Boolean)
  if (!makerSlug || !slug || extra || !truck.id || !truck.maker || !truck.title) return null
  return {
    id: truck.id,
    slug,
    title: truck.title,
    maker: truck.maker,
    href: truck.href,
    years: truck.years,
  }
}
