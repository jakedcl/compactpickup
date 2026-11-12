import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  saveVisitorPhoto,
  shouldOfferSavePhoto,
  type SaveVisitorPhotoDeps,
} from './visitor-save-photo'

test('shouldOfferSavePhoto is true only for camera capture', () => {
  assert.equal(shouldOfferSavePhoto('camera'), true)
  assert.equal(shouldOfferSavePhoto('library'), false)
  assert.equal(shouldOfferSavePhoto('drop'), false)
  assert.equal(shouldOfferSavePhoto('paste'), false)
  assert.equal(shouldOfferSavePhoto('desktop'), false)
})

test('saveVisitorPhoto uses the Web Share sheet when files can be shared', async () => {
  const jpeg = new File([Uint8Array.from([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' })
  let shared = false
  let downloaded = false
  const deps: SaveVisitorPhotoDeps = {
    canShare: () => true,
    share: async () => {
      shared = true
    },
    download: () => {
      downloaded = true
    },
    shrink: async (blob) => new File([blob], 'truck-scan.jpg', { type: 'image/jpeg' }),
  }
  assert.equal(await saveVisitorPhoto(jpeg, deps), 'shared')
  assert.equal(shared, true)
  assert.equal(downloaded, false)
})

test('saveVisitorPhoto falls back to download when share is unavailable', async () => {
  const jpeg = new File([Uint8Array.from([4, 5])], 'shot.jpg', { type: 'image/jpeg' })
  let shared = false
  let downloaded = false
  const deps: SaveVisitorPhotoDeps = {
    canShare: () => false,
    share: async () => {
      shared = true
    },
    download: () => {
      downloaded = true
    },
    shrink: async (blob) => new File([blob], 'truck-scan.jpg', { type: 'image/jpeg' }),
  }
  assert.equal(await saveVisitorPhoto(jpeg, deps), 'downloaded')
  assert.equal(shared, false)
  assert.equal(downloaded, true)
})
