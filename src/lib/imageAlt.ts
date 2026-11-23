/** Prefer the Sanity alt string. Fall back so an image is never left with alt="". */
export function imageAlt(alt: string | null | undefined, fallback: string): string {
  const trimmed = typeof alt === 'string' ? alt.trim() : ''
  if (trimmed && trimmed.toLowerCase() !== 'null') return trimmed
  const fallbackTrimmed = fallback.trim()
  return fallbackTrimmed || 'Truck photo'
}

export function truckStillAlt(
  alt: string | null | undefined,
  parts: { yearRange?: string | null; manufacturerName?: string | null; truckTitle?: string | null },
): string {
  const bits = [parts.yearRange, parts.manufacturerName, parts.truckTitle]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  return imageAlt(alt, bits.join(' '))
}
