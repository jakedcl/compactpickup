'use client'

import { SCAN_EMBEDDING_DIM, l2Normalize } from '@/lib/binder/clip'
import { paddedCropNorm, pickVehicleBox, type NormDetection } from '@/lib/clip/crop-select'
import { fitCanvasLongEdge } from '@/lib/clip/crop-canvas'
import { postProcessDfineDetections } from '@/lib/clip/dfine-post'
import {
  DETECT_SCORE_THRESHOLD,
  DFINE_BROWSER_DTYPE,
  DFINE_BROWSER_MODEL,
  EMBED_MODEL,
  EMBED_PIPELINE,
  SIGLIP_BROWSER_DTYPE,
  SIGLIP_BROWSER_MODEL,
  WORK_MAX_EDGE,
} from '@/lib/clip/pipeline'

/**
 * Canonical vision extractor for the public scanner and the review tools.
 * Both sides must import embedImage from this file so stored fingerprints
 * and visitor fingerprints stay in one space.
 *
 * Pipeline: D-FINE nano (vehicle box, 15% pad) → SigLIP2-base q4 pooler (768-d).
 * Detector and embedder load lazily with shared progress events and browser cache.
 */
export { EMBED_MODEL, EMBED_PIPELINE }
export const SIGLIP_BROWSER_DTYPE_EXPORT = SIGLIP_BROWSER_DTYPE
/** @deprecated Use SIGLIP_BROWSER_MODEL from pipeline.ts */
export const CLIP_BROWSER_MODEL = SIGLIP_BROWSER_MODEL
/** @deprecated Use SIGLIP_BROWSER_DTYPE from pipeline.ts */
export const CLIP_BROWSER_DTYPE = SIGLIP_BROWSER_DTYPE

const MAX_EDGE = 768

export type ClipErrorCode = 'photo' | 'model' | 'runtime'

export class ClipError extends Error {
  readonly code: ClipErrorCode

  constructor(code: ClipErrorCode, message: string) {
    super(message)
    this.name = 'ClipError'
    this.code = code
  }
}

/** transformers.js progress_callback payload. progress is 0–100 when present. */
export type ClipProgress = {
  status: 'initiate' | 'download' | 'progress' | 'progress_total' | 'done' | 'ready' | string
  name?: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

type RawImageFactory = {
  fromCanvas: (canvas: HTMLCanvasElement | OffscreenCanvas) => unknown
}

type SiglipSession = {
  RawImage: RawImageFactory
  processor: (image: unknown) => Promise<unknown>
  model: (inputs: unknown) => Promise<unknown>
}

type DfineSession = {
  processor: (images: unknown) => Promise<{
    pixel_values: unknown
    pixel_mask?: unknown
  }>
  model: (inputs: unknown) => Promise<unknown>
  id2label: Record<string, string>
}

const progressListeners = new Set<(progress: ClipProgress) => void>()
let siglipPromise: Promise<SiglipSession> | null = null
let dfinePromise: Promise<DfineSession | null> | null = null

function emitProgress(progress: ClipProgress) {
  for (const listener of progressListeners) {
    listener(progress)
  }
}

function poolerOutput(output: unknown): ArrayLike<number> | null {
  if (!output || typeof output !== 'object') return null
  const pooler = (output as { pooler_output?: { data?: ArrayLike<number> } }).pooler_output
  const data = pooler?.data
  if (!data || typeof data.length !== 'number') return null
  return data
}

/** Decode once, honor EXIF orientation, and cap the long edge so big phone photos stay under canvas limits. */
async function workingCanvasFromBlob(input: Blob): Promise<HTMLCanvasElement> {
  if (input.size === 0) throw new ClipError('photo', 'Could not read the photo')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' })
  } catch {
    throw new ClipError('photo', 'Could not read the photo')
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new ClipError('photo', 'Could not read the photo')
    const scale = Math.min(1, WORK_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new ClipError('photo', 'Could not read the photo')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap.close()
  }
}

/** Padded vehicle crop, or the whole photo when no vehicle box passed the rule. */
function cropCanvas(source: HTMLCanvasElement, detections: NormDetection[]): HTMLCanvasElement {
  const picked = pickVehicleBox(detections)
  if (!picked) return source
  const rect = paddedCropNorm(picked)
  const sx = Math.max(0, Math.floor(rect.x0 * source.width))
  const sy = Math.max(0, Math.floor(rect.y0 * source.height))
  const sw = Math.max(1, Math.min(source.width - sx, Math.ceil(rect.x1 * source.width) - sx))
  const sh = Math.max(1, Math.min(source.height - sy, Math.ceil(rect.y1 * source.height) - sy))
  const cropped = document.createElement('canvas')
  cropped.width = sw
  cropped.height = sh
  const ctx = cropped.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
  return cropped
}

function loadSiglipSession(): Promise<SiglipSession> {
  if (!siglipPromise) {
    siglipPromise = (async () => {
      const transformers = await import('@huggingface/transformers')
      const { env, AutoProcessor, SiglipVisionModel, RawImage } = transformers
      env.allowLocalModels = false
      env.useBrowserCache = true
      const wasm = env.backends.onnx.wasm
      if (wasm) wasm.numThreads = 1
      const progress_callback = (progress: ClipProgress) => emitProgress(progress)
      const processor = await AutoProcessor.from_pretrained(SIGLIP_BROWSER_MODEL, { progress_callback })
      const model = await SiglipVisionModel.from_pretrained(SIGLIP_BROWSER_MODEL, {
        dtype: SIGLIP_BROWSER_DTYPE,
        device: 'wasm',
        progress_callback,
      })
      return {
        RawImage,
        processor: (image: unknown) => processor(image),
        model: (inputs: unknown) => model(inputs),
      }
    })().catch((error: unknown) => {
      siglipPromise = null
      throw error
    })
  }
  return siglipPromise
}

function loadDfineSession(): Promise<DfineSession | null> {
  if (dfinePromise === null) {
    dfinePromise = (async () => {
      try {
        const transformers = await import('@huggingface/transformers')
        const { env, AutoProcessor, DFineForObjectDetection } = transformers
        env.allowLocalModels = false
        env.useBrowserCache = true
        const wasm = env.backends.onnx.wasm
        if (wasm) wasm.numThreads = 1
        const progress_callback = (progress: ClipProgress) => emitProgress(progress)
        const processor = await AutoProcessor.from_pretrained(DFINE_BROWSER_MODEL, { progress_callback })
        const model = await DFineForObjectDetection.from_pretrained(DFINE_BROWSER_MODEL, {
          dtype: DFINE_BROWSER_DTYPE,
          device: 'wasm',
          progress_callback,
        })
        const id2label = ((model.config as { id2label?: Record<string, string> }).id2label) ?? {}
        return {
          processor: (images: unknown) => processor(images as Parameters<typeof processor>[0]),
          model: (inputs: unknown) => model(inputs as Parameters<typeof model>[0]),
          id2label,
        }
      } catch {
        // Crop is optional: this scan uses the whole photo, and the next scan retries the download.
        dfinePromise = null
        return null
      }
    })()
  }
  return dfinePromise
}

/** Progress listeners are owned by embedImage, so the SigLIP download keeps reporting after detection. */
async function detectVehicles(source: HTMLCanvasElement): Promise<NormDetection[]> {
  try {
    const session = await loadDfineSession()
    if (!session) return []
    const transformers = await import('@huggingface/transformers')
    const image = transformers.RawImage.fromCanvas(source)
    const prepared = await session.processor(image)
    const output = await session.model(prepared)
    if (!output || typeof output !== 'object') return []
    const record = output as {
      logits?: { dims: number[]; data: Float32Array }
      pred_boxes?: { dims: number[]; data: Float32Array }
    }
    if (!record.logits || !record.pred_boxes) return []
    return postProcessDfineDetections(
      { logits: record.logits, pred_boxes: record.pred_boxes },
      session.id2label,
      source.width,
      source.height,
      DETECT_SCORE_THRESHOLD,
    )
  } catch {
    return []
  }
}

export async function embedImage(
  blob: Blob,
  onProgress?: (progress: ClipProgress) => void,
): Promise<Float32Array> {
  if (typeof document === 'undefined') throw new ClipError('runtime', 'The scanner runs in the browser')
  if (onProgress) progressListeners.add(onProgress)
  try {
    const source = await workingCanvasFromBlob(blob)
    let detections: NormDetection[] = []
    try {
      detections = await detectVehicles(source)
    } catch {
      detections = []
    }
    const cropped = cropCanvas(source, detections)
    const fitted = fitCanvasLongEdge(cropped, MAX_EDGE)
    const session = await loadSiglipSession()
    const image = session.RawImage.fromCanvas(fitted)
    const inputs = await session.processor(image)
    const output = await session.model(inputs)
    const data = poolerOutput(output)
    if (!data || data.length !== SCAN_EMBEDDING_DIM) {
      throw new ClipError('model', 'Scanner model returned an unexpected fingerprint')
    }
    const normalized = l2Normalize(data)
    if (!normalized) throw new ClipError('model', 'Scanner model returned an empty fingerprint')
    return normalized
  } finally {
    if (onProgress) progressListeners.delete(onProgress)
  }
}
