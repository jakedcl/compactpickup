import type { ScanState } from '@/lib/binder/scan-types'

export type DemoSampleKind =
  | 'easy'
  | 'far'
  | 'letterbox'
  | 'close-call'
  | 'out-of-catalog'
  | 'not-a-truck'

export type DemoSampleCredit = {
  /** Title of the source file. */
  title: string
  author: string
  license: string
  sourceUrl: string
  /** What was changed from the original, if anything (for example "black bars added"). */
  note?: string
}

export type DemoSample = {
  id: string
  kind: DemoSampleKind
  /** Public path, served from public/demo-samples/. */
  src: string
  /** Short button label: what makes this sample interesting. */
  label: string
  /** One line shown with the result: why this sample is in the demo. */
  why: string
  /** Catalog slug the scanner should answer, or null when no catalog truck is right. */
  expectedSlug: string | null
  expectedTitle: string | null
  credit: DemoSampleCredit
}

export type SampleVerdict = {
  tone: 'good' | 'warn' | 'bad'
  text: string
}

/**
 * Compares what the scanner showed with what the sample should produce.
 * `visible` is the list the visitor sees (after the display floor and adaptive 1–3 rule).
 */
export function sampleVerdict(
  sample: Pick<DemoSample, 'expectedSlug' | 'expectedTitle'>,
  state: ScanState,
  visible: Array<{ slug: string }>,
): SampleVerdict {
  if (sample.expectedSlug) {
    const name = sample.expectedTitle ?? sample.expectedSlug
    const index = visible.findIndex((match) => match.slug === sample.expectedSlug)
    if (index === 0) return { tone: 'good', text: `Right: the first guess is the ${name}.` }
    if (index > 0) {
      return { tone: 'warn', text: `Close: the ${name} is in the list, but as guess ${index + 1}, not first.` }
    }
    return { tone: 'bad', text: `Missed: this is a ${name}, and it was not in the guesses.` }
  }
  if (visible.length === 0) return { tone: 'good', text: 'Right: it did not claim a truck from the catalog.' }
  if (state === 'match') {
    return {
      tone: 'bad',
      text: 'Wrong: it confidently matched a catalog truck, but none of them is right for this photo.',
    }
  }
  return {
    tone: 'warn',
    text: 'Hedged: it offered guesses without a confident match. That is the safe answer for a photo with no catalog truck in it.',
  }
}

/** The built-in demo photos. Replace the files and these entries together. */
export const DEMO_SAMPLES: DemoSample[] = []
