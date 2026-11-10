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

/** Visitor-facing match strength. Underlying score stays 0–1 cosine similarity. */
export function formatScanScorePercent(score: number): string {
  if (!Number.isFinite(score)) return '—%'
  const clamped = Math.min(1, Math.max(0, score))
  return `${Math.round(clamped * 100)}%`
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
