import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { paddedCropNorm, pickVehicleBox, type NormDetection } from '@/lib/clip/crop-select'
import { DETECT_SCORE_THRESHOLD } from '@/lib/clip/pipeline'
import { cxcywhNormToXyxyNorm, postProcessDfineDetections, sigmoid } from '@/lib/clip/dfine-post'

const here = path.dirname(fileURLToPath(import.meta.url))
type CropReference = {
  detections: NormDetection[]
  expectedPick: { label: string; x0: number; y0: number; x1: number; y1: number }
  expectedPadded: { x0: number; y0: number; x1: number; y1: number }
  dfine: {
    logitsShape: [number, number, number]
    pred_boxesShape: [number, number, number]
    id2label: Record<string, string>
    width: number
    height: number
    threshold: number
    expectCount: number
    expectBestScore: number
    logitsQuery0: number
    truckLogitQuery1: number
    truckClassIndex: number
  }
}

const reference = JSON.parse(readFileSync(path.join(here, 'fixtures', 'crop-reference.json'), 'utf8')) as CropReference

test('sigmoid matches high-confidence vehicle logit', () => {
  assert.ok(sigmoid(4) > 0.98)
  assert.ok(sigmoid(-4) < 0.02)
})

test('pickVehicleBox matches run_crop.py tie-break (area × centrality)', () => {
  const picked = pickVehicleBox(reference.detections)
  assert.ok(picked)
  assert.equal(picked.label, reference.expectedPick.label)
  assert.ok(Math.abs(picked.x0 - reference.expectedPick.x0) < 1e-6)
  assert.ok(Math.abs(picked.y1 - reference.expectedPick.y1) < 1e-6)
  const padded = paddedCropNorm(picked, 0.15)
  assert.ok(Math.abs(padded.x0 - reference.expectedPadded.x0) < 1e-6)
  assert.ok(Math.abs(padded.y1 - reference.expectedPadded.y1) < 1e-6)
})

test('postProcessDfineDetections uses sigmoid and original image scale', () => {
  const { dfine } = reference
  const numClasses = dfine.logitsShape[2]
  const numQueries = dfine.logitsShape[1]
  const logits = new Array(numQueries * numClasses).fill(dfine.logitsQuery0)
  logits[numClasses + dfine.truckClassIndex] = dfine.truckLogitQuery1
  const pred_boxes = [0.2, 0.2, 0.1, 0.1, 0.5, 0.5, 0.4, 0.3]
  const rows = postProcessDfineDetections(
    {
      logits: { dims: dfine.logitsShape, data: logits },
      pred_boxes: { dims: dfine.pred_boxesShape, data: pred_boxes },
    },
    dfine.id2label,
    dfine.width,
    dfine.height,
    dfine.threshold,
  )
  assert.equal(rows.length, dfine.expectCount)
  const best = rows.reduce((a, b) => (b.score > a.score ? b : a), rows[0])
  assert.ok(best.score >= dfine.expectBestScore)
  const [x0, y0, x1, y1] = cxcywhNormToXyxyNorm(0.5, 0.5, 0.4, 0.3)
  assert.ok(Math.abs(x0 - 0.3) < 1e-6)
  assert.ok(Math.abs(y1 - 0.65) < 1e-6)
})

test('default vehicle cutoff fits the onnx-community D-FINE score scale', () => {
  assert.equal(DETECT_SCORE_THRESHOLD, 0.2)
  const low = { label: 'truck', score: 0.36, x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.8 }
  assert.ok(pickVehicleBox([low]))
  assert.equal(pickVehicleBox([{ ...low, score: 0.15 }]), null)
})
