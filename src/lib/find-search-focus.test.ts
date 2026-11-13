import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visualViewportScrollDelta } from '@/lib/find-search-focus'

test('visualViewportScrollDelta scrolls the anchor to padding below the visual viewport', () => {
  assert.equal(visualViewportScrollDelta(420, 0, 52), 368)
  assert.equal(visualViewportScrollDelta(80, 120, 52), -92)
  assert.equal(visualViewportScrollDelta(52, 0, 52), 0)
})
