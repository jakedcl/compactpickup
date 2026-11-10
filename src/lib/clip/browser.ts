'use client'

/**
 * Shared browser CLIP for the review dashboard and the public scanner.
 * Import embedImage from this file. Do not load a second copy of the model.
 *
 * Xenova/clip-vit-base-patch32 is the ONNX build of openai/clip-vit-base-patch32.
 * device wasm and dtype q8 are pinned so a phone and a laptop write comparable vectors.
 * The result is an L2-normalized Float32Array of length 512.
 * The model downloads once, then stays in the module and the browser cache.
 */

export const CLIP_BROWSER_MODEL = 'Xenova/clip-vit-base-patch32'
export const CLIP_BROWSER_DTYPE = 'q8' as const
export const CLIP_BROWSER_DEVICE = 'wasm' as const
export const CLIP_BROWSER_DIM = 512

type FeatureTensor = {
  data: ArrayLike<number>
  dims?: number[]
}

type Extractor = (image: Blob | OffscreenCanvas) => Promise<FeatureTensor>

type ProgressInfo = {
  status?: string
  progress?: number
  loaded?: number
  total?: number
}

export type EmbedProgress = (update: { ratio: number; status: string }) => void

let pending: Promise<Extractor> | null = null

function unitVector(values: Float32Array): Float32Array {
  if (values.length !== CLIP_BROWSER_DIM) {
    throw new Error('The fingerprint was the wrong length')
  }
  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    const n = values[i]
    if (!Number.isFinite(n)) throw new Error('The fingerprint was the wrong length')
    sum += n * n
  }
  if (!(sum > 0)) throw new Error('The fingerprint was empty')
  const norm = Math.sqrt(sum)
  const out = new Float32Array(CLIP_BROWSER_DIM)
  for (let i = 0; i < values.length; i += 1) out[i] = values[i] / norm
  return out
}

function vectorFromTensor(tensor: FeatureTensor): Float32Array {
  const { dims } = tensor
  if (dims && dims.length > 0) {
    const size = dims.reduce((product, dim) => product * dim, 1)
    if (size !== CLIP_BROWSER_DIM) throw new Error('The fingerprint was the wrong length')
  }
  const values = tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data)
  return unitVector(values)
}

async function imageInput(input: Blob | ImageBitmap): Promise<Blob | OffscreenCanvas> {
  if (typeof Blob !== 'undefined' && input instanceof Blob) return input
  const bitmap = input as ImageBitmap
  if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser cannot read the photo')
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot read the photo')
  context.drawImage(bitmap, 0, 0)
  return canvas
}

async function loadExtractor(onProgress?: EmbedProgress): Promise<Extractor> {
  const { env, pipeline } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  env.useBrowserCache = true
  const pipe = await pipeline('image-feature-extraction', CLIP_BROWSER_MODEL, {
    device: CLIP_BROWSER_DEVICE,
    dtype: CLIP_BROWSER_DTYPE,
    progress_callback: onProgress
      ? (info: ProgressInfo) => {
          const ratio =
            typeof info.progress === 'number'
              ? info.progress / 100
              : info.total
                ? (info.loaded ?? 0) / info.total
                : 0
          onProgress({
            ratio: Math.max(0, Math.min(1, ratio)),
            status: info.status ?? 'progress',
          })
        }
      : undefined,
  })
  return async (image) => pipe(image) as Promise<FeatureTensor>
}

function extractor(onProgress?: EmbedProgress): Promise<Extractor> {
  if (!pending) {
    pending = loadExtractor(onProgress).catch((error: unknown) => {
      pending = null
      throw error
    })
  }
  return pending
}

export async function embedImage(input: Blob | ImageBitmap, onProgress?: EmbedProgress): Promise<Float32Array> {
  if (typeof window === 'undefined') throw new Error('Fingerprints run in the browser')
  const image = await imageInput(input)
  const run = await extractor(onProgress)
  const tensor = await run(image)
  return vectorFromTensor(tensor)
}
