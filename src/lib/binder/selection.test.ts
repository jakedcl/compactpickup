import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applySelection } from './selection'

test('selection actions select all, clear, and toggle one photo', () => {
  const none = new Set<string>()
  const all = applySelection(none, 'all', ['a', 'b', 'c'])
  assert.deepEqual([...all], ['a', 'b', 'c'])
  const dropped = applySelection(all, 'toggle', ['a', 'b', 'c'], 'b')
  assert.equal(dropped.has('b'), false)
  assert.equal(dropped.has('a'), true)
  const restored = applySelection(dropped, 'toggle', ['a', 'b', 'c'], 'b')
  assert.equal(restored.has('b'), true)
  assert.equal(applySelection(restored, 'clear', ['a', 'b']).size, 0)
})
