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
} as const

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
