import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aiAngleToBinder,
  aiBadgeClass,
  aiBadgeLabel,
  parseAiOutcome,
  parseAiSort,
} from './ai-review'
import { decodeConfidenceCursor, encodeConfidenceCursor, parseListQuery } from './review'

test('ai angles map to binder angles', () => {
  assert.equal(aiAngleToBinder('rear-3/4'), 'rear-3q')
  assert.equal(aiAngleToBinder('front-3/4'), 'front-3q')
  assert.equal(aiAngleToBinder('side'), 'side')
  assert.equal(aiAngleToBinder('nope'), null)
})

test('list query accepts ai filters and confidence sort', () => {
  const ok = parseListQuery(
    'https://compactpickup.local/api/admin/photos?status=pending&aiOutcome=looks_right&sort=confidence',
  )
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.equal(ok.aiOutcome, 'looks_right')
  assert.equal(ok.sort, 'confidence')

  const bad = parseListQuery('https://compactpickup.local/api/admin/photos?aiOutcome=nope')
  assert.equal(bad.ok, false)
  assert.equal(parseAiOutcome('needs_jake'), 'needs_jake')
  assert.equal(parseAiSort('confidence'), 'confidence')
})

test('confidence cursors round-trip', () => {
  const id = '0c201f37-44d9-4db9-b3cc-306a97b526bb'
  const createdAt = '2026-11-10T20:18:58.000Z'
  const encoded = encodeConfidenceCursor(0.92, createdAt, id)
  const decoded = decodeConfidenceCursor(encoded)
  assert.equal(decoded?.confidence, 0.92)
  assert.equal(decoded?.id, id)
})

test('ai badge labels', () => {
  assert.match(aiBadgeClass('looks_right'), /is-ai-ok/)
  assert.match(aiBadgeClass('needs_jake'), /is-ai-warn/)
  assert.match(aiBadgeClass('reject'), /is-ai-bad/)
  assert.equal(aiBadgeLabel('wrong_truck'), 'Wrong truck')
})
