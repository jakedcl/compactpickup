import 'server-only'

import type { PoolClient } from 'pg'
import sharp from 'sharp'
import { l2Normalize } from '@/lib/binder/clip'
import { sha256Hex, compressToWebp } from '@/lib/binder/images'
import { insertPendingPhoto, photoIdForSha256 } from '@/lib/binder/photos'
import { photoObjectKey } from '@/lib/binder/r2'
import type { ScanCatalogTruck, ScanMatch, ScanState } from '@/lib/binder/scan-types'

/**
 * Cosine similarity cutoff for a confident model name.
 *
 * CLIP ViT-B/32 puts compact pickups close together. A different truck is
 * often still around 0.75–0.85, and a similar photo of the same model is
 * usually higher. 0.82 asks the best truck (mean of its closest few photos)
 * to clear that band. Below it, the page says "not sure" and still shows
 * the closest guess. Raise it if guesses are too bold. Lower it if a clear
 * photo of a truck we have several pictures of stays unsure.
 */
export const SCAN_MATCH_MIN_SIMILARITY = 0.82
export const SCAN_TOP_TRUCKS = 3
export const SCAN_PHOTOS_PER_TRUCK = 3
export const SCAN_NEIGHBOR_LIMIT = 40
export const SCAN_EF_SEARCH = 80

export const SCAN_LIMIT = 20
export const SCAN_WINDOW_SECONDS = 10 * 60
export const SUBMIT_LIMIT = 8
export const SUBMIT_WINDOW_SECONDS = 24 * 60 * 60
export const SUBMIT_SITE_LIMIT = 200
export const SUBMIT_SITE_WINDOW_SECONDS = 24 * 60 * 60
const RATE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000

export const VISITOR_MAX_BYTES = 4 * 1024 * 1024
export const SCAN_BODY_MAX_BYTES = 64 * 1024
export const SUBMIT_BODY_MAX_BYTES = 4_500_000
export const VISITOR_NOTE = 'Public scanner'

export const SCAN_RATE_MESSAGE = 'Too many scans from this network. Wait a few minutes and try again.'
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

export function sniffImage(bytes: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'heif' | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a') return 'gif'
  if (bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12).toLowerCase()
    if (['heic', 'heix', 'hevc', 'heif', 'mif1', 'msf1', 'avif'].includes(brand)) return 'heif'
  }
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
  for (const row of rows) {
    if (!row.truckId || !Number.isFinite(row.similarity)) continue
    let group = groups.get(row.truckId)
    if (!group) {
      group = { truckId: row.truckId, truckSlug: row.truckSlug, scores: [] }
      groups.set(row.truckId, group)
    }
    group.scores.push(row.similarity)
  }
  const ranked: Array<{ truckId: string; truckSlug: string; score: number }> = []
  for (const group of groups.values()) {
    const best = group.scores.sort((a, b) => b - a).slice(0, SCAN_PHOTOS_PER_TRUCK)
    const score = best.reduce((sum, n) => sum + n, 0) / best.length
    ranked.push({ truckId: group.truckId, truckSlug: group.truckSlug, score })
  }
  ranked.sort((a, b) => b.score - a.score || a.truckId.localeCompare(b.truckId))
  return ranked.slice(0, SCAN_TOP_TRUCKS)
}

export function labelMatches(neighbors: NeighborPhoto[], catalog: ScanCatalogTruck[]): ScanOutcome {
  const threshold = SCAN_MATCH_MIN_SIMILARITY
  if (neighbors.length === 0) return { state: 'learning', matches: [], threshold }
  const byId = new Map(catalog.map((truck) => [truck.id, truck]))
  const matches: ScanMatch[] = []
  for (const group of aggregateTruckScores(neighbors)) {
    const truck = byId.get(group.truckId)
    if (!truck) continue
    matches.push({ ...truck, score: roundScore(group.score) })
  }
  if (matches.length === 0) return { state: 'guess', matches: [], threshold }
  const top = aggregateTruckScores(neighbors).find((group) => byId.has(group.truckId))
  const state: ScanState = top && top.score >= threshold ? 'match' : 'guess'
  return { state, matches, threshold }
}

function rateIp(ip: string | null): string {
  const value = ip?.trim() || 'unknown'
  return value.slice(0, 64)
}

async function takeRateSlot(
  client: ScanClient,
  ip: string,
  route: 'scan' | 'submit' | 'submit-site',
  limit: number,
  windowSeconds: number,
  now: number,
): Promise<boolean> {
  const bucket = windowStart(now, windowSeconds)
  await client.query(`delete from scanner_rate_buckets where bucket < $1`, [new Date(now - RATE_RETENTION_MS)])
  const result = await client.query<{ hits: number | string }>(
    `insert into scanner_rate_buckets (ip, route, bucket, hits)
     values ($1, $2, $3, 1)
     on conflict (ip, route, bucket)
     do update set hits = scanner_rate_buckets.hits + 1
     returning hits`,
    [ip, route, bucket],
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

async function nearestApproved(client: ScanClient, vector: Float32Array): Promise<NeighborPhoto[]> {
  const result = await client.query<{ truck_id: string; truck_slug: string; similarity: number | string }>(
    `select truck_id, truck_slug,
            (1 - (embedding <=> $1::vector))::float8 as similarity
     from photos
     where status = 'approved' and embedding is not null
     order by embedding <=> $1::vector
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
  const key = rateIp(ip)
  const limited = await withTransaction(deps, async (client) => {
    const allowed = await takeRateSlot(client, key, 'scan', SCAN_LIMIT, SCAN_WINDOW_SECONDS, deps.now())
    return !allowed
  })
  if (limited) return { ok: false, status: 429, error: 'rate', message: SCAN_RATE_MESSAGE }

  const neighbors = await withTransaction(deps, async (client) => {
    await client.query(`select set_config('hnsw.ef_search', $1, true)`, [String(SCAN_EF_SEARCH)])
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
  const meta = await sharp(bytes, { failOn: 'error' }).metadata()
  if (!meta.width || !meta.height) throw new Error('undecodable')
}

async function insertFeedback(
  client: ScanClient,
  row: {
    photoId: string
    guessed: ScanCatalogTruck
    corrected: ScanCatalogTruck | null
    verdict: 'right' | 'wrong'
    ip: string
  },
) {
  await client.query(
    `insert into scanner_feedback (
       photo_id, guessed_truck_id, guessed_truck_slug, verdict,
       corrected_truck_id, corrected_truck_slug, consent, ip
     ) values ($1, $2, $3, $4, $5, $6, true, $7)`,
    [
      row.photoId,
      row.guessed.id,
      row.guessed.slug,
      row.verdict,
      row.corrected?.id ?? null,
      row.corrected?.slug ?? null,
      row.ip,
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
  if (input.verdict !== 'right' && input.verdict !== 'wrong') {
    return { ok: false, status: 400, error: 'invalid', message: 'Say whether the guess was right or wrong.' }
  }
  const verdict: 'right' | 'wrong' = input.verdict

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
  if (verdict === 'wrong') {
    corrected = findTruck(catalog, input.correctedTruckId, input.correctedTruckSlug)
    if (!corrected || corrected.id === guessed.id) {
      return { ok: false, status: 400, error: 'truck', message: 'Pick the truck it actually is.' }
    }
  } else if (input.correctedTruckId || input.correctedTruckSlug) {
    return { ok: false, status: 400, error: 'truck', message: 'A right guess does not need a correction.' }
  }

  try {
    await assertDecodable(input.original)
  } catch {
    return { ok: false, status: 400, error: 'type', message: 'That file is not a photo we can read.' }
  }

  const ip = rateIp(input.ip)
  const limited = await withTransaction(deps, async (client) => {
    const personal = await takeRateSlot(client, ip, 'submit', SUBMIT_LIMIT, SUBMIT_WINDOW_SECONDS, deps.now())
    if (!personal) return true
    const site = await takeRateSlot(
      client,
      '*',
      'submit-site',
      SUBMIT_SITE_LIMIT,
      SUBMIT_SITE_WINDOW_SECONDS,
      deps.now(),
    )
    return !site
  })
  if (limited) return { ok: false, status: 429, error: 'rate', message: SUBMIT_RATE_MESSAGE }

  const sha256 = sha256Hex(input.original)
  const existingId = await withTransaction(deps, (client) => photoIdForSha256(asPool(client), sha256))
  const feedback = {
    guessed,
    corrected,
    verdict,
    ip,
  }

  if (existingId) {
    await withTransaction(deps, (client) => insertFeedback(client, { ...feedback, photoId: existingId }))
    return { ok: true, outcome: 'duplicate' }
  }

  const prepared = await compressToWebp(input.original)
  const r2Key = photoObjectKey(sha256)
  await deps.putPhoto(r2Key, prepared.data)

  const outcome = await withTransaction(deps, async (client) => {
    const inserted = await insertPendingPhoto(asPool(client), {
      truckId: (corrected ?? guessed).id,
      truckSlug: (corrected ?? guessed).slug,
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

export function normalizeScanEmbedding(value: unknown): Float32Array | null {
  return l2Normalize(value)
}
