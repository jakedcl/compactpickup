import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SCAN_CONSENT_VALUE,
  SCAN_FIELDS,
} from '@/lib/binder/scan-types'
import { isModelDownloadProgress } from '@/lib/clip/progress'
import { buildVisitorSubmitFormData } from './visitor-submit'
import { shouldOfferSavePhoto } from './visitor-save-photo'
import {
  correctionFromGuessIndex,
  hasActiveVisitorSession,
  SCAN_IDLE_INTRO_COPY,
  pagePhotoActionLayout,
  shouldShowScanStatus,
  shouldAutoScanAfterCrop,
  shouldBeginConsentIsland,
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
  assert.equal(
    visitorProgressLabel({ modelDownloading: false, scanning: true, cropBusy: false }),
    'Scanning the truck…',
  )
  assert.equal(visitorProgressVisible({ modelDownloading: true, scanning: false, cropBusy: false }), true)
})

test('isModelDownloadProgress is true only for download status on scanner models', () => {
  assert.equal(
    isModelDownloadProgress({ status: 'download', name: 'Xenova/dfine', file: 'onnx/model.onnx' }),
    true,
  )
  assert.equal(
    isModelDownloadProgress({ status: 'ready', name: 'siglip2-base', file: 'onnx/vision_model_q4.onnx' }),
    false,
  )
})

test('pagePhotoActionLayout stacks Save under Replace for camera only', () => {
  assert.equal(pagePhotoActionLayout(false), 'replace-only')
  assert.equal(pagePhotoActionLayout(true), 'dual')
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
  assert.equal(
    shouldShowScanStatus('Signal lost. The scanner did not answer.', {
      phase: 'error',
      cropError: false,
      hasResult: false,
    }),
    true,
  )
})

test('empty scan intro copy is the agreed idle-only message', () => {
  assert.match(
    SCAN_IDLE_INTRO_COPY,
    /THOUSANDS OF PHOTOS OF THE COMPACT PICKUPS IN OUR CATALOG/,
  )
  assert.match(SCAN_IDLE_INTRO_COPY, /WE WON'T USE YOUR PHOTO WITHOUT PERMISSION/)
})

test('Save photo is offered only for camera captures', () => {
  assert.equal(shouldOfferSavePhoto('camera'), true)
  assert.equal(shouldOfferSavePhoto('library'), false)
  assert.equal(shouldOfferSavePhoto('drop'), false)
})

test('Not sure skips the consent island', () => {
  assert.equal(shouldBeginConsentIsland('idk'), false)
  assert.equal(shouldBeginConsentIsland('right'), true)
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
    }),
    false,
  )
})

test('guess verdict and correction match island submit rules', () => {
  assert.equal(verdictFromGuessIndex(0), 'right')
  assert.equal(verdictFromGuessIndex(1), 'wrong')
  assert.deepEqual(correctionFromGuessIndex(1, truckB), { kind: 'catalog', truck: truckB })
})

test('buildVisitorSubmitFormData matches consent submit fields', () => {
  const jpeg = new File([Uint8Array.from([1, 2, 3])], 'truck.jpg', { type: 'image/jpeg' })
  const rightBody = buildVisitorSubmitFormData(jpeg, 'right', truck, null)
  assert.equal(rightBody.get(SCAN_FIELDS.consent), SCAN_CONSENT_VALUE)
  assert.equal(rightBody.get(SCAN_FIELDS.verdict), 'right')
})
