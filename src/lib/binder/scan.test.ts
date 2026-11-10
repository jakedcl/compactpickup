import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { POST as scanRoute } from '../../app/api/scan/route'
import { POST as submitRoute } from '../../app/api/scan/submit/route'
import { scanPost, submitPost } from './scan-http'
import { CLIP_EMBEDDING_DIM, l2Normalize } from './clip'
import { MAX_INPUT_PIXELS, pixelCountAllowed, sha256Hex } from './images'
import {
  SCAN_BUSY_MESSAGE,
  SCAN_EF_SEARCH,
  SCAN_LIMIT,
  SCAN_MATCH_MIN_MARGIN,
  SCAN_MATCH_MIN_SIMILARITY,
  SCAN_NEIGHBOR_LIMIT,
  SCAN_SITE_LIMIT,
  SCAN_SITE_SUBJECT,
  SCAN_SITE_WINDOW_SECONDS,
  SCAN_WINDOW_SECONDS,
  SUBMIT_LIMIT,
  SUBMIT_SITE_LIMIT,
  SUBMIT_SITE_WINDOW_SECONDS,
  SUBMIT_WINDOW_SECONDS,
  VISITOR_MAX_BYTES,
  VISITOR_NOTE,
  aggregateTruckScores,
  hashVisitorKey,
  labelMatches,
  rateSubject,
  sniffImage,
  vectorLiteral,
  windowStart,
  type ScanClient,
  type SubmitDeps,
} from './scan'
import { SCAN_FIELDS, formatScanScorePercent, toScanTruck, type ScanCatalogTruck } from './scan-types'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ORIGIN = 'https://compactpickup.local'
const TEST_SECRET = 'scanner-test-secret-32-chars-min'

const RANGER: ScanCatalogTruck = {
  id: 'truck-ranger',
  slug: 'ranger',
  title: 'Ranger',
  maker: 'Ford',
  href: '/ford/ranger',
  years: '1983–1992',
}
const HILUX: ScanCatalogTruck = {
  id: 'truck-hilux',
  slug: 'hilux',
  title: 'Hilux',
  maker: 'Toyota',
  href: '/toyota/hilux',
  years: '1979–1983',
}

type LibPhoto = {
  truckId: string
  truckSlug: string
  status: string
  hasEmbedding: boolean
  similarity: number
}

type StoredPhoto = {
  id: string
  truckId: string
  truckSlug: string
  status: string
  source: string
  sha256: string
  notes: string | null
  r2Key: string
}

type Feedback = {
  photoId: string
  guessedId: string
  guessedSlug: string
  verdict: string
  correctedId: string | null
  correctedSlug: string | null
  correctedCustomText: string | null
  consent: boolean
  ip: string
}

type Bucket = { ip: string; route: string; bucket: string; hits: number }

function compact(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function stamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

class Memory {
  now = Date.UTC(2026, 0, 15, 12, 0, 0)
  connects = 0
  catalogCalls = 0
  library: LibPhoto[] = []
  photos: StoredPhoto[] = []
  feedback: Feedback[] = []
  buckets: Bucket[] = []
  queries: string[] = []
  settings: string[] = []
  lastVector = ''
  puts: Buffer[] = []
  private nextId = 1
  private snapshot: { photos: StoredPhoto[]; feedback: Feedback[]; buckets: Bucket[] } | null = null

  connect(): Promise<ScanClient> {
    this.connects += 1
    return Promise.resolve({
      query: async <T>(text: string, params: readonly unknown[] = []) => {
        this.queries.push(compact(text))
        return { rows: this.exec(compact(text), params) as T[] }
      },
      release: () => {},
    })
  }

  deps(catalog: ScanCatalogTruck[] = [RANGER, HILUX]): SubmitDeps {
    return {
      connect: () => this.connect(),
      catalog: async () => {
        this.catalogCalls += 1
        return catalog
      },
      now: () => this.now,
      hashSubject: (subject) => hashVisitorKey(subject, TEST_SECRET),
      putPhoto: async (_key, body) => {
        this.puts.push(body)
      },
    }
  }

  private begin() {
    if (this.snapshot) throw new Error('nested transaction')
    this.snapshot = {
      photos: structuredClone(this.photos),
      feedback: structuredClone(this.feedback),
      buckets: structuredClone(this.buckets),
    }
  }

  private commit() {
    if (!this.snapshot) throw new Error('commit without begin')
    this.snapshot = null
  }

  private rollback() {
    if (!this.snapshot) return
    this.photos = this.snapshot.photos
    this.feedback = this.snapshot.feedback
    this.buckets = this.snapshot.buckets
    this.snapshot = null
  }

  private exec(sql: string, params: readonly unknown[]): unknown[] {
    if (sql === 'begin') {
      this.begin()
      return []
    }
    if (sql === 'commit') {
      this.commit()
      return []
    }
    if (sql === 'rollback') {
      this.rollback()
      return []
    }
    if (sql.startsWith('delete from scanner_rate_buckets')) {
      const cutoff = new Date(stamp(params[0])).getTime()
      this.buckets = this.buckets.filter((row) => new Date(row.bucket).getTime() >= cutoff)
      return []
    }
    if (sql.startsWith('insert into scanner_rate_buckets')) {
      const [ip, route, bucket] = params
      const key = stamp(bucket)
      let row = this.buckets.find((item) => item.ip === ip && item.route === route && item.bucket === key)
      if (!row) {
        row = { ip: String(ip), route: String(route), bucket: key, hits: 0 }
        this.buckets.push(row)
      }
      row.hits += 1
      return [{ hits: row.hits }]
    }
    if (sql.startsWith('select set_config')) {
      this.settings.push(String(params[0]))
      return [{}]
    }
    if (sql.includes('embedding <=>')) {
      this.lastVector = String(params[0])
      const filtered =
        sql.includes("status = 'approved'")
        && sql.includes('embedding is not null')
        && sql.includes('truck_id is not null')
      let rows = filtered ? this.library.filter((row) => row.status === 'approved' && row.hasEmbedding) : this.library
      if (sql.includes('order by embedding <=>')) {
        rows = [...rows].sort((a, b) => b.similarity - a.similarity)
      }
      const limit = Number(params[1])
      return rows.slice(0, limit).map((row) => ({
        truck_id: row.truckId,
        truck_slug: row.truckSlug,
        similarity: row.similarity,
      }))
    }
    if (sql.startsWith('select id from photos where sha256')) {
      const row = this.photos.find((item) => item.sha256 === params[0])
      return row ? [{ id: row.id }] : []
    }
    if (sql.startsWith('insert into photos')) {
      if (!sql.includes("'pending'")) throw new Error('visitor photo insert must set status pending')
      const [truckId, truckSlug, source, , , , r2Key, , , sha256, notes] = params
      const existing = this.photos.find((item) => item.sha256 === sha256)
      if (existing) return []
      const id = `photo-${this.nextId}`
      this.nextId += 1
      this.photos.push({
        id,
        truckId: String(truckId),
        truckSlug: String(truckSlug),
        status: 'pending',
        source: String(source),
        sha256: String(sha256),
        notes: notes == null ? null : String(notes),
        r2Key: String(r2Key),
      })
      return [{ id }]
    }
    if (sql.startsWith('insert into scanner_feedback')) {
      if (!sql.includes('true')) throw new Error('feedback consent must be the literal true')
      const [photoId, guessedId, guessedSlug, verdict, correctedId, correctedSlug, correctedCustomText, ip] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
      ]
      if (verdict === 'right' && (correctedId || correctedSlug || correctedCustomText)) {
        throw new Error('right verdict stored a correction')
      }
      if (verdict === 'idk' && (correctedId || correctedSlug || correctedCustomText)) {
        throw new Error('idk verdict stored a correction')
      }
      if (verdict === 'wrong' && !correctedCustomText && (!correctedId || !correctedSlug)) {
        throw new Error('wrong verdict missing a correction')
      }
      if (verdict === 'wrong' && correctedCustomText && (correctedId || correctedSlug)) {
        throw new Error('wrong verdict mixed correction types')
      }
      this.feedback.push({
        photoId,
        guessedId,
        guessedSlug,
        verdict,
        correctedId,
        correctedSlug,
        correctedCustomText,
        consent: true,
        ip,
      })
      return []
    }
    throw new Error(`unhandled sql: ${sql}`)
  }
}

function vector(fill = 1): number[] {
  return Array.from({ length: CLIP_EMBEDDING_DIM }, () => fill)
}

function scanRequest(embedding: unknown, ip = '203.0.113.8', origin = ORIGIN): Request {
  return new Request(`${ORIGIN}/api/scan`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof embedding === 'string' ? embedding : JSON.stringify({ embedding }),
  })
}

function photoForm(bytes: Buffer, fields: Record<string, string>, type = 'image/png'): FormData {
  const form = new FormData()
  form.set(SCAN_FIELDS.photo, new File([new Uint8Array(bytes)], 'truck.png', { type }))
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

function submitRequest(form: FormData, ip = '203.0.113.10', origin = ORIGIN): Request {
  return new Request(`${ORIGIN}/api/scan/submit`, {
    method: 'POST',
    headers: { origin, 'x-forwarded-for': ip },
    body: form,
  })
}

async function png(): Promise<Buffer> {
  return sharp({
    create: { width: 12, height: 8, channels: 3, background: { r: 9, g: 40, b: 180 } },
  })
    .png()
    .toBuffer()
}

test('fingerprints must be finite 512-vectors and come back unit length', () => {
  const unit = l2Normalize(vector(2))
  assert.ok(unit)
  assert.equal(unit.length, 512)
  let sum = 0
  for (const n of unit) sum += n * n
  assert.ok(Math.abs(sum - 1) < 1e-5)
  assert.equal(l2Normalize(vector(1).slice(0, 511)), null)
  assert.equal(l2Normalize(vector(0)), null)
  const bad = vector(0.2)
  bad[4] = Number.NaN
  assert.equal(l2Normalize(bad), null)
  const huge = vector(1e300)
  assert.equal(l2Normalize(huge), null)
  const text = vector(1).map(String)
  assert.equal(l2Normalize(text), null)
  const literal = vectorLiteral(unit)
  assert.equal(literal.split(',').length, 512)
  assert.match(literal, /^\[[0-9eE.+\-,]+\]$/)
})

test('image sniff accepts photos and rejects other bytes', () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg')
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), 'png')
  const webp = Buffer.alloc(12)
  webp.write('RIFF', 0)
  webp.write('WEBP', 8)
  assert.equal(sniffImage(webp), 'webp')
  const heic = Buffer.alloc(12)
  heic.write('ftyp', 4)
  heic.write('heic', 8)
  assert.equal(sniffImage(heic), null)
  const gif = Buffer.alloc(12)
  gif.write('GIF89a', 0)
  assert.equal(sniffImage(gif), null)
  assert.equal(sniffImage(Buffer.from('<svg></svg>')), null)
  assert.equal(sniffImage(Buffer.from('not-a-photo!!')), null)
})

test('truck score fills three slots and a close runner-up stays a guess', () => {
  const ranked = aggregateTruckScores([
    { truckId: 'a', truckSlug: 'a', similarity: 0.9 },
    { truckId: 'a', truckSlug: 'a', similarity: 0.8 },
    { truckId: 'a', truckSlug: 'a', similarity: 0.7 },
    { truckId: 'a', truckSlug: 'a', similarity: 0.1 },
    { truckId: 'b', truckSlug: 'b', similarity: 0.85 },
    { truckId: 'c', truckSlug: 'c', similarity: 0.4 },
    { truckId: 'd', truckSlug: 'd', similarity: 0.2 },
  ])
  assert.deepEqual(ranked.map((row) => row.truckId), ['a', 'b', 'c'])
  assert.ok(Math.abs(ranked[0].score - 0.8) < 1e-9)
  assert.ok(Math.abs(ranked[1].score - (0.85 + 0.1 + 0.1) / 3) < 1e-9)
  assert.equal(SCAN_MATCH_MIN_SIMILARITY, 0.82)
  assert.equal(SCAN_MATCH_MIN_MARGIN, 0.02)
  const sure = labelMatches([{ truckId: 'truck-ranger', truckSlug: 'old', similarity: 0.82 }], [RANGER])
  assert.equal(sure.state, 'match')
  assert.equal(sure.matches[0]?.href, '/ford/ranger')
  assert.equal(sure.matches[0]?.slug, 'ranger')
  const unsure = labelMatches([{ truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.81 }], [RANGER])
  assert.equal(unsure.state, 'guess')
  assert.equal(unsure.matches[0]?.title, 'Ranger')
  const close = labelMatches(
    [
      { truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.9 },
      { truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.9 },
      { truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.9 },
      { truckId: 'truck-hilux', truckSlug: 'hilux', similarity: 0.885 },
      { truckId: 'truck-hilux', truckSlug: 'hilux', similarity: 0.885 },
      { truckId: 'truck-hilux', truckSlug: 'hilux', similarity: 0.885 },
    ],
    [RANGER, HILUX],
  )
  assert.equal(close.state, 'guess')
  assert.equal(close.matches[0]?.title, 'Ranger')
  const separated = labelMatches(
    [
      { truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.9 },
      { truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.9 },
      { truckId: 'truck-ranger', truckSlug: 'ranger', similarity: 0.9 },
      { truckId: 'truck-hilux', truckSlug: 'hilux', similarity: 0.87 },
      { truckId: 'truck-hilux', truckSlug: 'hilux', similarity: 0.87 },
      { truckId: 'truck-hilux', truckSlug: 'hilux', similarity: 0.87 },
    ],
    [RANGER, HILUX],
  )
  assert.equal(separated.state, 'match')
  assert.equal(separated.matches[1]?.title, 'Hilux')
  assert.deepEqual(labelMatches([], [RANGER]), { state: 'learning', matches: [], threshold: 0.82 })
  assert.equal(labelMatches([{ truckId: 'missing', truckSlug: 'x', similarity: 0.99 }], [RANGER]).state, 'guess')
})

test('migration stores consenting feedback and does not approve photos', () => {
  const sql = readFileSync(path.join(root, 'db/migrations/002_scanner_feedback.sql'), 'utf8')
  assert.match(sql, /create table if not exists scanner_feedback/)
  assert.match(sql, /create table if not exists scanner_rate_buckets/)
  assert.match(sql, /scanner_feedback_consent check \(consent\)/)
  assert.match(sql, /'right'/)
  assert.match(sql, /'wrong'/)
  assert.match(sql, /'scan'/)
  assert.match(sql, /'submit'/)
  assert.match(sql, /'submit-site'/)
  assert.match(sql, /'scan-site'/)
  assert.match(sql, /ip_hash/)
  assert.match(sql, /photos_approved_embedding_hnsw_idx/)
  assert.match(sql, /where status = 'approved'/)
  assert.doesNotMatch(sql, /\bip text\b/)
  assert.doesNotMatch(sql, /^\s*update\s+photos/im)
  assert.equal(toScanTruck(RANGER)?.slug, 'ranger')
  assert.equal(toScanTruck({ ...RANGER, href: '/ford/ranger/extra' }), null)
})

test('the public route handlers reject a cross-site post before any library call', async () => {
  const scan = await scanRoute(scanRequest(vector(), '203.0.113.8', 'https://evil.example'))
  assert.equal(scan.status, 403)
  const form = new FormData()
  form.set(SCAN_FIELDS.consent, 'yes')
  const submit = await submitRoute(submitRequest(form, '203.0.113.10', 'https://evil.example'))
  assert.equal(submit.status, 403)
})

test('scan route rejects a bad origin, a bad fingerprint, and an oversized body', async () => {
  const db = new Memory()
  const deps = db.deps()
  const cross = await scanPost(scanRequest(vector(), '203.0.113.8', 'https://evil.example'), deps)
  assert.equal(cross.status, 403)
  const missing = await scanPost(
    new Request(`${ORIGIN}/api/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ embedding: vector() }),
    }),
    deps,
  )
  assert.equal(missing.status, 403)
  assert.equal((await scanPost(scanRequest(vector().slice(0, 511)), deps)).status, 400)
  assert.equal((await scanPost(scanRequest(vector().map(String)), deps)).status, 400)
  assert.equal((await scanPost(scanRequest({}), deps)).status, 400)
  const inflated = vector(0.1)
  const raw = `{"embedding":[${inflated.map((n, i) => (i === 3 ? '1e309' : String(n))).join(',')}]}`
  assert.equal((await scanPost(scanRequest(raw), deps)).status, 400)
  const huge = await scanPost(scanRequest(`{"embedding":"${'a'.repeat(70_000)}"}`), deps)
  assert.equal(huge.status, 413)
  assert.equal(db.connects, 0)
})

test('scan normalizes the vector, ignores unapproved photos, and reports learning when nothing is ready', async () => {
  const db = new Memory()
  db.library = [
    { truckId: 'truck-hilux', truckSlug: 'hilux', status: 'rejected', hasEmbedding: true, similarity: 0.99 },
    { truckId: 'truck-ranger', truckSlug: 'ranger', status: 'pending', hasEmbedding: true, similarity: 0.98 },
    { truckId: 'truck-ranger', truckSlug: 'ranger', status: 'approved', hasEmbedding: false, similarity: 0.97 },
  ]
  const deps = db.deps()
  const learning = await scanPost(scanRequest(vector(2)), deps)
  assert.equal(learning.status, 200)
  const body = await learning.json()
  assert.equal(body.state, 'learning')
  assert.deepEqual(body.matches, [])
  assert.equal(db.catalogCalls, 0)
  assert.ok(db.queries.some((sql) =>
    sql.includes("status = 'approved'")
    && sql.includes('embedding is not null')
    && sql.includes('truck_id is not null'),
  ))
  assert.ok(db.settings.includes(String(SCAN_EF_SEARCH)))
  assert.ok(db.settings.includes('relaxed_order'))
  assert.ok(db.queries.some((sql) => sql.includes('hnsw.iterative_scan')))
  const first = Number(db.lastVector.slice(1).split(',')[0])
  assert.ok(Math.abs(first - 1 / Math.sqrt(CLIP_EMBEDDING_DIM)) < 1e-5)
  assert.equal(db.lastVector.split(',').length, CLIP_EMBEDDING_DIM)
})

test('scan returns the closest trucks and says not sure under the threshold', async () => {
  const db = new Memory()
  const trucks: ScanCatalogTruck[] = []
  for (let i = 0; i < SCAN_NEIGHBOR_LIMIT; i += 1) {
    const id = `t${String(i).padStart(2, '0')}`
    trucks.push({ id, slug: id, title: id, maker: 'Ford', href: `/ford/${id}`, years: '1990' })
    db.library.push({ truckId: id, truckSlug: id, status: 'approved', hasEmbedding: true, similarity: 0.5 })
  }
  trucks.push({ id: 'best', slug: 'best-slug', title: 'B2600', maker: 'Mazda', href: '/mazda/best-slug', years: '1986' })
  db.library.push({ truckId: 'best', truckSlug: 'old-slug', status: 'approved', hasEmbedding: true, similarity: 0.91 })
  db.library.push({ truckId: 'best', truckSlug: 'old-slug', status: 'approved', hasEmbedding: true, similarity: 0.91 })
  db.library.push({ truckId: 'best', truckSlug: 'old-slug', status: 'approved', hasEmbedding: true, similarity: 0.91 })
  db.library.push({ truckId: 'truck-hilux', truckSlug: 'hilux', status: 'rejected', hasEmbedding: true, similarity: 0.99 })
  const deps = db.deps(trucks)
  const response = await scanPost(scanRequest(vector()), deps)
  const body = await response.json()
  assert.equal(body.state, 'match')
  assert.equal(body.matches.length, 3)
  assert.equal(body.matches[0].id, 'best')
  assert.equal(body.matches[0].slug, 'best-slug')
  assert.equal(body.matches[0].href, '/mazda/best-slug')
  assert.equal(body.matches[0].score, 0.91)
  assert.ok(body.matches.every((match: { id: string }) => match.id !== 'truck-hilux'))
  assert.deepEqual(Object.keys(body).sort(), ['matches', 'ok', 'state', 'threshold'])
  assert.deepEqual(Object.keys(body.matches[0]).sort(), ['href', 'id', 'maker', 'score', 'slug', 'title', 'years'])

  const unsureDb = new Memory()
  unsureDb.library = [
    { truckId: 'truck-ranger', truckSlug: 'ranger', status: 'approved', hasEmbedding: true, similarity: 0.5 },
  ]
  const unsure = await scanPost(scanRequest(vector()), unsureDb.deps())
  const guess = await unsure.json()
  assert.equal(guess.state, 'guess')
  assert.equal(guess.matches[0].title, 'Ranger')
  assert.equal(guess.matches[0].href, '/ford/ranger')
})

test('scan rate limit is per IP and resets on the next window', async () => {
  const db = new Memory()
  const deps = db.deps()
  for (let i = 0; i < SCAN_LIMIT; i += 1) {
    const response = await scanPost(scanRequest(vector(), '203.0.113.8'), deps)
    assert.equal(response.status, 200)
  }
  const blocked = await scanPost(scanRequest(vector(), '203.0.113.8'), deps)
  assert.equal(blocked.status, 429)
  const other = await scanPost(scanRequest(vector(), '198.51.100.4'), deps)
  assert.equal(other.status, 200)
  const before = db.queries.filter((sql) => sql.includes('embedding <=>')).length
  assert.equal((await scanPost(scanRequest(vector(), '203.0.113.8'), deps)).status, 429)
  assert.equal(db.queries.filter((sql) => sql.includes('embedding <=>')).length, before)
  db.now += SCAN_WINDOW_SECONDS * 1000 + 1
  assert.equal((await scanPost(scanRequest(vector(), '203.0.113.8'), deps)).status, 200)
})

test('old rate buckets are deleted on a cleanup sample', async () => {
  const db = new Memory()
  const old = new Date(db.now - 3 * 24 * 60 * 60 * 1000).toISOString()
  db.buckets.push({ ip: '203.0.113.8', route: 'scan', bucket: old, hits: 4 })
  const random = Math.random
  Math.random = () => 0.99
  try {
    await scanPost(scanRequest(vector()), db.deps())
    assert.equal(db.buckets.some((row) => row.bucket === old), true)
    Math.random = () => 0
    await scanPost(scanRequest(vector(), '198.51.100.4'), db.deps())
    assert.equal(db.buckets.some((row) => row.bucket === old), false)
  } finally {
    Math.random = random
  }
  assert.equal(windowStart(db.now, SCAN_WINDOW_SECONDS).getTime() <= db.now, true)
})

test('submit requires same-origin consent and a real catalog truck', async () => {
  const db = new Memory()
  const deps = db.deps()
  const bytes = await png()
  const fields = {
    [SCAN_FIELDS.verdict]: 'right',
    [SCAN_FIELDS.guessedTruckId]: RANGER.id,
    [SCAN_FIELDS.guessedTruckSlug]: RANGER.slug,
  }
  const cross = await submitPost(
    submitRequest(photoForm(bytes, { ...fields, [SCAN_FIELDS.consent]: 'yes' }), '203.0.113.10', 'https://evil.example'),
    deps,
  )
  assert.equal(cross.status, 403)
  const noConsent = await submitPost(submitRequest(photoForm(bytes, fields)), deps)
  assert.equal(noConsent.status, 400)
  assert.equal((await noConsent.json()).error, 'consent')
  const sloppy = await submitPost(
    submitRequest(photoForm(bytes, { ...fields, [SCAN_FIELDS.consent]: 'true' })),
    deps,
  )
  assert.equal(sloppy.status, 400)
  const gif = Buffer.alloc(12)
  gif.write('GIF89a', 0)
  const animated = await submitPost(
    submitRequest(photoForm(gif, { ...fields, [SCAN_FIELDS.consent]: 'yes' }, 'image/gif')),
    deps,
  )
  assert.equal(animated.status, 400)
  assert.equal(db.connects, 0)
  const unknown = await submitPost(
    submitRequest(photoForm(bytes, {
      ...fields,
      [SCAN_FIELDS.consent]: 'yes',
      [SCAN_FIELDS.guessedTruckId]: 'nope',
    })),
    deps,
  )
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).error, 'truck')
  const mismatched = await submitPost(
    submitRequest(photoForm(bytes, {
      ...fields,
      [SCAN_FIELDS.consent]: 'yes',
      [SCAN_FIELDS.guessedTruckSlug]: HILUX.slug,
    })),
    deps,
  )
  assert.equal(mismatched.status, 400)
  const corrected = await submitPost(
    submitRequest(photoForm(bytes, {
      ...fields,
      [SCAN_FIELDS.consent]: 'yes',
      [SCAN_FIELDS.correctedTruckId]: HILUX.id,
      [SCAN_FIELDS.correctedTruckSlug]: HILUX.slug,
    })),
    deps,
  )
  assert.equal(corrected.status, 400)
  const text = await submitPost(
    submitRequest(photoForm(Buffer.from('hello there!!'), {
      ...fields,
      [SCAN_FIELDS.consent]: 'yes',
    }, 'text/plain')),
    deps,
  )
  assert.equal(text.status, 400)
  const jpeg = Buffer.alloc(16, 1)
  jpeg[0] = 0xff
  jpeg[1] = 0xd8
  jpeg[2] = 0xff
  const broken = await submitPost(
    submitRequest(photoForm(jpeg, { ...fields, [SCAN_FIELDS.consent]: 'yes' }, 'image/jpeg')),
    deps,
  )
  assert.equal(broken.status, 400)
  const oversized = await submitPost(
    submitRequest(photoForm(Buffer.alloc(VISITOR_MAX_BYTES + 1), {
      ...fields,
      [SCAN_FIELDS.consent]: 'yes',
    }, 'image/jpeg')),
    deps,
  )
  assert.equal(oversized.status, 413)
  assert.ok(db.connects > 0)
  assert.ok(db.catalogCalls > 0)
  assert.equal(db.photos.length, 0)
  assert.equal(db.puts.length, 0)
  assert.equal(db.feedback.length, 0)
})

test('a consented photo is stored pending from a visitor and is not approved', async () => {
  const db = new Memory()
  const deps = db.deps()
  const bytes = await png()
  const response = await submitPost(
    submitRequest(photoForm(bytes, {
      [SCAN_FIELDS.consent]: 'yes',
      [SCAN_FIELDS.verdict]: 'wrong',
      [SCAN_FIELDS.guessedTruckId]: RANGER.id,
      [SCAN_FIELDS.guessedTruckSlug]: RANGER.slug,
      [SCAN_FIELDS.correctedTruckId]: HILUX.id,
      [SCAN_FIELDS.correctedTruckSlug]: HILUX.slug,
    })),
    deps,
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.outcome, 'inserted')
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'outcome'])
  assert.equal(db.photos.length, 1)
  assert.equal(db.photos[0].status, 'pending')
  assert.equal(db.photos[0].source, 'visitor')
  assert.equal(db.photos[0].truckId, HILUX.id)
  assert.equal(db.photos[0].truckSlug, HILUX.slug)
  assert.equal(db.photos[0].notes, VISITOR_NOTE)
  assert.equal(db.photos[0].sha256, sha256Hex(bytes))
  assert.equal(db.puts.length, 1)
  assert.equal(db.puts[0].toString('ascii', 0, 4), 'RIFF')
  assert.equal(db.feedback.length, 1)
  assert.equal(db.feedback[0].consent, true)
  assert.equal(db.feedback[0].verdict, 'wrong')
  assert.equal(db.feedback[0].correctedId, HILUX.id)
  assert.equal(db.feedback[0].photoId, db.photos[0].id)
  const ipHash = hashVisitorKey(rateSubject('203.0.113.10'), TEST_SECRET)
  assert.equal(db.feedback[0].ip, ipHash)
  assert.equal(db.buckets.some((row) => row.ip === '203.0.113.10'), false)
  assert.equal(db.buckets.some((row) => row.ip === ipHash), true)
  assert.ok(db.queries.some((sql) => sql.startsWith('insert into photos') && sql.includes("'pending'")))
  assert.equal(db.photos.some((row) => row.status === 'approved'), false)
})

test('sending the same photo again leaves a rejected row rejected', async () => {
  const db = new Memory()
  const bytes = await png()
  db.photos.push({
    id: 'already',
    truckId: RANGER.id,
    truckSlug: RANGER.slug,
    status: 'rejected',
    source: 'visitor',
    sha256: sha256Hex(bytes),
    notes: 'keep me',
    r2Key: 'photos/already.webp',
  })
  const response = await submitPost(
    submitRequest(photoForm(bytes, {
      [SCAN_FIELDS.consent]: 'yes',
      [SCAN_FIELDS.verdict]: 'right',
      [SCAN_FIELDS.guessedTruckId]: RANGER.id,
      [SCAN_FIELDS.guessedTruckSlug]: RANGER.slug,
    })),
    db.deps(),
  )
  assert.equal(response.status, 200)
  assert.equal((await response.json()).outcome, 'duplicate')
  assert.equal(db.photos.length, 1)
  assert.equal(db.photos[0].status, 'rejected')
  assert.equal(db.photos[0].notes, 'keep me')
  assert.equal(db.puts.length, 0)
  assert.equal(db.feedback[0]?.photoId, 'already')
  assert.equal(db.feedback[0]?.consent, true)
})

test('submit rate limit is separate from scans and a storage failure stores nothing', async () => {
  const db = new Memory()
  const bytes = await png()
  const fields = {
    [SCAN_FIELDS.consent]: 'yes',
    [SCAN_FIELDS.verdict]: 'right',
    [SCAN_FIELDS.guessedTruckId]: RANGER.id,
    [SCAN_FIELDS.guessedTruckSlug]: RANGER.slug,
  }
  const deps = db.deps()
  for (let i = 0; i < SCAN_LIMIT; i += 1) {
    assert.equal((await scanPost(scanRequest(vector(), '203.0.113.10'), deps)).status, 200)
  }
  for (let i = 0; i < SUBMIT_LIMIT; i += 1) {
    const response = await submitPost(submitRequest(photoForm(bytes, fields), '203.0.113.10'), deps)
    assert.equal(response.status, 200)
  }
  assert.equal(db.photos.length, 1)
  assert.equal(db.photos[0].status, 'pending')
  const blocked = await submitPost(submitRequest(photoForm(bytes, fields), '203.0.113.10'), deps)
  assert.equal(blocked.status, 429)
  assert.equal(db.photos.length, 1)

  const capped = new Memory()
  capped.buckets.push({
    ip: hashVisitorKey(SCAN_SITE_SUBJECT, TEST_SECRET),
    route: 'submit-site',
    bucket: windowStart(capped.now, SUBMIT_SITE_WINDOW_SECONDS).toISOString(),
    hits: SUBMIT_SITE_LIMIT,
  })
  const site = await submitPost(submitRequest(photoForm(bytes, fields)), capped.deps())
  assert.equal(site.status, 429)
  assert.equal(capped.catalogCalls, 0)
  assert.equal(capped.photos.length, 0)
  assert.equal(capped.puts.length, 0)

  const broken = new Memory()
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  const failDeps: SubmitDeps = {
    ...broken.deps(),
    putPhoto: async () => {
      throw new Error('R2_SECRET_ACCESS_KEY=abc')
    },
  }
  try {
    const failed = await submitPost(submitRequest(photoForm(await png(), fields), '203.0.113.77'), failDeps)
    assert.equal(failed.status, 500)
    assert.equal(broken.photos.length, 0)
    assert.equal(broken.feedback.length, 0)
    assert.ok(lines.every((line) => !line.includes('abc') && !line.includes('R2_SECRET')))
  } finally {
    console.error = original
  }
})

test('visitor keys are hmac hashes and huge pixel counts are rejected', () => {
  const hash = hashVisitorKey('203.0.113.8', TEST_SECRET)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.equal(hash, hashVisitorKey('203.0.113.8', TEST_SECRET))
  assert.notEqual(hash, hashVisitorKey('198.51.100.4', TEST_SECRET))
  assert.notEqual(hash, '203.0.113.8')
  assert.throws(() => hashVisitorKey('203.0.113.8', 'short'))
  assert.equal(pixelCountAllowed(100, 100), true)
  assert.equal(pixelCountAllowed(6325, 6325), false)
  assert.equal(pixelCountAllowed(undefined, 10), false)
  assert.equal(MAX_INPUT_PIXELS, 40_000_000)
  assert.equal(rateSubject('2001:db8:85a3::1'), '2001:db8:85a3:0')
  assert.equal(rateSubject('2001:db8:85a3:0:ffff:ffff:ffff:ffff'), rateSubject('2001:DB8:85A3::9'))
  assert.notEqual(rateSubject('2001:db8:85a3::1'), rateSubject('2001:db8:85a4::1'))
  assert.equal(rateSubject('::ffff:203.0.113.8'), '203.0.113.8')
})

test('ipv6 visitors in one /64 share a scan bucket and x-real-ip wins', async () => {
  const db = new Memory()
  const deps = db.deps()
  const prefix = rateSubject('2001:db8:85a3::1')
  db.buckets.push({
    ip: hashVisitorKey(prefix, TEST_SECRET),
    route: 'scan',
    bucket: windowStart(db.now, SCAN_WINDOW_SECONDS).toISOString(),
    hits: SCAN_LIMIT,
  })
  assert.equal((await scanPost(scanRequest(vector(), '2001:db8:85a3::1'), deps)).status, 429)
  assert.equal((await scanPost(scanRequest(vector(), '2001:db8:85a3:0:ffff:ffff:ffff:ffff'), deps)).status, 429)
  assert.equal((await scanPost(scanRequest(vector(), '2001:db8:85a4::1'), deps)).status, 200)

  const trusted = new Memory()
  trusted.buckets.push({
    ip: hashVisitorKey(rateSubject('203.0.113.8'), TEST_SECRET),
    route: 'scan',
    bucket: windowStart(trusted.now, SCAN_WINDOW_SECONDS).toISOString(),
    hits: SCAN_LIMIT,
  })
  const spoofed = new Request(`${ORIGIN}/api/scan`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.8',
      'x-forwarded-for': '198.51.100.4',
    },
    body: JSON.stringify({ embedding: vector() }),
  })
  assert.equal((await scanPost(spoofed, trusted.deps())).status, 429)
  assert.equal((await scanPost(scanRequest(vector(), '198.51.100.4'), trusted.deps())).status, 200)
})

test('a full day of scans tells the visitor to try later', async () => {
  const db = new Memory()
  db.buckets.push({
    ip: hashVisitorKey(SCAN_SITE_SUBJECT, TEST_SECRET),
    route: 'scan-site',
    bucket: windowStart(db.now, SCAN_SITE_WINDOW_SECONDS).toISOString(),
    hits: SCAN_SITE_LIMIT,
  })
  const response = await scanPost(scanRequest(vector()), db.deps())
  assert.equal(response.status, 429)
  const body = await response.json()
  assert.equal(body.error, 'busy')
  assert.equal(body.message, SCAN_BUSY_MESSAGE)
  assert.equal(db.catalogCalls, 0)
  assert.equal(db.queries.some((sql) => sql.includes('embedding <=>')), false)
})

test('submit spends a rate slot before the catalog and the decoder', async () => {
  const db = new Memory()
  const bytes = await png()
  const fields = {
    [SCAN_FIELDS.consent]: 'yes',
    [SCAN_FIELDS.verdict]: 'right',
    [SCAN_FIELDS.guessedTruckId]: RANGER.id,
    [SCAN_FIELDS.guessedTruckSlug]: RANGER.slug,
  }
  db.buckets.push({
    ip: hashVisitorKey(rateSubject('203.0.113.10'), TEST_SECRET),
    route: 'submit',
    bucket: windowStart(db.now, SUBMIT_WINDOW_SECONDS).toISOString(),
    hits: SUBMIT_LIMIT,
  })
  const response = await submitPost(submitRequest(photoForm(bytes, fields)), db.deps())
  assert.equal(response.status, 429)
  assert.equal(db.catalogCalls, 0)
  assert.equal(db.puts.length, 0)
  assert.equal(db.photos.length, 0)
})

test('scan match scores are shown to visitors as whole-number percents', () => {
  assert.equal(formatScanScorePercent(0.874), '87%')
  assert.equal(formatScanScorePercent(0.825), '83%')
  assert.equal(formatScanScorePercent(1.2), '100%')
  assert.equal(formatScanScorePercent(-0.1), '0%')
})
