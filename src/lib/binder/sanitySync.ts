import { createClient } from '@sanity/client'
import type { PoolClient } from 'pg'
import { withDirectClient, withPooledClient } from '@/lib/binder/db'
import { MAX_ORIGINAL_BYTES } from '@/lib/binder/images'
import {
  assertSanityCdnUrl,
  canonicalSanityUrl,
  collectImages,
  parseImageRef,
  sanityDerivativeUrl,
  sanityImageUrl,
  type FoundImage,
} from '@/lib/binder/sanityImages'
import { storeOriginalPhoto } from '@/lib/binder/store-photo'
import { apiVersion, dataset, projectId } from '@/lib/sanityConfig'
import { SANITY_BATCH_LIMIT } from '@/lib/binder/review'

export type PlannedSanityPhoto = {
  truckId: string
  slug: string
  assetRef: string
  canonicalUrl: string
  downloadUrl: string
  notes: string | null
}

type TruckDoc = {
  _id: string
  slug?: { current?: string }
}

export function safeReason(error: unknown): string {
  if (!(error instanceof Error)) return 'Error'
  const message = error.message.trim()
  if (
    message.length > 0 &&
    message.length <= 80 &&
    /^[a-z0-9 .:'-]+$/i.test(message) &&
    !/key|secret|token|password|database|postgres/i.test(message)
  ) {
    return message
  }
  return error.name || 'Error'
}

export function plannedFromImage(
  truckId: string,
  slug: string,
  image: FoundImage,
  assetUrl: string | null,
): PlannedSanityPhoto | null {
  const raw = assetUrl || sanityImageUrl(image.assetRef, projectId, dataset)
  if (!raw) return null
  let canonicalUrl: string
  let downloadUrl: string
  try {
    canonicalUrl = canonicalSanityUrl(raw)
    downloadUrl = sanityDerivativeUrl(raw)
    assertSanityCdnUrl(downloadUrl)
  } catch {
    return null
  }
  const parts = [image.alt, image.caption].filter((part): part is string => Boolean(part?.trim()))
  return {
    truckId,
    slug,
    assetRef: image.assetRef,
    canonicalUrl,
    downloadUrl,
    notes: parts.length > 0 ? parts.join(' — ').slice(0, 2000) : null,
  }
}

export async function downloadSanityDerivative(url: string): Promise<Buffer> {
  assertSanityCdnUrl(url)
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (type.startsWith('text/')) throw new Error('not an image')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error('empty image')
  if (bytes.length > MAX_ORIGINAL_BYTES) throw new Error('image too large')
  return bytes
}

async function assetUrls(ids: string[]): Promise<Map<string, string>> {
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const urls = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100)
    const rows = await client.fetch<Array<{ _id: string; url?: string | null }>>(
      '*[_id in $ids]{ _id, url }',
      { ids: slice },
    )
    for (const row of rows) {
      if (row.url) urls.set(row._id, row.url)
    }
  }
  return urls
}

let planCache: { at: number; plan: PlannedSanityPhoto[] } | null = null

export async function loadSanityPlan(): Promise<PlannedSanityPhoto[]> {
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const docs = await client.fetch<TruckDoc[]>(`*[_type == "truckModel" && !(_id in path("drafts.**"))]`)
  const planned: PlannedSanityPhoto[] = []
  const assetIds: string[] = []
  const pending: Array<{ truckId: string; slug: string; image: FoundImage }> = []
  for (const doc of docs) {
    if (doc._id.startsWith('drafts.') || doc._id.startsWith('versions.')) continue
    const slug = doc.slug?.current
    if (!slug) continue
    const seen = new Set<string>()
    for (const image of collectImages(doc)) {
      if (seen.has(image.assetRef)) continue
      seen.add(image.assetRef)
      const parsed = parseImageRef(image.assetRef)
      if (parsed) assetIds.push(parsed.assetId)
      pending.push({ truckId: doc._id, slug, image })
    }
  }
  const urls = await assetUrls([...new Set(assetIds)])
  for (const item of pending) {
    const parsed = parseImageRef(item.image.assetRef)
    const assetUrl = parsed ? (urls.get(parsed.assetId) ?? null) : null
    const photo = plannedFromImage(item.truckId, item.slug, item.image, assetUrl)
    if (photo) planned.push(photo)
  }
  return planned
}

async function cachedPlan(): Promise<PlannedSanityPhoto[]> {
  if (planCache && Date.now() - planCache.at < 60_000) return planCache.plan
  const plan = await loadSanityPlan()
  planCache = { at: Date.now(), plan }
  return plan
}

async function knownCanonicalUrls(db: PoolClient): Promise<Set<string>> {
  const result = await db.query<{ source_url: string }>(
    `select source_url from photos where source = 'sanity' and source_url is not null`,
  )
  const known = new Set<string>()
  for (const row of result.rows) {
    try {
      known.add(canonicalSanityUrl(row.source_url))
    } catch {
      known.add(row.source_url.split('?')[0] ?? row.source_url)
    }
  }
  return known
}

async function storePlanned(db: PoolClient, item: PlannedSanityPhoto, original: Buffer) {
  return storeOriginalPhoto(db, {
    original,
    truckId: item.truckId,
    truckSlug: item.slug,
    source: 'sanity',
    sourceUrl: item.canonicalUrl,
    author: null,
    license: null,
    notes: item.notes,
  })
}

export type SanityBatchResult = {
  inserted: number
  skipped: number
  failed: number
  failedRefs: string[]
  remaining: number
}

export async function importSanityBatch(
  skipRefs: readonly string[],
  limit = SANITY_BATCH_LIMIT,
): Promise<SanityBatchResult> {
  const plan = await cachedPlan()
  const bounded = Math.max(1, Math.min(limit, SANITY_BATCH_LIMIT))
  return withPooledClient(async (db) => {
    const known = await knownCanonicalUrls(db)
    const skip = new Set(skipRefs)
    const todo = plan.filter((item) => !known.has(item.canonicalUrl) && !skip.has(item.assetRef))
    const batch = todo.slice(0, bounded)
    let inserted = 0
    let skipped = 0
    let failed = 0
    const failedRefs: string[] = []
    for (const item of batch) {
      try {
        const original = await downloadSanityDerivative(item.downloadUrl)
        const outcome = await storePlanned(db, item, original)
        if (outcome === 'inserted') inserted += 1
        else skipped += 1
      } catch (error) {
        failed += 1
        failedRefs.push(item.assetRef)
        console.error(`binder: sanity import failed (${safeReason(error)})`)
      }
    }
    return {
      inserted,
      skipped,
      failed,
      failedRefs,
      remaining: Math.max(0, todo.length - batch.length),
    }
  })
}

export async function importAllSanityPhotos(log: (line: string) => void): Promise<{
  inserted: number
  skipped: number
  failed: number
}> {
  const plan = await loadSanityPlan()
  let inserted = 0
  let skipped = 0
  let failed = 0
  await withDirectClient(async (db) => {
    const known = await knownCanonicalUrls(db)
    for (const item of plan) {
      if (known.has(item.canonicalUrl)) {
        skipped += 1
        log(`skip ${item.slug} already stored`)
        continue
      }
      try {
        const original = await downloadSanityDerivative(item.downloadUrl)
        const outcome = await storePlanned(db, item, original)
        if (outcome === 'inserted') {
          inserted += 1
          known.add(item.canonicalUrl)
          log(`ok ${item.slug}`)
        } else {
          skipped += 1
          known.add(item.canonicalUrl)
          log(`skip ${item.slug} already stored`)
        }
      } catch (error) {
        failed += 1
        log(`fail ${item.slug} ${safeReason(error)}`)
      }
    }
  })
  return { inserted, skipped, failed }
}
