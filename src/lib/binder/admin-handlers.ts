import { getSession } from '@/lib/binder/session-cookie'
import { isSameOrigin } from '@/lib/binder/origin'
import { query, withPooledClient } from '@/lib/binder/db'
import { readJsonObject } from '@/lib/binder/http'
import { assertUploadFormat, compressToThumb, MAX_UPLOAD_BYTES } from '@/lib/binder/images'
import { photoFile } from '@/lib/binder/photos'
import { getPhotoBytes, putPhoto, readPhotoIfExists, thumbObjectKey } from '@/lib/binder/r2'
import { storeOriginalPhoto } from '@/lib/binder/store-photo'
import { importSanityBatch, type SanityBatchResult } from '@/lib/binder/sanitySync'
import { listCatalogTrucks, type CatalogTruck } from '@/lib/binder/trucks'
import { normalizeEmbedding, vectorLiteral } from '@/lib/binder/embedding'
import { APPROVED_TARGET, sortCoverage, type CoverageTruck } from '@/lib/binder/coverage'
import { PHOTO_ANGLES, PHOTO_STATUSES, type PhotoAngle, type PhotoStatus } from '@/lib/binder/types'
import {
  UUID_RE,
  encodeCursor,
  imageSizeParam,
  parseEmbedBody,
  parseListQuery,
  parsePhotoPatch,
  parseSkipRefs,
  isTruckId,
  parseStatusBody,
  resolvePhotoPatch,
  statusSql,
  type ReviewFace,
  type ReviewPhoto,
  type ReviewTruck,
} from '@/lib/binder/review'

export type AdminSql = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>
}

type SessionFn = () => Promise<{ email: string } | null>

const defaultDb: AdminSql = {
  async query<T>(text: string, params?: readonly unknown[]) {
    const result = await query(text, params ? [...params] : undefined)
    return { rows: result.rows as T[], rowCount: result.rowCount }
  },
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

async function guard(request: Request, session: SessionFn, write: boolean): Promise<Response | null> {
  if (write && !isSameOrigin(request)) return json({ error: 'That request came from another site.' }, 403)
  const current = await session()
  if (!current) return json({ error: 'Unauthorized' }, 401)
  return null
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function asAngle(value: string | null): PhotoAngle | null {
  if (!value) return null
  return (PHOTO_ANGLES as readonly string[]).includes(value) ? (value as PhotoAngle) : null
}

function asStatus(value: string): PhotoStatus {
  return (PHOTO_STATUSES as readonly string[]).includes(value) ? (value as PhotoStatus) : 'pending'
}

type PhotoDbRow = {
  id: string
  truck_id: string
  truck_slug: string
  status: string
  angle: string | null
  face_tag_id: string | null
  source: string
  source_url: string | null
  author: string | null
  license: string | null
  width: number | null
  height: number | null
  created_at: Date | string
  notes: string | null
  sha256: string
  has_embedding: boolean
}

function toPhoto(row: PhotoDbRow): ReviewPhoto {
  return {
    id: row.id,
    truckId: row.truck_id,
    truckSlug: row.truck_slug,
    status: asStatus(row.status),
    angle: asAngle(row.angle),
    faceTagId: row.face_tag_id,
    source: row.source,
    sourceUrl: row.source_url,
    author: row.author,
    license: row.license,
    width: row.width,
    height: row.height,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    notes: row.notes,
    sha256: row.sha256,
    hasEmbedding: Boolean(row.has_embedding),
  }
}

async function countMap(db: AdminSql): Promise<Record<PhotoStatus, number>> {
  const result = await db.query<{ status: string; n: number | string }>(
    `select status, count(*)::int as n from photos group by status`,
  )
  const counts = { pending: 0, approved: 0, rejected: 0 }
  for (const row of result.rows) {
    if (!(PHOTO_STATUSES as readonly string[]).includes(row.status)) continue
    counts[row.status as PhotoStatus] = Number(row.n) || 0
  }
  return counts
}

export async function handlePhotoList(
  request: Request,
  deps: { session?: SessionFn; db?: AdminSql } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const db = deps.db ?? defaultDb
  const denied = await guard(request, session, false)
  if (denied) return denied
  const parsed = parseListQuery(request.url)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  try {
    const params: unknown[] = [parsed.status]
    const truckSql = parsed.truckId ? `$${params.push(parsed.truckId)}` : 'null'
    const missingSql = `$${params.push(parsed.missingEmbedding)}`
    const cursorAt = parsed.cursor ? `$${params.push(parsed.cursor.createdAt)}` : 'null'
    const cursorId = parsed.cursor ? `$${params.push(parsed.cursor.id)}` : 'null'
    const limitSql = `$${params.push(parsed.limit + 1)}`
    const listed = await db.query<PhotoDbRow>(
      `select id, truck_id, truck_slug, status, angle, face_tag_id, source, source_url,
              author, license, width, height, created_at, notes, sha256,
              (embedding is not null) as has_embedding
       from photos
       where status = $1
         and (${truckSql}::text is null or truck_id = ${truckSql})
         and (${missingSql}::boolean = false or embedding is null)
         and (${cursorAt}::timestamptz is null or (created_at, id) < (${cursorAt}::timestamptz, ${cursorId}::uuid))
       order by created_at desc, id desc
       limit ${limitSql}`,
      params,
    )
    const hasMore = listed.rows.length > parsed.limit
    const page = hasMore ? listed.rows.slice(0, parsed.limit) : listed.rows
    const last = page.at(-1)
    const createdAt = last ? iso(last.created_at) : null
    const [counts, missing] = await Promise.all([
      countMap(db),
      db.query<{ n: number | string }>(
        `select count(*)::int as n from photos where status = 'approved' and embedding is null`,
      ),
    ])
    return json({
      photos: page.map(toPhoto),
      nextCursor: hasMore && last && createdAt ? encodeCursor(createdAt, last.id) : null,
      counts,
      missingEmbeddings: Number(missing.rows[0]?.n) || 0,
    })
  } catch (error) {
    console.error(`binder: photo list failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The photos did not load.' }, 500)
  }
}

export async function handlePhotoStatus(
  request: Request,
  deps: { session?: SessionFn; db?: AdminSql } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const db = deps.db ?? defaultDb
  const denied = await guard(request, session, true)
  if (denied) return denied
  const body = await readJsonObject(request)
  const parsed = parseStatusBody(body)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const statement = statusSql(parsed.ids)
  try {
    const result = await db.query<{ id: string }>(statement, [parsed.status, ...parsed.ids])
    return json({ updated: result.rows.length, status: parsed.status })
  } catch (error) {
    console.error(`binder: status update failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The photos were not updated.' }, 500)
  }
}

export async function handlePhotoPatch(
  request: Request,
  id: string,
  deps: { session?: SessionFn; db?: AdminSql; trucks?: () => Promise<CatalogTruck[]> } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const db = deps.db ?? defaultDb
  const trucks = deps.trucks ?? listCatalogTrucks
  const denied = await guard(request, session, true)
  if (denied) return denied
  if (!UUID_RE.test(id)) return json({ error: 'The photo was not found.' }, 404)
  const body = await readJsonObject(request)
  const parsed = parsePhotoPatch(body)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  try {
    const currentResult = await db.query<{
      truck_id: string
      truck_slug: string
      angle: string | null
      face_tag_id: string | null
    }>(`select truck_id, truck_slug, angle, face_tag_id from photos where id = $1`, [id])
    const current = currentResult.rows[0]
    if (!current) return json({ error: 'The photo was not found.' }, 404)
    const catalog = new Map<string, { slug: string }>()
    if (parsed.patch.truckId) {
      for (const truck of await trucks()) catalog.set(truck.id, { slug: truck.slug })
    }
    let faces: { id: string; truckId: string }[] = []
    if (parsed.patch.truckId || 'faceTagId' in parsed.patch) {
      const faceRows = await db.query<{ id: string; truck_id: string }>(
        `select id, truck_id from truck_faces where truck_id = $1 or truck_id = $2`,
        [current.truck_id, parsed.patch.truckId ?? current.truck_id],
      )
      faces = faceRows.rows.map((row) => ({ id: row.id, truckId: row.truck_id }))
    }
    const resolved = resolvePhotoPatch(
      {
        truckId: current.truck_id,
        truckSlug: current.truck_slug,
        angle: asAngle(current.angle),
        faceTagId: current.face_tag_id,
      },
      parsed.patch,
      catalog,
      faces,
    )
    if (!resolved.ok) return json({ error: resolved.error }, 400)
    const updated = await db.query<{ id: string }>(
      `update photos
       set truck_id = $1, truck_slug = $2, angle = $3, face_tag_id = $4
       where id = $5::uuid and truck_id = $6
       returning id`,
      [resolved.truckId, resolved.truckSlug, resolved.angle, resolved.faceTagId, id, current.truck_id],
    )
    if (updated.rows.length === 0) {
      return json({ error: 'The photo changed. Reload it and try again.' }, 409)
    }
    return json({ ok: true })
  } catch (error) {
    console.error(`binder: photo update failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The photo was not updated.' }, 500)
  }
}

export async function handleEmbeddings(
  request: Request,
  deps: { session?: SessionFn; db?: AdminSql } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const db = deps.db ?? defaultDb
  const denied = await guard(request, session, true)
  if (denied) return denied
  const body = await readJsonObject(request)
  const parsed = parseEmbedBody(body)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const prepared = parsed.items.map((item) => ({ id: item.id, vector: normalizeEmbedding(item.embedding) }))
  if (prepared.every((item) => !item.vector)) {
    return json({ error: 'The fingerprint must be 512 numbers.' }, 400)
  }
  const updated: string[] = []
  const skipped: string[] = []
  try {
    for (const item of prepared) {
      if (!item.vector) {
        skipped.push(item.id)
        continue
      }
      const result = await db.query<{ id: string }>(
        `update photos
         set embedding = $2::vector
         where id = $1::uuid and status = 'approved'
         returning id`,
        [item.id, vectorLiteral(item.vector)],
      )
      if (result.rows.length > 0) updated.push(item.id)
      else skipped.push(item.id)
    }
    return json({ updated, skipped })
  } catch (error) {
    console.error(`binder: embedding save failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The fingerprint was not saved.' }, 500)
  }
}

type PhotoStorage = {
  read: (key: string) => Promise<Uint8Array>
  readIfExists: (key: string) => Promise<Uint8Array | null>
  put: (key: string, body: Buffer) => Promise<void>
  thumb: (input: Buffer) => Promise<Buffer>
}

/** Full bytes, or the stored thumb. A missing thumb is built from the full photo and saved. */
export async function bytesForStoredPhoto(
  file: { r2Key: string; sha256: string },
  size: 'full' | 'thumb',
  io: PhotoStorage,
): Promise<Uint8Array> {
  if (size === 'full') return io.read(file.r2Key)
  const key = thumbObjectKey(file.sha256)
  const existing = await io.readIfExists(key)
  if (existing) return existing
  const full = await io.read(file.r2Key)
  const thumb = await io.thumb(Buffer.from(full))
  try {
    await io.put(key, thumb)
  } catch (error) {
    console.error(`binder: thumb upload failed (${error instanceof Error ? error.name : 'Error'})`)
  }
  return new Uint8Array(thumb)
}

async function readStoredImage(id: string, size: 'full' | 'thumb'): Promise<Uint8Array | null> {
  const file = await photoFile(id)
  if (!file) return null
  return bytesForStoredPhoto(file, size, {
    read: (key) => getPhotoBytes(key),
    readIfExists: (key) => readPhotoIfExists(key),
    put: (key, body) => putPhoto(key, body),
    thumb: (input) => compressToThumb(input),
  })
}

const IMAGE_CACHE = 'private, max-age=86400, immutable'

export async function handlePhotoImage(
  request: Request,
  id: string,
  deps: { session?: SessionFn; readImage?: (photoId: string, size: 'full' | 'thumb') => Promise<Uint8Array | null> } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const readImage = deps.readImage ?? readStoredImage
  const denied = await guard(request, session, false)
  if (denied) return denied
  if (!UUID_RE.test(id)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  const size = imageSizeParam(request.url)
  if (!size) return new Response('The photo did not load.', { status: 400, headers: { 'cache-control': 'no-store' } })
  try {
    const bytes = await readImage(id, size)
    if (!bytes) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cache-control': IMAGE_CACHE,
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    console.error(`binder: photo read failed (${error instanceof Error ? error.name : 'Error'})`)
    return new Response('The photo did not load.', { status: 500, headers: { 'cache-control': 'no-store' } })
  }
}

type UploadInput = {
  original: Buffer
  truckId: string
  truckSlug: string
  source: 'jake-upload'
  sourceUrl: null
  author: null
  license: null
  notes: null
}

function isImageDecodeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /unsupported image|input buffer|corrupt|premature|vips/i.test(`${error.name} ${error.message}`)
}

export async function handleUpload(
  request: Request,
  deps: {
    session?: SessionFn
    trucks?: () => Promise<CatalogTruck[]>
    store?: (input: UploadInput) => Promise<'inserted' | 'duplicate'>
  } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const trucks = deps.trucks ?? listCatalogTrucks
  const store =
    deps.store ??
    ((input: UploadInput) => withPooledClient((db) => storeOriginalPhoto(db, input)))
  const denied = await guard(request, session, true)
  if (denied) return denied
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'The photo did not upload.' }, 400)
  }
  const truckId = form.get('truckId')
  const file = form.get('file')
  if (typeof truckId !== 'string' || !isTruckId(truckId)) return json({ error: 'Pick a truck from the list.' }, 400)
  if (!(file instanceof File)) return json({ error: 'Choose a photo.' }, 400)
  if (file.size <= 0) return json({ error: 'That file is empty.' }, 400)
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: 'That photo is too large. Try it again from the phone.' }, 400)
  }
  const catalog = await trucks()
  const truck = catalog.find((item) => item.id === truckId)
  if (!truck) return json({ error: 'Pick a truck from the list.' }, 400)
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    return json({ error: 'That photo is too large. Try it again from the phone.' }, 400)
  }
  try {
    await assertUploadFormat(bytes)
  } catch (error) {
    console.error(`binder: upload rejected (${error instanceof Error ? error.name : 'Error'})`)
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      return json({ error: 'That photo is too large. Try it again from the phone.' }, 400)
    }
    return json({ error: 'That file is not a photo.' }, 400)
  }
  try {
    const outcome = await store({
      original: bytes,
      truckId: truck.id,
      truckSlug: truck.slug,
      source: 'jake-upload',
      sourceUrl: null,
      author: null,
      license: null,
      notes: null,
    })
    return json({ outcome })
  } catch (error) {
    console.error(`binder: upload failed (${error instanceof Error ? error.name : 'Error'})`)
    if (isImageDecodeError(error)) return json({ error: 'That file is not a photo.' }, 400)
    return json({ error: 'The photo did not upload.' }, 500)
  }
}

export async function handleTrucks(
  request: Request,
  deps: { session?: SessionFn; db?: AdminSql; trucks?: () => Promise<CatalogTruck[]> } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const db = deps.db ?? defaultDb
  const trucks = deps.trucks ?? listCatalogTrucks
  const denied = await guard(request, session, false)
  if (denied) return denied
  try {
    const [catalog, faceRows] = await Promise.all([
      trucks(),
      db.query<{ id: string; truck_id: string; label: string }>(
        `select id, truck_id, label from truck_faces order by truck_slug, sort_order, label`,
      ),
    ])
    const faces: ReviewFace[] = faceRows.rows.map((row) => ({
      id: row.id,
      truckId: row.truck_id,
      label: row.label,
    }))
    const list: ReviewTruck[] = catalog.map((truck) => ({
      id: truck.id,
      slug: truck.slug,
      title: truck.title,
      maker: truck.maker,
    }))
    return json({ trucks: list, faces })
  } catch (error) {
    console.error(`binder: truck list failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The truck list did not load.' }, 500)
  }
}

export async function handleCoverage(
  request: Request,
  deps: { session?: SessionFn; db?: AdminSql; trucks?: () => Promise<CatalogTruck[]> } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const db = deps.db ?? defaultDb
  const trucks = deps.trucks ?? listCatalogTrucks
  const denied = await guard(request, session, false)
  if (denied) return denied
  try {
    const [catalog, counts, faces, faceCounts] = await Promise.all([
      trucks(),
      db.query<{
        truck_id: string
        approved: number | string
        fronts: number | string
        sides: number | string
        fingerprinted: number | string
      }>(
        `select truck_id,
                count(*) filter (where status = 'approved')::int as approved,
                count(*) filter (where status = 'approved' and embedding is not null)::int as fingerprinted,
                count(*) filter (where status = 'approved' and angle = 'front')::int as fronts,
                count(*) filter (where status = 'approved' and angle = 'side')::int as sides
         from photos
         group by truck_id`,
      ),
      db.query<{ id: string; truck_id: string; label: string }>(
        `select id, truck_id, label from truck_faces order by sort_order, label`,
      ),
      db.query<{ face_tag_id: string; n: number | string }>(
        `select face_tag_id, count(*)::int as n
         from photos
         where status = 'approved' and face_tag_id is not null
         group by face_tag_id`,
      ),
    ])
    const byTruck = new Map(counts.rows.map((row) => [row.truck_id, row]))
    const tagged = new Map(faceCounts.rows.map((row) => [row.face_tag_id, Number(row.n) || 0]))
    const rows: CoverageTruck[] = catalog.map((truck) => {
      const count = byTruck.get(truck.id)
      return {
        truckId: truck.id,
        slug: truck.slug,
        title: truck.title,
        maker: truck.maker,
        approved: Number(count?.approved) || 0,
        fingerprinted: Number(count?.fingerprinted) || 0,
        front: Number(count?.fronts) || 0,
        side: Number(count?.sides) || 0,
        faces: faces.rows
          .filter((face) => face.truck_id === truck.id)
          .map((face) => ({
            id: face.id,
            label: face.label,
            approved: tagged.get(face.id) ?? 0,
          })),
      }
    })
    return json({ target: APPROVED_TARGET, trucks: sortCoverage(rows) })
  } catch (error) {
    console.error(`binder: coverage failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The shooting list did not load.' }, 500)
  }
}

export async function handleSanitySync(
  request: Request,
  deps: { session?: SessionFn; sync?: (skipRefs: string[]) => Promise<SanityBatchResult> } = {},
): Promise<Response> {
  const session = deps.session ?? getSession
  const sync = deps.sync ?? ((skipRefs: string[]) => importSanityBatch(skipRefs))
  const denied = await guard(request, session, true)
  if (denied) return denied
  const body = await readJsonObject(request)
  const parsed = parseSkipRefs(body ?? {})
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  try {
    return json(await sync(parsed.skipRefs))
  } catch (error) {
    console.error(`binder: sanity sync failed (${error instanceof Error ? error.name : 'Error'})`)
    return json({ error: 'The Sanity import did not finish.' }, 500)
  }
}
