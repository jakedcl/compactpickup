import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CLIP_EMBEDDING_DIM, SCAN_EMBEDDING_DIM, l2Normalize } from './clip'
import { sortCoverage } from './coverage'
import { THUMB_CACHE_VERSION } from './limits'
import { photoImagePath } from './review'
import { vectorLiteral } from './embedding'
import { adminEmail } from './env'
import { SHARP_PIXEL_LIMIT, THUMB_LONG_EDGE, assertUploadFormat, compressToThumb, compressToWebp, sha256Hex } from './images'
import { manifestFileCandidates, parseManifestLine, resolveInside, truckIdFromSlug } from './manifest'
import { connectionStringForPg } from './pg-url'
import { assertSanityCdnUrl, canonicalSanityUrl, collectImages, parseImageRef, sanityDerivativeUrl, sanityImageUrl } from './sanityImages'
import { plannedFromImage } from './sanitySync'
import { readSessionToken, signSession } from './session'
import { PHOTO_ANGLES, PHOTO_SOURCES, PHOTO_STATUSES } from './types'
import robots from '../../app/robots'
import { fittedSize } from '../../app/binder/shrink-photo'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const secret = 'test-secret-value-32-characters'

test('session round-trips and rejects tampering', async () => {
  const token = await signSession('Person@Example.com', secret, 60)
  const session = await readSessionToken(token, secret)
  assert.equal(session?.email, 'person@example.com')
  assert.equal(await readSessionToken(token, `${secret}-other`), null)
  const [body, signature] = token.split('.')
  const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`
  assert.equal(await readSessionToken(`${body}.${flipped}`, secret), null)
  const expired = await signSession('person@example.com', secret, -10)
  assert.equal(await readSessionToken(expired, secret), null)
})

test('admin email comes only from the environment', () => {
  const previous = process.env.ADMIN_EMAIL
  delete process.env.ADMIN_EMAIL
  assert.equal(adminEmail(), null)
  process.env.ADMIN_EMAIL = '  Person@Example.com '
  assert.equal(adminEmail(), 'person@example.com')
  if (previous === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = previous
})

test('webp long edge is capped and the hash is the original', async () => {
  const large = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 20, g: 40, b: 180 } },
  })
    .png()
    .toBuffer()
  const stored = await compressToWebp(large)
  assert.notEqual(sha256Hex(stored.data), sha256Hex(large))
  assert.equal(Math.max(stored.width, stored.height), 1600)
  assert.equal(stored.width, 1600)
  assert.equal(stored.height, 800)
  assert.ok(stored.data.length > 0)

  const small = await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer()
  const kept = await compressToWebp(small)
  assert.equal(kept.width, 320)
  assert.equal(kept.height, 200)
  await assertUploadFormat(small)
  await assert.rejects(() => assertUploadFormat(Buffer.from('not a photo')), /unsupported image/)
  assert.equal(SHARP_PIXEL_LIMIT, 40_000_000)
})

test('image walk finds content and other image fields', () => {
  const images = collectImages({
    content: [
      { _type: 'block', children: [] },
      {
        _type: 'image',
        alt: 'Front',
        caption: 'Parked',
        asset: { _ref: 'image-abc-2000x1000-jpg' },
      },
    ],
    hero: { _type: 'image', asset: { _ref: 'image-def-800x600-png' } },
    model3d: { _type: 'file', asset: { _ref: 'file-xyz-glb' } },
  })
  assert.deepEqual(
    images.map((image) => image.assetRef),
    ['image-abc-2000x1000-jpg', 'image-def-800x600-png'],
  )
  assert.equal(parseImageRef('image-abc-2000x1000-jpg')?.assetId, 'image-abc')
  assert.equal(
    sanityImageUrl('image-abc-2000x1000-jpg', 'xbw6uf6e', 'production'),
    'https://cdn.sanity.io/images/xbw6uf6e/production/abc-2000x1000.jpg',
  )
  assert.doesNotThrow(() => assertSanityCdnUrl('https://cdn.sanity.io/images/xbw6uf6e/production/abc-2000x1000.jpg'))
  assert.throws(() => assertSanityCdnUrl('https://evil.example/images/abc.jpg'))
  assert.throws(() => assertSanityCdnUrl('http://cdn.sanity.io/images/abc.jpg'))
})

test('manifest lines stay inside the folder', () => {
  const row = parseManifestLine(
    JSON.stringify({
      slug: 'b-5',
      truckId: 'truck-1',
      source: 'commons',
      sourceUrl: 'https://example.com/a',
      originalUrl: 'https://example.com/a',
      author: 'A',
      license: 'CC0',
      title: 'Front',
      localPath: 'photos/a.jpg',
    }),
  )
  assert.equal(row.source, 'commons')
  assert.equal(resolveInside('/tmp/binder', row.localPath), path.resolve('/tmp/binder', 'photos/a.jpg'))
  assert.throws(() => parseManifestLine(JSON.stringify({ ...row, source: 'nope', localPath: 'a.jpg' })))
  assert.throws(() => resolveInside('/tmp/binder', '../secret.jpg'))

  const commons = parseManifestLine(
    JSON.stringify({
      slug: 'b-5',
      url: 'https://commons.wikimedia.org/wiki/File:Foo',
      license: 'CC BY 2.0',
      author: 'Ada',
      title: 'Foo',
      filename: 'foo.webp',
    }),
    { defaultSource: 'commons' },
  )
  assert.equal(commons.source, 'commons')
  assert.equal(commons.truckId, '')
  assert.equal(commons.author, 'Ada')
  assert.equal(commons.license, 'CC BY 2.0')
  assert.equal(commons.title, 'Foo')
  assert.equal(commons.sourceUrl, 'https://commons.wikimedia.org/wiki/File:Foo')
  const candidates = manifestFileCandidates('/tmp/pull', commons)
  assert.ok(candidates.includes(path.resolve('/tmp/pull/commons/b-5/foo.webp')))
  assert.ok(candidates.every((candidate) => candidate.startsWith(path.resolve('/tmp/pull'))))
  assert.throws(() => parseManifestLine(JSON.stringify({ slug: 'b-5', filename: '../secret.webp' }), { defaultSource: 'commons' }))

  const pull = manifestFileCandidates('/workspace/cp-photo-pull', { slug: 'pickup', localPath: 'pickup-front.webp' })
  assert.deepEqual(pull, [
    path.resolve('/workspace/cp-photo-pull/pickup-front.webp'),
    path.resolve('/workspace/cp-photo-pull/commons/pickup/pickup-front.webp'),
    path.resolve('/workspace/cp-photo-pull/commons/pickup-front.webp'),
  ])
})

test('folder import takes the truck id from the slug', () => {
  const wrong = '8420afe5-5f9a-4475-9d45-18d42f6ee35d'
  const real = '8420afe5-5f9a-4475-9d1a-1e731c3ee606'
  const bySlug = new Map([['pickup', real]])
  assert.equal(truckIdFromSlug('pickup', bySlug), real)
  assert.notEqual(truckIdFromSlug('pickup', bySlug), wrong)
  assert.equal(truckIdFromSlug('pickup', new Map()), null)
})

test('migration matches the CLIP dimension and lookup indexes', () => {
  const sql = readFileSync(path.join(root, 'db/migrations/001_binder.sql'), 'utf8')
  assert.match(sql, new RegExp(`vector\\(${CLIP_EMBEDDING_DIM}\\)`))
  assert.match(sql, /vector_cosine_ops/)
  assert.match(sql, /using hnsw/)
  assert.match(sql, /create extension if not exists vector/)
  for (const source of PHOTO_SOURCES) assert.match(sql, new RegExp(`'${source}'`))
  for (const status of PHOTO_STATUSES) assert.match(sql, new RegExp(`'${status}'`))
  for (const angle of PHOTO_ANGLES) assert.match(sql, new RegExp(`'${angle}'`))
})

test('a sanity import downloads a derivative and stores the canonical url', () => {
  const raw = 'https://cdn.sanity.io/images/xbw6uf6e/production/abc-8000x6000.png'
  assert.equal(canonicalSanityUrl(`${raw}?w=100`), raw)
  const derivative = sanityDerivativeUrl(raw)
  assert.match(derivative, /[?&]w=2000/)
  assert.match(derivative, /fm=jpg/)
  assert.doesNotThrow(() => assertSanityCdnUrl(derivative))
  const planned = plannedFromImage(
    'truck-1',
    'b-5',
    { assetRef: 'image-abc-8000x6000-png', alt: 'Front', caption: null },
    raw,
  )
  assert.equal(planned?.canonicalUrl, raw)
  assert.match(planned?.downloadUrl ?? '', /fm=jpg/)
  assert.equal(planned?.notes, 'Front')
})

test('non-local database urls use sslmode=verify-full', () => {
  assert.equal(
    connectionStringForPg('postgres://u:p@ep-cool.neon.tech/db?sslmode=require'),
    'postgres://u:p@ep-cool.neon.tech/db?sslmode=verify-full',
  )
  assert.equal(
    connectionStringForPg('postgres://u:p@ep-cool.neon.tech/db'),
    'postgres://u:p@ep-cool.neon.tech/db?sslmode=verify-full',
  )
  assert.equal(connectionStringForPg('postgres://u:p@localhost:5432/db?sslmode=disable'), 'postgres://u:p@localhost:5432/db?sslmode=disable')
  assert.equal(connectionStringForPg('postgres://u:p@127.0.0.1/db'), 'postgres://u:p@127.0.0.1/db')
})

test('embeddings must be 768 finite numbers and come back normalized', () => {
  assert.equal(l2Normalize(Array(SCAN_EMBEDDING_DIM - 1).fill(1)), null)
  assert.equal(l2Normalize(Array(SCAN_EMBEDDING_DIM).fill(Number.NaN)), null)
  assert.equal(l2Normalize(Array(SCAN_EMBEDDING_DIM).fill(0)), null)
  const vector = l2Normalize(Array(SCAN_EMBEDDING_DIM).fill(2))
  assert.ok(vector)
  const expected = 1 / Math.sqrt(SCAN_EMBEDDING_DIM)
  assert.ok(Math.abs(vector[0] - expected) < 1e-6)
  let sum = 0
  for (const value of vector) sum += value * value
  assert.ok(Math.abs(sum - 1) < 1e-5)
  assert.match(vectorLiteral(vector), /^\[[-\d.,]+\]$/)
})

test('coverage puts the truck that still needs shots first', () => {
  const rows = sortCoverage([
    {
      truckId: '1',
      slug: 'full',
      title: 'Full',
      maker: 'Mazda',
      approved: 10,
      fingerprinted: 10,
      front: 1,
      side: 1,
      faces: [{ id: 'f', label: '1994', approved: 1 }],
    },
    {
      truckId: '2',
      slug: 'empty',
      title: 'Empty',
      maker: 'Ford',
      approved: 0,
      fingerprinted: 0,
      front: 0,
      side: 0,
      faces: [{ id: 'g', label: '1994', approved: 0 }],
    },
  ])
  assert.equal(rows[0].slug, 'empty')
  assert.equal(rows[0].needsFront, true)
  assert.equal(rows[0].needsSide, true)
  assert.deepEqual(rows[0].missingFaces, ['1994'])
  assert.equal(rows[1].caughtUp, true)
})

test('thumb long edge stays small and upload fit does not enlarge', async () => {
  const large = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 8, g: 16, b: 32 } },
  })
    .webp()
    .toBuffer()
  const thumb = await compressToThumb(large)
  const meta = await sharp(thumb).metadata()
  assert.ok((meta.width ?? 0) <= THUMB_LONG_EDGE)
  assert.ok((meta.height ?? 0) <= THUMB_LONG_EDGE)
  assert.equal(Math.max(meta.width ?? 0, meta.height ?? 0), THUMB_LONG_EDGE)
  assert.deepEqual(fittedSize(4000, 2000), { width: 2000, height: 1000 })
  assert.deepEqual(fittedSize(320, 200), { width: 320, height: 200 })
  const id = '00000000-0000-4000-8000-000000000001'
  const sha = 'a'.repeat(64)
  assert.equal(photoImagePath(id, sha), `/api/admin/photos/${id}?v=${sha}`)
  assert.equal(photoImagePath(id, sha, 'thumb'), `/api/admin/photos/${id}?v=${sha}-${THUMB_CACHE_VERSION}&size=thumb`)
})

test('robots keeps the binder and the api out of the crawl', () => {
  const body = robots()
  const rules = Array.isArray(body.rules) ? body.rules : [body.rules]
  const disallow = rules.flatMap((rule) =>
    typeof rule.disallow === 'string' ? [rule.disallow] : (rule.disallow ?? []),
  )
  assert.ok(disallow.includes('/binder'))
  assert.ok(disallow.includes('/api/'))
  assert.ok(disallow.includes('/studio/'))
})

test('the shared fingerprint module is the SigLIP + D-FINE crop contract', () => {
  const source = readFileSync(path.join(root, 'src/lib/clip/browser.ts'), 'utf8')
  const pipeline = readFileSync(path.join(root, 'src/lib/clip/pipeline.ts'), 'utf8')
  assert.match(source, /export async function embedImage\(\s*blob: Blob/)
  assert.match(source, /ClipProgress/)
  assert.match(source, /ClipError/)
  assert.match(source, /l2Normalize/)
  assert.match(pipeline, /dfine_n_coco-ONNX/)
  assert.match(source, /Promise<Float32Array>/)
  assert.match(source, /768/)
  assert.match(source, /EMBED_PIPELINE/)
  assert.match(source, /SiglipVisionModel/)
  assert.match(source, /DFineForObjectDetection/)
  assert.match(source, /pooler_output/)
  assert.match(source, /progress_callback/)
  assert.match(source, /pickVehicleBox/)
  assert.match(pipeline, /siglip2-base-q4-ft20261112\+dfine-crop15/)
  assert.match(pipeline, /SIGLIP_BROWSER_MODEL = '\/models\//)
})

test('SigLIP fingerprint migration adds embedding_siglip', () => {
  const sql = readFileSync(path.join(root, 'db/migrations/006_embedding_siglip.sql'), 'utf8')
  assert.match(sql, new RegExp(`vector\\(${SCAN_EMBEDDING_DIM}\\)`))
  assert.match(sql, /embedding_siglip/)
  assert.match(sql, /vector_cosine_ops/)
  assert.match(sql, /if not exists/)
})
