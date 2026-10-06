/** Prefer the Sanity alt string. Fall back so an image is never left with alt="". */
export function imageAlt(alt: string | null | undefined, fallback: string): string {
  const trimmed = typeof alt === 'string' ? alt.trim() : ''
  if (trimmed && trimmed.toLowerCase() !== 'null') return trimmed
  const fallbackTrimmed = fallback.trim()
  return fallbackTrimmed || 'Truck photo'
}
