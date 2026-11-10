import { PHOTO_ANGLES, type PhotoAngle } from '@/lib/binder/types'

export const AI_OUTCOMES = ['looks_right', 'reject', 'wrong_truck', 'needs_jake'] as const
export type AiOutcome = (typeof AI_OUTCOMES)[number]

export const AI_OUTCOME_FILTERS = ['', 'looks_right', 'needs_jake', 'wrong_truck', 'reject', 'none'] as const
export type AiOutcomeFilter = (typeof AI_OUTCOME_FILTERS)[number]

export const AI_SORTS = ['created', 'confidence'] as const
export type AiSort = (typeof AI_SORTS)[number]

export type PhotoAiReview = {
  outcome: AiOutcome
  suggestedTruckSlug: string | null
  angle: PhotoAngle | null
  confidence: number | null
  reasons: string[]
  questions: string[]
  rejectReason: string | null
  generationYearsGuess: string | null
  reviewedAt: string | null
}

const ANGLE_ALIASES: Record<string, PhotoAngle> = {
  front: 'front',
  'front-3/4': 'front-3q',
  'front-3q': 'front-3q',
  side: 'side',
  'rear-3/4': 'rear-3q',
  'rear-3q': 'rear-3q',
  rear: 'rear',
  other: 'other',
}

export function aiAngleToBinder(value: string | null | undefined): PhotoAngle | null {
  if (!value) return null
  const key = value.trim().toLowerCase()
  const mapped = ANGLE_ALIASES[key]
  if (mapped) return mapped
  if ((PHOTO_ANGLES as readonly string[]).includes(key)) return key as PhotoAngle
  return null
}

export function parseAiOutcome(value: string | null): AiOutcomeFilter | null {
  if (value === null || value === '') return ''
  if ((AI_OUTCOME_FILTERS as readonly string[]).includes(value)) return value as AiOutcomeFilter
  return null
}

export function parseAiSort(value: string | null): AiSort | null {
  if (value === null || value === '') return 'created'
  if ((AI_SORTS as readonly string[]).includes(value)) return value as AiSort
  return null
}

export function aiBadgeClass(outcome: AiOutcome): string {
  if (outcome === 'looks_right') return 'binder-ai-badge is-ai-ok'
  if (outcome === 'needs_jake') return 'binder-ai-badge is-ai-warn'
  return 'binder-ai-badge is-ai-bad'
}

export function aiBadgeLabel(outcome: AiOutcome): string {
  if (outcome === 'looks_right') return 'Looks right'
  if (outcome === 'needs_jake') return 'Needs you'
  if (outcome === 'wrong_truck') return 'Wrong truck'
  return 'Reject'
}

export function rejectReasonLabel(code: string | null): string {
  if (!code) return 'Reject'
  return code.replace(/_/g, ' ')
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}
