import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOME_SLIDE_MS } from '@/lib/homeSlideshow'

test('homepage truck preview advances every four seconds', () => {
  assert.equal(HOME_SLIDE_MS, 4000)
})
