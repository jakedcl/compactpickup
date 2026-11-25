import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { DEMO_SAMPLES, sampleVerdict } from '@/lib/scan/demo-samples'

const BEST = { slug: 'ranger-3' }
const OTHER = { slug: 'sonoma' }

test('expected truck first is right', () => {
  const v = sampleVerdict({ expectedSlug: 'ranger-3', expectedTitle: 'Ford Ranger (3rd Gen)' }, 'match', [BEST, OTHER])
  assert.equal(v.tone, 'good')
  assert.match(v.text, /first guess is the Ford Ranger/)
})

test('expected truck lower in the list is a warning that names its position', () => {
  const v = sampleVerdict({ expectedSlug: 'ranger-3', expectedTitle: 'Ranger' }, 'guess', [OTHER, BEST])
  assert.equal(v.tone, 'warn')
  assert.match(v.text, /guess 2/)
})

test('expected truck missing is a miss', () => {
  const v = sampleVerdict({ expectedSlug: 'ranger-3', expectedTitle: 'Ranger' }, 'guess', [OTHER])
  assert.equal(v.tone, 'bad')
  assert.match(v.text, /Missed/)
})

test('no catalog truck expected: nothing shown is right', () => {
  const v = sampleVerdict({ expectedSlug: null, expectedTitle: null }, 'guess', [])
  assert.equal(v.tone, 'good')
})

test('no catalog truck expected: a confident match is wrong, a hedge is a warning', () => {
  assert.equal(sampleVerdict({ expectedSlug: null, expectedTitle: null }, 'match', [BEST]).tone, 'bad')
  const hedge = sampleVerdict({ expectedSlug: null, expectedTitle: null }, 'guess', [BEST])
  assert.equal(hedge.tone, 'warn')
  assert.match(hedge.text, /safe answer/)
})

test('every demo sample is complete, credited, and has its file', () => {
  const ids = new Set<string>()
  for (const sample of DEMO_SAMPLES) {
    assert.equal(ids.has(sample.id), false, `duplicate id ${sample.id}`)
    ids.add(sample.id)
    assert.match(sample.src, /^\/demo-samples\/[\w.-]+\.(jpg|jpeg|png|webp)$/)
    assert.ok(existsSync(path.join(process.cwd(), 'public', sample.src)), `missing file for ${sample.id}`)
    assert.ok(sample.label.length > 0 && sample.label.length <= 28, `label length for ${sample.id}`)
    assert.ok(sample.why.length > 0)
    assert.ok(sample.credit.author && sample.credit.license, `credit for ${sample.id}`)
    assert.match(sample.credit.sourceUrl, /^https:\/\//)
    assert.equal(sample.expectedSlug === null, sample.expectedTitle === null)
    if (sample.kind === 'out-of-catalog' || sample.kind === 'not-a-truck') {
      assert.equal(sample.expectedSlug, null, `${sample.id} should expect no catalog truck`)
    } else {
      assert.ok(sample.expectedSlug, `${sample.id} should name its catalog truck`)
    }
  }
})
