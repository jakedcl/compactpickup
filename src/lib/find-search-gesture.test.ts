import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIND_SUGGESTION_TAP_SLOP_PX, pointerMovedBeyondTapSlop } from '@/lib/find-search-gesture'

test('suggestion tap slop treats small movement as a tap', () => {
  assert.equal(pointerMovedBeyondTapSlop(0, 0), false)
  assert.equal(pointerMovedBeyondTapSlop(FIND_SUGGESTION_TAP_SLOP_PX, 0), false)
  assert.equal(pointerMovedBeyondTapSlop(0, FIND_SUGGESTION_TAP_SLOP_PX), false)
  assert.equal(pointerMovedBeyondTapSlop(FIND_SUGGESTION_TAP_SLOP_PX + 1, 0), true)
  assert.equal(pointerMovedBeyondTapSlop(0, FIND_SUGGESTION_TAP_SLOP_PX + 1), true)
})
