import assert from 'node:assert/strict'
import { test } from 'node:test'
import { explainScan, formatStageMs } from '@/lib/scan/explain'

const T = 0.8
const M = 0.02

test('confident match names both numbers and says it counts as a match', () => {
  const out = explainScan({
    state: 'match',
    matches: [{ score: 0.93 }, { score: 0.88 }, { score: 0.8 }],
    threshold: T,
    minMargin: M,
  })
  assert.equal(out.confident, true)
  assert.equal(out.gap !== null && Math.abs(out.gap - 0.05) < 1e-9, true)
  assert.deepEqual(out.checks.map((c) => [c.id, c.passed]), [['score', true], ['margin', true]])
  assert.match(out.sentence, /0\.93 is above the 0\.80 needed/)
  assert.match(out.sentence, /leads the runner-up by 0\.05 \(needs 0\.02\)/)
  assert.match(out.sentence, /counts as a match/)
})

test('guess: score clears the cutoff but the lead is too small', () => {
  const out = explainScan({
    state: 'guess',
    matches: [{ score: 0.91 }, { score: 0.9 }],
    threshold: T,
    minMargin: M,
  })
  assert.equal(out.confident, false)
  assert.deepEqual(out.checks.map((c) => [c.id, c.passed]), [['score', true], ['margin', false]])
  assert.match(out.sentence, /clears 0\.80, but it leads the runner-up by only 0\.01/)
})

test('guess: score below the cutoff', () => {
  const out = explainScan({
    state: 'guess',
    matches: [{ score: 0.74 }, { score: 0.6 }],
    threshold: T,
    minMargin: M,
  })
  assert.deepEqual(out.checks.map((c) => [c.id, c.passed]), [['score', false], ['margin', true]])
  assert.match(out.sentence, /below the 0\.80 needed for a match/)
})

test('guess: both checks fail', () => {
  const out = explainScan({
    state: 'guess',
    matches: [{ score: 0.74 }, { score: 0.73 }],
    threshold: T,
    minMargin: M,
  })
  assert.match(out.sentence, /below the 0\.80 needed, and it leads the runner-up by only 0\.01/)
})

test('a single match has no margin check', () => {
  const out = explainScan({ state: 'match', matches: [{ score: 0.9 }], threshold: T, minMargin: M })
  assert.equal(out.gap, null)
  assert.deepEqual(out.checks.map((c) => c.id), ['score'])
  assert.match(out.sentence, /above the 0\.80 needed, so this counts as a match/)
})

test('learning and empty results get their own sentences and no checks', () => {
  const learning = explainScan({ state: 'learning', matches: [], threshold: T, minMargin: M })
  assert.match(learning.sentence, /No reference photos/)
  assert.deepEqual(learning.checks, [])
  const none = explainScan({ state: 'guess', matches: [], threshold: T, minMargin: M })
  assert.match(none.sentence, /No truck in the catalog/)
  assert.equal(none.topScore, null)
})

test('the server state decides the headline even if local numbers disagree', () => {
  const out = explainScan({
    state: 'match',
    matches: [{ score: 0.5 }, { score: 0.4 }],
    threshold: T,
    minMargin: M,
  })
  assert.equal(out.confident, true)
  assert.equal(out.checks[0].passed, false)
})

test('formatStageMs', () => {
  assert.equal(formatStageMs(412.4), '412 ms')
  assert.equal(formatStageMs(1840), '1.8 s')
  assert.equal(formatStageMs(-1), '—')
  assert.equal(formatStageMs(Number.NaN), '—')
})
