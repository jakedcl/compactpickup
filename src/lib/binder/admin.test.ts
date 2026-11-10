import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POST as embeddingsPost } from '../../app/api/admin/photos/embeddings/route'
import { GET as imageGet, PATCH as imagePatch } from '../../app/api/admin/photos/[id]/route'
import { POST as statusPost } from '../../app/api/admin/photos/status/route'
import { POST as uploadPost } from '../../app/api/admin/uploads/route'
import { CLIP_EMBEDDING_DIM } from './clip'
import { normalizeEmbedding, vectorLiteral } from './embedding'
import {
  handleEmbeddings,
  handlePhotoImage,
  handlePhotoList,
  handlePhotoPatch,
  handlePhotoStatus,
  handleSanitySync,
  handleUpload,
  type AdminSql,
} from './admin-handlers'
import { resolvePhotoPatch } from './review'

const ID = '00000000-0000-4000-8000-000000000001'
const FACE = '00000000-0000-4000-8000-000000000002'
const ORIGIN = 'https://compactpickup.local'
const signedIn = async () => ({ email: 'admin@example.com' })

function post(url: string, body: unknown, origin = ORIGIN) {
  return new Request(url, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fakeDb(
  respond?: (sql: string, params: readonly unknown[]) => { rows: Record<string, unknown>[] },
): AdminSql & { calls: { sql: string; params: readonly unknown[] }[] } {
  const calls: { sql: string; params: readonly unknown[] }[] = []
  return {
    calls,
    async query<T>(text: string, params: readonly unknown[] = []) {
      const sql = text.replace(/\s+/g, ' ').trim()
      calls.push({ sql, params })
      const result = respond ? respond(sql, params) : { rows: [] }
      return result as { rows: T[] }
    },
  }
}

test('admin write routes reject a signed-out call and a cross-site call', async () => {
  const same = post(`https://compactpickup.local/api/admin/photos/status`, { ids: [ID], status: 'approved' })
  const cross = post(same.url, { ids: [ID], status: 'approved' }, 'https://evil.example')
  assert.equal((await statusPost(same)).status, 401)
  assert.equal((await statusPost(cross)).status, 403)
  assert.equal((await embeddingsPost(post('https://compactpickup.local/api/admin/photos/embeddings', {}))).status, 401)
  assert.equal((await uploadPost(post('https://compactpickup.local/api/admin/uploads', {}))).status, 401)
  assert.equal(
    (await imagePatch(post(`https://compactpickup.local/api/admin/photos/${ID}`, { angle: 'front' }), {
      params: Promise.resolve({ id: ID }),
    })).status,
    401,
  )
  assert.equal(
    (await imageGet(new Request(`https://compactpickup.local/api/admin/photos/${ID}?size=thumb`), {
      params: Promise.resolve({ id: ID }),
    })).status,
    401,
  )
})

test('status changes are validated and never delete a photo', async () => {
  const db = fakeDb(() => ({ rows: [{ id: ID }] }))
  const bad = await handlePhotoStatus(post('https://compactpickup.local/api/admin/photos/status', { ids: [ID], status: 'published' }), {
    session: signedIn,
    db,
  })
  assert.equal(bad.status, 400)
  assert.equal(db.calls.length, 0)

  const tooMany = Array.from({ length: 101 }, () => ID)
  const bulky = await handlePhotoStatus(
    post('https://compactpickup.local/api/admin/photos/status', { ids: tooMany, status: 'approved' }),
    { session: signedIn, db },
  )
  assert.equal(bulky.status, 400)

  for (const status of ['approved', 'rejected', 'pending'] as const) {
    db.calls.length = 0
    const response = await handlePhotoStatus(
      post('https://compactpickup.local/api/admin/photos/status', { ids: [ID], status }),
      { session: signedIn, db },
    )
    assert.equal(response.status, 200)
    const body = (await response.json()) as { updated: number; status: string }
    assert.equal(body.updated, 1)
    assert.equal(body.status, status)
    const call = db.calls[0]
    assert.match(call.sql, /reviewed_at = case when \$1::text = 'pending' then null else now\(\) end/)
    assert.equal(call.params[0], status)
    assert.equal(call.params[1], ID)
    assert.equal(/delete\s+from\s+photos/i.test(call.sql), false)
  }
})

test('a fingerprint must be 512 numbers and is stored only on approved photos', async () => {
  const db = fakeDb((sql) => (sql.startsWith('update') ? { rows: [{ id: ID }] } : { rows: [] }))
  const bad = await handleEmbeddings(
    post('https://compactpickup.local/api/admin/photos/embeddings', {
      items: [{ id: ID, embedding: [1, 2, 3] }],
    }),
    { session: signedIn, db },
  )
  assert.equal(bad.status, 400)
  assert.equal(db.calls.length, 0)

  const vector = Array(CLIP_EMBEDDING_DIM).fill(1)
  const other = '00000000-0000-4000-8000-000000000003'
  const response = await handleEmbeddings(
    post('https://compactpickup.local/api/admin/photos/embeddings', {
      items: [
        { id: ID, embedding: vector },
        { id: other, embedding: [1] },
      ],
    }),
    { session: signedIn, db },
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { updated: string[]; skipped: string[] }
  assert.deepEqual(body.updated, [ID])
  assert.deepEqual(body.skipped, [other])
  assert.match(db.calls[0].sql, /status = 'approved'/)
  assert.match(db.calls[0].sql, /::vector/)
  const normalized = normalizeEmbedding(vector)
  assert.ok(normalized)
  assert.equal(db.calls[0].params[1], vectorLiteral(normalized))
})

test('photo edits reject a bad angle and a face tag from another truck', async () => {
  const cleared = resolvePhotoPatch(
    { truckId: 'truck-a', truckSlug: 'old', angle: 'side', faceTagId: FACE },
    { truckId: 'truck-b' },
    new Map([['truck-b', { slug: 'b-5' }]]),
    [{ id: FACE, truckId: 'truck-a' }],
  )
  assert.equal(cleared.ok, true)
  if (cleared.ok) {
    assert.equal(cleared.truckSlug, 'b-5')
    assert.equal(cleared.faceTagId, null)
    assert.equal(cleared.angle, 'side')
  }
  const wrong = resolvePhotoPatch(
    { truckId: 'truck-b', truckSlug: 'b-5', angle: null, faceTagId: null },
    { faceTagId: FACE },
    new Map(),
    [{ id: FACE, truckId: 'truck-a' }],
  )
  assert.equal(wrong.ok, false)

  const db = fakeDb()
  const badAngle = await handlePhotoPatch(
    post(`https://compactpickup.local/api/admin/photos/${ID}`, { angle: 'overhead' }),
    ID,
    { session: signedIn, db },
  )
  assert.equal(badAngle.status, 400)
  assert.equal(db.calls.length, 0)

  const editing = fakeDb((sql) => {
    if (sql.startsWith('select truck_id')) {
      return { rows: [{ truck_id: 'truck-1', truck_slug: 'b-5', angle: null, face_tag_id: null }] }
    }
    if (sql.includes('from truck_faces')) {
      return { rows: [{ id: FACE, truck_id: 'truck-other' }] }
    }
    return { rows: [{ id: ID }] }
  })
  const badFace = await handlePhotoPatch(
    post(`https://compactpickup.local/api/admin/photos/${ID}`, { faceTagId: FACE }),
    ID,
    { session: signedIn, db: editing },
  )
  assert.equal(badFace.status, 400)
  assert.equal(editing.calls.some((call) => call.sql.startsWith('update')), false)

  const saved = await handlePhotoPatch(
    post(`https://compactpickup.local/api/admin/photos/${ID}`, { angle: 'rear' }),
    ID,
    { session: signedIn, db: editing },
  )
  assert.equal(saved.status, 200)
  const update = editing.calls.find((call) => call.sql.startsWith('update'))
  assert.equal(update?.params[2], 'rear')
})

test('list and image routes validate the query before reading a photo', async () => {
  const db = fakeDb()
  const bad = await handlePhotoList(new Request('https://compactpickup.local/api/admin/photos?status=nope'), {
    session: signedIn,
    db,
  })
  assert.equal(bad.status, 400)
  assert.equal(db.calls.length, 0)

  let reads = 0
  const image = await handlePhotoImage(
    new Request(`https://compactpickup.local/api/admin/photos/${ID}?size=original`),
    ID,
    {
      session: signedIn,
      readImage: async () => {
        reads += 1
        return new Uint8Array()
      },
    },
  )
  assert.equal(image.status, 400)
  assert.equal(reads, 0)
})

test('upload requires a catalog truck and marks the photo as an owner upload', async () => {
  const form = new FormData()
  form.set('truckId', 'not a truck')
  form.set('file', new File([Uint8Array.from([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' }))
  const invalid = await handleUpload(
    new Request('https://compactpickup.local/api/admin/uploads', { method: 'POST', headers: { origin: ORIGIN }, body: form }),
    { session: signedIn, trucks: async () => [], store: async () => 'inserted' },
  )
  assert.equal(invalid.status, 400)

  const good = new FormData()
  good.set('truckId', 'truck-1')
  good.set('file', new File([Uint8Array.from([1, 2, 3, 4])], 'b.jpg', { type: 'image/jpeg' }))
  let source = ''
  const response = await handleUpload(
    new Request('https://compactpickup.local/api/admin/uploads', { method: 'POST', headers: { origin: ORIGIN }, body: good }),
    {
      session: signedIn,
      trucks: async () => [{ id: 'truck-1', slug: 'b-5', title: 'B-Series', maker: 'Mazda' }],
      store: async (input) => {
        source = input.source
        assert.equal(input.truckSlug, 'b-5')
        return 'inserted'
      },
    },
  )
  assert.equal(response.status, 200)
  assert.equal(source, 'jake-upload')
  const body = (await response.json()) as { outcome: string }
  assert.equal(body.outcome, 'inserted')
})

test('sanity sync ignores a bad skip list and reports the batch', async () => {
  const bad = await handleSanitySync(post('https://compactpickup.local/api/admin/sanity-sync', { skipRefs: [1] }), {
    session: signedIn,
    sync: async () => ({ inserted: 0, skipped: 0, failed: 0, failedRefs: [], remaining: 0 }),
  })
  assert.equal(bad.status, 400)

  let seen: string[] = []
  const response = await handleSanitySync(
    post('https://compactpickup.local/api/admin/sanity-sync', { skipRefs: ['image-abc-10x10-jpg'] }),
    {
      session: signedIn,
      sync: async (skipRefs) => {
        seen = skipRefs
        return { inserted: 1, skipped: 0, failed: 0, failedRefs: [], remaining: 3 }
      },
    },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(seen, ['image-abc-10x10-jpg'])
})
