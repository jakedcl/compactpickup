import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import {
  buildDeck,
  collectGameStills,
  filterEligibleStills,
  isEligibleGameStill,
  randomShuffle,
  seededShuffle,
} from '@/lib/gameDeck'
import type { GameStill } from '@/lib/gameDeck'

function still(overrides: Partial<GameStill> = {}): GameStill {
  return {
    asset: { _ref: 'image-abc' },
    truckTitle: 'Ranger (2nd Gen)',
    manufacturerName: 'Ford',
    manufacturerSlug: 'ford',
    truckSlug: 'ford-ranger-2nd-gen',
    ...overrides,
  }
}

test('collectGameStills dedupes trucks and sorts by slug', () => {
  const rows = [
    {
      images: [
        still({ truckSlug: 'z-truck', manufacturerSlug: 'ford', truckTitle: 'Z' }),
        still({ truckSlug: 'a-truck', manufacturerSlug: 'ford', truckTitle: 'A' }),
        still({ truckSlug: 'a-truck', manufacturerSlug: 'ford', truckTitle: 'A dup' }),
      ],
    },
  ]
  const collected = collectGameStills(rows)
  assert.equal(collected.length, 2)
  assert.equal(collected[0]?.truckSlug, 'a-truck')
  assert.equal(collected[1]?.truckSlug, 'z-truck')
})

test('buildDeck is deterministic for a fixed seed', () => {
  const rows = [{ images: [still(), still({ truckSlug: 'other', truckTitle: 'Other' })] }]
  const a = buildDeck(rows, 42)
  const b = buildDeck(rows, 42)
  assert.deepEqual(a.map((s) => s.truckSlug), b.map((s) => s.truckSlug))
})

test('seededShuffle permutes without dropping items', () => {
  const input = [1, 2, 3, 4, 5]
  const out = seededShuffle(input, 99)
  assert.deepEqual([...out].sort(), input)
  assert.notDeepEqual(out, input)
})

test('randomShuffle permutes using Math.random', () => {
  const input = ['a', 'b', 'c', 'd']
  let i = 0
  const picks = [0.9, 0.1, 0.5]
  mock.method(Math, 'random', () => picks[i++ % picks.length])
  const out = randomShuffle(input)
  mock.restoreAll()
  assert.deepEqual([...out].sort(), input)
  assert.notDeepEqual(out, input)
})

test('filterEligibleStills requires asset, make slug, and model slug', () => {
  assert.equal(isEligibleGameStill(still()), true)
  assert.equal(isEligibleGameStill(still({ manufacturerSlug: undefined })), false)
  const eligible = filterEligibleStills([
    still(),
    still({ asset: undefined }),
    still({ truckSlug: undefined }),
  ])
  assert.equal(eligible.length, 1)
})
