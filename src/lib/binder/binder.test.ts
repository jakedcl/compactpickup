import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CLIP_EMBEDDING_DIM } from './clip'
import { adminEmail } from './env'
import { prepareStoredPhoto, sha256Hex } from './images'
import { parseManifestLine, resolveInside } from './manifest'
import { collectImages, parseImageRef, sanityImageUrl } from './sanityImages'
import { readSessionToken, signSession } from './session'
import { PHOTO_ANGLES, PHOTO_SOURCES, PHOTO_STATUSES } from './types'

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
  const stored = await prepareStoredPhoto(large)
  assert.equal(stored.sha256, sha256Hex(large))
  assert.equal(Math.max(stored.width, stored.height), 1600)
  assert.equal(stored.width, 1600)
  assert.equal(stored.height, 800)
  assert.ok(stored.webp.length > 0)

  const small = await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer()
  const kept = await prepareStoredPhoto(small)
  assert.equal(kept.width, 320)
  assert.equal(kept.height, 200)
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
