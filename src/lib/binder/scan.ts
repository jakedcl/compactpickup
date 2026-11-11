import 'server-only'

import { createHmac } from 'node:crypto'
import type { PoolClient } from 'pg'
import sharp from 'sharp'
import { SCAN_EMBEDDING_DIM, isStaleClipFingerprint, l2Normalize } from '@/lib/binder/clip'
import { loadProbeWeights, probeTruckScores } from '@/lib/scan/probe'
import { authSecret } from '@/lib/binder/env'
import { sha256Hex, compressToWebp, MAX_INPUT_PIXELS, pixelCountAllowed } from '@/lib/binder/images'
import { insertPendingPhoto, photoIdForSha256 } from '@/lib/binder/photos'
import { photoObjectKey } from '@/lib/binder/r2'
import type { ScanCatalogTruck, ScanMatch, ScanState } from '@/lib/binder/scan-types'

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Cosine similarity cutoff for a confident model name (SigLIP2-base image-to-image scale).
 * Photo-to-photo cosine sits around 0.79-0.89 for the top truck (held-out median 0.85),
 * so text-scale SigLIP numbers (0.3-0.6) do not apply here. Calibrated on 99 held-out
 * photos: 0.80 with a 0.02 margin fires on about half the scans at about 85% precision
 * (DB leave-one-out: 63% fire, 97% precision). Override with SCAN_MATCH_MIN_SIMILARITY.
 */
export const SCAN_MATCH_MIN_SIMILARITY = envNumber('SCAN_MATCH_MIN_SIMILARITY', 0.8)

/**
 * How far the top truck must lead the runner-up before the page calls it a match.
 * Override with SCAN_MATCH_MIN_MARGIN.
 */
export const SCAN_MATCH_MIN_MARGIN = envNumber('SCAN_MATCH_MIN_MARGIN', 0.02)

/** When a linear probe is loaded, match confidence uses max class probability instead. */
export const SCAN_PROBE_MATCH_MIN_PROBABILITY = envNumber('SCAN_PROBE_MATCH_MIN_PROBABILITY', 0.35)
export const SCAN_PROBE_MIN_MARGIN = envNumber('SCAN_PROBE_MIN_MARGIN', 0.04)
export const SCAN_TOP_TRUCKS = 3
export const SCAN_PHOTOS_PER_TRUCK = 3
export const SCAN_NEIGHBOR_LIMIT = 40
export const SCAN_EF_SEARCH = 80

export const SCAN_LIMIT = 20
export const SCAN_WINDOW_SECONDS = 10 * 60
export const SCAN_SITE_LIMIT = 2000
export const SCAN_SITE_WINDOW_SECONDS = 24 * 60 * 60
export const SUBMIT_LIMIT = 8
export const SUBMIT_WINDOW_SECONDS = 24 * 60 * 60
export const SUBMIT_SITE_LIMIT = 200
export const SUBMIT_SITE_WINDOW_SECONDS = 24 * 60 * 60
/** Shared subject for the site-wide ceilings. Hashed like an address; not stored raw. */
export const SCAN_SITE_SUBJECT = '*'
const RATE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000
const RATE_CLEANUP_CHANCE = 0.05

export const VISITOR_MAX_BYTES = 4 * 1024 * 1024
export const SCAN_BODY_MAX_BYTES = 64 * 1024
export const SUBMIT_BODY_MAX_BYTES = 4_500_000
export const VISITOR_NOTE = 'Public scanner'

export const SCAN_RATE_MESSAGE = 'Too many scans from this network. Wait a few minutes and try again.'
export const SCAN_BUSY_MESSAGE = 'The scanner is busy. Try again later.'
export const SUBMIT_RATE_MESSAGE = 'Too many photos from this network today. Try again tomorrow.'

export type ScanQuery = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
) => Promise<{ rows: T[] }>

export type ScanClient = {
  query: ScanQuery
  release: () => void
}

export type ScanDeps = {
  connect: () => Promise<ScanClient>
  catalog: () => Promise<ScanCatalogTruck[]>
  now: () => number
  hashSubject: (subject: string) => string
}

export type SubmitDeps = ScanDeps & {
  putPhoto: (key: string, body: Buffer) => Promise<void>
}

export type NeighborPhoto = {
  truckId: string
  truckSlug: string
  similarity: number
}

export type ScanOutcome = {
  state: ScanState
  matches: ScanMatch[]
  threshold: number
}

type Fail = { ok: false; status: number; error: string; message: string }
type ScanRun = { ok: true; outcome: ScanOutcome } | Fail
type SubmitRun = { ok: true; outcome: 'inserted' | 'duplicate' } | Fail
type Slot = 'ok' | 'personal' | 'site'

export function vectorLiteral(vector: Float32Array): string {
  const parts = new Array<string>(vector.length)
  for (let i = 0; i < vector.length; i += 1) {
    const n = vector[i]
    if (!Number.isFinite(n)) throw new Error('non-finite embedding')
    parts[i] = n.toString()
  }
  return `[${parts.join(',')}]`
}

export function windowStart(nowMs: number, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000
  return new Date(Math.floor(nowMs / windowMs) * windowMs)
}

export function hashVisitorKey(subject: string, secret = authSecret() ?? ''): string {
  if (secret.length < 16) throw new Error('AUTH_SECRET is not set')
  return createHmac('sha256', secret).update(subject).digest('hex')
}

/**
 * Visitor address for scanner rate limits.
 * Vercel sets x-real-ip to the connecting client. x-forwarded-for is only
 * a fallback because a browser can send its own value. This is specific to
 * Vercel; another host would need a different header.
 */
export function scannerClientIp(request: Request): string | null {
  const real = request.headers.get('x-real-ip')?.split(',')[0]?.trim()
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const raw = real || forwarded || ''
  if (!raw) return null
  return raw.slice(0, 128)
}

function ipv6Prefix64(ip: string): string | null {
  const bare = ip.trim().toLowerCase().split('%')[0]
  if (!bare.includes(':')) return null
  if (bare.includes('.')) {
    const tail = bare.slice(bare.lastIndexOf(':') + 1)
    const parts = tail.split('.')
    if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return tail
    return null
  }
  const halves = bare.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (left.some((group) => group === '') || right.some((group) => group === '')) return null
  const missing = 8 - left.length - right.length
  if (halves.length === 1 && missing !== 0) return null
  if (halves.length === 2 && missing < 1) return null
  const groups = [...left, ...Array.from({ length: Math.max(missing, 0) }, () => '0'), ...right]
  if (groups.length !== 8) return null
  const nums: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    nums.push(Number.parseInt(group, 16))
  }
  return nums.slice(0, 4).map((n) => n.toString(16)).join(':')
}

/** Rate-limit subject. IPv6 addresses share a bucket per /64. IPv4 is the whole address. */
export function rateSubject(ip: string | null): string {
  const value = ip?.trim() || 'unknown'
  const prefix = ipv6Prefix64(value)
  return (prefix ?? value).slice(0, 64)
}

export function sniffImage(bytes: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

function roundScore(score: number): number {
  return Math.round(score * 10_000) / 10_000
}

export function aggregateTruckScores(rows: NeighborPhoto[]): Array<{
  truckId: string
  truckSlug: string
  score: number
}> {
  const groups = new Map<string, { truckId: string; truckSlug: string; scores: number[] }>()
  let floor = Number.POSITIVE_INFINITY
  for (const row of rows) {
    if (!row.truckId || !Number.isFinite(row.similarity)) continue
    if (row.similarity < floor) floor = row.similarity
    let group = groups.get(row.truckId)
    if (!group) {
      group = { truckId: row.truckId, truckSlug: row.truckSlug, scores: [] }
      groups.set(row.truckId, group)
    }
    group.scores.push(row.similarity)
  }
  if (!Number.isFinite(floor)) return []
  const ranked: Array<{ truckId: string; truckSlug: string; score: number }> = []
  for (const group of groups.values()) {
    const best = group.scores.sort((a, b) => b - a).slice(0, SCAN_PHOTOS_PER_TRUCK)
    while (best.length < SCAN_PHOTOS_PER_TRUCK) best.push(floor)
    const score = best.reduce((sum, n) => sum + n, 0) / SCAN_PHOTOS_PER_TRUCK
    ranked.push({ truckId: group.truckId, truckSlug: group.truckSlug, score })
  }
  ranked.sort((a, b) => b.score - a.score || a.truckId.localeCompare(b.truckId))
  return ranked.slice(0, SCAN_TOP_TRUCKS)
}

type TruckRank = { truckId: string; truckSlug: string; score: number }

function outcomeFromRanks(
  ranked: TruckRank[],
  catalog: ScanCatalogTruck[],
  options: { threshold: number; minMargin: number },
): ScanOutcome {
  const threshold = options.threshold
  if (ranked.length === 0) return { state: 'learning', matches: [], threshold }
  const byId = new Map(catalog.map((truck) => [truck.id, truck]))
  const matches: ScanMatch[] = []
  for (const group of ranked) {
    const truck = byId.get(group.truckId)
    if (!truck) continue
    matches.push({ ...truck, score: roundScore(group.score) })
  }
  if (matches.length === 0) return { state: 'guess', matches: [], threshold }
  const top = ranked[0]
  const second = ranked[1]
  const marginOk = !second || top.score - second.score >= options.minMargin
  const state: ScanState = byId.has(top.truckId) && top.score >= threshold && marginOk ? 'match' : 'guess'
  return { state, matches, threshold }
}

export function labelMatches(neighbors: NeighborPhoto[], catalog: ScanCatalogTruck[]): ScanOutcome {
  if (neighbors.length === 0) {
    return { state: 'learning', matches: [], threshold: SCAN_MATCH_MIN_SIMILARITY }
  }
  return outcomeFromRanks(aggregateTruckScores(neighbors), catalog, {
    threshold: SCAN_MATCH_MIN_SIMILARITY,
    minMargin: SCAN_MATCH_MIN_MARGIN,
  })
}

export function labelProbeMatches(
  ranked: TruckRank[],
  catalog: ScanCatalogTruck[],
): ScanOutcome {
  if (ranked.length === 0) {
    return { state: 'learning', matches: [], threshold: SCAN_PROBE_MATCH_MIN_PROBABILITY }
  }
  return outcomeFromRanks(ranked, catalog, {
    threshold: SCAN_PROBE_MATCH_MIN_PROBABILITY,
    minMargin: SCAN_PROBE_MIN_MARGIN,
  })
}

async function takeRateSlot(
  client: ScanClient,
  ipHash: string,
  route: 'scan' | 'scan-site' | 'submit' | 'submit-site',
  limit: number,
  windowSeconds: number,
  now: number,
): Promise<boolean> {
  const bucket = windowStart(now, windowSeconds)
  if (Math.random() < RATE_CLEANUP_CHANCE) {
    await client.query(`delete from scanner_rate_buckets where bucket < $1`, [new Date(now - RATE_RETENTION_MS)])
  }
  const result = await client.query<{ hits: number | string }>(
    `insert into scanner_rate_buckets (ip_hash, route, bucket, hits)
     values ($1, $2, $3, 1)
     on conflict (ip_hash, route, bucket)
     do update set hits = scanner_rate_buckets.hits + 1
     returning hits`,
    [ipHash, route, bucket],
  )
  const hits = Number(result.rows[0]?.hits)
  return Number.isFinite(hits) && hits <= limit
}

async function withTransaction<T>(deps: ScanDeps, fn: (client: ScanClient) => Promise<T>): Promise<T> {
  const client = await deps.connect()
  try {
    await client.query('begin')
    const value = await fn(client)
    await client.query('commit')
    return value
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // The connection may already be closed.
    }
    throw error
  } finally {
    client.release()
  }
}

function asPool(client: ScanClient): PoolClient {
  return client as unknown as PoolClient
}

async function visitorHash(ip: string | null, deps: ScanDeps): Promise<string> {
  return deps.hashSubject(rateSubject(ip))
}

async function takeVisitorSlots(
  deps: ScanDeps,
  ip: string | null,
  personalRoute: 'scan' | 'submit',
  siteRoute: 'scan-site' | 'submit-site',
  personalLimit: number,
  personalWindow: number,
  siteLimit: number,
  siteWindow: number,
): Promise<Slot> {
  const personalKey = await visitorHash(ip, deps)
  const siteKey = deps.hashSubject(SCAN_SITE_SUBJECT)
  return withTransaction(deps, async (client) => {
    const personal = await takeRateSlot(client, personalKey, personalRoute, personalLimit, personalWindow, deps.now())
    if (!personal) return 'personal'
    const site = await takeRateSlot(client, siteKey, siteRoute, siteLimit, siteWindow, deps.now())
    return site ? 'ok' : 'site'
  })
}

async function nearestApproved(client: ScanClient, vector: Float32Array): Promise<NeighborPhoto[]> {
  const result = await client.query<{ truck_id: string; truck_slug: string; similarity: number | string }>(
    `select truck_id, truck_slug,
            (1 - (embedding_siglip <=> $1::vector))::float8 as similarity
     from photos
     where status = 'approved' and embedding_siglip is not null and truck_id is not null
     order by embedding_siglip <=> $1::vector
     limit $2`,
    [vectorLiteral(vector), SCAN_NEIGHBOR_LIMIT],
  )
  const rows: NeighborPhoto[] = []
  for (const row of result.rows) {
    const similarity = Number(row.similarity)
    if (typeof row.truck_id !== 'string' || !row.truck_id || !Number.isFinite(similarity)) continue
    rows.push({
      truckId: row.truck_id,
      truckSlug: typeof row.truck_slug === 'string' ? row.truck_slug : '',
      similarity,
    })
  }
  return rows
}

export async function runScan(vector: Float32Array, ip: string | null, deps: ScanDeps): Promise<ScanRun> {
  const slot = await takeVisitorSlots(
    deps,
    ip,
    'scan',
    'scan-site',
    SCAN_LIMIT,
    SCAN_WINDOW_SECONDS,
    SCAN_SITE_LIMIT,
    SCAN_SITE_WINDOW_SECONDS,
  )
  if (slot === 'personal') return { ok: false, status: 429, error: 'rate', message: SCAN_RATE_MESSAGE }
  if (slot === 'site') return { ok: false, status: 429, error: 'busy', message: SCAN_BUSY_MESSAGE }

  const probe = loadProbeWeights()
  if (probe) {
    const catalog = await deps.catalog()
    const ranked = probeTruckScores(vector, probe, catalog)
    return { ok: true, outcome: labelProbeMatches(ranked, catalog) }
  }

  const neighbors = await withTransaction(deps, async (client) => {
    await client.query(`select set_config('hnsw.ef_search', $1, true)`, [String(SCAN_EF_SEARCH)])
    await client.query(`select set_config('hnsw.iterative_scan', $1, true)`, ['relaxed_order'])
    return nearestApproved(client, vector)
  })
  if (neighbors.length === 0) {
    return { ok: true, outcome: labelMatches([], []) }
  }
  const catalog = await deps.catalog()
  return { ok: true, outcome: labelMatches(neighbors, catalog) }
}

function findTruck(catalog: ScanCatalogTruck[], id: string, slug: string): ScanCatalogTruck | null {
  if (!id || !slug) return null
  const truck = catalog.find((item) => item.id === id)
  if (!truck || truck.slug !== slug) return null
  return truck
}

async function assertDecodable(bytes: Buffer): Promise<void> {
  const meta = await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  if (!pixelCountAllowed(meta.width, meta.height)) throw new Error('undecodable')
  if (meta.format !== 'jpeg' && meta.format !== 'png' && meta.format !== 'webp') throw new Error('undecodable')
}

async function insertFeedback(
  client: ScanClient,
  row: {
    photoId: string
    guessed: ScanCatalogTruck
    corrected: ScanCatalogTruck | null
    correctedCustomText: string | null
    verdict: 'right' | 'wrong' | 'idk'
    ipHash: string
  },
) {
  await client.query(
    `insert into scanner_feedback (
       photo_id, guessed_truck_id, guessed_truck_slug, verdict,
       corrected_truck_id, corrected_truck_slug, corrected_truck_custom_text, consent, ip_hash
     ) values ($1, $2, $3, $4, $5, $6, $7, true, $8)`,
    [
      row.photoId,
      row.guessed.id,
      row.guessed.slug,
      row.verdict,
      row.corrected?.id ?? null,
      row.corrected?.slug ?? null,
      row.correctedCustomText,
      row.ipHash,
    ],
  )
}

export async function submitVisitorPhoto(
  input: {
    original: Buffer
    consent: boolean
    verdict: string
    guessedTruckId: string
    guessedTruckSlug: string
    correctedTruckId: string
    correctedTruckSlug: string
    correctedTruckCustomText: string
    ip: string | null
  },
  deps: SubmitDeps,
): Promise<SubmitRun> {
  if (input.consent !== true) {
    return {
      ok: false,
      status: 400,
      error: 'consent',
      message: 'Check the box to agree before sending the photo.',
    }
  }
  if (input.original.length === 0 || input.original.length > VISITOR_MAX_BYTES) {
    return { ok: false, status: 413, error: 'size', message: 'That photo is too large. Use one under 4 MB.' }
  }
  if (!sniffImage(input.original)) {
    return { ok: false, status: 400, error: 'type', message: 'Use a JPEG, PNG, or WebP photo.' }
  }
  if (input.verdict !== 'right' && input.verdict !== 'wrong' && input.verdict !== 'idk') {
    return { ok: false, status: 400, error: 'invalid', message: 'Say whether the guess was right, wrong, or uncertain.' }
  }
  const verdict: 'right' | 'wrong' | 'idk' = input.verdict
  const customText = input.correctedTruckCustomText.trim()
  if (verdict === 'right' && (input.correctedTruckId || input.correctedTruckSlug || customText)) {
    return { ok: false, status: 400, error: 'truck', message: 'A right guess does not need a correction.' }
  }
  if (verdict === 'idk' && (input.correctedTruckId || input.correctedTruckSlug || customText)) {
    return { ok: false, status: 400, error: 'truck', message: 'An uncertain guess does not need a correction.' }
  }
  if (verdict === 'wrong') {
    const catalogCorrection = Boolean(input.correctedTruckId && input.correctedTruckSlug)
    const customCorrection = customText.length > 0
    if (catalogCorrection === customCorrection) {
      return { ok: false, status: 400, error: 'truck', message: 'Pick the truck it actually is, or describe it in text.' }
    }
  }

  const slot = await takeVisitorSlots(
    deps,
    input.ip,
    'submit',
    'submit-site',
    SUBMIT_LIMIT,
    SUBMIT_WINDOW_SECONDS,
    SUBMIT_SITE_LIMIT,
    SUBMIT_SITE_WINDOW_SECONDS,
  )
  if (slot !== 'ok') return { ok: false, status: 429, error: 'rate', message: SUBMIT_RATE_MESSAGE }

  let catalog: ScanCatalogTruck[]
  try {
    catalog = await deps.catalog()
  } catch {
    return { ok: false, status: 500, error: 'offline', message: 'Signal lost. The truck list did not load.' }
  }
  const guessed = findTruck(catalog, input.guessedTruckId, input.guessedTruckSlug)
  if (!guessed) {
    return { ok: false, status: 400, error: 'truck', message: 'Pick a truck from the catalog.' }
  }
  let corrected: ScanCatalogTruck | null = null
  let correctedCustomText: string | null = null
  if (verdict === 'wrong') {
    if (customText) {
      if (customText.length > 200) {
        return { ok: false, status: 400, error: 'truck', message: 'That description is too long.' }
      }
      correctedCustomText = customText
    } else {
      corrected = findTruck(catalog, input.correctedTruckId, input.correctedTruckSlug)
      if (!corrected || corrected.id === guessed.id) {
        return { ok: false, status: 400, error: 'truck', message: 'Pick the truck it actually is.' }
      }
    }
  }

  try {
    await assertDecodable(input.original)
  } catch {
    return { ok: false, status: 400, error: 'type', message: 'That file is not a photo we can read.' }
  }

  const ipHash = await visitorHash(input.ip, deps)
  const sha256 = sha256Hex(input.original)
  const existingId = await withTransaction(deps, (client) => photoIdForSha256(asPool(client), sha256))
  const feedback = {
    guessed,
    corrected,
    correctedCustomText,
    verdict,
    ipHash,
  }

  if (existingId) {
    await withTransaction(deps, (client) => insertFeedback(client, { ...feedback, photoId: existingId }))
    return { ok: true, outcome: 'duplicate' }
  }

  const prepared = await compressToWebp(input.original)
  const r2Key = photoObjectKey(sha256)
  await deps.putPhoto(r2Key, prepared.data)

  const outcome = await withTransaction(deps, async (client) => {
    let truckId: string | null = null
    let truckSlug: string | null = null
    if (verdict === 'right') {
      truckId = guessed.id
      truckSlug = guessed.slug
    } else if (verdict === 'wrong' && corrected) {
      truckId = corrected.id
      truckSlug = corrected.slug
    }
    const inserted = await insertPendingPhoto(asPool(client), {
      truckId,
      truckSlug,
      source: 'visitor',
      sourceUrl: null,
      author: null,
      license: null,
      r2Key,
      width: prepared.width,
      height: prepared.height,
      sha256,
      notes: VISITOR_NOTE,
    })
    const photoId = await photoIdForSha256(asPool(client), sha256)
    if (!photoId) throw new Error('inserted photo has no id')
    await insertFeedback(client, { ...feedback, photoId })
    return inserted
  })
  return { ok: true, outcome }
}

export type ScanEmbeddingResult =
  | { ok: true; vector: Float32Array }
  | { ok: false; stale: boolean }

export function normalizeScanEmbedding(value: unknown): ScanEmbeddingResult {
  if (isStaleClipFingerprint(value)) return { ok: false, stale: true }
  const vector = l2Normalize(value, SCAN_EMBEDDING_DIM)
  if (!vector) return { ok: false, stale: false }
  return { ok: true, vector }
}

/** @deprecated Use normalizeScanEmbedding. */
export function normalizeScanEmbeddingLegacy(value: unknown): Float32Array | null {
  const result = normalizeScanEmbedding(value)
  return result.ok ? result.vector : null
}
