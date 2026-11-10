import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  angleShortcut,
  appendItems,
  choose,
  claimJob,
  createReviewSession,
  currentItem,
  dropJob,
  enqueueJob,
  faceShortcut,
  failedSaves,
  forgetRetry,
  jobCounts,
  noteSave,
  rememberRetry,
  prefetchItems,
  remainingCount,
  retryFailedJobs,
  settleJob,
  skip,
  undo,
  type ReviewItem,
} from './review-session'

function item(id: string, extra: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id,
    sha256: id.padEnd(64, 'a'),
    angle: null,
    faceTagId: null,
    status: 'pending',
    truckId: 'truck-1',
    truckSlug: 'b-5',
    ...extra,
  }
}

test('approve advances, a rejection stays off the fingerprint queue, and undo restores the photo', () => {
  const session = createReviewSession(
    [item('p1', { angle: 'side' }), item('p2'), item('p3'), item('p4'), item('p5')],
    5,
  )
  const approved = choose(session, { status: 'approved', angle: 'front', faceTagId: null }, 't1')
  assert.equal(currentItem(approved)?.id, 'p2')
  assert.equal(remainingCount(approved), 4)
  assert.equal(approved.steps[0]?.save, 'pending')
  assert.equal(approved.items[0]?.angle, 'front')
  assert.deepEqual(
    prefetchItems(approved).map((photo) => photo.id),
    ['p3', 'p4', 'p5'],
  )

  const rejected = choose(approved, { status: 'rejected', angle: null, faceTagId: null }, 't2')
  assert.equal(currentItem(rejected)?.id, 'p3')
  const failed = rememberRetry(noteSave(rejected, 't1', 'failed', 'The photo was not updated.'), {
    token: 't1',
    id: 'p1',
    status: 'approved',
    angle: 'front',
    faceTagId: null,
    error: 'The photo was not updated.',
  })
  assert.equal(failedSaves(failed).length, 1)
  assert.equal(failedSaves(failed)[0]?.id, 'p1')
  assert.equal(failed.retries.length, 1)
  assert.equal(noteSave(failed, 'missing', 'saved').steps[0]?.save, 'failed')
  assert.equal(forgetRetry(failed, 't1').retries.length, 0)

  const back = undo(failed)
  assert.equal(back.step?.id, 'p2')
  assert.equal(back.step?.kind, 'choice')
  assert.equal(currentItem(back.session)?.id, 'p2')
  const again = undo(back.session)
  assert.equal(again.step?.token, 't1')
  assert.equal(currentItem(again.session)?.id, 'p1')
  assert.equal(currentItem(again.session)?.angle, 'side')
  assert.equal(currentItem(again.session)?.status, 'pending')
  assert.equal(failedSaves(again.session).length, 0)
  assert.equal(again.session.retries.length, 0)
})

test('skip moves on without a saved decision and undo returns to that photo', () => {
  const session = createReviewSession([item('p1'), item('p2')], 2)
  const skipped = skip(session, 's1')
  assert.equal(currentItem(skipped)?.id, 'p2')
  assert.equal(skipped.steps[0]?.kind, 'skip')
  const back = undo(skipped)
  assert.equal(back.step?.kind, 'skip')
  assert.equal(currentItem(back.session)?.id, 'p1')
  assert.equal(undo(back.session).step, null)
})

test('new pages append without duplicating or rewinding', () => {
  const session = createReviewSession([item('p1')], 3)
  const next = choose(session, { status: 'approved', angle: null, faceTagId: null }, 't1')
  const more = appendItems(next, [item('p1'), item('p2')], 3)
  assert.equal(currentItem(more)?.id, 'p2')
  assert.equal(more.items.length, 2)
  assert.equal(remainingCount(more), 2)
  assert.equal(choose(more, { status: 'rejected', angle: null, faceTagId: null }, 't2').index, 2)
  assert.equal(currentItem(choose(createReviewSession([], 0), { status: 'approved', angle: null, faceTagId: null }, 'x')), null)
})

test('fingerprint jobs run one at a time and undo drops one that has not finished', () => {
  let jobs = enqueueJob([], { id: 'p1', sha256: 'a'.repeat(64) })
  jobs = enqueueJob(jobs, { id: 'p1', sha256: 'a'.repeat(64) })
  jobs = enqueueJob(jobs, { id: 'p2', sha256: 'b'.repeat(64) })
  assert.equal(jobs.length, 2)
  const first = claimJob(jobs)
  assert.equal(first.job?.id, 'p1')
  assert.equal(first.job?.state, 'running')
  assert.equal(claimJob(first.jobs).job, null)
  const dropped = dropJob(first.jobs, 'p1')
  assert.equal(dropped.find((job) => job.id === 'p1')?.state, 'dropped')
  const cleared = settleJob(dropped, 'p1', 'dropped')
  assert.equal(cleared.some((job) => job.id === 'p1'), false)
  const second = claimJob(cleared)
  assert.equal(second.job?.id, 'p2')
  const done = settleJob(second.jobs, 'p2', 'done')
  assert.equal(dropJob(done, 'p2').find((job) => job.id === 'p2')?.state, 'done')
  const again = enqueueJob(done, { id: 'p2', sha256: 'b'.repeat(64) })
  assert.equal(again.find((job) => job.id === 'p2')?.state, 'waiting')
  assert.equal(again.find((job) => job.id === 'p2')?.generation, 2)
  const stale = settleJob(again, 'p2', 'dropped', undefined, 1)
  assert.equal(stale.find((job) => job.id === 'p2')?.state, 'waiting')
  const failed = settleJob(enqueueJob(done, { id: 'p3', sha256: 'c'.repeat(64) }), 'p3', 'failed', 'offline')
  const waiting = dropJob(failed, 'p4')
  assert.deepEqual(jobCounts(retryFailedJobs(waiting)), { waiting: 1, running: 0, done: 1, failed: 0 })
  assert.equal(angleShortcut('front'), '1')
  assert.equal(angleShortcut('other'), '6')
  assert.equal(faceShortcut(0), 'b')
  assert.equal(faceShortcut(30), null)
})
