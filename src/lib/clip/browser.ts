'use client'

import { SCAN_EMBEDDING_DIM, l2Normalize } from '@/lib/binder/clip'

/**
 * Canonical vision extractor for the public scanner and the review tools.
 * Both sides must import embedImage from this file so stored fingerprints
 * and visitor fingerprints stay in one space.
 *
 * Model: onnx-community/siglip2-base-patch16-224-ONNX (SiglipVisionModel).
 * Weights: quantized vision encoder (q4, about 63 MB), loaded once and kept
 * in the browser cache. Device is WASM with one thread so iPhone Safari does
 * not need cross-origin isolation. The image is drawn to a canvas whose long
 * edge is at most 768px, then read with RawImage.fromCanvas. Output is
 * pooler_output, L2-normalized to 768 numbers.
 *
 * embedImage(blob, onProgress?) forwards transformers.js progress_callback
 * events while that shared load is in flight. Later callers can subscribe
 * to the same load; events that already fired are not repeated.
 */
export const EMBED_MODEL = 'siglip2-base-q4'
export const SIGLIP_BROWSER_MODEL = 'onnx-community/siglip2-base-patch16-224-ONNX'
export const SIGLIP_BROWSER_DTYPE = 'q4' as const

/** @deprecated Use SIGLIP_BROWSER_MODEL. */
export const CLIP_BROWSER_MODEL = SIGLIP_BROWSER_MODEL
/** @deprecated Use SIGLIP_BROWSER_DTYPE. */
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

const progressListeners = new Set<(progress: ClipProgress) => void>()
let sessionPromise: Promise<SiglipSession> | null = null

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

async function drawFitted(input: Blob): Promise<HTMLCanvasElement> {
  if (input.size === 0) throw new ClipError('photo', 'Could not read the photo')
  const bitmap = await createImageBitmap(input)
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new ClipError('photo', 'Could not read the photo')
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new ClipError('photo', 'Could not read the photo')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas
  } finally {
    bitmap.close()
  }
}

function loadSession(): Promise<SiglipSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
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
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}

export async function embedImage(
  blob: Blob,
  onProgress?: (progress: ClipProgress) => void,
): Promise<Float32Array> {
  if (typeof document === 'undefined') throw new ClipError('runtime', 'The scanner runs in the browser')
  if (onProgress) progressListeners.add(onProgress)
  try {
    const session = await loadSession()
    const canvas = await drawFitted(blob)
    const image = session.RawImage.fromCanvas(canvas)
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
