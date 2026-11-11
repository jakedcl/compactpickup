import {
  AI_OUTCOMES,
  parseAiOutcome,
  parseAiSort,
  aiAngleToBinder,
  readStringArray,
  type AiOutcome,
  type AiOutcomeFilter,
  type AiSort,
  type PhotoAiReview,
} from '@/lib/binder/ai-review'
import { THUMB_CACHE_VERSION } from '@/lib/binder/limits'
import { PHOTO_ANGLES, PHOTO_STATUSES, type PhotoAngle, type PhotoStatus } from '@/lib/binder/types'

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const MAX_STATUS_IDS = 100
export const MAX_EMBED_ITEMS = 8
export const PAGE_SIZE_DEFAULT = 24
export const PAGE_SIZE_MAX = 48
export const SANITY_BATCH_LIMIT = 2
export const MAX_SKIP_REFS = 500

export function isTruckId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 200 &&
    !/[\s/?#\\]/.test(value) &&
    !value.startsWith('drafts.') &&
    !value.startsWith('versions.')
  )
}

export function parseStatusBody(
  body: unknown,
): { ok: true; ids: string[]; status: PhotoStatus } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The photos were not updated.' }
  }
  const record = body as Record<string, unknown>
  const status = record.status
  if (typeof status !== 'string' || !(PHOTO_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Choose pending, approved, or rejected.' }
  }
  if (!Array.isArray(record.ids) || record.ids.length === 0) {
    return { ok: false, error: 'Select at least one photo.' }
  }
  if (record.ids.length > MAX_STATUS_IDS) {
    return { ok: false, error: `Update at most ${MAX_STATUS_IDS} photos at a time.` }
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of record.ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return { ok: false, error: 'One of those photos was not found.' }
    }
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return { ok: true, ids, status: status as PhotoStatus }
}

export type ReviewDecision = {
  id: string
  status: PhotoStatus
  angle: PhotoAngle | null
  faceTagId: string | null
}

/** One review action: status plus the angle and face to store with it. */
export function parseReviewBody(
  body: unknown,
): { ok: true; decision: ReviewDecision } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The photo was not updated.' }
  }
  const record = body as Record<string, unknown>
  if (typeof record.id !== 'string' || !UUID_RE.test(record.id)) {
    return { ok: false, error: 'The photo was not found.' }
  }
  if (typeof record.status !== 'string' || !(PHOTO_STATUSES as readonly string[]).includes(record.status)) {
    return { ok: false, error: 'Choose pending, approved, or rejected.' }
  }
  if (!('angle' in record) || !('faceTagId' in record)) {
    return { ok: false, error: 'The photo was not updated.' }
  }
  let angle: PhotoAngle | null
  if (record.angle === null) angle = null
  else if (typeof record.angle === 'string' && (PHOTO_ANGLES as readonly string[]).includes(record.angle)) {
    angle = record.angle as PhotoAngle
  } else return { ok: false, error: 'That angle is not one this library stores.' }
  let faceTagId: string | null
  if (record.faceTagId === null) faceTagId = null
  else if (typeof record.faceTagId === 'string' && UUID_RE.test(record.faceTagId)) faceTagId = record.faceTagId
  else return { ok: false, error: 'That face tag is not on this truck.' }
  return {
    ok: true,
    decision: { id: record.id, status: record.status as PhotoStatus, angle, faceTagId },
  }
}

export type PhotoPatch = {
  truckId?: string
  angle?: PhotoAngle | null
  faceTagId?: string | null
}

export function parsePhotoPatch(body: unknown): { ok: true; patch: PhotoPatch } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The photo was not updated.' }
  }
  const record = body as Record<string, unknown>
  const patch: PhotoPatch = {}
  if ('truckId' in record) {
    if (typeof record.truckId !== 'string' || !isTruckId(record.truckId)) {
      return { ok: false, error: 'Pick a truck from the list.' }
    }
    patch.truckId = record.truckId
  }
  if ('angle' in record) {
    if (record.angle === null) patch.angle = null
    else if (typeof record.angle === 'string' && (PHOTO_ANGLES as readonly string[]).includes(record.angle)) {
      patch.angle = record.angle as PhotoAngle
    } else return { ok: false, error: 'That angle is not one this library stores.' }
  }
  if ('faceTagId' in record) {
    if (record.faceTagId === null) patch.faceTagId = null
    else if (typeof record.faceTagId === 'string' && UUID_RE.test(record.faceTagId)) patch.faceTagId = record.faceTagId
    else return { ok: false, error: 'That face tag is not on this truck.' }
  }
  if (!('truckId' in patch) && !('angle' in patch) && !('faceTagId' in patch)) {
    return { ok: false, error: 'Nothing to change.' }
  }
  return { ok: true, patch }
}

export type CurrentPhoto = {
  truckId: string | null
  truckSlug: string | null
  angle: PhotoAngle | null
  faceTagId: string | null
}

export function resolvePhotoPatch(
  current: CurrentPhoto,
  patch: PhotoPatch,
  trucks: ReadonlyMap<string, { slug: string }>,
  faces: ReadonlyArray<{ id: string; truckId: string }>,
):
  | { ok: true; truckId: string | null; truckSlug: string | null; angle: PhotoAngle | null; faceTagId: string | null }
  | { ok: false; error: string } {
  let truckId = current.truckId
  let truckSlug = current.truckSlug
  if (patch.truckId) {
    const truck = trucks.get(patch.truckId)
    if (!truck) return { ok: false, error: 'Pick a truck from the list.' }
    truckId = patch.truckId
    truckSlug = truck.slug
  }
  const angle = 'angle' in patch ? (patch.angle ?? null) : current.angle
  let faceTagId = 'faceTagId' in patch ? (patch.faceTagId ?? null) : current.faceTagId
  if (faceTagId) {
    const face = faces.find((item) => item.id === faceTagId)
    if (!face || face.truckId !== truckId) {
      if (!('faceTagId' in patch) && patch.truckId) faceTagId = null
      else return { ok: false, error: 'That face tag is not on this truck.' }
    }
  }
  return { ok: true, truckId, truckSlug, angle, faceTagId }
}

export function statusSql(ids: string[]): string {
  const placeholders = ids.map((_, index) => `$${index + 2}::uuid`).join(', ')
  return `update photos
      set status = $1,
          reviewed_at = case when $1::text = 'pending' then null else now() end,
          embedding_siglip = case when $1::text = 'approved' then embedding_siglip else null end
      where id in (${placeholders})
        and ($1::text <> 'approved' or truck_id is not null)
      returning id`
}

export function encodeCursor(createdAt: string, id: string): string {
  return `${createdAt}_${id}`
}

export function decodeCursor(value: string): { createdAt: string; id: string } | null {
  const index = value.lastIndexOf('_')
  if (index <= 0) return null
  const createdAt = value.slice(0, index)
  const id = value.slice(index + 1)
  if (!UUID_RE.test(id)) return null
  const time = Date.parse(createdAt)
  if (!Number.isFinite(time)) return null
  return { createdAt: new Date(time).toISOString(), id }
}

/** Cursor for confidence sort: `{conf|n}_{iso}_{uuid}` */
export function encodeConfidenceCursor(confidence: number | null, createdAt: string, id: string): string {
  const conf = confidence === null ? 'n' : String(confidence)
  return `${conf}_${createdAt}_${id}`
}

export function decodeConfidenceCursor(
  value: string,
): { confidence: number | null; createdAt: string; id: string } | null {
  const first = value.indexOf('_')
  const last = value.lastIndexOf('_')
  if (first <= 0 || last <= first) return null
  const confRaw = value.slice(0, first)
  const createdAt = value.slice(first + 1, last)
  const id = value.slice(last + 1)
  if (!UUID_RE.test(id)) return null
  const time = Date.parse(createdAt)
  if (!Number.isFinite(time)) return null
  const confidence = confRaw === 'n' ? null : Number(confRaw)
  if (confRaw !== 'n' && !Number.isFinite(confidence)) return null
  return { confidence, createdAt: new Date(time).toISOString(), id }
}

export function parseListQuery(url: string):
  | {
      ok: true
      status: PhotoStatus
      truckId: string | null
      truckIds: string[] | null
      missingEmbedding: boolean
      aiOutcome: AiOutcomeFilter
      sort: AiSort
      limit: number
      cursor:
        | { kind: 'created'; createdAt: string; id: string }
        | { kind: 'confidence'; confidence: number | null; createdAt: string; id: string }
        | null
    }
  | { ok: false; error: string } {
  const params = new URL(url).searchParams
  const status = params.get('status') ?? 'pending'
  if (!(PHOTO_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Choose pending, approved, or rejected.' }
  }
  const truckRaw = params.get('truckId')
  if (truckRaw && !isTruckId(truckRaw)) return { ok: false, error: 'Pick a truck from the list.' }
  let truckIds: string[] | null = null
  if (!truckRaw && params.has('trucks')) {
    const raw = params.get('trucks') ?? ''
    if (!raw) truckIds = []
    else {
      const ids = raw.split(',')
      if (ids.length > 80 || ids.some((id) => !isTruckId(id))) return { ok: false, error: 'Pick a truck from the list.' }
      truckIds = ids
    }
  }
  const limitRaw = params.get('limit')
  let limit = PAGE_SIZE_DEFAULT
  if (limitRaw) {
    if (!/^\d+$/.test(limitRaw)) return { ok: false, error: 'The page size is not valid.' }
    limit = Number(limitRaw)
    if (limit < 1 || limit > PAGE_SIZE_MAX) return { ok: false, error: 'The page size is not valid.' }
  }
  const sortRaw = params.get('sort')
  const sort = parseAiSort(sortRaw)
  if (sortRaw && sort === null) return { ok: false, error: 'That sort is not valid.' }
  const resolvedSort = sort ?? 'created'
  const cursorRaw = params.get('cursor')
  let cursor:
    | { kind: 'created'; createdAt: string; id: string }
    | { kind: 'confidence'; confidence: number | null; createdAt: string; id: string }
    | null = null
  if (cursorRaw) {
    if (resolvedSort === 'confidence') {
      const decoded = decodeConfidenceCursor(cursorRaw)
      if (!decoded) return { ok: false, error: 'That page link is not valid.' }
      cursor = { kind: 'confidence', ...decoded }
    } else {
      const decoded = decodeCursor(cursorRaw)
      if (!decoded) return { ok: false, error: 'That page link is not valid.' }
      cursor = { kind: 'created', ...decoded }
    }
  }
  const aiRaw = params.get('aiOutcome')
  const aiOutcome = parseAiOutcome(aiRaw)
  if (aiRaw && aiOutcome === null) return { ok: false, error: 'That AI filter is not valid.' }
  return {
    ok: true,
    status: status as PhotoStatus,
    truckId: truckRaw,
    truckIds,
    missingEmbedding: params.get('missingEmbedding') === '1',
    aiOutcome: aiOutcome ?? '',
    sort: resolvedSort,
    limit,
    cursor,
  }
}

export type PhotoAiReviewRow = {
  ai_outcome: string | null
  ai_suggested_truck_slug: string | null
  ai_angle: string | null
  ai_confidence: string | number | null
  ai_reasons: unknown
  ai_questions: unknown
  ai_reject_reason: string | null
  ai_generation_years_guess: string | null
  ai_reviewed_at: Date | string | null
}

function isoReview(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

export function aiReviewFromRow(row: PhotoAiReviewRow): PhotoAiReview | null {
  if (!row.ai_outcome) return null
  if (!(AI_OUTCOMES as readonly string[]).includes(row.ai_outcome)) {
    return null
  }
  const confidenceRaw = row.ai_confidence
  const confidence =
    confidenceRaw === null || confidenceRaw === undefined
      ? null
      : Number(typeof confidenceRaw === 'string' ? confidenceRaw : confidenceRaw)
  return {
    outcome: row.ai_outcome as AiOutcome,
    suggestedTruckSlug: row.ai_suggested_truck_slug,
    angle: aiAngleToBinder(row.ai_angle),
    confidence: Number.isFinite(confidence) ? confidence : null,
    reasons: readStringArray(row.ai_reasons),
    questions: readStringArray(row.ai_questions),
    rejectReason: row.ai_reject_reason,
    generationYearsGuess: row.ai_generation_years_guess,
    reviewedAt: isoReview(row.ai_reviewed_at),
  }
}

/** Cache-busting path for a stored photo. `v` changes when the bytes would. */
export function photoImagePath(id: string, sha256: string, size: 'full' | 'thumb' = 'full'): string {
  const version = size === 'thumb' ? `${sha256}-${THUMB_CACHE_VERSION}` : sha256
  const params = new URLSearchParams({ v: version })
  if (size === 'thumb') params.set('size', 'thumb')
  return `/api/admin/photos/${id}?${params}`
}

export function imageSizeParam(url: string): 'full' | 'thumb' | null {
  const size = new URL(url).searchParams.get('size')
  if (size === null || size === '' || size === 'full') return 'full'
  if (size === 'thumb') return 'thumb'
  return null
}

export function parseEmbedBody(
  body: unknown,
): { ok: true; items: { id: string; embedding: unknown }[] } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The fingerprint was not saved.' }
  }
  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'The fingerprint was not saved.' }
  }
  if (items.length > MAX_EMBED_ITEMS) {
    return { ok: false, error: `Send at most ${MAX_EMBED_ITEMS} fingerprints at a time.` }
  }
  const parsed: { id: string; embedding: unknown }[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: 'The fingerprint was not saved.' }
    }
    const record = item as { id?: unknown; embedding?: unknown }
    if (typeof record.id !== 'string' || !UUID_RE.test(record.id)) {
      return { ok: false, error: 'One of those photos was not found.' }
    }
    parsed.push({ id: record.id, embedding: record.embedding })
  }
  return { ok: true, items: parsed }
}

export function parseSkipRefs(body: unknown): { ok: true; skipRefs: string[] } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The Sanity import did not start.' }
  }
  const raw = (body as { skipRefs?: unknown }).skipRefs
  if (raw === undefined) return { ok: true, skipRefs: [] }
  if (!Array.isArray(raw) || raw.length > MAX_SKIP_REFS) {
    return { ok: false, error: 'The Sanity import did not start.' }
  }
  const skipRefs: string[] = []
  for (const ref of raw) {
    if (typeof ref !== 'string' || ref.length === 0 || ref.length > 300 || /[\s/?#\\]/.test(ref)) {
      return { ok: false, error: 'The Sanity import did not start.' }
    }
    skipRefs.push(ref)
  }
  return { ok: true, skipRefs }
}

export type ReviewPhoto = {
  id: string
  truckId: string | null
  truckSlug: string | null
  status: PhotoStatus
  angle: PhotoAngle | null
  faceTagId: string | null
  source: string
  sourceUrl: string | null
  author: string | null
  license: string | null
  width: number | null
  height: number | null
  createdAt: string
  notes: string | null
  sha256: string
  hasEmbedding: boolean
  aiReview: PhotoAiReview | null
}

export type ReviewTruck = {
  id: string
  slug: string
  title: string
  maker: string
}

export type ReviewFace = {
  id: string
  truckId: string
  label: string
}
