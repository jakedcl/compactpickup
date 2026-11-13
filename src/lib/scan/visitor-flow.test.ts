import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignVisibleScanDisplayPercents,
  scanGuessCardTitle,
  SCAN_CONSENT_VALUE,
  SCAN_FIELDS,
  sentenceCaseMake,
} from '@/lib/binder/scan-types'
import { buildVisitorSubmitFormData } from './visitor-submit'
import { shouldOfferSavePhoto } from './visitor-save-photo'
import {
  correctionFromGuessIndex,
  hasActiveVisitorSession,
  SCAN_IDLE_INTRO_COPY,
  shouldAutoScanAfterCrop,
  shouldBeginConsentIsland,
  shouldShowConsentIsland,
  shouldShowScanStatus,
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
})

test('visitor progress switches cropping, downloading, and scanning labels', () => {
  assert.equal(
    visitorProgressLabel({ modelDownloading: false, scanning: false, cropBusy: true }),
    'Cropping the truck…',
  )
  assert.equal(
    visitorProgressLabel({ modelDownloading: true, scanning: false, cropBusy: true }),
    'Downloading the scanner…',
  )
  assert.equal(visitorProgressVisible({ modelDownloading: true, scanning: false, cropBusy: false }), true)
})

test('shouldShowScanStatus hides match-score copy when results are on the page', () => {
  assert.equal(
    shouldShowScanStatus('Closest match at 87%', {
      phase: 'preview',
      cropError: false,
      hasResult: true,
    }),
    false,
  )
})

test('empty scan intro copy is the agreed idle-only message', () => {
  assert.match(
    SCAN_IDLE_INTRO_COPY,
    /THOUSANDS OF PHOTOS OF THE COMPACT PICKUPS IN OUR CATALOG/,
  )
  assert.match(SCAN_IDLE_INTRO_COPY, /WE WON'T USE YOUR PHOTO WITHOUT PERMISSION/)
})

test('assignVisibleScanDisplayPercents cascades duplicate rounded percents', () => {
  assert.deepEqual(
    assignVisibleScanDisplayPercents([
      { score: 0.905 },
      { score: 0.904 },
    ]),
    [82, 81],
  )
  assert.deepEqual(
    assignVisibleScanDisplayPercents([
      { score: 0.9 },
      { score: 0.86 },
      { score: 0.86 },
    ]),
    [80, 64, 64],
  )
})

test('guess card title sentence-cases the make on one line with the model', () => {
  assert.equal(sentenceCaseMake('FORD'), 'Ford')
  assert.equal(scanGuessCardTitle('FORD', 'Ranger (2nd Gen)'), 'Ford Ranger (2nd Gen)')
})

test('Save photo is offered only for camera captures', () => {
  assert.equal(shouldOfferSavePhoto('camera'), true)
  assert.equal(shouldOfferSavePhoto('library'), false)
})

const activeSession = {
  file: new File([], 'a.jpg'),
  previewUrl: null,
  verdict: 'right' as const,
  correction: null,
  topGuess: truck,
  islandSurface: 'catalog' as const,
  submitPhase: 'idle' as const,
  submitMessage: '',
  consentAnswered: false,
}

test('Not sure skips the consent island', () => {
  assert.equal(shouldBeginConsentIsland('idk'), false)
  assert.equal(
    hasActiveVisitorSession({
      ...activeSession,
      verdict: 'idk',
    }),
    false,
  )
})

test('consent island stays off /scan after a catalog guess until dismissed', () => {
  assert.equal(shouldShowConsentIsland('/ford/ranger', activeSession), true)
  assert.equal(shouldShowConsentIsland('/scan', activeSession), false)
  assert.equal(
    shouldShowConsentIsland('/scan', { ...activeSession, islandSurface: 'scan', correction: { kind: 'custom', text: 'MY TRUCK' } }),
    true,
  )
  assert.equal(shouldShowConsentIsland('/scan', null), false)
})

test('guess verdict and correction match island submit rules', () => {
  assert.equal(verdictFromGuessIndex(0), 'right')
  assert.deepEqual(correctionFromGuessIndex(1, truckB), { kind: 'catalog', truck: truckB })
})

test('buildVisitorSubmitFormData matches consent submit fields', () => {
  const jpeg = new File([Uint8Array.from([1, 2, 3])], 'truck.jpg', { type: 'image/jpeg' })
  const rightBody = buildVisitorSubmitFormData(jpeg, 'right', truck, null)
  assert.equal(rightBody.get(SCAN_FIELDS.consent), SCAN_CONSENT_VALUE)
  assert.equal(rightBody.get(SCAN_FIELDS.verdict), 'right')
})
