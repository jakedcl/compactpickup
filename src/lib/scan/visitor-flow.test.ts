import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SCAN_CONSENT_VALUE,
  SCAN_FIELDS,
} from '@/lib/binder/scan-types'
import { buildVisitorSubmitFormData } from './visitor-submit'
import {
  correctionFromGuessIndex,
  hasActiveVisitorSession,
  shouldAutoScanAfterCrop,
  verdictFromGuessIndex,
  visitorProgressLabel,
  visitorProgressVisible,
} from './visitor-session'

const truck = {
  id: 't1',
  slug: 'ranger',
  title: 'Ranger',
  maker: 'Ford',
  href: '/ford/ranger',
  years: '1983–1992',
}

const truckB = { ...truck, id: 't2', slug: 's10', title: 'S-10', href: '/chevrolet/s10' }

test('shouldAutoScanAfterCrop runs only when crop is ready and scan has not run', () => {
  assert.equal(
    shouldAutoScanAfterCrop({
      cropPhase: 'ready',
      hasFile: true,
      scanning: false,
      hasResult: false,
      cropError: false,
    }),
    true,
  )
  assert.equal(
    shouldAutoScanAfterCrop({
      cropPhase: 'cropping',
      hasFile: true,
      scanning: false,
      hasResult: false,
      cropError: false,
    }),
    false,
  )
  assert.equal(
    shouldAutoScanAfterCrop({
      cropPhase: 'ready',
      hasFile: true,
      scanning: true,
      hasResult: false,
      cropError: false,
    }),
    false,
  )
  assert.equal(
    shouldAutoScanAfterCrop({
      cropPhase: 'error',
      hasFile: true,
      scanning: false,
      hasResult: false,
      cropError: true,
    }),
    false,
  )
})

test('visitor progress uses one bar that switches label while scanning', () => {
  assert.equal(visitorProgressVisible(true, false), true)
  assert.equal(visitorProgressVisible(false, true), true)
  assert.equal(visitorProgressVisible(false, false), false)
  assert.equal(visitorProgressLabel(false), 'Cropping the truck…')
  assert.equal(visitorProgressLabel(true), 'Scanning the truck…')
})

test('guess verdict and correction match island submit rules', () => {
  assert.equal(verdictFromGuessIndex(0), 'right')
  assert.equal(verdictFromGuessIndex(1), 'wrong')
  assert.deepEqual(correctionFromGuessIndex(0, truck), null)
  assert.deepEqual(correctionFromGuessIndex(1, truckB), { kind: 'catalog', truck: truckB })
})

test('buildVisitorSubmitFormData matches consent submit fields', () => {
  const jpeg = new File([Uint8Array.from([1, 2, 3])], 'truck.jpg', { type: 'image/jpeg' })
  const rightBody = buildVisitorSubmitFormData(jpeg, 'right', truck, null)
  assert.equal(rightBody.get(SCAN_FIELDS.consent), SCAN_CONSENT_VALUE)
  assert.equal(rightBody.get(SCAN_FIELDS.verdict), 'right')
  assert.equal(rightBody.get(SCAN_FIELDS.guessedTruckId), truck.id)
  assert.equal(rightBody.get(SCAN_FIELDS.correctedTruckSlug), '')

  const wrongBody = buildVisitorSubmitFormData(jpeg, 'wrong', truck, { kind: 'catalog', truck: truckB })
  assert.equal(wrongBody.get(SCAN_FIELDS.verdict), 'wrong')
  assert.equal(wrongBody.get(SCAN_FIELDS.correctedTruckId), truckB.id)
  assert.equal(wrongBody.get(SCAN_FIELDS.correctedTruckSlug), truckB.slug)

  const customBody = buildVisitorSubmitFormData(jpeg, 'wrong', truck, { kind: 'custom', text: 'Mazda B-Series' })
  assert.equal(customBody.get(SCAN_FIELDS.correctedTruckCustomText), 'Mazda B-Series')
})

test('hasActiveVisitorSession is false without a file', () => {
  assert.equal(hasActiveVisitorSession(null), false)
  assert.equal(
    hasActiveVisitorSession({
      file: new File([], 'a.jpg'),
      previewUrl: null,
      verdict: 'idk',
      correction: null,
      topGuess: truck,
      submitPhase: 'idle',
      submitMessage: '',
      consentAnswered: false,
      fromCameraCapture: false,
      photoSaved: false,
    }),
    true,
  )
})
