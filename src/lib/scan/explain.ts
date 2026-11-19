import type { ScanState } from '@/lib/binder/scan-types'

export type ExplainCheck = {
  id: 'score' | 'margin'
  label: string
  actual: number
  needed: number
  passed: boolean
}

export type ScanExplanation = {
  /** True when the server called this a confident match. */
  confident: boolean
  topScore: number | null
  runnerUpScore: number | null
  /** Top score minus runner-up, or null when there is no runner-up. */
  gap: number | null
  checks: ExplainCheck[]
  sentence: string
}

function two(n: number): string {
  return n.toFixed(2)
}

/**
 * Plain-English account of why a scan was called a match or a guess.
 * The server decides the state; the checks only show the numbers behind it.
 */
export function explainScan(input: {
  state: ScanState
  matches: Array<{ score: number }>
  threshold: number
  minMargin: number
}): ScanExplanation {
  const { state, matches, threshold, minMargin } = input
  const empty = { confident: false, topScore: null, runnerUpScore: null, gap: null, checks: [] }
  if (state === 'learning') {
    return { ...empty, sentence: 'No reference photos are available to compare against yet.' }
  }
  if (matches.length === 0) {
    return { ...empty, sentence: 'No truck in the catalog was close enough to show.' }
  }
  const top = matches[0].score
  const runnerUp = matches[1]?.score ?? null
  const gap = runnerUp === null ? null : top - runnerUp
  const scorePassed = top >= threshold
  const marginPassed = gap === null || gap >= minMargin
  const checks: ExplainCheck[] = [
    { id: 'score', label: 'Top score', actual: top, needed: threshold, passed: scorePassed },
  ]
  if (gap !== null) {
    checks.push({ id: 'margin', label: 'Lead over runner-up', actual: gap, needed: minMargin, passed: marginPassed })
  }
  const confident = state === 'match'
  let sentence: string
  if (confident) {
    sentence =
      gap === null
        ? `Top score ${two(top)} is above the ${two(threshold)} needed, so this counts as a match.`
        : `Top score ${two(top)} is above the ${two(threshold)} needed and leads the runner-up by ${two(gap)} (needs ${two(minMargin)}), so this counts as a match.`
  } else if (!scorePassed && !marginPassed && gap !== null) {
    sentence = `Top score ${two(top)} is below the ${two(threshold)} needed, and it leads the runner-up by only ${two(gap)} (needs ${two(minMargin)}), so this is a guess.`
  } else if (!scorePassed) {
    sentence = `Top score ${two(top)} is below the ${two(threshold)} needed for a match, so this is a guess.`
  } else if (gap !== null) {
    sentence = `Top score ${two(top)} clears ${two(threshold)}, but it leads the runner-up by only ${two(gap)} (needs ${two(minMargin)}), so this is a guess.`
  } else {
    sentence = 'The scanner is not confident enough to call this a match, so this is a guess.'
  }
  return { confident, topScore: top, runnerUpScore: runnerUp, gap, checks, sentence }
}

/** "412 ms" under a second, "1.8 s" above. */
export function formatStageMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
