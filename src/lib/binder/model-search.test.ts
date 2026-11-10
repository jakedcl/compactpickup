import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterModels, type ModelChoice } from './model-search'

const trucks: ModelChoice[] = [
  { id: 'ranger', slug: 'ranger-1', title: 'Ranger (1st Gen)', maker: 'Ford' },
  { id: 'courier', slug: 'courier', title: 'Courier', maker: 'Ford' },
  { id: 'taco', slug: 'tacoma-1', title: 'Tacoma (1st Gen)', maker: 'Toyota' },
  { id: 'ridge', slug: 'honda-ridgeline', title: 'Ridgeline (1st Gen)', maker: 'Honda' },
]

test('model search narrows by make and by typed text', () => {
  const ford = filterModels(trucks, 'Ford', '')
  assert.deepEqual(ford.map((truck) => truck.id), ['courier', 'ranger'])
  const typed = filterModels(trucks, 'Ford', 'rang')
  assert.deepEqual(typed.map((truck) => truck.id), ['ranger'])
  const honda = filterModels(trucks, '', 'ridge')
  assert.deepEqual(honda.map((truck) => truck.id), ['ridge'])
  const current = filterModels(trucks, '', '', 'taco')
  assert.equal(current[0]?.id, 'taco')
})
