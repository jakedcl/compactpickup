import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BINDER_API_TIMEOUT_MS, BinderApiError, SANITY_SYNC_TIMEOUT_MS, binderApi } from '../../app/binder/api'
import { createReviewSession, rememberRetry, type ReviewItem } from './review-session'

function item(id: string): ReviewItem {
  return {
    id,
    sha256: id.padEnd(64, 'a'),
    angle: null,
    faceTagId: null,
    status: 'pending',
    truckId: 'truck-1',
    truckSlug: 'b-5',
  }
}

test('a timed-out save is a normal failure a review retry can keep', async () => {
  assert.equal(BINDER_API_TIMEOUT_MS, 15_000)
  assert.equal(SANITY_SYNC_TIMEOUT_MS, 60_000)
  const original = globalThis.fetch
  const signals: AbortSignal[] = []
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const signal = init?.signal
    assert.ok(signal)
    signals.push(signal)
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  }) as typeof fetch
  try {
    const caught = await binderApi('/api/admin/photos/review', {
      method: 'POST',
      body: JSON.stringify({ id: 'p1' }),
    }).then(
      () => null,
      (error: unknown) => error,
    )
    assert.ok(caught instanceof BinderApiError)
    assert.equal(caught.status, 408)
    assert.equal(caught.message, 'That did not finish.')
    assert.ok(signals[0])
    assert.equal(signals[0]?.aborted, false)

    const slow = AbortSignal.timeout(SANITY_SYNC_TIMEOUT_MS)
    const again = await binderApi('/api/admin/sanity-sync', {
      method: 'POST',
      body: '{}',
      signal: slow,
    }).then(
      () => null,
      (error: unknown) => error,
    )
    assert.equal(signals[1], slow)
    assert.ok(again instanceof BinderApiError)

    const saved = rememberRetry(createReviewSession([item('p1')], 1), {
      token: 't1',
      id: 'p1',
      status: 'approved',
      angle: 'front',
      faceTagId: null,
      error: caught.message,
    })
    assert.equal(saved.retries.length, 1)
    assert.equal(saved.retries[0]?.id, 'p1')
    assert.equal(saved.retries[0]?.error, 'That did not finish.')
  } finally {
    globalThis.fetch = original
  }
})
