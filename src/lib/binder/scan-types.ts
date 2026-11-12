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
 * Min raw cosine gap between the top score and a lower guess before the results popup hides that guess.
 * Compared as score1 − score2 and score1 − score3 only (never score2 − score3). About 25 points on the
 * 0.70–0.95 → 0–100% meter ({@link formatScanScorePercent}).
 */
export const SCAN_RESULTS_SCORE_GAP = 0.05

/** Adaptive 1/2/3 results rows from raw match scores (independent of confident-match margin). */
export function visibleScanMatches<T extends { score: number }>(matches: T[]): T[] {
  if (matches.length <= 1) return matches
  const [first, second, third] = matches
  const m12 = first.score - second.score
  if (m12 >= SCAN_RESULTS_SCORE_GAP) return [first]
  const m13 = first.score - (third?.score ?? Number.NEGATIVE_INFINITY)
  if (m13 >= SCAN_RESULTS_SCORE_GAP) return matches.slice(0, 2)
  return matches.slice(0, 3)
}

/**
 * Raw cosine floor for display rescaling. 0.70 shows as 0%, 0.95+ as 100%.
 */
export const SCAN_SCORE_DISPLAY_FLOOR = 0.7
/** Top of the visitor-facing meter (raw cosine at or above reads as 100%). */
export const SCAN_SCORE_DISPLAY_CEIL = 0.95
export const SCAN_SCORE_DISPLAY_SPAN = SCAN_SCORE_DISPLAY_CEIL - SCAN_SCORE_DISPLAY_FLOOR

/** Rounded 0–100 display percent for one raw cosine (display-only; not used alone on multi-guess UI). */
export function rawScanScorePercent(score: number): number {
  if (!Number.isFinite(score)) return 0
  const clamped = Math.min(1, Math.max(0, score))
  const scaled = ((clamped - SCAN_SCORE_DISPLAY_FLOOR) / SCAN_SCORE_DISPLAY_SPAN) * 100
  return Math.round(Math.min(100, Math.max(0, scaled)))
}

/** Cascade so lower guesses never show ≥ the guess above unless raw scores are equal. */
export function assignVisibleScanDisplayPercents<T extends { score: number }>(matches: T[]): number[] {
  const rows = matches.map((match) => rawScanScorePercent(match.score))
  for (let i = 1; i < rows.length; i++) {
    if (matches[i].score === matches[i - 1].score) continue
    if (rows[i] >= rows[i - 1]) {
      rows[i] = Math.max(0, rows[i - 1] - 1)
    }
  }
  return rows
}

/** Visitor-facing match strength for a single score (tests, single-value callers). */
export function formatScanScorePercent(score: number): string {
  if (!Number.isFinite(score)) return '—%'
  return `${rawScanScorePercent(score)}%`
}

export function sentenceCaseMake(maker: string): string {
  const trimmed = maker.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

export function scanGuessCardTitle(maker: string, title: string): string {
  const make = sentenceCaseMake(maker)
  return make ? `${make} ${title}`.trim() : title.trim()
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
